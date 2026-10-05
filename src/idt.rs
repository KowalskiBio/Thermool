//! IDT OligoAnalyzer proxy, ported from Primerool's `idt` crate (itself
//! from Oligool). Credentials and tokens pass straight through to IDT and
//! are never logged or stored here.
//!
//! Unlike Primerool's seven-call pair batch, `/api/idt/run` runs exactly
//! one OligoAnalyzer endpoint per request, so each analysis in the UI has
//! its own IDT button. IDT's JSON comes back verbatim; the frontend reads
//! the fields it knows and shows the rest as raw data.

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::analyze::clean_sequence;
use crate::conditions::Conditions;
use crate::error::AppError;
use crate::AppState;

/// IDT's web OligoAnalyzer folds hairpins at 25 °C by default, and Strider
/// reports hairpin ΔG at 25 °C too (`HairpinThermo::dg25`).
const FOLDING_TEMP_C: f64 = 25.0;

fn host(region: &str) -> &'static str {
    if region.eq_ignore_ascii_case("us") {
        "www.idtdna.com"
    } else {
        "eu.idtdna.com"
    }
}

#[derive(Debug, Deserialize)]
pub struct TokenRequest {
    pub client_id: String,
    pub client_secret: String,
    pub username: String,
    pub password: String,
    #[serde(default)]
    pub region: String,
}

/// Resource Owner Password Credentials grant against IDT's identity server.
pub async fn token(State(state): State<AppState>, Json(req): Json<TokenRequest>) -> Result<Json<Value>, AppError> {
    if [&req.client_id, &req.client_secret, &req.username, &req.password].iter().any(|s| s.trim().is_empty()) {
        return Err(AppError::bad_request("Client ID, client secret, username and password are all required."));
    }
    let url = format!("https://{}/IdentityServer/connect/token", host(&req.region));
    let form = [("grant_type", "password"), ("scope", "test"), ("username", req.username.as_str()), ("password", req.password.as_str())];
    let response = state
        .http
        .post(&url)
        .basic_auth(&req.client_id, Some(&req.client_secret))
        .form(&form)
        .send()
        .await
        .map_err(|e| AppError::new(StatusCode::BAD_GATEWAY, format!("Could not reach IDT: {e}")))?;
    let status = response.status();
    let body: Value = response.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        let detail = body.get("error_description").or_else(|| body.get("error")).and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| format!("HTTP {status}"));
        // 400/401 from the identity server mean bad credentials; keep them as 401.
        let code = if status.is_client_error() { StatusCode::UNAUTHORIZED } else { StatusCode::BAD_GATEWAY };
        return Err(AppError::new(code, format!("IDT sign-in failed: {detail}")));
    }
    if body.get("access_token").and_then(Value::as_str).is_none() {
        return Err(AppError::new(StatusCode::BAD_GATEWAY, "IDT sign-in returned no access token."));
    }
    Ok(Json(body))
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Analyze,
    Hairpin,
    SelfDimer,
    HeteroDimer,
}

impl Kind {
    fn endpoint(self) -> &'static str {
        match self {
            Kind::Analyze => "Analyze",
            Kind::Hairpin => "Hairpin",
            Kind::SelfDimer => "SelfDimer",
            Kind::HeteroDimer => "HeteroDimer",
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct RunRequest {
    pub kind: Kind,
    pub sequence: String,
    #[serde(default)]
    pub partner: Option<String>,
    #[serde(default)]
    pub conditions: Conditions,
    pub token: String,
    #[serde(default)]
    pub region: String,
}

pub async fn run(State(state): State<AppState>, Json(req): Json<RunRequest>) -> Result<Json<Value>, AppError> {
    if req.token.trim().is_empty() {
        return Err(AppError::new(StatusCode::UNAUTHORIZED, "Not signed in to IDT."));
    }
    req.conditions.validate().map_err(AppError::bad_request)?;
    let seq = clean_sequence(&req.sequence, "Sequence")?;
    let partner = match (req.kind, req.partner.as_deref()) {
        (Kind::HeteroDimer, Some(p)) if !p.trim().is_empty() => Some(clean_sequence(p, "Partner sequence")?),
        (Kind::HeteroDimer, _) => return Err(AppError::bad_request("A heterodimer needs a partner sequence.")),
        _ => None,
    };

    let c = req.conditions;
    let mut body = json!({
        "NaConc": c.na_mm,
        "MgConc": c.mg_mm,
        "dNTPsConc": c.dntp_mm,
        "OligoConc": c.oligo_um,
        "NucleotideType": "DNA",
    });
    let mut query: Vec<(&str, &str)> = Vec::new();
    match req.kind {
        Kind::Analyze => body["Sequence"] = json!(seq),
        Kind::Hairpin => {
            body["Sequence"] = json!(seq);
            body["FoldingTemp"] = json!(FOLDING_TEMP_C);
        }
        Kind::SelfDimer => query.push(("primary", &seq)),
        Kind::HeteroDimer => {
            query.push(("primary", &seq));
            query.push(("secondary", partner.as_deref().unwrap_or_default()));
        }
    }

    let endpoint = req.kind.endpoint();
    let url = format!("https://{}/restapi/v1/OligoAnalyzer/{endpoint}", host(&req.region));
    let response = state
        .http
        .post(&url)
        .bearer_auth(req.token.trim())
        .query(&query)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::new(StatusCode::BAD_GATEWAY, format!("Could not reach IDT: {e}")))?;

    let status = response.status();
    if status == StatusCode::UNAUTHORIZED {
        return Err(AppError::new(StatusCode::UNAUTHORIZED, "IDT rejected the access token."));
    }
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        let text: String = text.chars().take(300).collect();
        return Err(AppError::new(StatusCode::BAD_GATEWAY, format!("IDT {endpoint} failed ({status}): {text}")));
    }
    let data: Value = response.json().await.map_err(|e| AppError::new(StatusCode::BAD_GATEWAY, format!("IDT {endpoint} returned unreadable data: {e}")))?;
    Ok(Json(data))
}
