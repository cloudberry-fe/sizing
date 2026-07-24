# sizing

Sizing calculator for HashData Lightning / HashData Enterprise (Cloudberry-based products).
Static page — input data size + infrastructure type (physical / VM / cloud / container),
get node counts, per-node specs, and a resource summary. zh/en.

## Run locally

    python3 -m http.server 8000   # then open http://localhost:8000

## Test

    node --test tests/

## Deploy

GitHub Pages, main branch root. No build step.

Sizing rules live in `js/config.js`; calculation logic in `js/calc.js`;
design spec in `docs/superpowers/specs/`.
