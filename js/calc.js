import { COMPUTE_RULE, PHYSICAL_PRESETS, VM_PROFILES, VM_COORD, CLOUD_SCHEMES, ENTERPRISE_SEGMENT, ENTERPRISE_PROXY, ENTERPRISE_FIXED } from './config.js';

export function toTB(value, unit) {
  if (unit === 'GB') return value / 1024;
  if (unit === 'PB') return value * 1024;
  return value;
}

export function excelRound(x) {
  return Math.round(x); // positive inputs only
}

export function excelEven(x) {
  return Math.ceil(x / 2) * 2;
}

export function evenUp(n) {
  return n % 2 ? n + 1 : n;
}

function computeNodesFor(onDiskTB, vcpu, memGB, concurrencyFactor = 1) {
  const perNodeTB = Math.min(vcpu / (COMPUTE_RULE.vcpuPerTB * concurrencyFactor),
                             memGB / (COMPUTE_RULE.memGBPerTB * concurrencyFactor));
  return Math.ceil(onDiskTB / perNodeTB);
}

// Segments per host: each primary segment gets 8 vCPU/cores + 32G (scaled by
// concurrency factor); mirrors are co-hosted 1:1 (spread mirroring).
export function segLayoutFor(cpu, memGB, concurrencyFactor = 1) {
  const primaries = Math.max(1, Math.min(
    Math.floor(cpu / (COMPUTE_RULE.vcpuPerTB * concurrencyFactor)),
    Math.floor(memGB / (COMPUTE_RULE.memGBPerTB * concurrencyFactor))));
  return { primaries, mirrors: primaries };
}

function layoutBom(layout, perSegTB) {
  const lines = [{ labelKey: 'bom.layout', value: `${layout.primaries} primary + ${layout.mirrors} mirror` }];
  if (perSegTB != null) lines.push({ labelKey: 'bom.perseg', value: `≈ ${perSegTB.toFixed(1)} TB` });
  return lines;
}

// fin-industry 2023 deck method: mirror ×2, ÷0.9 OS+FS overhead, ÷0.8 keep 20% free.
export function physicalNeedTB(onDiskTB) {
  return onDiskTB * 2 / 0.9 / 0.8;
}

export function calcPhysical({ dataTB, compressionRatio, presetId, concurrencyFactor = 1 }) {
  const p = PHYSICAL_PRESETS.find(x => x.id === presetId);
  const onDiskTB = dataTB / compressionRatio;
  const storageNodes = Math.max(2, Math.ceil(physicalNeedTB(onDiskTB) / p.arrayTB));
  const computeNodes = computeNodesFor(onDiskTB, p.cores, p.memGB, concurrencyFactor);
  const segNodes = evenUp(Math.max(storageNodes, computeNodes));
  const layout = segLayoutFor(p.cores, p.memGB, concurrencyFactor);
  const perSegTB = onDiskTB / (segNodes * layout.primaries);
  return {
    product: 'lightning',
    layout,
    roles: [
      { key: 'coordinator', count: 2, cpu: p.cores, memGB: p.memGB,
        storageTB: p.coordStorageTB, cpuUnitKey: 'unit.cores', noteKey: 'note.coord.physical',
        bom: [
          { labelKey: 'bom.cpu', value: p.bom.cpu },
          { labelKey: 'bom.mem', value: p.bom.mem },
          { labelKey: 'bom.sysdisk', value: p.bom.sysDisk },
          { labelKey: 'bom.datadisk', value: p.bom.coordDataDisk },
          { labelKey: 'bom.nic', value: p.network },
        ] },
      { key: 'segment', count: segNodes, cpu: p.cores, memGB: p.memGB,
        storageTB: p.arrayTB, cpuUnitKey: 'unit.cores', noteKey: 'note.segment.physical',
        bom: [
          { labelKey: 'bom.cpu', value: p.bom.cpu },
          { labelKey: 'bom.mem', value: p.bom.mem },
          { labelKey: 'bom.sysdisk', value: p.bom.sysDisk },
          { labelKey: 'bom.datadisk', value: p.bom.dataDisk },
          { labelKey: 'bom.raid', valueKey: p.bom.raidKey },
          { labelKey: 'bom.nic', value: p.network },
          ...layoutBom(layout, perSegTB),
        ] },
    ],
    binding: { type: computeNodes > storageNodes ? 'compute' : 'storage', storageNodes, computeNodes },
    capacityTB: segNodes * p.arrayTB * 0.9 * 0.8 / 2 * compressionRatio,
    sourceKey: p.sourceKey,
  };
}

export function vmUsableTB(storageTB) {
  return storageTB * 0.7 / (2 + 1 / 3);
}

export function recommendVMProfile(dataTB) {
  return VM_PROFILES.find(p => dataTB <= p.maxTB);
}

function lightningNodes({ dataTB, compressionRatio, vcpu, memGB, storageTB, concurrencyFactor = 1 }) {
  const usable = vmUsableTB(storageTB);
  const onDiskTB = dataTB / compressionRatio;
  const storageNodes = Math.max(2, evenUp(Math.trunc(onDiskTB / usable) + 2));
  const computeNodes = computeNodesFor(onDiskTB, vcpu, memGB, concurrencyFactor);
  const dataNodes = evenUp(Math.max(storageNodes, computeNodes));
  return { usable, storageNodes, computeNodes, dataNodes };
}

