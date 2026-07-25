# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Test: `node --test tests/` (Node ≥18, no dependencies)
- Run locally: `python3 -m http.server 8000` → http://localhost:8000
- Deploy: GitHub Pages serves main branch root directly — no build step.

## Architecture

Static sizing calculator for the Cloudberry-based product family (classic MPP + compute-storage
separation). Brand-neutral UI ("Cloudberry Family") — source citations may still name vendor docs.
Zero-build vanilla JS (ES modules):

- `js/config.js` — ALL sizing rule data: `PHYSICAL_PRESETS` (基础款/高吞吐款/NVMe现代款,
  full BOM per node), `VM_PROFILES` (Lite/Medium/Large), `CLOUD_SCHEMES` (per provider:
  managed-disk per cloud best practice + local-NVMe per production practice), the
  8vCPU+32G-per-TB compute rule. Tuning numbers = edit this file only.
- `js/calc.js` — pure functions, no DOM. Four paths: `calcPhysical` (customer-deck method:
  need = onDisk×2/0.9/0.8, nodes = evenUp(max(storage, compute))), `calcVM`
  (+`recommendVMProfile`), `calcCloud`, `calcEnterprise` (segments by tier TB/segment).
  All return the same `Result` shape (`roles[]` with optional `bom[]`, `binding`,
  `capacityTB`); `summarize(roles)` totals resources.
- `js/i18n.js` — zh/en flat string table, `t(key, lang)`.
- `js/app.js` — DOM wiring only; no sizing math. Selection state lives in the `state`
  object, not in rebuilt DOM (language toggle must never reset user choices).
- Formula provenance: `docs/superpowers/specs/2026-07-24-sizing-calculator-design.md`
  (legacy sizing tool v2.1, HashData Deployment Spec 2025, fin-industry customer deck 2023,
  MPP 7.7 Cloud Technical Recommendations).

Tests regression-pin known values from the source documents (customer-deck 160TB → 10/12 nodes,
Azure 50TB → 88 nodes, etc.) — keep them passing when touching formulas.
