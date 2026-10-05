# 02: Backend competition endpoint

Status: resolved

`src/competition.rs`: mass-action solver (port of strider
`equilibrium.py` solve_equilibrium: dual damped-Newton on chemical
potentials, complexes A / AA / B / AB, logQ = -dG/RT - (N-1)ln(1)),
unimolecular + bimolecular ensemble partitions from large-N subopt
enumeration rescored at T via dG = dH - T_K dS/1000, two-state fraction
from the MFE hairpin's dH/dS. Route `POST /api/competition` in
`main.rs`. Tests mirror Oligool's `test_competition_two_state.py`.

Blocked by: 01

## Answer

Done. `src/competition.rs` + `POST /api/competition`; 9 cargo tests pass (solver conservation, symmetry, two-state 50% at Local Tm, monotonic decay, split invariants). Hairpins fold under the selected engine, dimers native SantaLucia; one mass-action solve covers both strands (tightening over Oligool's per-perspective solves).
