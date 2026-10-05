//! `POST /api/competition`: Oligool's equilibrium split (Free / Hairpin /
//! Self-Dimer / Cross-Dimer) for one oligo (plus an optional partner), at
//! a chosen equilibrium temperature.
//!
//! Three layers, mirroring Oligool's `backend/main.py`:
//!
//! 1. **Partitions**: enumeration-based Boltzmann sums over suboptimal
//!    folds (never a partition-function DP: the shares must agree with the
//!    structures the cards show). Hairpins fold under the selected engine;
//!    dimers always fold native SantaLucia, Oligool's rule, since mixing
//!    parameter sets inside one equilibrium solve would be physically
//!    incoherent.
//! 2. **Rescoring at temperature**: thermo-core's tables are dG37-based,
//!    so every candidate is rescored as `dG(T) = dH - T·dS` (the same
//!    relation `HairpinThermo::dg25` already uses) rather than refolded.
//!    Structure cards stay anchored at their 25/37 °C reference.
//! 3. **Mass-action solve**: the Dirks et al. (2007) convex dual Newton
//!    solve (port of strider's `equilibrium.solve_equilibrium`), fed the
//!    ensemble dG of every complex: each strand's hairpin partition (open
//!    state included, so dG <= 0), its self-dimer partition and the
//!    heterodimer partition (association term kept).
//!
//! The monomer pool is then split three ways: `p_hairpin` is the share of
//! the best fold at this temperature, `p_unfolded` the open state plus all
//! dG >= 0 microstates, and the remainder sits in other folds. The
//! two-state mode instead uses the classic hairpin-vs-open sigmoid
//! `1/(1+exp(dG(T)/RT))` of the *reported* (25 °C MFE) fold, so it reads
//! 50% at the Local Tm by construction.

use std::collections::HashMap;

use axum::Json;
use serde::{Deserialize, Serialize};
use thermo_core::mathews2004::ParamSetId;
use thermo_core::thermo::{dimer_thermo_subopt_in, hairpin_thermo_subopt_in, HairpinThermo};

use crate::analyze::Engine;
use crate::conditions::Conditions;
use crate::error::AppError;

const R_GAS: f64 = 1.987e-3; // kcal / (mol . K)
/// Partition caps, mirroring Oligool (`gap=5, max_structures=20000` for
/// hairpins, `n=3000` dimer alignments): enumeration-based Boltzmann sums
/// over the same candidates the cards rank.
const HAIRPIN_ENUM_CAP: usize = 20000;
const DIMER_ENUM_CAP: usize = 3000;

// ---------------------------------------------------------------------------
// Mass-action equilibrium solver (Dirks et al. 2007, dual Newton)

/// One complex in the mass-action system: `strand_counts[s]` copies of
/// strand species `s`, with ensemble free energy `dg` (kcal/mol) at the
/// solve temperature, 1 M standard state.
struct ComplexSpec {
    strand_counts: Vec<usize>,
    dg: f64,
}

struct Equilibrium {
    /// Concentration (M) of each complex, in `ComplexSpec` order.
    concentrations: Vec<f64>,
    /// Free (monomeric) concentration of each strand species, M.
    strand_free: Vec<f64>,
    converged: bool,
}

/// Solves `H delta = r` by Gaussian elimination with partial pivoting.
/// Systems here are at most 2x2 (one or two strand species).
fn solve_linear(h: &[Vec<f64>], r: &[f64]) -> Vec<f64> {
    let n = r.len();
    let mut a = h.to_vec();
    let mut b = r.to_vec();
    for col in 0..n {
        let piv = (col..n).max_by(|&i, &j| a[i][col].abs().total_cmp(&a[j][col].abs())).unwrap_or(col);
        a.swap(col, piv);
        b.swap(col, piv);
        let d = a[col][col];
        if d.abs() < 1e-30 {
            continue;
        }
        for row in (col + 1)..n {
            let f = a[row][col] / d;
            for k in col..n {
                a[row][k] -= f * a[col][k];
            }
            b[row] -= f * b[col];
        }
    }
    let mut x = vec![0.0; n];
    for i in (0..n).rev() {
        let mut s = b[i];
        for k in (i + 1)..n {
            s -= a[i][k] * x[k];
        }
        x[i] = if a[i][i].abs() < 1e-30 { 0.0 } else { s / a[i][i] };
    }
    x
}

