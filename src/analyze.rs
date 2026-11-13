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
    /// DNA bases, uppercase (LNA positions read as their DNA base).
    pub sequence: String,
    /// IDT-style notation with `+` before each LNA base; equals `sequence`
    /// when there is no LNA.
    pub notation: String,
    pub lna_count: usize,
    pub length: usize,
    pub gc_percent: f64,
    /// Duplex Tm against the perfect DNA complement, °C (LNA-aware:
    /// Owczarzy et al. 2011 / McTigue et al. 2004 nearest neighbours).
    pub tm: f64,
    /// Anhydrous molecular weight, g/mol (5'-OH, LNA bridges included).
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

/// One oligo as typed: its DNA bases and which of them are LNA.
#[derive(Debug, Clone, PartialEq)]
pub struct Oligo {
    /// Uppercase A/C/G/T.
    pub dna: String,
    /// `lna[i]`: base `i` is a locked nucleic acid.
    pub lna: Vec<bool>,
}

impl Oligo {
    pub fn lna_count(&self) -> usize {
        self.lna.iter().filter(|&&l| l).count()
    }

    /// IDT-style notation: each LNA base prefixed with `+` ("AG+C+TG").
    pub fn notation(&self) -> String {
        let mut out = String::with_capacity(self.dna.len() + self.lna_count());
        for (c, &l) in self.dna.chars().zip(&self.lna) {
            if l {
                out.push('+');
            }
            out.push(c);
        }
        out
    }
}

/// Accepts raw or FASTA text: drops `>` header lines, whitespace and
/// position numbers, and reads U as T. LNA residues are marked either with
/// a leading `+` (IDT notation, "+A") or, in a sequence that mixes cases,
/// by lowercase letters ("agGCtG"). An all-lowercase sequence is plain DNA,
/// since that is how many tools export ordinary sequences.
pub fn parse_oligo(raw: &str, what: &str) -> Result<Oligo, AppError> {
    let body: String = raw.lines().filter(|l| !l.trim_start().starts_with('>')).collect();
    let chars: Vec<char> = body.chars().filter(|c| !c.is_whitespace() && !c.is_ascii_digit()).collect();
    let has_upper = chars.iter().any(|c| c.is_ascii_uppercase());
    let has_lower = chars.iter().any(|c| c.is_ascii_lowercase());
    let lower_is_lna = has_upper && has_lower;

    let mut dna = String::with_capacity(chars.len());
    let mut lna = Vec::with_capacity(chars.len());
    let mut bad: Vec<char> = Vec::new();
    let mut plus = false;
    for c in chars {
        if c == '+' {
            if plus {
                return Err(AppError::bad_request(format!("{what} has '++'. Mark each LNA base with a single +, as in +A.")));
            }
            plus = true;
            continue;
        }
        let base = match c.to_ascii_uppercase() {
            'U' => 'T',
            other => other,
        };
        if !matches!(base, 'A' | 'C' | 'G' | 'T') {
            bad.push(c.to_ascii_uppercase());
        }
        dna.push(base);
        lna.push(plus || (lower_is_lna && c.is_ascii_lowercase()));
        plus = false;
    }
    if plus {
        return Err(AppError::bad_request(format!("{what} ends with +. A + marks the LNA base that follows it.")));
    }
    if dna.is_empty() {
        return Err(AppError::bad_request(format!("{what} is empty.")));
    }
    bad.sort_unstable();
    bad.dedup();
    if !bad.is_empty() {
        let list: Vec<String> = bad.iter().map(|c| c.to_string()).collect();
        return Err(AppError::bad_request(format!("{what} contains unsupported characters: {}. Use A, C, G, T only (lowercase or +N for LNA).", list.join(" "))));
    }
    if dna.len() > MAX_LEN {
        return Err(AppError::bad_request(format!("{what} is {} nt; Thermool handles oligos up to {MAX_LEN} nt.", dna.len())));
    }
    Ok(Oligo { dna, lna })
}

