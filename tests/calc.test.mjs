import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toTB, excelRound, excelEven, evenUp,
  nodeUsableTB, calcPhysical,
  recommendVMProfile, calcVM, calcCloud,
  calcEnterprise, summarize,
} from '../js/calc.js';
import { PHYSICAL_PRESETS, VM_PROFILES, CLOUD_SCHEMES, ENTERPRISE_SEGMENT } from '../js/config.js';

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

test('nodeUsableTB: x0.9 FS, x0.8 free, /(2+1/3) mirror+workspace — unified for all paths', () => {
  assert.ok(Math.abs(nodeUsableTB(26.4) - 8.1463) < 0.001); // physical sas array
  assert.ok(Math.abs(nodeUsableTB(2) - 0.6171) < 0.001);    // vm lite disk
});

test('Customer-deck regression: 160TB cr=2 sas_std -> 10 data nodes (deck says 10)', () => {
  const r = calcPhysical({ dataTB: 160, compressionRatio: 2, presetId: 'sas_std' });
  assert.equal(role(r, 'segment').count, 10);
  assert.equal(role(r, 'coordinator').count, 2);
});

test('160TB cr=2 ssd_perf -> 14 nodes (deck said 12; unified formula adds workspace term)', () => {
  const r = calcPhysical({ dataTB: 160, compressionRatio: 2, presetId: 'ssd_perf' });
  assert.equal(role(r, 'segment').count, 14);
  assert.equal(r.binding.storageNodes, 13); // ceil(80 / (21.12*0.72/2.333))
  assert.equal(r.binding.type, 'storage');
});

test('physical nvme_modern 160TB cr=2: storage-bound 8 nodes (128 logical cores)', () => {
  const r = calcPhysical({ dataTB: 160, compressionRatio: 2, presetId: 'nvme_modern' });
  assert.equal(r.binding.storageNodes, 7);  // ceil(80 / 13.03)
  assert.equal(r.binding.computeNodes, 5);  // ceil(80 / min(128/8, 1024/32)=16)
  assert.equal(role(r, 'segment').count, 8);
});

test('physical tiny data floors at 2 segment nodes', () => {
  const r = calcPhysical({ dataTB: 1, compressionRatio: 2, presetId: 'sas_std' });
  assert.equal(role(r, 'segment').count, 2);
});

test('physical capacityTB inverts the formula', () => {
  const r = calcPhysical({ dataTB: 160, compressionRatio: 2, presetId: 'sas_std' });
  // 10 nodes × nodeUsableTB(26.4) × 2 = 162.93
  assert.ok(Math.abs(r.capacityTB - 162.93) < 0.01);
});

