import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toTB, excelRound, excelEven, evenUp } from '../js/calc.js';

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

import { calcPhysical, physicalUsableTB } from '../js/calc.js';
import { PHYSICAL_TIERS } from '../js/config.js';

const ssd192 = PHYSICAL_TIERS.find(t => t.id === 'ssd192x24');

test('physical usable capacity matches Excel (SSD 1.92T x24 RAID5)', () => {
  // 1778*20/2/1024*0.75 = 13.0224609375
  assert.ok(Math.abs(physicalUsableTB(ssd192) - 13.0225) < 0.001);
});

test('physical 200TB cr=2: storage says 8, compute rule says 20 -> compute-bound 20', () => {
  const r = calcPhysical({ dataTB: 200, compressionRatio: 2, tierId: 'ssd192x24' });
  assert.equal(r.binding.storageNodes, 8);   // EVEN(ROUND(200/(2*13.0225)))
  assert.equal(r.binding.computeNodes, 20);  // CEIL(100 / min(40/8, 256/32)=5)
  assert.equal(r.binding.type, 'compute');
  const seg = r.roles.find(x => x.key === 'segment');
  assert.equal(seg.count, 20);
  const coord = r.roles.find(x => x.key === 'coordinator');
  assert.equal(coord.count, 2);
});

test('physical cr=1 reproduces Excel no-compression column for storage', () => {
  const r = calcPhysical({ dataTB: 200, compressionRatio: 1, tierId: 'ssd192x24' });
  assert.equal(r.binding.storageNodes, 16);  // EVEN(ROUND(200/13.0225)=15)=16
  assert.equal(r.binding.computeNodes, 40);  // CEIL(200/5)
});

test('physical tiny data floors at 2 segment nodes', () => {
  const r = calcPhysical({ dataTB: 1, compressionRatio: 2, tierId: 'ssd192x24' });
  assert.equal(r.roles.find(x => x.key === 'segment').count, 2);
});

import { calcVM, calcCloud, vmUsableTB } from '../js/calc.js';

test('vm usable = storage * 0.7/(2+1/3)', () => {
  assert.ok(Math.abs(vmUsableTB(2) - 0.6) < 0.0001);
});

test('vm 10TB cr=1: matches 2025 sheet formula, storage-bound', () => {
  const r = calcVM({ dataTB: 10, compressionRatio: 1 });
  // TRUNC(10/0.6)+2 = 18 -> even 18; compute = CEIL(10/1) = 10
  assert.equal(r.binding.storageNodes, 18);
  assert.equal(r.binding.computeNodes, 10);
  assert.equal(r.binding.type, 'storage');
  assert.equal(r.roles.find(x => x.key === 'datanode').count, 18);
});

test('vm 10TB cr=2: compression halves on-disk data', () => {
  const r = calcVM({ dataTB: 10, compressionRatio: 2 });
  assert.equal(r.binding.storageNodes, 10); // TRUNC(5/0.6)+2=10
  assert.equal(r.roles.find(x => x.key === 'datanode').count, 10);
});

test('cloud i3en 20TB cr=1: compute-bound at 20 nodes', () => {
  const r = calcCloud({ dataTB: 20, compressionRatio: 1, cloudId: 'aws_i3en' });
  assert.equal(r.binding.storageNodes, 16); // TRUNC(20/1.5)+2=15 -> even 16
  assert.equal(r.binding.computeNodes, 20);
  assert.equal(r.binding.type, 'compute');
  const dn = r.roles.find(x => x.key === 'datanode');
  assert.equal(dn.count, 20);
  assert.equal(dn.instance, 'i3en.2xlarge');
  assert.ok(r.roles.some(x => x.key === 'oss'));
});

test('cloud azure 50TB cr=1 matches sheet: 88 nodes', () => {
  const r = calcCloud({ dataTB: 50, compressionRatio: 1, cloudId: 'azure' });
  assert.equal(r.binding.storageNodes, 88); // TRUNC(50/(1.92*0.3))+2=88
  assert.equal(r.roles.find(x => x.key === 'datanode').count, 88);
});

import { calcEnterprise, summarize } from '../js/calc.js';

test('enterprise segment counts across tiers (1000TB)', () => {
  assert.equal(calcEnterprise({ dataTB: 1000, tierId: 'spec1' })
    .roles.find(x => x.key === 'segment').count, 1000);
  assert.equal(calcEnterprise({ dataTB: 1000, tierId: 'spec3' })
    .roles.find(x => x.key === 'segment').count, 500);
  assert.equal(calcEnterprise({ dataTB: 1000, tierId: 'spec5' })
    .roles.find(x => x.key === 'segment').count, 250);
});

test('enterprise floors at 2 segments and carries fixed platform roles', () => {
  const r = calcEnterprise({ dataTB: 1, tierId: 'spec1' });
  assert.equal(r.roles.find(x => x.key === 'segment').count, 2);
  assert.equal(r.roles.find(x => x.key === 'unionstore').count, 4);
  assert.equal(r.roles.find(x => x.key === 'platform').count, 11);
  assert.equal(r.roles.find(x => x.key === 'proxy').count, 1);
  assert.equal(r.binding, null);
});

test('summarize totals count*spec and skips nulls', () => {
  const s = summarize([
    { key: 'a', count: 2, cpu: 8, memGB: 32, storageTB: 2 },
    { key: 'b', count: 1, cpu: null, memGB: null, storageTB: null },
  ]);
  assert.deepEqual(s, { nodes: 3, cpu: 16, memGB: 64, storageTB: 4 });
});
