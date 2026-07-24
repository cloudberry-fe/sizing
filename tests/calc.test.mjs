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
