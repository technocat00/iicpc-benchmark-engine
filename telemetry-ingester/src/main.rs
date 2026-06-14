mod orderbook;

use anyhow::{Context, Result};
use axum::{
    Json, Router,
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
    routing::get,
};
use common::models::RawEvent;
use dashmap::DashMap;
use futures::{SinkExt, StreamExt};
use hdrhistogram::Histogram;
use redis::AsyncCommands;
use rskafka::{
    client::{
        ClientBuilder,
        consumer::{StartOffset, StreamConsumerBuilder},
        partition::UnknownTopicHandling,
    },
};
use serde::{Deserialize, Serialize};
use std::{
    net::SocketAddr,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::broadcast;
use tracing::{error, info, warn};
use orderbook::{Orderbook, ExpectedFill};

const SILENCE_TIMEOUT_SECS: u64 = 30;
const DEGRADED_FAILURE_PCT: f64 = 5.0;
const FAILED_FAILURE_PCT: f64 = 20.0;
const DEGRADED_P99_NS: u64 = 10_000_000;
const FAILED_P99_NS: u64 = 100_000_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ContestantStatus {
    Live,
    Degraded,
    Failed,
    Silent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContestantScore {
    pub contestant_id: String,
    pub total_orders: u64,
    pub failed_orders: u64,
    pub correctness_pct: f64,
    pub tps: f64,
    pub p50_ns: u64,
    pub p90_ns: u64,
    pub p99_ns: u64,
    pub snapshot_count: u64,
    pub status: ContestantStatus,
    pub last_seen_ns: u64,
    pub composite_score: f64,
}

impl ContestantScore {
    fn new(contestant_id: String) -> Self {
        Self {
            contestant_id,
            total_orders: 0,
            failed_orders: 0,
            correctness_pct: 100.0,
            tps: 0.0,
            p50_ns: 0,
            p90_ns: 0,
            p99_ns: 0,
            snapshot_count: 0,
            status: ContestantStatus::Live,
            last_seen_ns: now_ns(),
            composite_score: 0.0,
        }
    }

    fn recalculate(&mut self, prev_total: u64, prev_ts_ns: u64) {
        self.snapshot_count += 1;

        self.correctness_pct = if self.total_orders > 0 {
            (self.total_orders.saturating_sub(self.failed_orders)) as f64
                / self.total_orders as f64
                * 100.0
        } else {
            100.0
        };

        if prev_ts_ns > 0 && now_ns() > prev_ts_ns {
            let delta_orders = self.total_orders.saturating_sub(prev_total);
            let delta_secs   = (now_ns() - prev_ts_ns) as f64 / 1e9;
            if delta_secs > 0.0 {
                self.tps = delta_orders as f64 / delta_secs;
            }
        }

        let failure_pct = 100.0 - self.correctness_pct;

        self.status = if failure_pct >= FAILED_FAILURE_PCT || self.p99_ns > FAILED_P99_NS {
            ContestantStatus::Failed
        } else if failure_pct >= DEGRADED_FAILURE_PCT || self.p99_ns > DEGRADED_P99_NS {
            ContestantStatus::Degraded
        } else {
            ContestantStatus::Live
        };

        self.composite_score = if self.tps > 0.0 && self.p99_ns > 0 {
            self.correctness_pct
                * (self.tps + 1.0).log10()
                / (self.p99_ns as f64 + 1.0).log10()
        } else {
            0.0
        };
    }

    fn check_silence(&mut self) {
        let elapsed_ns = now_ns().saturating_sub(self.last_seen_ns);
        let elapsed_secs = elapsed_ns / 1_000_000_000;
        if elapsed_secs > SILENCE_TIMEOUT_SECS && self.status != ContestantStatus::Failed {
            self.status = ContestantStatus::Silent;
        }
    }
}

#[derive(Default)]
struct PrevSnapshot {
    total_orders: u64,
    timestamp_ns: u64,
}

struct AppState {
    scores: DashMap<String, ContestantScore>,
    orderbooks: DashMap<String, std::sync::Mutex<Orderbook>>,
    expected_fills: DashMap<String, Vec<ExpectedFill>>,
    latencies: DashMap<String, std::sync::Mutex<Histogram<u64>>>,
    prev_snapshots: DashMap<String, PrevSnapshot>,
    broadcast_tx: broadcast::Sender<String>,
    redis: redis::aio::ConnectionManager,
}

fn now_ns() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64
}

struct Config {
    kafka_addr:  String,
    redis_url:   String,
    listen_addr: SocketAddr,
}

impl Config {
    fn from_env() -> Self {
        Self {
            kafka_addr:  std::env::var("KAFKA_ADDR")
                .unwrap_or_else(|_| "localhost:9092".into()),
            redis_url:   std::env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://localhost:6379".into()),
            listen_addr: std::env::var("LISTEN_ADDR")
                .unwrap_or_else(|_| "0.0.0.0:4000".into())
                .parse()
                .expect("Invalid LISTEN_ADDR"),
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_target(false)
        .compact()
        .init();

    let config = Config::from_env();

    info!("🚀 Starting Telemetry Ingester (with Shadow Matching Engine)");
    info!("   Kafka  → {}", config.kafka_addr);
    info!("   Redis  → {}", config.redis_url);
    info!("   Listen → {}", config.listen_addr);

    let redis_client = redis::Client::open(config.redis_url.clone())
        .context("Invalid Redis URL")?;
    let redis_conn = redis::aio::ConnectionManager::new(redis_client)
        .await
        .context("Failed to connect to Redis")?;

    info!("✅ Redis connected");

    let (broadcast_tx, _) = broadcast::channel::<String>(256);

    let state = Arc::new(AppState {
        scores:         DashMap::new(),
        orderbooks:     DashMap::new(),
        expected_fills: DashMap::new(),
        latencies:      DashMap::new(),
        prev_snapshots: DashMap::new(),
        broadcast_tx:   broadcast_tx.clone(),
        redis:          redis_conn,
    });

    let kafka_state = Arc::clone(&state);
    tokio::spawn(async move {
        loop {
            match run_kafka_consumer(Arc::clone(&kafka_state), &config.kafka_addr).await {
                Ok(_) => {
                    warn!("Kafka consumer exited cleanly, restarting in 5s...");
                }
                Err(e) => {
                    error!("Kafka consumer crashed: {}. Retrying in 5 seconds...", e);
                }
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });

    let silence_state = Arc::clone(&state);
    tokio::spawn(async move {
        run_silence_detector(silence_state).await;
    });

    let app = Router::new()
        .route("/health",      get(handle_health))
        .route("/api/scores",  get(handle_scores))
        .route("/ws",          get(handle_ws_upgrade))
        .with_state(Arc::clone(&state));

    info!("🌐 HTTP server listening on {}", config.listen_addr);

    let listener = tokio::net::TcpListener::bind(config.listen_addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn run_kafka_consumer(state: Arc<AppState>, kafka_addr: &str) -> Result<()> {
    let client = ClientBuilder::new(vec![kafka_addr.to_string()])
        .build()
        .await?;

    let partition_client = client
        .partition_client("raw_orders_stream", 0, UnknownTopicHandling::Retry)
        .await?;

    info!("✅ Kafka consumer connected, reading from 'raw_orders_stream' partition 0");

    let mut stream = StreamConsumerBuilder::new(
        Arc::new(partition_client),
        StartOffset::Latest,
    )
    .with_max_batch_size(1_000_000)
    .with_max_wait_ms(100)
    .build();

    while let Some(result) = stream.next().await {
        match result {
            Ok((record_and_offset, _high_watermark)) => {
                if let Some(bytes) = &record_and_offset.record.value {
                    match serde_json::from_slice::<RawEvent>(bytes) {
                        Ok(event) => {
                            process_raw_event(&state, event).await;
                        }
                        Err(e) => {
                            warn!("Failed to deserialize RawEvent: {}", e);
                        }
                    }
                }
            }
            Err(e) => {
                error!("Kafka stream error: {}", e);
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        }
    }

    Ok(())
}

async fn process_raw_event(state: &Arc<AppState>, event: RawEvent) {
    match event {
        RawEvent::OrderSent(order, contestant_id) => {
            let order_id = order.order_id.clone();
            let ob_lock = state.orderbooks.entry(contestant_id.clone()).or_insert_with(|| std::sync::Mutex::new(Orderbook::new()));
            let fills = ob_lock.lock().unwrap().process_order(order);
            if !fills.is_empty() {
                state.expected_fills.insert(order_id, fills);
            }
        }
        RawEvent::OrderAcked(ack, contestant_id, latency_ns) => {
            let should_broadcast = {
                let mut score = state.scores.entry(contestant_id.clone()).or_insert_with(|| ContestantScore::new(contestant_id.clone()));
                score.total_orders += 1;
                score.last_seen_ns = now_ns();

                // Record Latency
                {
                    let hist_lock = state.latencies.entry(contestant_id.clone()).or_insert_with(|| std::sync::Mutex::new(Histogram::<u64>::new(3).unwrap()));
                    let mut hist = hist_lock.lock().unwrap();
                    let _ = hist.record(latency_ns as u64);
                    
                    score.p50_ns = hist.value_at_percentile(50.0);
                    score.p90_ns = hist.value_at_percentile(90.0);
                    score.p99_ns = hist.value_at_percentile(99.0);
                }

                // Price-Time Priority Validation
                let mut is_correct = false;
                if let Some((_, expected_fills)) = state.expected_fills.remove(&ack.order_id) {
                    if let Some(first_fill) = expected_fills.first() {
                        if ack.status == common::models::AckStatus::Accepted || ack.status == common::models::AckStatus::Filled {
                            if ack.execution_price == Some(first_fill.price) {
                                is_correct = true;
                            }
                        }
                    }
                } else {
                    if ack.execution_price.is_none() || ack.status == common::models::AckStatus::Rejected {
                        is_correct = true;
                    }
                }

                if !is_correct {
                    score.failed_orders += 1;
                }

                let (prev_total, prev_ts) = {
                    let mut prev = state.prev_snapshots.entry(contestant_id.clone()).or_default();
                    let pt = prev.total_orders;
                    let pts = prev.timestamp_ns;
                    if now_ns() - pts > 1_000_000_000 {
                        prev.total_orders = score.total_orders;
                        prev.timestamp_ns = now_ns();
                    }
                    (pt, pts)
                };

                score.recalculate(prev_total, prev_ts);
                score.total_orders % 5 == 0 || score.total_orders < 10
            }; // DashMap lock dropped here

            if should_broadcast {
                broadcast_leaderboard(state).await;
            }
        }
    }
}

async fn broadcast_leaderboard(state: &Arc<AppState>) {
    let mut all_scores: Vec<ContestantScore> = state.scores
        .iter()
        .map(|entry| entry.value().clone())
        .collect();

    all_scores.sort_by(|a, b| {
        b.composite_score
            .partial_cmp(&a.composite_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    if let Ok(leaderboard_json) = serde_json::to_string(&all_scores) {
        let mut redis = state.redis.clone();
        let _ = redis.set_ex::<_, _, ()>("leaderboard", &leaderboard_json, 60).await;
        let _ = state.broadcast_tx.send(leaderboard_json);
    }
}

async fn run_silence_detector(state: Arc<AppState>) {
    let mut interval = tokio::time::interval(Duration::from_secs(5));
    loop {
        interval.tick().await;

        let mut found_silent = false;
        for mut entry in state.scores.iter_mut() {
            let prev_status = entry.status.clone();
            entry.check_silence();
            if entry.status == ContestantStatus::Silent && prev_status != ContestantStatus::Silent {
                found_silent = true;
            }
        }

        if found_silent {
            broadcast_leaderboard(&state).await;
        }
    }
}

async fn handle_health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "contestants": state.scores.len(),
        "timestamp_ns": now_ns(),
    }))
}

async fn handle_scores(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let mut scores: Vec<ContestantScore> = state.scores
        .iter()
        .map(|e| e.value().clone())
        .collect();

    scores.sort_by(|a, b| {
        b.composite_score
            .partial_cmp(&a.composite_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Json(scores)
}

async fn handle_ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws_connection(socket, state))
}

async fn handle_ws_connection(socket: WebSocket, state: Arc<AppState>) {
    let mut rx = state.broadcast_tx.subscribe();
    let (mut sender, mut receiver) = socket.split();

    {
        let mut scores: Vec<ContestantScore> = state.scores
            .iter()
            .map(|e| e.value().clone())
            .collect();
        scores.sort_by(|a, b| {
            b.composite_score.partial_cmp(&a.composite_score).unwrap_or(std::cmp::Ordering::Equal)
        });
        if let Ok(json) = serde_json::to_string(&scores) {
            let _ = sender.send(Message::Text(json.into())).await;
        }
    }

    info!("🔌 WebSocket client connected");

    loop {
        tokio::select! {
            result = rx.recv() => {
                match result {
                    Ok(json) => {
                        if sender.send(Message::Text(json.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        warn!("WebSocket client lagged by {} messages", n);
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(data))) => {
                        let _ = sender.send(Message::Pong(data)).await;
                    }
                    _ => {}
                }
            }
        }
    }

    info!("🔌 WebSocket client disconnected");
}
