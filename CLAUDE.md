# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Test: `node --test tests/` (Node ≥18, no dependencies)
- Run locally: `python3 -m http.server 8000` → http://localhost:8000
- Deploy: GitHub Pages serves main branch root directly — no build step.

## Architecture

Static sizing calculator for HashData Lightning / Enterprise. Zero-build vanilla JS (ES modules):

- `js/config.js` — ALL sizing rule data: hardware tiers, cloud instance types, enterprise
  concurrency tiers, the 8vCPU+32G-per-TB compute rule. Tuning numbers = edit this file only.
- `js/calc.js` — pure functions, no DOM. Four paths: `calcPhysical`, `calcVM`, `calcCloud`
  (Lightning: nodes = evenUp(max(storage-derived, compute-derived))), `calcEnterprise`
  (segments by concurrency-tier TB/segment). All return the same `Result` shape
  (`roles[]`, `binding`, `capacityTB`); `summarize(roles)` totals resources.
- `js/i18n.js` — zh/en flat string table, `t(key, lang)`.
- `js/app.js` — DOM wiring only; no sizing math.
- Formula provenance: `docs/superpowers/specs/2026-07-24-sizing-calculator-design.md`
  (ported from legacy sizing tool v2.1 + HashData Deployment Spec 2025 xlsx).

Excel semantics preserved in helpers: `excelEven` (round up to even), `excelRound`,
`evenUp`. Tests regression-pin known values from the original spreadsheets — keep them
passing when touching formulas.
