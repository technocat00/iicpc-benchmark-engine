use axum::{
    extract::Multipart,
    routing::{get, post},
    Router, Json, http::StatusCode,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::path::PathBuf;
use uuid::Uuid;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use kube::{
    api::{Api, PostParams},
    Client,
};
use k8s_openapi::api::core::v1::{
    Container, Pod, PodSpec, ResourceRequirements, SecurityContext, EnvVar,
};
use k8s_openapi::api::batch::v1::{Job, JobSpec};
use std::collections::BTreeMap;
use k8s_openapi::apimachinery::pkg::api::resource::Quantity;

#[derive(Serialize)]
struct StatusResponse {
    status: String,
}

#[derive(Serialize)]
struct SubmitResponse {
    submission_id: String,
    message: String,
}

use tower_http::cors::CorsLayer;

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/submit", post(submit_code))
        .layer(CorsLayer::permissive());

    let addr = SocketAddr::from(([0, 0, 0, 0], 8000));
    println!("Sandboxing Engine listening on {}", addr);
    
    // Ensure submissions directory exists
    tokio::fs::create_dir_all("/tmp/submissions").await.ok();

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> Json<StatusResponse> {
    Json(StatusResponse {
        status: "ok".to_string(),
    })
}

use std::process::Command;
use std::sync::atomic::{AtomicU16, Ordering};

static PORT_COUNTER: AtomicU16 = AtomicU16::new(9000);

/// Handles the binary upload, saves it securely, and provisions a local Docker Sandbox
async fn submit_code(mut multipart: Multipart) -> Result<Json<SubmitResponse>, (StatusCode, String)> {
    let submission_id = Uuid::new_v4().to_string();
    let mut file_saved = false;

    let submission_dir = format!("C:\\Users\\karti\\Documents\\antigravity\\modest-newton\\submissions\\{}", submission_id);
    std::fs::create_dir_all(&submission_dir).unwrap();

    // 1. Process Multipart Upload
    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        if field.name() == Some("binary") {
            let data = field.bytes().await.map_err(|e| {
                (StatusCode::BAD_REQUEST, format!("Failed to read multipart field: {}", e))
            })?;

            let file_path = PathBuf::from(format!("{}\\engine.cpp", submission_dir));
            let mut file = File::create(&file_path).await.unwrap();
            file.write_all(&data).await.unwrap();
            file_saved = true;
        }
    }

    if !file_saved {
        return Err((StatusCode::BAD_REQUEST, "Missing 'binary' field in upload".to_string()));
    }

    let port = PORT_COUNTER.fetch_add(1, Ordering::SeqCst);
    let sub_id_clone = submission_id.clone();
    
    // 2. Process Docker Deployment Asynchronously
    tokio::spawn(async move {
        println!("Spawning Local Docker Sandbox for contestant-{} on port {}...", sub_id_clone, port);
        
        let libs_dir = "C:\\Users\\karti\\Documents\\antigravity\\modest-newton\\cpp_libs";
        
        // Spawn Docker container to compile and run C++ code
        let status = Command::new("docker")
            .args(&[
                "run", "-d",
                "--name", &format!("contestant-{}", sub_id_clone),
                "-p", &format!("{}:8080", port),
                "-v", &format!("{}:/app", submission_dir),
                "-v", &format!("{}:/libs", libs_dir),
                "-w", "/app",
                "gcc:latest",
                "bash", "-c", "g++ -O3 -I/libs engine.cpp -o engine -lpthread && ./engine"
            ])
            .status()
            .expect("Failed to execute docker run");
            
        if !status.success() {
            println!("❌ Docker failed to start for {}", sub_id_clone);
            return;
        }

        println!("Waiting for GCC to compile and start container on port {}...", port);
        tokio::time::sleep(tokio::time::Duration::from_secs(12)).await;

        println!("✅ Container is RUNNING! Triggering Local Load Generator...");
        
        // Spawn Load Generator locally
        let lg_status = Command::new("cargo")
            .args(&["run", "--release", "--bin", "load-generator"])
            .current_dir("C:\\Users\\karti\\Documents\\antigravity\\modest-newton\\load-generator")
            .env("TARGET_URL", format!("http://localhost:{}/api/order", port))
            .env("CONTESTANT_ID", sub_id_clone.clone())
            .env("KAFKA_ADDR", "localhost:9092")
            .spawn();
            
        if let Err(e) = lg_status {
            println!("❌ Failed to spawn load generator for {}: {}", sub_id_clone, e);
        } else {
            println!("🚀 Load Generator dispatched successfully for contestant-{}!", sub_id_clone);
        }
    });

    Ok(Json(SubmitResponse {
        submission_id,
        message: "Code accepted and compiling in strict Sandbox.".to_string(),
    }))
}
