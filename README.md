# sizing

Sizing calculator for the Cloudberry-based product family (classic MPP and
compute-storage-separation form factors).
Static page — input data size + infrastructure type (physical / VM / cloud / container),
get node counts, per-node specs, and a resource summary. zh/en.

## Run locally

    python3 -m http.server 8000   # then open http://localhost:8000

## Test

    node --test tests/

## Deploy

GitHub Pages, main branch root. No build step.

Sizing rules live in `js/config.js`; calculation logic in `js/calc.js`;
methodology is documented on the site itself (`methodology.html`).
