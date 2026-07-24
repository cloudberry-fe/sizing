import { COMPUTE_RULE, PHYSICAL_TIERS, PHYSICAL_NODE } from './config.js';

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
        storageTB: PHYSICAL_NODE.coordStorageTB, noteKey: 'note.coord.physical' },
      { key: 'segment', count: segNodes, cpu: PHYSICAL_NODE.cores, memGB: PHYSICAL_NODE.memGB,
        storageTB: tierStorageTB, noteKey: 'note.segment.physical' },
    ],
    binding: { type: computeNodes > storageNodes ? 'compute' : 'storage', storageNodes, computeNodes },
    capacityTB: segNodes * usable * compressionRatio,
  };
}
