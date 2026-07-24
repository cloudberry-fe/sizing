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
