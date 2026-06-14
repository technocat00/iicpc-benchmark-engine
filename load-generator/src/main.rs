use anyhow::Result;
use common::models::{AckStatus, Order, OrderAck, OrderSide, OrderType, RawEvent};
use rand::{Rng, SeedableRng, rngs::StdRng};
use rskafka::{
    client::{ClientBuilder, partition::UnknownTopicHandling},
    record::Record,
};
use std::{
    sync::Arc,
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use chrono::Utc;
use futures::stream::{FuturesUnordered, StreamExt};
use tokio::sync::mpsc;
use tracing::{error, info, warn};
use uuid::Uuid;

// ── Config (read from env, fallback to sensible defaults) ─────────────────────
struct Config {
    target_url:    String,  // contestant engine HTTP endpoint
    contestant_id:   String,  // which contestant we're benchmarking
    kafka_addr:      String,  // Kafka broker address
    num_workers:     usize,   // number of concurrent bot workers
    batch_size:      usize,   // how many orders before we snapshot telemetry
    worker_delay_ms: u64,     // 0 = full speed, >0 = throttle (ms between orders)
}

impl Config {
    fn from_env() -> Self {
        Self {
            target_url:    std::env::var("TARGET_URL")
                .unwrap_or_else(|_| "http://localhost:8080/api/order".into()),
            contestant_id: std::env::var("CONTESTANT_ID")
                .unwrap_or_else(|_| "contestant-local".into()),
            kafka_addr:    std::env::var("KAFKA_ADDR")
                .unwrap_or_else(|_| "localhost:9092".into()),
            num_workers:   std::env::var("NUM_WORKERS")
                .unwrap_or_else(|_| "100".into())
                .parse()
                .unwrap_or(100),
            batch_size:    std::env::var("BATCH_SIZE")
                .unwrap_or_else(|_| "1000".into())
                .parse()
                .unwrap_or(1000),
            worker_delay_ms: std::env::var("WORKER_DELAY_MS")
                .unwrap_or_else(|_| "0".into())
                .parse()
                .unwrap_or(0),
        }
    }
}

// Static delay value read by workers — avoids passing it through Arc<Config>
static WORKER_DELAY_MS: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(0);

// ── Telemetry message sent from each worker to the aggregator ─────────────────
// We now send RawEvents directly.

#[tokio::main]
async fn main() -> Result<()> {
    // Structured logging to stdout
    tracing_subscriber::fmt()
        .with_target(false)
        .compact()
        .init();

    let config = Arc::new(Config::from_env());

    // Initialize static so workers can read delay without Arc overhead
    WORKER_DELAY_MS.store(config.worker_delay_ms, std::sync::atomic::Ordering::Relaxed);

    info!(
        workers  = config.num_workers,
        target   = %config.target_url,
        kafka    = %config.kafka_addr,
        "🚀 Starting IICPC Distributed Load Generator"
    );

    // ── Build Kafka producer ───────────────────────────────────────────────────
    // rskafka is pure Rust — no CMake, no librdkafka, no C deps at all
    let kafka_client = ClientBuilder::new(vec![config.kafka_addr.clone()])
        .build()
        .await?;

    let partition_client = Arc::new(
        kafka_client
            .partition_client("raw_orders_stream", 0, UnknownTopicHandling::Retry)
            .await?,
    );

    info!("✅ Kafka producer connected to {}", config.kafka_addr);

    // ── Telemetry aggregation channel ─────────────────────────────────────────
    // All workers push WorkerSample into this channel
    // The aggregator task is the single consumer
    // Channel now sends Batches of samples to drastically reduce thread lock contention
    let (telemetry_tx, mut telemetry_rx) = mpsc::channel::<Vec<RawEvent>>(5000);

    // ── Aggregator task ───────────────────────────────────────────────────────
    let agg_config         = Arc::clone(&config);
    let agg_kafka_client   = Arc::clone(&partition_client);

    tokio::spawn(async move {
        let mut payload_batch: Vec<RawEvent> = Vec::with_capacity(agg_config.batch_size * 2);

        while let Some(mut batch) = telemetry_rx.recv().await {
            payload_batch.append(&mut batch);

            if payload_batch.len() >= agg_config.batch_size {
                let records: Vec<Record> = payload_batch
                    .drain(..)
                    .filter_map(|event| {
                        serde_json::to_vec(&event).ok().map(|json_bytes| Record {
                            key: None,
                            value: Some(json_bytes),
                            headers: Default::default(),
                            timestamp: Utc::now(),
                        })
                    })
                    .collect();

                if !records.is_empty() {
                    if let Err(e) = agg_kafka_client.produce(records, rskafka::client::partition::Compression::NoCompression).await {
                        error!("Kafka publish failed: {}", e);
                    }
                }
            }
        }
    });

    // ── Build global HTTP client ──────────────────────────────────────────────
    // A single client shared across all workers allows global connection pooling.
    // 3200 max idle covers 100 workers * 16 pipelined requests seamlessly.
    let http_client = reqwest::Client::builder()
        .pool_max_idle_per_host(3200)
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .expect("Failed to build HTTP client");

    // ── Spawn bot worker fleet ────────────────────────────────────────────────
    let mut handles = Vec::with_capacity(config.num_workers);

    for worker_id in 0..config.num_workers {
        let tx     = telemetry_tx.clone();
        let url    = config.target_url.clone();
        let client = http_client.clone();

        let contestant_id_clone = config.contestant_id.clone();
        let handle = tokio::spawn(async move {
            run_worker(worker_id, url, client, tx, contestant_id_clone).await;
        });

        handles.push(handle);
    }

    info!("⚡ {} workers spawned — bombarding {}", config.num_workers, config.target_url);

    // Drop the original sender so aggregator exits when all workers are done
    drop(telemetry_tx);

    // Wait for all workers (they run infinitely until cancelled)
    for handle in handles {
        let _ = handle.await;
    }

    Ok(())
}

// ── A single bot worker — runs forever ───────────────────────────────────────
async fn run_worker(
    worker_id: usize,
    target_url: String,
    client: reqwest::Client,
    telemetry_tx: mpsc::Sender<Vec<RawEvent>>,
    contestant_id: String,
) {
    let target_url = Arc::new(target_url);

    // StdRng is Send-safe — safe to hold across .await points unlike ThreadRng
    let mut rng = StdRng::from_entropy();
    
    // Pipelining: keep up to 16 requests in-flight concurrently per worker
    let max_in_flight = 16;
    let mut in_flight = FuturesUnordered::new();
    
    // Batch samples locally to minimize channel contention
    let mut local_batch = Vec::with_capacity(100);

    loop {
        // Top up the pipeline
        while in_flight.len() < max_in_flight {
            // ── BUG FIX 1: Real nanosecond timestamp on the order ─────────────
            let send_ts_ns = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos() as u64;

            // Randomize orders so the contestant's engine gets realistic variety
            let (side, price) = if rng.gen_bool(0.5) {
                (OrderSide::Buy,  148.0 + rng.r#gen::<f64>() * 4.0)  // 148–152
            } else {
                (OrderSide::Sell, 148.0 + rng.r#gen::<f64>() * 4.0)
            };

            let order_type = match rng.gen_range(0..3) {
                0 => OrderType::Limit,
                1 => OrderType::Market,
                _ => OrderType::Cancel,
            };

            let order = Order {
                order_id:   Uuid::new_v4().to_string(),
                symbol:     "AAPL".to_string(),
                price,
                quantity:   (rng.r#gen::<u32>() % 100 + 1) as f64,  // 1–100 shares
                side,
                order_type,
                timestamp:  send_ts_ns,
            };

            let order_clone = order.clone();
            let contestant_id_clone = contestant_id.clone();
            let client = client.clone();
            let target = target_url.clone();
            let worker_id = worker_id;
            
            in_flight.push(async move {
                let mut events = Vec::new();
                events.push(RawEvent::OrderSent(order_clone, contestant_id_clone.clone()));

                // Stamp time BEFORE the network call
                let start = Instant::now();

                let result = client
                    .post(target.as_ref())
                    .json(&order)
                    .send()
                    .await;

                // Nanosecond round-trip time
                let latency_ns = start.elapsed().as_nanos();

                match result {
                    Ok(response) if response.status().is_success() => {
                        match response.json::<OrderAck>().await {
                            Ok(ack) => {
                                events.push(RawEvent::OrderAcked(ack, contestant_id_clone, latency_ns));
                            }
                            Err(_) => {
                                warn!(worker = worker_id, "Invalid OrderAck response body");
                            }
                        }
                    }
                    Ok(response) => {
                        warn!(worker = worker_id, status = %response.status(), "HTTP error from contestant");
                    }
                    Err(e) => {
                        warn!(worker = worker_id, error = %e, "Network error");
                    }
                };

                events
            });
        }

        // Wait for the fastest request to complete before pushing another
        if let Some(mut events) = in_flight.next().await {
            local_batch.append(&mut events);

            // Push batched measurements to aggregator
            if local_batch.len() >= 100 {
                let batch_to_send = std::mem::replace(&mut local_batch, Vec::with_capacity(100));
                if telemetry_tx.send(batch_to_send).await.is_err() {
                    break; // Aggregator dropped — clean shutdown
                }
            }

            // Configurable delay: WORKER_DELAY_MS env var (default 0 = full speed)
            let delay = WORKER_DELAY_MS.load(std::sync::atomic::Ordering::Relaxed);
            if delay > 0 {
                tokio::time::sleep(tokio::time::Duration::from_millis(delay)).await;
            }
        }
    }
}