/// Concentration solve for nucleic acid complex mixtures. `totals` holds
/// each strand species' total concentration (M). Every strand must also
/// appear as a single-strand complex so the free state is represented.
fn solve_equilibrium(complexes: &[ComplexSpec], totals: &[f64], temp_k: f64) -> Equilibrium {
    let n_s = totals.len();
    let n_c = complexes.len();
    let rt = R_GAS * temp_k;
    let log_q: Vec<f64> = complexes.iter().map(|c| -c.dg / rt).collect();

    // Initialize mu so monomer x ~ totals.
    let mut mu = vec![0.0; n_s];
    for s in 0..n_s {
        let lq = (0..n_c)
            .find(|&i| complexes[i].strand_counts.iter().sum::<usize>() == 1 && complexes[i].strand_counts[s] == 1)
            .map(|i| log_q[i])
            .unwrap_or(0.0);
        mu[s] = totals[s].max(1e-30).ln() - lq;
    }

    let x_and_residual = |mu: &[f64]| -> (Vec<f64>, Vec<f64>) {
        let mut x = vec![0.0; n_c];
        for (i, xi) in x.iter_mut().enumerate() {
            let mut lx = log_q[i];
            for (s, m) in mu.iter().enumerate() {
                lx += complexes[i].strand_counts[s] as f64 * m;
            }
            *xi = lx.clamp(-200.0, 200.0).exp();
        }
        let mut r = vec![0.0; n_s];
        for (s, rs) in r.iter_mut().enumerate() {
            let mut sum = 0.0;
            for (i, xi) in x.iter().enumerate() {
                sum += complexes[i].strand_counts[s] as f64 * xi;
            }
            *rs = sum - totals[s];
        }
        (x, r)
    };

    let rel_norm = |r: &[f64]| r.iter().zip(totals).map(|(&ri, &b)| ri.abs() / b.max(1e-30)).fold(0.0_f64, f64::max);

    let tol = 1e-9;
    let (mut x, mut r) = x_and_residual(&mu);
    let mut residual = rel_norm(&r);
    for _ in 0..200 {
        if residual < tol {
            break;
        }
        // H = A^T diag(x) A + tiny regularization; Newton step on the dual.
        let mut h = vec![vec![0.0; n_s]; n_s];
        for i in 0..n_c {
            for p in 0..n_s {
                if complexes[i].strand_counts[p] == 0 {
                    continue;
                }
                for q in 0..n_s {
                    h[p][q] += x[i] * (complexes[i].strand_counts[p] * complexes[i].strand_counts[q]) as f64;
                }
            }
        }
        for s in 0..n_s {
            h[s][s] += 1e-12;
        }
        let delta = solve_linear(&h, &r);

        // Backtracking line search on the max relative residual.
        let mut step = 1.0;
        let mut accepted = false;
        for _ in 0..40 {
            let mu_new: Vec<f64> = mu.iter().zip(&delta).map(|(&m, &d)| m - step * d).collect();
            let (_, r_new) = x_and_residual(&mu_new);
            if rel_norm(&r_new) < residual {
                mu = mu_new;
                accepted = true;
                break;
            }
            step *= 0.5;
        }
        if !accepted {
            break;
        }
        let (xn, rn) = x_and_residual(&mu);
        x = xn;
        r = rn;
        residual = rel_norm(&r);
    }

    let mut strand_free = vec![0.0; n_s];
    for (i, xi) in x.iter().enumerate() {
        if complexes[i].strand_counts.iter().sum::<usize>() == 1 {
            if let Some(s) = complexes[i].strand_counts.iter().position(|&c| c == 1) {
                strand_free[s] += xi;
            }
        }
    }

    Equilibrium { concentrations: x, strand_free, converged: residual < tol }
}

// ---------------------------------------------------------------------------
// Enumeration-based partitions

