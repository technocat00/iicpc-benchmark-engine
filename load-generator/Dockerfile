# Stage 1: Build
FROM rust:latest AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock ./
COPY common/ common/
COPY dummy-engine/ dummy-engine/
COPY load-generator/ load-generator/
COPY sandboxing-engine/ sandboxing-engine/
COPY telemetry-ingester/ telemetry-ingester/
RUN cargo build --release -p load-generator

# Stage 2: Runtime
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/load-generator /usr/local/bin/load-generator
CMD ["load-generator"]
