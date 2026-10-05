# Thermool

Paste an oligo, see what Strider says about it: length, GC content and Tm, and the five most stable hairpins, self-dimers and (with a partner sequence) heterodimers, each drawn as a structure. Every analysis has an **IDT** button that runs the same thing on IDT OligoAnalyzer under the same conditions and shows IDT's numbers next to Strider's.

## Run

Needs Rust and Node, and a `Primerool` checkout next to this folder (Thermool uses Primerool's `engine` and `thermo-core` crates, the native Rust Strider).

```bash
cd frontend && npm install && npm run build && cd ..
cargo run --release          # http://127.0.0.1:5070
```

For frontend work, run `npm run dev` in `frontend/` alongside the server; Vite proxies `/api` to port 5070.

Environment: `THERMOOL_ADDR` (default `127.0.0.1:5070`), `THERMOOL_FRONTEND_DIST` (default `frontend/dist`).

## Conditions

Oligo (µM), Na⁺, Mg²⁺ and dNTPs (mM), in IDT's units, with qPCR and IDT-default presets. Pasting labelled text into any field (for example IDT's "Oligo Conc 0.25 µM, Na+ Conc 50 mM, Mg++ Conc 0 mM, dNTPs Conc 0 mM") fills every value it names. Hairpin ΔG is reported at 25 °C, dimer ΔG at 37 °C, as in OligoAnalyzer.

Strider's dimer ΔG includes the +1.96 kcal/mol bimolecular initiation term; IDT's does not, so expect Strider to read about 2 kcal/mol less negative for the same dimer.

## IDT

**Connect IDT** takes the same API credentials as Oligool and Primerool (client ID, client secret, username, password, EU or US region). They are stored AES-GCM encrypted in the browser and relayed through `/api/idt/*` to IDT; the server keeps nothing. The access token is cached in memory and refreshed once on a 401.

## API

- `POST /api/analyze` `{sequence, partner?, conditions: {na_mm, mg_mm, dntp_mm, oligo_um}}`
- `POST /api/idt/token` `{client_id, client_secret, username, password, region}`
- `POST /api/idt/run` `{kind: analyze|hairpin|self_dimer|hetero_dimer, sequence, partner?, conditions, token, region}`: IDT's raw JSON