/// Unimolecular (hairpin) partition of one strand at `temp_k`.
struct UniPartition {
    /// `-RT ln Z`, open state included (Z >= 1, so dG <= 0): the monomer
    /// complex free energy for the mass-action solve.
    ensemble_dg: f64,
    /// Boltzmann share of the best fold at this temperature.
    hairpin_fraction: f64,
    /// Open state plus every dG >= 0 microstate: a positive-dG structure is
    /// a random-coil fluctuation, not a stable fold.
    unfolded_fraction: f64,
    /// `1/(1+exp(dG(T)/RT))` of the reported fold (the 25 °C MFE the cards
    /// anchor on): 50% at its Local Tm by construction.
    two_state_fraction: f64,
}

fn dg_at_t(dh: f64, ds_cal: f64, temp_k: f64) -> f64 {
    dh - temp_k * ds_cal / 1000.0
}

fn unimolecular(ps: ParamSetId, seq: &str, c: &Conditions, temp_k: f64) -> UniPartition {
    let rt = R_GAS * temp_k;
    let subs = hairpin_thermo_subopt_in(ps, seq, HAIRPIN_ENUM_CAP, c.sodium_m(), c.free_magnesium_m(), 2);
    if subs.is_empty() {
        return UniPartition { ensemble_dg: 0.0, hairpin_fraction: 0.0, unfolded_fraction: 1.0, two_state_fraction: 0.0 };
    }

    let mut z = 1.0; // fully-open state, weight 1
    let mut neg_w = 0.0;
    let mut best_dg_t = f64::INFINITY;
    let mut best_report: Option<&HairpinThermo> = None; // min dg25: the fold the UI card shows
    for h in &subs {
        let dg_t = dg_at_t(h.dh, h.ds, temp_k);
        let w = (-dg_t / rt).exp();
        z += w;
        if dg_t < 0.0 {
            neg_w += w;
        }
        best_dg_t = best_dg_t.min(dg_t);
        if best_report.is_none_or(|b: &HairpinThermo| h.dg25 < b.dg25) {
            best_report = Some(h);
        }
    }
    let hairpin_w = (-best_dg_t / rt).exp();
    let z = z.max(hairpin_w);
    let neg_w = neg_w.max(hairpin_w);
    let ensemble_dg = -rt * z.ln();
    let two_state_fraction = match best_report {
        Some(h) => {
            let dg_ts = dg_at_t(h.dh, h.ds, temp_k);
            1.0 / (1.0 + (dg_ts / rt).exp())
        }
        None => 0.0,
    };
    UniPartition {
        ensemble_dg,
        hairpin_fraction: hairpin_w / z,
        unfolded_fraction: ((z - neg_w) / z).max(0.0),
        two_state_fraction,
    }
}

/// Bimolecular (self-dimer or heterodimer) partition: ensemble dG at
/// `temp_k`, association term kept (the mass-action solve expects it).
/// Always native SantaLucia parameters, per Oligool's dimers-always-native
/// rule. Returns `None` when no dimer structure exists at all.
fn bimolecular(seq1: &str, seq2: Option<&str>, c: &Conditions, temp_k: f64) -> Option<f64> {
    let rt = R_GAS * temp_k;
    let subs = dimer_thermo_subopt_in(ParamSetId::SantaLucia2004, seq1, seq2, DIMER_ENUM_CAP, c.sodium_m(), c.free_magnesium_m(), c.oligo_um * 1e-6, 0);
    // Dedup by dot-bracket (one alignment can enumerate twice), keep the
    // best rescored dG per structure.
    let mut states: HashMap<&str, f64> = HashMap::new();
    for d in &subs {
        let dg_t = dg_at_t(d.dh, d.ds, temp_k);
        states.entry(d.structure.as_str()).and_modify(|e| *e = e.min(dg_t)).or_insert(dg_t);
    }
    let z: f64 = states.values().map(|&dg| (-dg / rt).exp()).sum();
    (z > 0.0).then(|| -rt * z.ln())
}

// ---------------------------------------------------------------------------
// Composition: one solve, both perspectives

