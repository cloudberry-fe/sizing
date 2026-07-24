import { toTB, calcPhysical, calcVM, calcCloud, calcEnterprise, summarize } from './calc.js';
import { PHYSICAL_TIERS, CLOUD, ENTERPRISE_TIERS } from './config.js';
import { t } from './i18n.js';

function readStoredLang() {
  try {
    return localStorage.getItem('lang') || 'zh';
  } catch {
    return 'zh';
  }
}

const state = {
  lang: readStoredLang(),
  infra: 'physical',
};

const $ = id => document.getElementById(id);

function fmt(key, vars) {
  let s = t(key, state.lang);
  for (const [k, v] of Object.entries(vars || {})) s = s.replaceAll(`{${k}}`, v);
  return s;
}

function fmtNum(n) {
  const s = n.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

function populateStaticSelects() {
  $('phys-tier').innerHTML = PHYSICAL_TIERS
    .map(x => `<option value="${x.id}"${x.id === 'ssd192x24' ? ' selected' : ''}>${x.label}</option>`).join('');
  $('cloud-provider').innerHTML = Object.entries(CLOUD)
    .map(([id, c]) => `<option value="${id}">${id.startsWith('aws') ? 'AWS' : id === 'azure' ? 'Azure' : 'GCP'} — ${c.instance}</option>`).join('');
}

function populateEntTier() {
  const prev = $('ent-tier').value;
  $('ent-tier').innerHTML = ENTERPRISE_TIERS
    .map(x => `<option value="${x.id}">Spec-${x.id.slice(4)} ${fmt('enttier.label', { n: x.concurrency })}</option>`).join('');
  if (prev) $('ent-tier').value = prev;
}

function applyLang() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n, state.lang); });
  $('lang-toggle').textContent = state.lang === 'zh' ? 'EN' : '中';
  populateEntTier();
}

function specText(r) {
  if (r.cpu == null) return r.instance || '—';
  const cpu = `${r.cpu} ${t(r.cpuUnitKey, state.lang)}`;
  const mem = `${r.memGB}G`;
  const st = r.storageTB == null ? '' : ` / ${r.storageTB >= 1 ? fmtNum(r.storageTB) + 'T' : fmtNum(r.storageTB * 1024) + 'G'}`;
  const inst = r.instance ? ` (${r.instance})` : '';
  return `${cpu} / ${mem}${st}${inst}`;
}

function compute() {
  const size = parseFloat($('data-size').value);
  const valid = Number.isFinite(size) && size > 0;
  $('input-error').hidden = valid;
  $('result-card').hidden = !valid;
  if (!valid) return;

  const dataTB = toTB(size, $('data-unit').value);
  const compressionRatio = Math.max(1, parseFloat($('compression').value) || 1);
  let r;
  if (state.infra === 'physical') r = calcPhysical({ dataTB, compressionRatio, tierId: $('phys-tier').value });
  else if (state.infra === 'vm') r = calcVM({ dataTB, compressionRatio });
  else if (state.infra === 'cloud') r = calcCloud({ dataTB, compressionRatio, cloudId: $('cloud-provider').value });
  else r = calcEnterprise({ dataTB, tierId: $('ent-tier').value });

  $('huge-warning').hidden = dataTB <= 10240;
  $('product-line').textContent = t(`product.${state.infra}`, state.lang);
  $('network-line').textContent = state.infra === 'cloud'
    ? `${t('network.label', state.lang)}: ${CLOUD[$('cloud-provider').value].network}`
    : state.infra === 'container' ? '' : t('network.10g', state.lang);

  const badge = $('binding-badge');
  if (r.binding) {
    badge.hidden = false;
    badge.textContent = fmt(`binding.${r.binding.type}`, { s: r.binding.storageNodes, c: r.binding.computeNodes });
  } else badge.hidden = true;

  $('role-table').querySelector('tbody').innerHTML = r.roles.map(role => `<tr>
    <td>${t('role.' + role.key, state.lang)}</td><td>${role.count}</td>
    <td>${specText(role)}</td><td>${t(role.noteKey, state.lang)}</td></tr>`).join('');

  const s = summarize(r.roles);
  const rows = [
    ['summary.nodes', s.nodes],
    ['summary.cpu', s.cpu],
    ['summary.mem', `${s.memGB} GB`],
    ['summary.storage', `${s.storageTB.toFixed(1)} TB`],
  ];
  if (r.capacityTB != null) rows.push(['summary.capacity', `${r.capacityTB.toFixed(1)} TB`]);
  $('summary-table').querySelector('tbody').innerHTML =
    rows.map(([k, v]) => `<tr><th>${t(k, state.lang)}</th><td>${v}</td></tr>`).join('');
}

function showAdvancedFor(infra) {
  document.querySelectorAll('.adv').forEach(el => {
    el.hidden = !el.dataset.for.split(' ').includes(infra);
  });
}

$('infra-tabs').addEventListener('click', e => {
  const btn = e.target.closest('button[data-infra]');
  if (!btn) return;
  state.infra = btn.dataset.infra;
  document.querySelectorAll('#infra-tabs button').forEach(b => b.classList.toggle('active', b === btn));
  showAdvancedFor(state.infra);
  compute();
});

$('lang-toggle').addEventListener('click', () => {
  state.lang = state.lang === 'zh' ? 'en' : 'zh';
  try { localStorage.setItem('lang', state.lang); } catch {}
  applyLang();
  compute();
});

['data-size', 'data-unit', 'compression', 'phys-tier', 'cloud-provider', 'ent-tier']
  .forEach(id => $(id).addEventListener('input', compute));

populateStaticSelects();
applyLang();
showAdvancedFor(state.infra);
compute();
