//! Duplex thermodynamics for DNA oligos carrying locked nucleic acid (LNA)
//! residues, hybridised to an all-DNA complement.
//!
//! Owczarzy et al. (2011), Biochemistry 50:9352, "Stability and mismatch
//! discrimination of locked nucleic acid-DNA duplexes":
//! - an isolated LNA uses the full nearest-neighbour values of their
//!   Table 2 (computed there from McTigue, Peterson & Kahn 2004, 32NN set);
//! - two consecutive LNAs add the differential values of their Table 1 to
//!   the DNA doublet.
//!
//! Both tables are at 1 M Na+ against the SantaLucia unified DNA set, which
//! is exactly this crate's [`crate::NN`] table, so the full isolated values
//! can replace the DNA doublet directly. Initiation for a terminal LNA is
//! the DNA initiation (the paper's own assumption), and salt is corrected
//! exactly as for DNA ([`salt::owczarzy_salt_tm`]).
//!
//! Every table is indexed like [`crate::NN`]: `(b1 << 2) | b2` over the
//! top-strand (LNA-bearing) doublet 5'-b1 b2-3', A=0, C=1, G=2, T=3.

use crate::{salt, ThermoError, BASE_CODE, INIT_AT, INIT_GC, NN, R};

/// Table 2, isolated LNA on the 5' base of the doublet ("+XY/..."): full ΔH (kcal/mol), ΔS (cal/mol/K).
const LNA_FIRST: [(f64, f64); 16] = [
    (-7.193, -19.723), // +AA
    (-7.269, -18.336), // +AC
    (-7.536, -18.387), // +AG
    (-4.918, -12.943), // +AT
    (-7.451, -18.380), // +CA
    (-5.904, -11.904), // +CC
    (-9.815, -23.491), // +CG
    (-7.092, -16.825), // +CT
    (-5.038, -11.656), // +GA
    (-10.160, -24.651), // +GC
    (-10.844, -26.580), // +GG
    (-8.612, -22.327), // +GT
    (-7.246, -19.738), // +TA
    (-6.307, -15.515), // +TC
    (-10.040, -25.744), // +TG
    (-6.372, -16.902), // +TT
];

/// Table 2, isolated LNA on the 3' base of the doublet ("X+Y/..."): full ΔH, ΔS.
const LNA_SECOND: [(f64, f64); 16] = [
    (-6.908, -18.135), // A+A
    (-5.510, -11.824), // A+C
    (-9.000, -22.826), // A+G
    (-5.384, -13.537), // A+T
    (-7.142, -18.333), // C+A
    (-5.937, -12.335), // C+C
    (-10.876, -27.918), // C+G
    (-9.471, -25.070), // C+T
    (-7.756, -19.302), // G+A
    (-10.725, -25.511), // G+C
    (-8.943, -20.833), // G+G
    (-9.035, -22.742), // G+T
    (-5.609, -16.019), // T+A
    (-7.591, -19.031), // T+C
    (-6.335, -15.537), // T+G
    (-5.574, -14.149), // T+T
];

/// Table 1, both bases LNA ("+X+Y/..."): ΔΔH, ΔΔS added to the DNA doublet.
const LNA_BOTH_DELTA: [(f64, f64); 16] = [
    (-2.091, -4.975),  // +A+A
    (-2.989, -6.563),  // +A+C
    (-4.993, -10.607), // +A+G
    (-7.503, -20.350), // +A+T
    (-5.677, -12.798), // +C+A
    (-7.399, -16.475), // +C+C
    (-3.958, -8.039),  // +C+G
    (-7.937, -20.218), // +C+T
    (-5.759, -12.897), // +G+A
    (-6.309, -16.338), // +G+C
    (-5.022, -9.773),  // +G+G
    (-8.961, -23.458), // +G+T
    (-3.118, -4.808),  // +T+A
    (-0.966, 0.665),   // +T+C
    (-1.546, 0.109),   // +T+G
    (-2.519, -5.483),  // +T+T
];

fn check(seq: &[u8], lna: &[bool]) -> Result<(), ThermoError> {
    if seq.is_empty() {
        return Err(ThermoError::EmptySequence);
    }
    if seq.len() != lna.len() {
        return Err(ThermoError::InvalidPairing("LNA mask length differs from the sequence".into()));
    }
    if seq.iter().any(|&b| BASE_CODE[b as usize] == 255) {
        return Err(ThermoError::InvalidPairing("sequence must be A, C, G, T".into()));
    }
    Ok(())
}

/// Nearest-neighbour ΔH (kcal/mol) and ΔS (cal/mol/K) at 1 M Na+ of the
/// duplex between `seq` (LNA where `lna[i]`) and its DNA complement. With no
/// LNA this equals [`crate::duplex_dh_ds`].
pub fn lna_duplex_dh_ds(seq: &str, lna: &[bool]) -> Result<(f64, f64), ThermoError> {
    let bytes = seq.as_bytes();
    check(bytes, lna)?;
    if !lna.iter().any(|&l| l) {
        return crate::duplex_dh_ds(seq);
    }
    let (mut dh, mut ds) = (0.0, 0.0);
    for i in 0..bytes.len() - 1 {
        let k = ((BASE_CODE[bytes[i] as usize] << 2) | BASE_CODE[bytes[i + 1] as usize]) as usize;
        let (h, s) = match (lna[i], lna[i + 1]) {
            (false, false) => NN[k],
            (true, false) => LNA_FIRST[k],
            (false, true) => LNA_SECOND[k],
            (true, true) => (NN[k].0 + LNA_BOTH_DELTA[k].0, NN[k].1 + LNA_BOTH_DELTA[k].1),
        };
        dh += h;
        ds += s;
    }
    for idx in [0usize, bytes.len() - 1] {
        let (h, s) = match bytes[idx].to_ascii_uppercase() {
            b'G' | b'C' => INIT_GC,
            _ => INIT_AT,
        };
        dh += h;
        ds += s;
    }
    // An LNA strand and its DNA complement are never the same molecule, so
    // there is no self-complementary symmetry term.
    Ok((dh, ds))
}