#[derive(Debug, Clone, Serialize)]
pub struct Competition {
    pub p_free: f64,
    pub p_hairpin: f64,
    pub p_hairpin_two_state: f64,
    pub p_unfolded: f64,
    pub p_self_dimer: f64,
    /// `None` when there is no heterodimer context (no partner, or the
    /// partner equals the oligo, Oligool's rule).
    pub p_hetero_dimer: Option<f64>,
    pub converged: bool,
}

#[derive(Debug, Serialize)]
pub struct CompetitionResponse {
    pub oligo: Competition,
    pub partner: Option<Competition>,
}

/// Runs the full competition for `seq` (strand 0) and the optional
/// `partner` (strand 1). One mass-action solve over every complex (both
/// self-dimers and the heterodimer together, a deliberate tightening over
/// Oligool's two per-perspective solves, which each ignored the other
/// strand's self-dimer) yields both strands' splits.
fn compute_competition(seq: &str, partner: Option<&str>, c: &Conditions, ps: ParamSetId, temp_k: f64) -> CompetitionResponse {
    let total = c.oligo_um * 1e-6;
    let has_hetero = match partner {
        Some(p) => p != seq,
        None => false,
    };

    let uni_a = unimolecular(ps, seq, c, temp_k);
    let uni_b = partner.map(|p| unimolecular(ps, p, c, temp_k));
    let self_a = bimolecular(seq, None, c, temp_k);
    let self_b = partner.and_then(|p| bimolecular(p, None, c, temp_k));
    let hetero = has_hetero.then(|| bimolecular(seq, partner, c, temp_k)).flatten();

    // Complex table: monomers first (the solver's mu initialization relies
    // on finding each strand's monomer), then the dimers. `strand_counts`
    // always has one entry per strand species (the B entry is 0 for
    // A-only complexes).
    let n_strands = if uni_b.is_some() { 2 } else { 1 };
    let counts = |a: usize, b: usize| {
        if n_strands == 2 {
            vec![a, b]
        } else {
            vec![a]
        }
    };
    let mut complexes = vec![ComplexSpec { strand_counts: counts(1, 0), dg: uni_a.ensemble_dg }];
    if let Some(u) = &uni_b {
        complexes.push(ComplexSpec { strand_counts: counts(0, 1), dg: u.ensemble_dg });
    }
    let mut idx_self_a = None;
    if let Some(dg) = self_a {
        idx_self_a = Some(complexes.len());
        complexes.push(ComplexSpec { strand_counts: counts(2, 0), dg });
    }
    let mut idx_self_b = None;
    if uni_b.is_some() {
        if let Some(dg) = self_b {
            idx_self_b = Some(complexes.len());
            complexes.push(ComplexSpec { strand_counts: counts(0, 2), dg });
        }
    }
    let mut idx_hetero = None;
    if let Some(dg) = hetero {
        idx_hetero = Some(complexes.len());
        complexes.push(ComplexSpec { strand_counts: counts(1, 1), dg });
    }

    let totals: Vec<f64> = uni_b.as_ref().map(|_| vec![total, total]).unwrap_or_else(|| vec![total]);
    let eq = solve_equilibrium(&complexes, &totals, temp_k);

    let clamp01 = |v: f64| v.clamp(0.0, 1.0);
    let conc = |i: Option<usize>| i.map(|i| eq.concentrations[i]).unwrap_or(0.0);

    let oligo = Competition {
        p_free: clamp01(eq.strand_free[0] / total),
        p_hairpin: clamp01(eq.strand_free[0] / total * uni_a.hairpin_fraction),
        p_hairpin_two_state: clamp01(eq.strand_free[0] / total * uni_a.two_state_fraction),
        p_unfolded: clamp01(eq.strand_free[0] / total * uni_a.unfolded_fraction),
        p_self_dimer: clamp01(2.0 * conc(idx_self_a) / total),
        p_hetero_dimer: has_hetero.then(|| clamp01(conc(idx_hetero) / total)),
        converged: eq.converged,
    };
    let partner_comp = match (&uni_b, &self_b) {
        _ if !has_hetero && partner.is_some() => {
            // Partner equals the oligo: identical split, no cross-dimer.
            Some(Competition { p_hetero_dimer: None, ..oligo.clone() })
        }
        (Some(u), _) => Some(Competition {
            p_free: clamp01(eq.strand_free[1] / total),
            p_hairpin: clamp01(eq.strand_free[1] / total * u.hairpin_fraction),
            p_hairpin_two_state: clamp01(eq.strand_free[1] / total * u.two_state_fraction),
            p_unfolded: clamp01(eq.strand_free[1] / total * u.unfolded_fraction),
            p_self_dimer: clamp01(2.0 * conc(idx_self_b) / total),
            p_hetero_dimer: Some(clamp01(conc(idx_hetero) / total)),
            converged: eq.converged,
        }),
        _ => None,
    };
    CompetitionResponse { oligo, partner: partner_comp }
}

