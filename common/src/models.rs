use serde::{Deserialize, Serialize};

// Represents an incoming order from a Bot to a Contestant's engine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Order {
    pub order_id: String,
    pub symbol: String,
    pub price: f64,
    pub quantity: f64,
    pub side: OrderSide,
    pub order_type: OrderType,
    pub timestamp: u64, // Unix timestamp in nanoseconds
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum OrderSide {
    Buy,
    Sell,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum OrderType {
    Limit,
    Market,
    Cancel,
}

/// Represents the response/acknowledgement from the Contestant's engine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderAck {
    pub order_id: String,
    pub status: AckStatus,
    pub execution_price: Option<f64>,
    pub execution_quantity: Option<f64>,
    pub timestamp: u64, // Used to calculate round-trip latency
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AckStatus {
    Accepted,
    Rejected,
    Filled,
    PartiallyFilled,
}

/// Telemetry payload sent from the Load Generator to the Telemetry Ingester
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryPayload {
    pub bot_id: String,
    pub contestant_id: String,
    pub total_orders_sent: u64,
    pub p50_latency_ns: u64,
    pub p90_latency_ns: u64,
    pub p99_latency_ns: u64,
    pub failed_orders: u64,
    pub snapshot_timestamp: u64,
}

/// A raw event streamed from the Load Generator to the Telemetry Ingester
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RawEvent {
    OrderSent(Order, String), // Order, Contestant ID
    OrderAcked(OrderAck, String, u128), // Ack, Contestant ID, Latency NS
}