/// The DNA bases of [`parse_oligo`], for analyses that model LNA as DNA
/// (folding, competition) and for IDT structure calls.
pub fn clean_sequence(raw: &str, what: &str) -> Result<String, AppError> {
    parse_oligo(raw, what).map(|o| o.dna)
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

/// Mass an LNA residue adds over its DNA nucleotide: the 2'-O,4'-C
/// methylene bridge (+C +O -2H), g/mol.
const LNA_MASS_DELTA: f64 = 27.99;

fn properties(o: &Oligo, c: &Conditions) -> Result<Properties, AppError> {
    use thermo_core::lna;
    let fail = |e: thermo_core::ThermoError| AppError::bad_request(e.to_string());
    let seq = o.dna.as_str();
    let gc = seq.bytes().filter(|b| matches!(b, b'G' | b'C')).count();
    let tm = lna::lna_duplex_tm(seq, &o.lna, c.sodium_m(), c.mg_mm / 1000.0, c.dntp_mm / 1000.0, c.oligo_um * 1e-6).map_err(fail)?;
    let (dh, ds) = lna::lna_duplex_dh_ds(seq, &o.lna).map_err(fail)?;
    let dg37 = lna::lna_duplex_dg(seq, &o.lna, 37.0, c.sodium_m(), c.free_magnesium_m()).map_err(fail)?;
    let mw = molecular_weight(seq) + LNA_MASS_DELTA * o.lna_count() as f64;
    Ok(Properties {
        sequence: seq.to_string(),
        notation: o.notation(),
        lna_count: o.lna_count(),
        length: seq.len(),
        gc_percent: 100.0 * gc as f64 / seq.len() as f64,
        tm,
        mw,
        dh,
        ds,
        dg37,
    })
}

pub async fn analyze(Json(req): Json<AnalyzeRequest>) -> Result<Json<AnalyzeResponse>, AppError> {
    req.conditions.validate().map_err(AppError::bad_request)?;
    let oligo = parse_oligo(&req.sequence, "Sequence")?;
    let partner_oligo = match req.partner.as_deref().map(str::trim) {
        Some(p) if !p.is_empty() => Some(parse_oligo(p, "Partner sequence")?),
        _ => None,
    };
    // Structures are folded on the DNA bases: there are no LNA loop,
    // mismatch or dangle parameters to fold them with.
    let seq = oligo.dna.clone();
    let partner = partner_oligo.as_ref().map(|p| p.dna.clone());
    let c = req.conditions;
    let ps = req.engine.param_set();

    // CPU-bound subopt enumeration: keep it off the async workers.
    let result = tokio::task::spawn_blocking(move || -> Result<AnalyzeResponse, AppError> {
        let params = c.thermo_params();
        Ok(AnalyzeResponse {
            oligo: properties(&oligo, &c)?,
            partner: partner_oligo.as_ref().map(|p| properties(p, &c)).transpose()?,
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
    fn parse_oligo_reads_mixed_case_as_lna() {
        let o = parse_oligo("agGCtGttATggat", "Sequence").unwrap();
        assert_eq!(o.dna, "AGGCTGTTATGGAT");
        assert_eq!(o.notation(), "+A+GGC+TG+T+TAT+G+G+A+T");
        assert_eq!(o.lna_count(), 9);
    }

    #[test]
    fn parse_oligo_all_lowercase_is_plain_dna() {
        let o = parse_oligo("acgtacgt", "Sequence").unwrap();
        assert_eq!(o.lna_count(), 0);
    }

    #[test]
    fn parse_oligo_reads_plus_notation() {
        let o = parse_oligo("+a+cGT", "Sequence").unwrap();
        assert_eq!(o.lna, vec![true, true, false, false]);
        let o = parse_oligo("+A+C+G+T", "Sequence").unwrap();
        assert_eq!(o.lna_count(), 4);
        assert!(parse_oligo("ACG+", "Sequence").is_err());
        assert!(parse_oligo("A++C", "Sequence").is_err());
    }

    #[test]
    fn lna_raises_tm() {
        let c = Conditions::default();
        let dna = properties(&parse_oligo("AGGCTGTTATGGAT", "S").unwrap(), &c).unwrap();
        let lna = properties(&parse_oligo("agGCtGttATggat", "S").unwrap(), &c).unwrap();
        assert!(lna.tm > dna.tm + 15.0, "dna={} lna={}", dna.tm, lna.tm);
        assert!((lna.mw - dna.mw - 9.0 * LNA_MASS_DELTA).abs() < 1e-6);
    }

    #[test]
    fn properties_are_plausible_for_a_20mer() {
        let p = properties(&parse_oligo("GCACTACAACCGCTACCGTG", "S").unwrap(), &Conditions::default()).unwrap();
        assert_eq!(p.length, 20);
        assert!((p.gc_percent - 60.0).abs() < 1e-9);
        assert!((55.0..70.0).contains(&p.tm), "tm={}", p.tm);
        assert!((6000.0..6300.0).contains(&p.mw), "mw={}", p.mw);
        assert!(p.dg37 < -15.0, "dg37={}", p.dg37);
    }
}
