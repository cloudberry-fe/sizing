import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toTB, excelRound, excelEven, evenUp,
  physicalNeedTB, calcPhysical,
  vmUsableTB, recommendVMProfile, calcVM, calcCloud,
  calcEnterprise, summarize,
} from '../js/calc.js';
import { PHYSICAL_PRESETS, VM_PROFILES, CLOUD_SCHEMES } from '../js/config.js';

const role = (r, key) => r.roles.find(x => x.key === key);

test('toTB converts units', () => {
  assert.equal(toTB(512, 'GB'), 0.5);
  assert.equal(toTB(10, 'TB'), 10);
  assert.equal(toTB(2, 'PB'), 2048);
});

test('excelRound: half away from zero (positive domain)', () => {
  assert.equal(excelRound(7.5), 8);
  assert.equal(excelRound(7.4), 7);
});

test('excelEven: smallest even integer >= x', () => {
  assert.equal(excelEven(7.68), 8);
  assert.equal(excelEven(8), 8);
  assert.equal(excelEven(15.7), 16);
  assert.equal(excelEven(0), 0);
});

test('evenUp: integers round odd up to even', () => {
  assert.equal(evenUp(19), 20);
  assert.equal(evenUp(18), 18);
});

// --- Physical (fin-industry 2023 deck method) ---

test('physicalNeedTB: x2 mirror, /0.9 OS+FS, /0.8 free reserve', () => {
  // customer deck: 160TB (incl. mirror) -> 160/0.8/0.9 = 222.2; ours takes onDisk=80
  assert.ok(Math.abs(physicalNeedTB(80) - 222.222) < 0.01);
});

test('Customer-deck regression: 160TB cr=2 sas_std -> 10 data nodes (deck says 10)', () => {
  const r = calcPhysical({ dataTB: 160, compressionRatio: 2, presetId: 'sas_std' });
  assert.equal(role(r, 'segment').count, 10);
  assert.equal(role(r, 'coordinator').count, 2);
});

test('Customer-deck regression: 160TB cr=2 ssd_perf -> 12 data nodes (deck says 12)', () => {
  const r = calcPhysical({ dataTB: 160, compressionRatio: 2, presetId: 'ssd_perf' });
  assert.equal(role(r, 'segment').count, 12);
  assert.equal(r.binding.storageNodes, 11);
  assert.equal(r.binding.type, 'storage');
});

test('physical nvme_modern is compute-bound at 160TB cr=2', () => {
  const r = calcPhysical({ dataTB: 160, compressionRatio: 2, presetId: 'nvme_modern' });
  assert.equal(r.binding.storageNodes, 6);  // ceil(222.2/42.24)
  assert.equal(r.binding.computeNodes, 10); // ceil(80/8)
  assert.equal(role(r, 'segment').count, 10);
});

test('physical tiny data floors at 2 segment nodes', () => {
  const r = calcPhysical({ dataTB: 1, compressionRatio: 2, presetId: 'sas_std' });
  assert.equal(role(r, 'segment').count, 2);
});

test('physical capacityTB inverts the formula', () => {
  const r = calcPhysical({ dataTB: 160, compressionRatio: 2, presetId: 'sas_std' });
  // 10 nodes × 26.4 × 0.9 × 0.8 / 2 × 2 = 190.08
  assert.ok(Math.abs(r.capacityTB - 190.08) < 0.01);
});

test('physical tie-break: equal storage/compute nodes -> storage-bound (40TB cr=1 sas_std)', () => {
  const r = calcPhysical({ dataTB: 40, compressionRatio: 1, presetId: 'sas_std' });
  assert.equal(r.binding.storageNodes, 5); // ceil(111.1/26.4)
  assert.equal(r.binding.computeNodes, 5); // ceil(40/8)
  assert.equal(r.binding.type, 'storage');
  assert.equal(role(r, 'segment').count, 6);
});

test('physical roles carry BOM lines incl. RAID', () => {
  const r = calcPhysical({ dataTB: 10, compressionRatio: 2, presetId: 'sas_std' });
  const seg = role(r, 'segment');
  assert.equal(seg.cpuUnitKey, 'unit.cores');
  assert.ok(seg.bom.some(b => b.labelKey === 'bom.raid' && b.valueKey === 'raid.2x12r5'));
  assert.ok(role(r, 'coordinator').bom.some(b => b.labelKey === 'bom.datadisk'));
});

// --- VM (profiles) ---

test('vm usable = storage * 0.7/(2+1/3)', () => {
  assert.ok(Math.abs(vmUsableTB(2) - 0.6) < 0.0001);
});

test('recommendVMProfile picks by business data size', () => {
  assert.equal(recommendVMProfile(3).id, 'lite');
  assert.equal(recommendVMProfile(30).id, 'medium');
  assert.equal(recommendVMProfile(100).id, 'large');
});

