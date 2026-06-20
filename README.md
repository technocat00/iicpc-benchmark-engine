# IICPC Benchmark Engine 🚀

A distributed, high-performance benchmarking and hosting platform for evaluating trading infrastructure — built for the **IICPC Summer Hackathon 2026**.

## Architecture

```
Contestant Binary Upload
        ↓
Sandboxing Engine (Rust + Axum + kube-rs)
  → Isolated Kubernetes Pod (resource-limited, no root, read-only FS)
        ↓
Load Generator (Rust + Tokio)
  → 1,000+ async bot workers firing orders concurrently
  → Nanosecond-precision latency measurement (p50/p90/p99)
  → Publishes TelemetryPayload to Kafka
        ↓
Telemetry Ingester (Rust) [WIP]
  → Kafka consumer
  → Correctness validator (price-time priority orderbook sim)
  → Writes scores to Redis
        ↓
Frontend Dashboard (Next.js)
  → Real-time leaderboard via WebSocket
  → Live latency + TPS charts (Recharts)
  → Live terminal log
```

## Tech Stack

| Layer | Technology |
|---|---|
| Sandboxing | Rust, Axum, kube-rs, Kubernetes |
| Load Generation | Rust, Tokio (async), reqwest |
| Message Bus | Apache Kafka / Redpanda |
| Score Store | Redis |
| Frontend | Next.js 16, Tailwind CSS, Recharts |
| Infrastructure | Terraform, AWS EKS, MSK, ElastiCache |

## Project Structure

```
.
├── common/                 # Shared data models (Order, OrderAck, TelemetryPayload)
├── sandboxing-engine/      # Submission receiver + K8s pod spawner
├── load-generator/         # Distributed bot fleet + telemetry aggregator
├── telemetry-ingester/     # Kafka consumer + correctness validator + Redis writer
├── frontend/               # Next.js real-time dashboard
└── iac/                    # Terraform + Kubernetes manifests
```

## Getting Started (Local)

### Prerequisites
- Rust 1.78+
- Node.js 20+
- Docker + Docker Compose
- `kubectl` + `minikube` (for local K8s)

### Run the frontend
```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3000
```

### Build all Rust services
```bash
cargo build --workspace
```

## Scoring Criteria

Contestants are scored on:
1. **Throughput (TPS)** — Orders processed per second under load
2. **Latency p99** — Worst 1% of response times (nanoseconds)
3. **Correctness** — Price-time priority adherence, valid execution prices
4. **Stability** — No crashes, no degradation over sustained load

## Team

Built with Rust 🦀 + AI-assisted development for IICPC Summer Hackathon 2026.

## Authors

- [Kartik Agarwal]
- [Diya Arora]
