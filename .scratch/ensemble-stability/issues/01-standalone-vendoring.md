# 01: Vendor thermo-core, stand alone

Status: resolved

Thermool builds against `../Primerool` via path deps. Vendor
`thermo-core` into `crates/thermo-core` (from Primerool @ e2fd5fc, drop
primer3-ffi parity tests), inline `structure_variant.rs` and `ThermoParams`
into `src/`, workspace + own deploy target dir, README / AGENTS.md /
footer updates. Parity gate: `/api/analyze` output byte-identical before
and after.

## Answer

Done. Both engines' `/api/analyze` output identical to baseline; 21
vendored thermo-core unit tests pass.
