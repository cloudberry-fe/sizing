import { COMPUTE_RULE, PHYSICAL_TIERS, PHYSICAL_NODE, VM_NODE, CLOUD, ENTERPRISE_TIERS, ENTERPRISE_FIXED } from './config.js';

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

export function physicalUsableTB(tier) {
  return tier.diskGB * tier.raidFactor / 2 / 1024 * 0.75;
}

function computeNodesFor(onDiskTB, vcpu, memGB) {
  const perNodeTB = Math.min(vcpu / COMPUTE_RULE.vcpuPerTB, memGB / COMPUTE_RULE.memGBPerTB);
  return Math.ceil(onDiskTB / perNodeTB);
}

export function calcPhysical({ dataTB, compressionRatio, tierId }) {
  const tier = PHYSICAL_TIERS.find(t => t.id === tierId);
  const usable = physicalUsableTB(tier);
  const onDiskTB = dataTB / compressionRatio;
  const storageNodes = Math.max(2, excelEven(excelRound(dataTB / (compressionRatio * usable))));
  const computeNodes = computeNodesFor(onDiskTB, PHYSICAL_NODE.cores, PHYSICAL_NODE.memGB);
  const segNodes = evenUp(Math.max(storageNodes, computeNodes));
  const tierStorageTB = tier.disks * tier.diskGB / 1024;
  return {
    product: 'lightning',
    roles: [
      { key: 'coordinator', count: 2, cpu: PHYSICAL_NODE.cores, memGB: PHYSICAL_NODE.memGB,
        storageTB: PHYSICAL_NODE.coordStorageTB, cpuUnitKey: 'unit.cores', noteKey: 'note.coord.physical' },
      { key: 'segment', count: segNodes, cpu: PHYSICAL_NODE.cores, memGB: PHYSICAL_NODE.memGB,
        storageTB: tierStorageTB, cpuUnitKey: 'unit.cores', noteKey: 'note.segment.physical' },
    ],
    binding: { type: computeNodes > storageNodes ? 'compute' : 'storage', storageNodes, computeNodes },
    capacityTB: segNodes * usable * compressionRatio,
  };
}

export function vmUsableTB(storageTB) {
  return storageTB * 0.7 / (2 + 1 / 3);
}

function lightningVMResult({ dataTB, compressionRatio, node, instance, extraRoles }) {
  const usable = vmUsableTB(node.storageTB);
  const onDiskTB = dataTB / compressionRatio;
  const storageNodes = Math.max(2, evenUp(Math.trunc(onDiskTB / usable) + 2));
  const computeNodes = computeNodesFor(onDiskTB, node.vcpu, node.memGB);
  const dataNodes = evenUp(Math.max(storageNodes, computeNodes));
  return {
    product: 'lightning',
    roles: [
      { key: 'coordinator', count: 2, cpu: node.vcpu, memGB: node.memGB,
        storageTB: VM_NODE.coordStorageTB, instance, cpuUnitKey: 'unit.vcpu', noteKey: 'note.coord.vm' },
      { key: 'datanode', count: dataNodes, cpu: node.vcpu, memGB: node.memGB,
        storageTB: node.storageTB, instance, cpuUnitKey: 'unit.vcpu', noteKey: 'note.datanode.vm' },
      ...(extraRoles || []),
    ],
    binding: { type: computeNodes > storageNodes ? 'compute' : 'storage', storageNodes, computeNodes },
    capacityTB: dataNodes * usable * compressionRatio,
  };
}

export function calcVM({ dataTB, compressionRatio }) {
  return lightningVMResult({ dataTB, compressionRatio, node: VM_NODE, instance: null, extraRoles: null });
}

export function calcCloud({ dataTB, compressionRatio, cloudId }) {
  const c = CLOUD[cloudId];
  return lightningVMResult({
    dataTB, compressionRatio, node: c, instance: c.instance,
    extraRoles: [{ key: 'oss', count: 1, cpu: null, memGB: null, storageTB: null,
                   instance: c.oss, noteKey: 'note.oss' }],
  });
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