// ---------------------------------------------------------------------------
// HTTP

#[derive(Debug, Deserialize)]
pub struct CompetitionRequest {
    pub sequence: String,
    #[serde(default)]
    pub partner: Option<String>,
    #[serde(default)]
    pub conditions: Conditions,
    #[serde(default)]
    pub engine: Engine,
    #[serde(default = "default_temp_c")]
    pub temp_c: f64,
}

fn default_temp_c() -> f64 {
    25.0
}

pub async fn competition(Json(req): Json<CompetitionRequest>) -> Result<Json<CompetitionResponse>, AppError> {
    if !req.temp_c.is_finite() || !(0.0..=99.0).contains(&req.temp_c) {
        return Err(AppError::bad_request("Temperature must be between 0 and 99 °C."));
    }
    req.conditions.validate().map_err(AppError::bad_request)?;
    let seq = crate::analyze::clean_sequence(&req.sequence, "Sequence")?;
    let partner = match req.partner.as_deref().map(str::trim) {
        Some(p) if !p.is_empty() => Some(crate::analyze::clean_sequence(p, "Partner sequence")?),
        _ => None,
    };

    let c = req.conditions;
    let ps = req.engine.param_set();
    let temp_k = req.temp_c + 273.15;
    let result = tokio::task::spawn_blocking(move || compute_competition(&seq, partner.as_deref(), &c, ps, temp_k))
        .await
        .map_err(|e| AppError::new(axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Competition solve failed: {e}")))?;
    Ok(Json(result))
}

#[cfg(test)]
mod tests {
    use super::*;


    fn close(a: f64, b: f64, eps: f64) -> bool {
        (a - b).abs() <= eps
    }

    #[test]
    fn solver_conserves_mass_and_matches_trivial_solution() {
        // A only: everything stays monomeric.
        let eq = solve_equilibrium(&[ComplexSpec { strand_counts: vec![1], dg: -1.0 }], &[2.5e-7], 298.15);
        assert!(eq.converged);
        assert!(close(eq.strand_free[0], 2.5e-7, 1e-16));

        // A + very favourable AA: nearly all A pairs up (2 per dimer).
        let eq = solve_equilibrium(
            &[ComplexSpec { strand_counts: vec![1], dg: 0.0 }, ComplexSpec { strand_counts: vec![2], dg: -12.0 }],
            &[2.5e-7],
            298.15,
        );
        assert!(eq.converged);
        let paired = eq.strand_free[0] + 2.0 * eq.concentrations[1];
        assert!(close(paired, 2.5e-7, 1e-12), "mass not conserved: {paired}");
        // K = exp(12/RT) ~ 1e8 M^-1 at 2.5e-7 M: dimerization is near total,
        // but exact symmetry keeps a little free strand.
        assert!(eq.concentrations[1] > 0.9 * 2.5e-7 / 2.0);
    }

    #[test]
    fn solver_two_strands_share_the_heterodimer() {
        // A + B + AB only (no self-dimers): mass action on both strands.
        let eq = solve_equilibrium(
            &[
                ComplexSpec { strand_counts: vec![1, 0], dg: 0.0 },
                ComplexSpec { strand_counts: vec![0, 1], dg: 0.0 },
                ComplexSpec { strand_counts: vec![1, 1], dg: -9.0 },
            ],
            &[2.5e-7, 2.5e-7],
            298.15,
        );
        assert!(eq.converged);
        assert!(close(eq.strand_free[0] + eq.concentrations[2], 2.5e-7, 1e-12));
        assert!(close(eq.strand_free[1] + eq.concentrations[2], 2.5e-7, 1e-12));
        assert!(close(eq.strand_free[0], eq.strand_free[1], 1e-18), "symmetric strands must be equally free");
    }

    #[test]
    fn two_state_fraction_reads_half_at_reported_tm() {
        let c = Conditions::default();
        let ps = ParamSetId::Mathews2004;
        let seq = "GCACTACAACCGCTACCGTG";
        let subs = hairpin_thermo_subopt_in(ps, seq, HAIRPIN_ENUM_CAP, c.sodium_m(), c.free_magnesium_m(), 2);
        let reported = subs.iter().min_by(|a, b| a.dg25.total_cmp(&b.dg25)).expect("folds");
        // dg25 is dG at 298.15 K; the two-state sigmoid at T = Local Tm
        // (dg = 0) reads 50% by construction.
        let tm_k = reported.tm_celsius + 273.15;
        let uni = unimolecular(ps, seq, &c, tm_k);
        assert!(close(uni.two_state_fraction, 0.5, 1e-9), "two_state={} at tm={}", uni.two_state_fraction, reported.tm_celsius);
    }

    #[test]
    fn two_state_fraction_decays_monotonically_with_temperature() {
        let c = Conditions::default();
        let seq = "GCACTACAACCGCTACCGTG";
        let mut prev = 1.1;
        for t in [25.0, 40.0, 55.0, 70.0, 85.0] {
            let uni = unimolecular(ParamSetId::Mathews2004, seq, &c, t + 273.15);
            assert!(uni.two_state_fraction <= prev + 1e-9, "not monotonic at {t}");
            prev = uni.two_state_fraction;
        }
    }

    #[test]
    fn competition_splits_sum_to_one() {
        let c = Conditions::default();
        for t in [25.0, 60.0] {
            let r = compute_competition("GCACTACAACCGCTACCGTG", Some("TCCAGGAGCTCGTTGTAGCC"), &c, ParamSetId::Mathews2004, t + 273.15);
            assert!(r.oligo.converged, "solver did not converge at {t}");
            for comp in [&r.oligo, r.partner.as_ref().unwrap()] {
                let sum = comp.p_free + comp.p_self_dimer + comp.p_hetero_dimer.unwrap_or(0.0);
                assert!(sum <= 1.0 + 1e-6, "monomer + dimers = {sum} at {t}C");
                assert!(comp.p_hairpin + comp.p_unfolded <= comp.p_free + 1e-6);
                assert!(comp.p_hairpin <= comp.p_free + 1e-6);
            }
            assert!(r.oligo.p_hetero_dimer.unwrap() >= 0.0);
            assert!(r.partner.unwrap().p_hetero_dimer.unwrap() >= 0.0);
        }
    }

    #[test]
    fn hairpin_share_grows_as_temperature_drops() {
        let c = Conditions::default();
        let seq = "GCACTACAACCGCTACCGTG";
        let cold = compute_competition(seq, None, &c, ParamSetId::Mathews2004, 15.0 + 273.15).oligo;
        let hot = compute_competition(seq, None, &c, ParamSetId::Mathews2004, 65.0 + 273.15).oligo;
        assert!(
            cold.p_hairpin_two_state > hot.p_hairpin_two_state,
            "two-state hairpin share must grow colder: {} vs {}",
            cold.p_hairpin_two_state,
            hot.p_hairpin_two_state
        );
        // p_self_dimer is a *relative* competition, not an absolute melt:
        // at low temperature the folded hairpin monomer suppresses
        // dimerization more than the (weak) dimer melts, so the dimer
        // share may well grow with temperature. The dimer ensemble dG
        // itself, though, must rise monotonically toward zero.
        let mut prev = f64::NEG_INFINITY;
        for t in [15.0, 25.0, 40.0, 55.0, 65.0, 85.0] {
            let dg = bimolecular(seq, None, &c, t + 273.15).expect("dimer folds");
            assert!(dg > prev, "dimer ensemble dG must rise with temperature: {dg} at {t}C");
            prev = dg;
        }
    }
}
