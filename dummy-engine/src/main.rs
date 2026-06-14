use axum::{
    extract::Json,
    routing::post,
    Router,
};
use common::models::{AckStatus, Order, OrderAck};
use std::{net::SocketAddr, time::{SystemTime, UNIX_EPOCH}};
use tracing::info;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().compact().init();

    let app = Router::new()
        .route("/api/order", post(handle_order));

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .unwrap_or(8080);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("Dummy Trading Engine listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn handle_order(Json(order): Json<Order>) -> Json<OrderAck> {
    // Instantly accept the order and send back an ack.
    // In a real C++ engine, this would hit the lock-free orderbook matching engine.
    let ack = OrderAck {
        order_id: order.order_id,
        status: AckStatus::Accepted,
        execution_price: Some(order.price),
        execution_quantity: Some(order.quantity),
        timestamp: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos() as u64,
    };

    Json(ack)
}
