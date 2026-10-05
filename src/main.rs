//! Thermool server: Strider thermodynamics for one pasted oligo (plus an
//! optional partner for the heterodimer), and a thin IDT OligoAnalyzer
//! proxy so the browser can compare against IDT without CORS trouble.
//! Also serves the built frontend (`frontend/dist`) at `/`.

mod analyze;
mod conditions;
mod error;
mod idt;

use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Value};
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

#[derive(Clone, Default)]
pub struct AppState {
    pub http: reqwest::Client,
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true, "version": env!("CARGO_PKG_VERSION") }))
}

fn router(state: AppState) -> Router {
    let dist = std::env::var("THERMOOL_FRONTEND_DIST").unwrap_or_else(|_| "frontend/dist".to_string());
    Router::new()
        .route("/api/health", get(health))
        .route("/api/analyze", post(analyze::analyze))
        .route("/api/idt/token", post(idt::token))
        .route("/api/idt/run", post(idt::run))
        .layer(CorsLayer::permissive())
        .with_state(state)
        .fallback_service(ServeDir::new(dist))
}

#[tokio::main]
async fn main() {
    let addr = std::env::var("THERMOOL_ADDR").unwrap_or_else(|_| "127.0.0.1:5070".to_string());
    let listener = tokio::net::TcpListener::bind(&addr).await.expect("failed to bind server address");
    println!("thermool listening on http://{addr}");
    axum::serve(listener, router(AppState::default())).await.expect("server error");
}
