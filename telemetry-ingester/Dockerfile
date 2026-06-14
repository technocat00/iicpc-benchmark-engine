# Stage 1: Build (uses the full Rust compiler toolchain)
FROM rust:latest AS builder
WORKDIR /app

# Install minimal build deps
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Copy workspace
COPY Cargo.toml Cargo.lock ./
COPY common/ common/
COPY dummy-engine/ dummy-engine/
COPY load-generator/ load-generator/
COPY sandboxing-engine/ sandboxing-engine/
COPY telemetry-ingester/ telemetry-ingester/

# Build only the binary we need (avoids compiling all crates)
RUN cargo build --release -p telemetry-ingester

# Stage 2: Runtime (tiny Debian slim image, no compiler)
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/telemetry-ingester /usr/local/bin/telemetry-ingester
EXPOSE 4000
CMD ["telemetry-ingester"]