test('vm lite 10TB cr=1: storage-bound 18 nodes (2025 sheet formula)', () => {
  const r = calcVM({ dataTB: 10, compressionRatio: 1, profileId: 'lite' });
  assert.equal(r.binding.storageNodes, 18); // TRUNC(10/0.6)+2
  assert.equal(r.binding.computeNodes, 10);
  assert.equal(r.binding.type, 'storage');
  assert.equal(role(r, 'datanode').count, 18);
});

test('vm medium 30TB cr=2: 14 nodes, coordinator fixed 8vCPU/32G', () => {
  const r = calcVM({ dataTB: 30, compressionRatio: 2, profileId: 'medium' });
  assert.equal(role(r, 'datanode').count, 14); // trunc(15/1.2)+2=14
  const coord = role(r, 'coordinator');
  assert.equal(coord.cpu, 8);
  assert.equal(coord.memGB, 32);
  assert.ok(role(r, 'datanode').bom.some(b => b.labelKey === 'bom.throughput'));
});

// --- Cloud (schemes) ---

test('cloud aws_ebs 20TB cr=2: r5.4xlarge, storage-bound 8 nodes', () => {
  const r = calcCloud({ dataTB: 20, compressionRatio: 2, schemeId: 'aws_ebs' });
  const dn = role(r, 'datanode');
  assert.equal(dn.instance, 'r5.4xlarge');
  assert.equal(r.binding.storageNodes, 8); // trunc(10/1.8)+2=7 -> even 8
  assert.equal(r.binding.computeNodes, 5); // ceil(10/min(2,4))
  assert.equal(dn.count, 8);
  assert.equal(role(r, 'coordinator').instance, 'r5.xlarge');
  assert.ok(r.roles.some(x => x.key === 'oss'));
});

test('cloud aws_local (i3en) 20TB cr=1: compute-bound 20 nodes', () => {
  const r = calcCloud({ dataTB: 20, compressionRatio: 1, schemeId: 'aws_local' });
  assert.equal(r.binding.storageNodes, 16); // trunc(20/1.5)+2=15 -> even 16
  assert.equal(r.binding.computeNodes, 20);
  assert.equal(role(r, 'datanode').count, 20);
});

test('cloud azure_local 50TB cr=1 keeps 2025-sheet pin: 88 nodes', () => {
  const r = calcCloud({ dataTB: 50, compressionRatio: 1, schemeId: 'azure_local' });
  assert.equal(r.binding.storageNodes, 88); // trunc(50/(1.92*0.3))+2=88
  assert.equal(role(r, 'datanode').count, 88);
});

test('every cloud scheme resolves with coordinator+segment', () => {
  for (const s of CLOUD_SCHEMES) {
    const r = calcCloud({ dataTB: 10, compressionRatio: 2, schemeId: s.id });
    assert.ok(role(r, 'datanode').count >= 2, s.id);
    assert.equal(role(r, 'coordinator').count, 2, s.id);
  }
});

// --- Enterprise (unchanged from v1) ---

test('enterprise segment counts across tiers (1000TB)', () => {
  assert.equal(role(calcEnterprise({ dataTB: 1000, tierId: 'spec1' }), 'segment').count, 1000);
  assert.equal(role(calcEnterprise({ dataTB: 1000, tierId: 'spec3' }), 'segment').count, 500);
  assert.equal(role(calcEnterprise({ dataTB: 1000, tierId: 'spec5' }), 'segment').count, 250);
});

test('enterprise floors at 2 segments and carries fixed platform roles', () => {
  const r = calcEnterprise({ dataTB: 1, tierId: 'spec1' });
  assert.equal(role(r, 'segment').count, 2);
  assert.equal(role(r, 'unionstore').count, 4);
  assert.equal(role(r, 'platform').count, 11);
  assert.equal(role(r, 'proxy').count, 1);
  assert.equal(r.binding, null);
});

// --- Shared ---

test('summarize totals count*spec and skips nulls', () => {
  const s = summarize([
    { key: 'a', count: 2, cpu: 8, memGB: 32, storageTB: 2 },
    { key: 'b', count: 1, cpu: null, memGB: null, storageTB: null },
  ]);
  assert.deepEqual(s, { nodes: 3, cpu: 16, memGB: 64, storageTB: 4 });
});

test('cpuUnitKey: cores on physical, vCPU elsewhere', () => {
  assert.equal(role(calcPhysical({ dataTB: 10, compressionRatio: 2, presetId: 'ssd_perf' }), 'segment').cpuUnitKey, 'unit.cores');
  assert.equal(role(calcVM({ dataTB: 10, compressionRatio: 2, profileId: 'lite' }), 'datanode').cpuUnitKey, 'unit.vcpu');
  assert.equal(role(calcEnterprise({ dataTB: 10, tierId: 'spec1' }), 'segment').cpuUnitKey, 'unit.vcpu');
});

test('config sanity: presets/profiles/schemes counts', () => {
  assert.equal(PHYSICAL_PRESETS.length, 3);
  assert.equal(VM_PROFILES.length, 3);
  assert.equal(CLOUD_SCHEMES.length, 6);
});
