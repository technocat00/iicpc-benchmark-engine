# IICPC Benchmark Engine — Architecture Blueprint

> A high-performance, distributed, lock-free benchmarking engine for High-Frequency Trading (HFT) simulators.

## System Overview

The IICPC Benchmark Engine is a distributed infrastructure designed to evaluate trading engines under extreme load. It is built entirely in **Rust** to achieve nanosecond-precision latency tracking and is capable of generating and processing hundreds of thousands of transactions per second (TPS) on commodity hardware.

### Core Philosophy
1. **Zero Garbage Collection:** The entire hot path (Load Generator → Kafka → Ingester → Redis) is built in Rust to eliminate GC pauses, ensuring true p99 and p99.9 latency measurements.
2. **Lock-Free Concurrency:** We bypass traditional mutex bottlenecks by utilizing concurrent hash maps (`DashMap`), atomic counters, and localized thread batching.
3. **Pipelined Asynchronous I/O:** The system relies heavily on the Tokio async runtime, utilizing `FuturesUnordered` to maintain massive numbers of in-flight network requests per worker.

---

## 🏗️ The Architecture

### 1. The Distributed Load Generator (`load-generator`)
The Load Generator is responsible for bombarding contestant matching engines with realistic trading traffic.
* **Global Connection Pooling:** Maintains a massive TCP connection pool (`pool_max_idle_per_host = 3200`) across all worker threads. This guarantees that new HTTP/REST requests instantly reuse warm keep-alive TCP sockets without incurring TCP handshake overhead.
* **Tokio Futures Pipelining:** Instead of waiting sequentially for a response, each worker maintains up to 16 pipelined requests in-flight concurrently using `FuturesUnordered`. 
* **Batched MPSC Channels:** To eliminate thread lock contention on the CPU's L3 cache, workers aggregate latencies locally into chunks of 100 before transmitting them across the Tokio MPSC channel to the main aggregator thread.

### 2. High-Throughput Telemetry Stream (Redpanda / Kafka)
All performance metrics (p50, p90, p99 latencies, TPS, and failure rates) are streamed from the Load Generator fleet to the central telemetry bus using **Redpanda** (a C++ Kafka-compatible streaming engine).
* **Pure Rust Producer:** We use `rskafka` for zero-C-dependency, pure-Rust Kafka streaming, ensuring maximum memory safety and speed.

### 3. Telemetry Ingester (`telemetry-ingester`)
A dedicated microservice that consumes the Kafka stream and aggregates scores in real time.
* **Zero-Copy Deserialization:** Kafka payloads are ingested and processed without heavy memory reallocation.
* **Lock-Free Global State:** We use `DashMap` for the global leaderboard state, allowing the Kafka consumer thread to write updates and the WebSocket thread to read updates simultaneously without blocking each other.
* **Redis Persistence:** The ingester calculates a final composite score (weighting throughput and correctness) and persists it to Redis for the frontend layer.

### 4. Real-Time WebSockets (`axum` & `tokio-tungstenite`)
The Ingester exposes a high-speed WebSocket endpoint (`/ws`) and a REST endpoint (`/api/scores`).
* The UI receives pushed updates the exact millisecond a new Kafka batch lands, enabling ultra-smooth, real-time leaderboard charts.

### 5. Secure Sandboxing Runner (`sandboxing-engine`)
*(Prepared for K8s deployments)*
For untrusted contestant code, we built a Kubernetes dynamic job generator using `kube-rs`. It spins up contestant binaries in tightly constrained pods (read-only root filesystem, dropped capabilities, cgroups resource limits) before pointing the Load Generator at them.

---

## 🚀 Extreme Performance Tuning Summary

To hit maximum theoretical TPS during local testing, we implemented four major optimizations:
1. **Unlocked Throttle:** Removed artificial sleeping mechanisms; bot fleets operate strictly bounded by the contestant engine's response speed.
2. **Futures Pipelining:** `FuturesUnordered` keeps 16 network requests strictly in-flight per thread.
3. **Global Keep-Alive Pools:** Prevents TCP thrashing by sharing a global 3200-connection pool across the entire application.
4. **Channel Batching:** Dropped inter-thread communication overhead by 99% by having threads report metrics in arrays of 100 rather than singular struct messages.

This architecture guarantees that the benchmarking platform is **never** the bottleneck — ensuring that contestant scores are a true reflection of their own engine's performance.
