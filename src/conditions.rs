//! Reaction conditions, in IDT OligoAnalyzer's own units so the numbers a
//! user types (or pastes from IDT) go to both engines unchanged.

use engine::ThermoParams;
use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(default)]
pub struct Conditions {
    /// Na+ (monovalent), mM.
    pub na_mm: f64,
    /// Mg2+, mM.
    pub mg_mm: f64,
    /// dNTPs, mM.
    pub dntp_mm: f64,
    /// Oligo concentration, µM.
    pub oligo_um: f64,
}

impl Default for Conditions {
    /// IDT OligoAnalyzer's qPCR preset (Primerool's app-wide default).
    fn default() -> Self {
        Self { na_mm: 50.0, mg_mm: 3.0, dntp_mm: 0.8, oligo_um: 0.2 }
    }
}

impl Conditions {
    pub fn validate(&self) -> Result<(), String> {
        let fields = [("Na+", self.na_mm), ("Mg2+", self.mg_mm), ("dNTPs", self.dntp_mm), ("Oligo", self.oligo_um)];
        for (name, v) in fields {
            if !v.is_finite() || v < 0.0 {
                return Err(format!("{name} concentration must be a non-negative number."));
            }
        }
        if self.na_mm <= 0.0 && self.mg_mm <= 0.0 {
            return Err("At least one of Na+ or Mg2+ must be above zero.".into());
        }
        if self.oligo_um <= 0.0 {
            return Err("Oligo concentration must be above zero.".into());
        }
        Ok(())
    }

    /// Primer3-convention units (mM, mM, mM, nM) that `engine` expects.
    pub fn thermo_params(&self) -> ThermoParams {
        ThermoParams { mv_conc: self.na_mm, dv_conc: self.mg_mm, dntp_conc: self.dntp_mm, dna_conc: self.oligo_um * 1000.0 }
    }

    pub fn sodium_m(&self) -> f64 {
        self.na_mm / 1000.0
    }

    /// Mg2+ left free after dNTP chelation, molar (same correction Strider
    /// applies everywhere in `engine`).
    pub fn free_magnesium_m(&self) -> f64 {
        ((self.mg_mm - self.dntp_mm) / 1000.0).max(0.0)
    }
}