/// Duplex Tm (°C) of an LNA-bearing oligo with its DNA complement, the
/// LNA counterpart of [`crate::duplex_tm`] (Mg2+ net of dNTPs, Owczarzy 2008
/// salt correction). With no LNA it is exactly [`crate::duplex_tm`].
pub fn lna_duplex_tm(seq: &str, lna: &[bool], sodium_m: f64, magnesium_m: f64, dntp_m: f64, oligo_conc_m: f64) -> Result<f64, ThermoError> {
    if !lna.iter().any(|&l| l) {
        check(seq.as_bytes(), lna)?;
        return crate::duplex_tm(seq, sodium_m, magnesium_m, dntp_m, oligo_conc_m);
    }
    let (dh, ds) = lna_duplex_dh_ds(seq, lna)?;
    let free_mg = (magnesium_m - dntp_m).max(0.0);
    let tm_1m = (dh * 1000.0) / (ds + R * 1000.0 * (oligo_conc_m / 4.0).ln());
    let tm = if sodium_m != 1.0 || free_mg > 0.0 { salt::owczarzy_salt_tm(tm_1m, seq, sodium_m, free_mg) } else { tm_1m };
    Ok(tm - 273.15)
}

/// Salt-corrected duplex ΔG (kcal/mol) at `celsius`, LNA counterpart of
/// [`crate::duplex_dg`] (`magnesium_m` is free Mg2+).
pub fn lna_duplex_dg(seq: &str, lna: &[bool], celsius: f64, sodium_m: f64, magnesium_m: f64) -> Result<f64, ThermoError> {
    if !lna.iter().any(|&l| l) {
        check(seq.as_bytes(), lna)?;
        return crate::duplex_dg(seq, celsius, sodium_m, magnesium_m);
    }
    let (dh, ds) = lna_duplex_dh_ds(seq, lna)?;
    let mut dg = dh - (celsius + 273.15) * ds / 1000.0;
    if sodium_m != 1.0 || magnesium_m > 0.0 {
        dg += seq.len() as f64 * salt::dg_per_bp_salt(sodium_m, magnesium_m, celsius, "dna");
    }
    Ok(dg)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SEQ: &str = "AGGCTGTTATGGAT";

    fn mask(pattern: &str) -> Vec<bool> {
        pattern.chars().map(|c| c.is_ascii_lowercase()).collect()
    }

    #[test]
    fn no_lna_matches_plain_dna() {
        let none = vec![false; SEQ.len()];
        assert_eq!(lna_duplex_dh_ds(SEQ, &none).unwrap(), crate::duplex_dh_ds(SEQ).unwrap());
        let a = lna_duplex_tm(SEQ, &none, 0.05, 0.003, 0.0008, 2e-7).unwrap();
        let b = crate::duplex_tm(SEQ, 0.05, 0.003, 0.0008, 2e-7).unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn isolated_lna_replaces_both_flanking_doublets() {
        // A+GG: doublets AG (LNA second) and GG (LNA first).
        let (dh, ds) = lna_duplex_dh_ds("AGG", &[false, true, false]).unwrap();
        let want_dh = LNA_SECOND[2].0 + LNA_FIRST[10].0 + INIT_AT.0 + INIT_GC.0;
        let want_ds = LNA_SECOND[2].1 + LNA_FIRST[10].1 + INIT_AT.1 + INIT_GC.1;
        assert!((dh - want_dh).abs() < 1e-9 && (ds - want_ds).abs() < 1e-9);
    }

    #[test]
    fn consecutive_lna_adds_table1_delta() {
        let (dh, ds) = lna_duplex_dh_ds("CC", &[true, true]).unwrap();
        assert!((dh - (NN[5].0 + LNA_BOTH_DELTA[5].0 + 2.0 * INIT_GC.0)).abs() < 1e-9);
        assert!((ds - (NN[5].1 + LNA_BOTH_DELTA[5].1 + 2.0 * INIT_GC.1)).abs() < 1e-9);
    }

    #[test]
    fn lna_raises_tm_a_few_degrees_per_residue() {
        let dna = lna_duplex_tm(SEQ, &vec![false; SEQ.len()], 0.05, 0.003, 0.0008, 2e-7).unwrap();
        let m = mask("agGCtGttATggat");
        let n_lna = m.iter().filter(|&&l| l).count() as f64;
        let lna = lna_duplex_tm(SEQ, &m, 0.05, 0.003, 0.0008, 2e-7).unwrap();
        let per = (lna - dna) / n_lna;
        assert!((1.0..8.0).contains(&per), "dna={dna} lna={lna} per-LNA={per}");
    }

    #[test]
    fn mask_length_mismatch_errors() {
        assert!(lna_duplex_dh_ds("ACGT", &[true]).is_err());
    }
}
