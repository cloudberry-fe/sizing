import { COMPUTE_RULE, PHYSICAL_PRESETS, VM_PROFILES, VM_COORD, CLOUD_SCHEMES, ENTERPRISE_TIERS, ENTERPRISE_FIXED } from './config.js';

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

function computeNodesFor(onDiskTB, vcpu, memGB) {
  const perNodeTB = Math.min(vcpu / COMPUTE_RULE.vcpuPerTB, memGB / COMPUTE_RULE.memGBPerTB);
  return Math.ceil(onDiskTB / perNodeTB);
}

// fin-industry 2023 deck method: mirror ×2, ÷0.9 OS+FS overhead, ÷0.8 keep 20% free.
export function physicalNeedTB(onDiskTB) {
  return onDiskTB * 2 / 0.9 / 0.8;
}

export function calcPhysical({ dataTB, compressionRatio, presetId }) {
  const p = PHYSICAL_PRESETS.find(x => x.id === presetId);
  const onDiskTB = dataTB / compressionRatio;
  const storageNodes = Math.max(2, Math.ceil(physicalNeedTB(onDiskTB) / p.arrayTB));
  const computeNodes = computeNodesFor(onDiskTB, p.cores, p.memGB);
  const segNodes = evenUp(Math.max(storageNodes, computeNodes));
  return {
    product: 'lightning',
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

function lightningNodes({ dataTB, compressionRatio, vcpu, memGB, storageTB }) {
  const usable = vmUsableTB(storageTB);
  const onDiskTB = dataTB / compressionRatio;
  const storageNodes = Math.max(2, evenUp(Math.trunc(onDiskTB / usable) + 2));
  const computeNodes = computeNodesFor(onDiskTB, vcpu, memGB);
  const dataNodes = evenUp(Math.max(storageNodes, computeNodes));
  return { usable, storageNodes, computeNodes, dataNodes };
}

export function calcVM({ dataTB, compressionRatio, profileId }) {
  const p = VM_PROFILES.find(x => x.id === profileId);
  const n = lightningNodes({ dataTB, compressionRatio, vcpu: p.vcpu, memGB: p.memGB, storageTB: p.storageTB });
  return {
    product: 'lightning',
    roles: [
      { key: 'coordinator', count: 2, cpu: VM_COORD.vcpu, memGB: VM_COORD.memGB,
        storageTB: VM_COORD.storageTB, cpuUnitKey: 'unit.vcpu', noteKey: 'note.coord.vm' },
      { key: 'datanode', count: n.dataNodes, cpu: p.vcpu, memGB: p.memGB,
        storageTB: p.storageTB, cpuUnitKey: 'unit.vcpu', noteKey: 'note.datanode.vm',
        bom: [
          { labelKey: 'bom.datadisk', value: `${p.storageTB}TB SSD` },
          { labelKey: 'bom.throughput', value: p.throughput },
          { labelKey: 'bom.host', valueKey: p.hostKey },
        ] },
    ],
    binding: { type: n.computeNodes > n.storageNodes ? 'compute' : 'storage',
               storageNodes: n.storageNodes, computeNodes: n.computeNodes },
    capacityTB: n.dataNodes * n.usable * compressionRatio,
    profileId: p.id,
  };
}

export function calcCloud({ dataTB, compressionRatio, schemeId }) {
  const s = CLOUD_SCHEMES.find(x => x.id === schemeId);
  const seg = s.segment;
  const n = lightningNodes({ dataTB, compressionRatio, vcpu: seg.vcpu, memGB: seg.memGB, storageTB: seg.storageTB });
  return {
    product: 'lightning',
    roles: [
      { key: 'coordinator', count: 2, cpu: s.coordinator.vcpu, memGB: s.coordinator.memGB,
        storageTB: s.coordinator.storageTB, instance: s.coordinator.instance,
        cpuUnitKey: 'unit.vcpu', noteKey: 'note.coord.vm',
        bom: [{ labelKey: 'bom.datadisk', value: s.coordinator.diskDesc }] },
      { key: 'datanode', count: n.dataNodes, cpu: seg.vcpu, memGB: seg.memGB,
        storageTB: seg.storageTB, instance: seg.instance,
        cpuUnitKey: 'unit.vcpu', noteKey: s.noteKey || 'note.datanode.vm',
        bom: [{ labelKey: 'bom.datadisk', value: seg.diskDesc }] },
      { key: 'oss', count: 1, cpu: null, memGB: null, storageTB: null,
        instance: s.oss, noteKey: 'note.oss' },
    ],
    binding: { type: n.computeNodes > n.storageNodes ? 'compute' : 'storage',
               storageNodes: n.storageNodes, computeNodes: n.computeNodes },
    capacityTB: n.dataNodes * n.usable * compressionRatio,
    sourceKey: s.sourceKey,
  };
}

export function calcEnterprise({ dataTB, tierId }) {
  const tier = ENTERPRISE_TIERS.find(t => t.id === tierId);
  const segments = Math.max(2, Math.ceil(dataTB / tier.tbPerSegment));
  return {
    product: 'enterprise',
    roles: [
      ...ENTERPRISE_FIXED,
      { key: 'proxy', count: 1, ...toRoleSpec(tier.proxy), noteKey: 'note.proxy' },
      { key: 'segment', count: segments, ...toRoleSpec(tier.segment), noteKey: 'note.segment.enterprise' },
    ],
    binding: null,
    capacityTB: null,
  };
}

function toRoleSpec(s) {
  return { cpu: s.vcpu, memGB: s.memGB, storageTB: s.storageTB, cpuUnitKey: 'unit.vcpu' };
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