test('physical tie-break: equal storage/compute nodes -> storage-bound (40TB cr=1 sas_std f=2)', () => {
  const r = calcPhysical({ dataTB: 40, compressionRatio: 1, presetId: 'sas_std', concurrencyFactor: 2 });
  assert.equal(r.binding.storageNodes, 5); // ceil(40 / 8.146)
  assert.equal(r.binding.computeNodes, 5); // ceil(40 / min(128/16, 512/64)=8)
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

test('recommendVMProfile picks by business data size', () => {
  assert.equal(recommendVMProfile(3).id, 'lite');
  assert.equal(recommendVMProfile(30).id, 'medium');
  assert.equal(recommendVMProfile(100).id, 'large');
});

test('vm lite 10TB cr=1: storage-bound 18 nodes (unified formula)', () => {
  const r = calcVM({ dataTB: 10, compressionRatio: 1, profileId: 'lite' });
  assert.equal(r.binding.storageNodes, 17); // ceil(10/0.617)
  assert.equal(r.binding.computeNodes, 10);
  assert.equal(r.binding.type, 'storage');
  assert.equal(role(r, 'datanode').count, 18); // evenUp
});

test('vm medium 30TB cr=2: 14 nodes, coordinator fixed 8vCPU/32G', () => {
  const r = calcVM({ dataTB: 30, compressionRatio: 2, profileId: 'medium' });
  assert.equal(role(r, 'datanode').count, 14); // evenUp(ceil(15/1.234))
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
  assert.equal(r.binding.storageNodes, 6); // ceil(10/1.851)
  assert.equal(r.binding.computeNodes, 5); // ceil(10 / min(16/8, 128/32)=2)
  assert.equal(dn.count, 6);
  assert.equal(role(r, 'coordinator').instance, 'r5.xlarge');
  assert.ok(r.roles.some(x => x.key === 'oss'));
});

test('cloud aws_local (i3en) 20TB cr=1: compute-bound 20 nodes (8 vCPU quota)', () => {
  const r = calcCloud({ dataTB: 20, compressionRatio: 1, schemeId: 'aws_local' });
  assert.equal(r.binding.storageNodes, 13); // ceil(20/1.543)
  assert.equal(r.binding.computeNodes, 20); // ceil(20 / min(8/8, 64/32)=1)
  assert.equal(role(r, 'datanode').count, 20);
});

test('cloud azure_local 50TB cr=1: 86 nodes (2025 sheet said 88; unified formula)', () => {
  const r = calcCloud({ dataTB: 50, compressionRatio: 1, schemeId: 'azure_local' });
  assert.equal(r.binding.storageNodes, 85); // ceil(50/0.5925)
  assert.equal(role(r, 'datanode').count, 86);
});

test('every cloud scheme resolves with coordinator+segment', () => {
  for (const s of CLOUD_SCHEMES) {
    const r = calcCloud({ dataTB: 10, compressionRatio: 2, schemeId: s.id });
    assert.ok(role(r, 'datanode').count >= 2, s.id);
    assert.equal(role(r, 'coordinator').count, 2, s.id);
  }
});

// --- Enterprise (unified concurrency model: 8c32G per 1TB segment at <=80) ---

test('enterprise: 1TB per segment, 8c/32G at standard concurrency', () => {
  const r = calcEnterprise({ dataTB: 1000 });
  const seg = role(r, 'segment');
  assert.equal(seg.count, 1000);
  assert.equal(seg.cpu, 8);
  assert.equal(seg.memGB, 32);
  assert.equal(role(r, 'proxy').count, 1);
});

test('enterprise concurrency factor scales segment spec, cache, proxy instances', () => {
  const r = calcEnterprise({ dataTB: 100, concurrencyFactor: 2 });
  const seg = role(r, 'segment');
  assert.equal(seg.count, 100);      // segment count driven by data, not concurrency
  assert.equal(seg.cpu, 16);
  assert.equal(seg.memGB, 64);
  assert.equal(seg.storageTB, 1);    // cache 0.5 x factor 2
  assert.equal(role(r, 'proxy').count, 2);
});

test('enterprise: 500G cache at standard, OSS capacity shown', () => {
  const r = calcEnterprise({ dataTB: 100 });
  assert.equal(role(r, 'segment').storageTB, 0.5);
  const oss = role(r, 'oss');
  assert.ok(oss.bom.some(b => b.labelKey === 'bom.osscap' && b.value === '≈ 100 TB'));
});

test('enterprise floors at 2 segments and carries fixed platform roles', () => {
  const r = calcEnterprise({ dataTB: 1 });
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
  assert.equal(role(calcEnterprise({ dataTB: 10 }), 'segment').cpuUnitKey, 'unit.vcpu');
});

test('config sanity: presets/profiles/schemes counts, enterprise density = MPP rule', () => {
  assert.equal(PHYSICAL_PRESETS.length, 3);
  assert.equal(VM_PROFILES.length, 3);
  assert.equal(CLOUD_SCHEMES.length, 6);
  assert.equal(ENTERPRISE_SEGMENT.vcpuPerTB, 8);
  assert.equal(ENTERPRISE_SEGMENT.memGBPerTB, 32);
});

test('concurrency factor scales compute constraint only (default unchanged)', () => {
  const def = calcPhysical({ dataTB: 160, compressionRatio: 2, presetId: 'sas_std' });
  const high = calcPhysical({ dataTB: 160, compressionRatio: 2, presetId: 'sas_std', concurrencyFactor: 2 });
  assert.equal(def.roles.find(x => x.key === 'segment').count, 10);
  assert.equal(def.binding.computeNodes, 5);   // ceil(80 / 16)
  assert.equal(high.binding.computeNodes, 10); // ceil(80 / min(128/16, 512/64)=8)
  assert.equal(high.binding.storageNodes, def.binding.storageNodes); // storage math untouched
  assert.equal(high.roles.find(x => x.key === 'segment').count, 10); // storage still binds
});

test('concurrency factor on vm path (mid=1.5)', () => {
  const r = calcVM({ dataTB: 10, compressionRatio: 1, profileId: 'lite', concurrencyFactor: 1.5 });
  assert.equal(r.binding.computeNodes, 15); // ceil(10 / min(8/12, 64/48))
  assert.equal(r.binding.storageNodes, 17); // unchanged, still storage-bound
});

test('segment layout: 16P+16M per physical host (128 logical cores, 1:4 mem)', () => {
  const r = calcPhysical({ dataTB: 160, compressionRatio: 2, presetId: 'sas_std' });
  assert.equal(r.layout.primaries, 16); // min(128/8, 512/32)
  assert.equal(r.layout.mirrors, 16);
  // 10 nodes × 16 primaries = 160 primaries for 80TB on-disk ≈ 0.5TB each
  const seg = r.roles.find(x => x.key === 'segment');
  const perSeg = seg.bom.find(b => b.labelKey === 'bom.perseg');
  assert.equal(perSeg.value, '≈ 0.5 TB');
  assert.ok(seg.bom.some(b => b.labelKey === 'bom.layout' && b.value === '16 primary + 16 mirror'));
});

test('segment layout scales down with concurrency factor', () => {
  const r = calcPhysical({ dataTB: 160, compressionRatio: 2, presetId: 'sas_std', concurrencyFactor: 2 });
  assert.equal(r.layout.primaries, 8); // min(128/16, 512/64)
});

test('segment layout on vm/cloud matches GP 1-4 per VM guidance', () => {
  assert.equal(calcVM({ dataTB: 10, compressionRatio: 2, profileId: 'lite' }).layout.primaries, 1);
  assert.equal(calcVM({ dataTB: 30, compressionRatio: 2, profileId: 'medium' }).layout.primaries, 2);
  assert.equal(calcVM({ dataTB: 100, compressionRatio: 2, profileId: 'large' }).layout.primaries, 3);
  assert.equal(calcCloud({ dataTB: 20, compressionRatio: 2, schemeId: 'aws_ebs' }).layout.primaries, 2);  // min(16/8, 128/32)
  assert.equal(calcCloud({ dataTB: 20, compressionRatio: 2, schemeId: 'azure_local' }).layout.primaries, 1); // min(8/8, 64/32)
});

test('one quota rule everywhere: concurrency scales cloud layout too', () => {
  const std = calcCloud({ dataTB: 20, compressionRatio: 2, schemeId: 'aws_ebs' });
  const xhigh = calcCloud({ dataTB: 20, compressionRatio: 2, schemeId: 'aws_ebs', concurrencyFactor: 2 });
  assert.equal(std.layout.primaries, 2);   // min(16/8, 128/32)
  assert.equal(xhigh.layout.primaries, 1); // min(16/16, 128/64)
});
