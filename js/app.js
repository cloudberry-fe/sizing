import { toTB, calcPhysical, calcVM, calcCloud, calcEnterprise, summarize, recommendVMProfile } from './calc.js';
import { PHYSICAL_PRESETS, VM_PROFILES, CLOUD_SCHEMES, ENTERPRISE_TIERS } from './config.js';
import { t } from './i18n.js';

function readStoredLang() {
  try { return localStorage.getItem('lang') || 'zh'; } catch { return 'zh'; }
}

const state = {
  lang: readStoredLang(),
  infra: 'physical',
  presetId: 'sas_std',
  vmProfileSel: 'auto',
  schemeId: 'aws_ebs',
};

const $ = id => document.getElementById(id);

function fmt(key, vars) {
  let s = t(key, state.lang);
  for (const [k, v] of Object.entries(vars || {})) s = s.replaceAll(`{${k}}`, v);
  return s;
}

function fmtNum(x) {
  const s = x.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

function populatePresetCards() {
  $('preset-cards').innerHTML = PHYSICAL_PRESETS.map(p => `
    <button type="button" class="preset-card${p.id === state.presetId ? ' selected' : ''}" data-preset="${p.id}">
      <span class="preset-name">${t('preset.' + p.id, state.lang)}</span>
      <span class="preset-desc">${t('preset.' + p.id + '.desc', state.lang)}</span>
      <span class="preset-src">${t(p.sourceKey, state.lang)}</span>
    </button>`).join('');
}

function populateVMProfile() {
  const opts = [`<option value="auto"${state.vmProfileSel === 'auto' ? ' selected' : ''}>${t('vmprofile.auto', state.lang)}</option>`]
    .concat(VM_PROFILES.map(p =>
      `<option value="${p.id}"${state.vmProfileSel === p.id ? ' selected' : ''}>${t('vmprofile.' + p.id, state.lang)}</option>`));
  $('vm-profile').innerHTML = opts.join('');
}

function populateCloudScheme() {
  const byProvider = {};
  for (const s of CLOUD_SCHEMES) (byProvider[s.provider] ||= []).push(s);
  $('cloud-scheme').innerHTML = Object.entries(byProvider).map(([prov, schemes]) =>
    `<optgroup label="${prov}">` + schemes.map(s =>
      `<option value="${s.id}"${s.id === state.schemeId ? ' selected' : ''}>` +
      `${t(s.kindKey, state.lang)} · ${s.segment.instance}</option>`).join('') + '</optgroup>').join('');
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
  populatePresetCards();
  populateVMProfile();
  populateCloudScheme();
  populateEntTier();
}

function specText(r) {
  if (r.cpu == null) return `<span class="spec-main">${r.instance || '—'}</span>`;
  const st = r.storageTB == null ? '' :
    ` / ${r.storageTB >= 1 ? fmtNum(r.storageTB) + 'T' : fmtNum(r.storageTB * 1024) + 'G'}`;
  const inst = r.instance ? `<span class="spec-inst">${r.instance}</span>` : '';
  const main = `<span class="spec-main">${r.cpu} ${t(r.cpuUnitKey, state.lang)} / ${r.memGB}G${st}</span>`;
  const bom = (r.bom || []).map(b =>
    `<div class="bom-line"><span class="bom-k">${t(b.labelKey, state.lang)}</span>` +
    `<span class="bom-v">${b.valueKey ? t(b.valueKey, state.lang) : b.value}</span></div>`).join('');
  return inst + main + bom;
}

function activeVMProfileId(dataTB) {
  return state.vmProfileSel === 'auto' ? recommendVMProfile(dataTB).id : state.vmProfileSel;
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
  if (state.infra === 'physical') {
    r = calcPhysical({ dataTB, compressionRatio, presetId: state.presetId });
  } else if (state.infra === 'vm') {
    r = calcVM({ dataTB, compressionRatio, profileId: activeVMProfileId(dataTB) });
  } else if (state.infra === 'cloud') {
    r = calcCloud({ dataTB, compressionRatio, schemeId: state.schemeId });
  } else {
    r = calcEnterprise({ dataTB, tierId: $('ent-tier').value });
  }

  $('huge-warning').hidden = dataTB <= 10240;
  $('product-line').textContent = t(`product.${state.infra}`, state.lang);

  const hint = $('vm-profile-hint');
  if (state.infra === 'vm' && state.vmProfileSel === 'auto') {
    hint.textContent = fmt('vmprofile.picked', { p: r.profileId.charAt(0).toUpperCase() + r.profileId.slice(1) });
    hint.hidden = false;
  } else hint.hidden = true;

  const src = $('source-line');
  if (r.sourceKey) {
    src.hidden = false;
    src.textContent = `${t('source.label', state.lang)}: ${t(r.sourceKey, state.lang)}`;
  } else src.hidden = true;

  const scheme = CLOUD_SCHEMES.find(x => x.id === state.schemeId);
  $('network-line').textContent =
    state.infra === 'cloud' ? `${t('network.label', state.lang)}: ${scheme.network}` :
    state.infra === 'container' ? '' : t('network.10g', state.lang);

  const badge = $('binding-badge');
  if (r.binding) {
    badge.hidden = false;
    badge.className = `badge badge-${r.binding.type}`;
    badge.textContent = fmt(`binding.${r.binding.type}`, { s: r.binding.storageNodes, c: r.binding.computeNodes });
  } else badge.hidden = true;

  $('role-table').querySelector('tbody').innerHTML = r.roles.map(role => `<tr>
    <td>${t('role.' + role.key, state.lang)}</td><td class="num">${role.count}</td>
    <td>${specText(role)}</td><td class="note">${t(role.noteKey, state.lang)}</td></tr>`).join('');

  const s = summarize(r.roles);
  const rows = [
    ['summary.nodes', s.nodes],
    ['summary.cpu', fmtNum(s.cpu)],
    ['summary.mem', `${fmtNum(s.memGB)} GB`],
    ['summary.storage', `${fmtNum(s.storageTB)} TB`],
  ];
  if (r.capacityTB != null) rows.push(['summary.capacity', `${fmtNum(r.capacityTB)} TB`]);
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

$('preset-cards').addEventListener('click', e => {
  const card = e.target.closest('button[data-preset]');
  if (!card) return;
  state.presetId = card.dataset.preset;
  document.querySelectorAll('.preset-card').forEach(c => c.classList.toggle('selected', c === card));
  compute();
});

$('vm-profile').addEventListener('input', () => { state.vmProfileSel = $('vm-profile').value; compute(); });
$('cloud-scheme').addEventListener('input', () => { state.schemeId = $('cloud-scheme').value; compute(); });

$('lang-toggle').addEventListener('click', () => {
  state.lang = state.lang === 'zh' ? 'en' : 'zh';
  try { localStorage.setItem('lang', state.lang); } catch { /* blocked storage */ }
  applyLang();
  compute();
});

['data-size', 'data-unit', 'compression', 'ent-tier']
  .forEach(id => $(id).addEventListener('input', compute));

applyLang();
showAdvancedFor(state.infra);
compute();