export function calcVM({ dataTB, compressionRatio, profileId, concurrencyFactor = 1 }) {
  const p = VM_PROFILES.find(x => x.id === profileId);
  const n = lightningNodes({ dataTB, compressionRatio, vcpu: p.vcpu, memGB: p.memGB, storageTB: p.storageTB, concurrencyFactor });
  const layout = segLayoutFor(p.vcpu, p.memGB, concurrencyFactor);
  const perSegTB = (dataTB / compressionRatio) / (n.dataNodes * layout.primaries);
  return {
    product: 'lightning',
    layout,
    roles: [
      { key: 'coordinator', count: 2, cpu: VM_COORD.vcpu, memGB: VM_COORD.memGB,
        storageTB: VM_COORD.storageTB, cpuUnitKey: 'unit.vcpu', noteKey: 'note.coord.vm' },
      { key: 'datanode', count: n.dataNodes, cpu: p.vcpu, memGB: p.memGB,
        storageTB: p.storageTB, cpuUnitKey: 'unit.vcpu', noteKey: 'note.datanode.vm',
        bom: [
          { labelKey: 'bom.datadisk', value: `${p.storageTB}TB SSD` },
          { labelKey: 'bom.throughput', value: p.throughput },
          { labelKey: 'bom.host', valueKey: p.hostKey },
          ...layoutBom(layout, perSegTB),
        ] },
    ],
    binding: { type: n.computeNodes > n.storageNodes ? 'compute' : 'storage',
               storageNodes: n.storageNodes, computeNodes: n.computeNodes },
    capacityTB: n.dataNodes * n.usable * compressionRatio,
    profileId: p.id,
  };
}

export function calcCloud({ dataTB, compressionRatio, schemeId, concurrencyFactor = 1 }) {
  const s = CLOUD_SCHEMES.find(x => x.id === schemeId);
  const seg = s.segment;
  const n = lightningNodes({ dataTB, compressionRatio, vcpu: seg.vcpu, memGB: seg.memGB, storageTB: seg.storageTB, concurrencyFactor });
  const layout = segLayoutFor(seg.vcpu, seg.memGB, concurrencyFactor);
  const perSegTB = (dataTB / compressionRatio) / (n.dataNodes * layout.primaries);
  return {
    product: 'lightning',
    layout,
    roles: [
      { key: 'coordinator', count: 2, cpu: s.coordinator.vcpu, memGB: s.coordinator.memGB,
        storageTB: s.coordinator.storageTB, instance: s.coordinator.instance,
        cpuUnitKey: 'unit.vcpu', noteKey: 'note.coord.vm',
        bom: [{ labelKey: 'bom.datadisk', value: s.coordinator.diskDesc }] },
      { key: 'datanode', count: n.dataNodes, cpu: seg.vcpu, memGB: seg.memGB,
        storageTB: seg.storageTB, instance: seg.instance,
        cpuUnitKey: 'unit.vcpu', noteKey: s.noteKey || 'note.datanode.vm',
        bom: [{ labelKey: 'bom.datadisk', value: seg.diskDesc }, ...layoutBom(layout, perSegTB)] },
      { key: 'oss', count: 1, cpu: null, memGB: null, storageTB: null,
        instance: s.oss, noteKey: 'note.oss' },
    ],
    binding: { type: n.computeNodes > n.storageNodes ? 'compute' : 'storage',
               storageNodes: n.storageNodes, computeNodes: n.computeNodes },
    capacityTB: n.dataNodes * n.usable * compressionRatio,
    sourceKey: s.sourceKey,
  };
}

export function calcEnterprise({ dataTB, concurrencyFactor = 1 }) {
  const segments = Math.max(2, Math.ceil(dataTB / ENTERPRISE_SEGMENT.tbPerSegment));
  const proxyCount = concurrencyFactor > 1 ? 2 : 1;
  return {
    product: 'enterprise',
    roles: [
      ...ENTERPRISE_FIXED,
      { key: 'proxy', count: proxyCount, cpu: ENTERPRISE_PROXY.vcpu, memGB: ENTERPRISE_PROXY.memGB,
        storageTB: ENTERPRISE_PROXY.storageTB, cpuUnitKey: 'unit.vcpu', noteKey: 'note.proxy' },
      { key: 'segment', count: segments,
        cpu: ENTERPRISE_SEGMENT.vcpuPerTB * concurrencyFactor,
        memGB: ENTERPRISE_SEGMENT.memGBPerTB * concurrencyFactor,
        storageTB: ENTERPRISE_SEGMENT.storageTB, cpuUnitKey: 'unit.vcpu',
        noteKey: 'note.segment.enterprise',
        bom: [{ labelKey: 'bom.perseg', value: `${ENTERPRISE_SEGMENT.tbPerSegment} TB` }] },
    ],
    binding: null,
    capacityTB: null,
  };
}

export function summarize(roles) {
  const s = { nodes: 0, cpu: 0, memGB: 0, storageTB: 0 };
  for (const r of roles) {
    s.nodes += r.count;
    if (r.cpu != null) s.cpu += r.count * r.cpu;
    if (r.memGB != null) s.memGB += r.count * r.memGB;
    if (r.storageTB != null) s.storageTB += r.count * r.storageTB;
  }
  return s;
}
