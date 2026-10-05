# Ensemble stability + settings, ported from Oligool

Port Oligool's equilibrium feature so Thermool stands on its own.

## What

1. Thermool owns its thermodynamics: `thermo-core` is vendored into
   `crates/thermo-core` (from Primerool @ e2fd5fc), and the two `engine`
   bits Thermool used (`structure_variant`, `ThermoParams`) live in `src/`.
   No sibling-checkout build requirement, own deploy target dir.
2. `POST /api/competition`: mass-action equilibrium solve (port of
   strider's `solve_equilibrium`, dual damped-Newton) over ensemble
   partition energies from large-N subopt enumeration, rescored at the
   requested temperature via `dG(T) = dH - T·dS` per structure. Per strand:
   `p_free`, `p_hairpin`, `p_hairpin_two_state`, `p_unfolded`,
   `p_self_dimer`, `p_hetero_dimer`, `converged`.
3. Settings dialog (gear button next to the theme toggle): Engine tab
   (structure engine, equilibrium split two-state / ensemble), IDT tab
   (credentials form moved out of `IdtDialog`).
4. Stability panel: per-strand stacked strip (Free / Hairpin /
   Self-Dimer / Cross-Dimer, or the three-way ensemble split) with an
   adjustable equilibrium temperature input.

## Key decisions

- Temperature enters by rescoring each enumerated structure's dG from its
  dH/dS (same relation thermo-core already uses for dg25), not by
  temperature-parameterized refolding. Structures cards stay anchored at
  their 25/37 C reference temperatures, like Oligool.
- Hairpin partition runs under the selected engine; dimer partitions
  always SantaLucia native (Oligool's rule: no paramset mixing inside one
  equilibrium solve).
- Partition caps mirror Oligool: 20000 hairpin structures, 3000 dimer
  alignments, dedup dimers by dot-bracket, open state has weight 1.
- Competition is a separate endpoint from `/api/analyze` so per-keystroke
  analysis stays fast; the frontend debounces it (500 ms) with a
  stale-response guard.
- Vendored thermo-core stays unmodified; syncs from upstream Primerool
  are deliberate, recorded in `crates/thermo-core/src/lib.rs`.
