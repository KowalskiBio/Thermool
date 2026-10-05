//! `POST /api/analyze`: everything Strider says about one oligo (and an
//! optional partner): duplex properties, plus up to five ranked hairpin,
//! self-dimer and heterodimer structures in both of Strider's models.

use axum::Json;
use crate::structure_variant::{analyze_structure_in, FullStructureAnalysis};
use thermo_core::mathews2004::ParamSetId;
use serde::{Deserialize, Serialize};

use crate::conditions::Conditions;
use crate::error::AppError;

/// Structure enumeration grows quickly with length; oligos are short.
pub const MAX_LEN: usize = 150;

#[derive(Debug, Deserialize)]
pub struct AnalyzeRequest {
    pub sequence: String,
    #[serde(default)]
    pub partner: Option<String>,
    #[serde(default)]
    pub conditions: Conditions,
    #[serde(default)]
    pub engine: Engine,
}

/// Nearest-neighbour parameter set for hairpin and dimer folding/scoring
/// (Oligool's Mathews/SantaLucia switch). Duplex Tm always uses SantaLucia
/// & Hicks 2004 nearest-neighbour values, whichever is chosen.
#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Engine {
    #[default]
    Mathews,
    Santalucia,
}

impl Engine {
    pub fn param_set(self) -> ParamSetId {
        match self {
            Engine::Mathews => ParamSetId::Mathews2004,
            Engine::Santalucia => ParamSetId::SantaLucia2004,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct Properties {
    pub sequence: String,
    pub length: usize,
    pub gc_percent: f64,
    /// Duplex Tm against the perfect complement, °C.
    pub tm: f64,
    /// Anhydrous molecular weight, g/mol (unmodified, 5'-OH).
    pub mw: f64,
    /// Nearest-neighbour duplex ΔH (kcal/mol) and ΔS (cal/mol/K), before salt correction.
    pub dh: f64,
    pub ds: f64,
    /// Salt-corrected duplex ΔG at 37 °C, kcal/mol.
    pub dg37: f64,
}

#[derive(Debug, Serialize)]
pub struct AnalyzeResponse {
    pub oligo: Properties,
    pub partner: Option<Properties>,
    /// Hairpin, self-dimer and (with a partner) heterodimer of `oligo`.
    pub structures: FullStructureAnalysis,
    /// Hairpin and self-dimer of `partner`.
    pub partner_structures: Option<FullStructureAnalysis>,
}

/// Accepts raw or FASTA text: drops `>` header lines, whitespace and
/// position numbers, uppercases, and reads U as T.
pub fn clean_sequence(raw: &str, what: &str) -> Result<String, AppError> {
    let body: String = raw.lines().filter(|l| !l.trim_start().starts_with('>')).collect();
    let seq: String = body
        .chars()
        .filter(|c| !c.is_whitespace() && !c.is_ascii_digit())
        .map(|c| match c.to_ascii_uppercase() {
            'U' => 'T',
            other => other,
        })
        .collect();
    if seq.is_empty() {
        return Err(AppError::bad_request(format!("{what} is empty.")));
    }
    let mut bad: Vec<char> = seq.chars().filter(|c| !matches!(c, 'A' | 'C' | 'G' | 'T')).collect();
    bad.sort_unstable();
    bad.dedup();
    if !bad.is_empty() {
        let list: Vec<String> = bad.iter().map(|c| c.to_string()).collect();
        return Err(AppError::bad_request(format!("{what} contains unsupported characters: {}. Use A, C, G, T only.", list.join(" "))));
    }
    if seq.len() > MAX_LEN {
        return Err(AppError::bad_request(format!("{what} is {} nt; Thermool handles oligos up to {MAX_LEN} nt.", seq.len())));
    }
    Ok(seq)
}

fn molecular_weight(seq: &str) -> f64 {
    let sum: f64 = seq
        .bytes()
        .map(|b| match b {
            b'A' => 313.21,
            b'C' => 289.18,
            b'G' => 329.21,
            _ => 304.2,
        })
        .sum();
    sum - 61.96
}

fn properties(seq: &str, c: &Conditions) -> Result<Properties, AppError> {
    let fail = |e: thermo_core::ThermoError| AppError::bad_request(e.to_string());
    let gc = seq.bytes().filter(|b| matches!(b, b'G' | b'C')).count();
    let tm = thermo_core::duplex_tm(seq, c.sodium_m(), c.mg_mm / 1000.0, c.dntp_mm / 1000.0, c.oligo_um * 1e-6).map_err(fail)?;
    let (dh, ds) = thermo_core::duplex_dh_ds(seq).map_err(fail)?;
    let dg37 = thermo_core::duplex_dg(seq, 37.0, c.sodium_m(), c.free_magnesium_m()).map_err(fail)?;
    Ok(Properties { sequence: seq.to_string(), length: seq.len(), gc_percent: 100.0 * gc as f64 / seq.len() as f64, tm, mw: molecular_weight(seq), dh, ds, dg37 })
}

pub async fn analyze(Json(req): Json<AnalyzeRequest>) -> Result<Json<AnalyzeResponse>, AppError> {
    req.conditions.validate().map_err(AppError::bad_request)?;
    let seq = clean_sequence(&req.sequence, "Sequence")?;
    let partner = match req.partner.as_deref().map(str::trim) {
        Some(p) if !p.is_empty() => Some(clean_sequence(p, "Partner sequence")?),
        _ => None,
    };
    let c = req.conditions;
    let ps = req.engine.param_set();

    // CPU-bound subopt enumeration: keep it off the async workers.
    let result = tokio::task::spawn_blocking(move || -> Result<AnalyzeResponse, AppError> {
        let params = c.thermo_params();
        Ok(AnalyzeResponse {
            oligo: properties(&seq, &c)?,
            partner: partner.as_deref().map(|p| properties(p, &c)).transpose()?,
            structures: analyze_structure_in(ps, &seq, partner.as_deref(), params),
            partner_structures: partner.as_deref().map(|p| analyze_structure_in(ps, p, None, params)),
        })
    })
    .await
    .map_err(|e| AppError::new(axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Analysis failed: {e}")))??;

    Ok(Json(result))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_sequence_accepts_fasta_and_rna() {
        assert_eq!(clean_sequence(">primer 1\nacgu ACGT\n12 gg", "Sequence").unwrap(), "ACGTACGTGG");
    }

    #[test]
    fn clean_sequence_reports_bad_characters() {
        let err = clean_sequence("ACGNNX", "Sequence").unwrap_err();
        assert!(err.message.contains("N X"), "{}", err.message);
    }

    #[test]
    fn properties_are_plausible_for_a_20mer() {
        let p = properties("GCACTACAACCGCTACCGTG", &Conditions::default()).unwrap();
        assert_eq!(p.length, 20);
        assert!((p.gc_percent - 60.0).abs() < 1e-9);
        assert!((55.0..70.0).contains(&p.tm), "tm={}", p.tm);
        assert!((6000.0..6300.0).contains(&p.mw), "mw={}", p.mw);
        assert!(p.dg37 < -15.0, "dg37={}", p.dg37);
    }
}
