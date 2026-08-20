import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getEarliestSchedulingDateKey,
  getLatestSchedulingDateKey,
  isSchedulingDateAllowed,
} from '../modules/projects/services/scheduling-window.service';

test('scheduling excludes today, tomorrow and the day after tomorrow in Ljubljana', () => {
  const now = new Date('2026-08-20T10:00:00.000Z');

  assert.equal(getEarliestSchedulingDateKey(now), '2026-08-23');
  assert.equal(isSchedulingDateAllowed('2026-08-20T15:00', now), false);
  assert.equal(isSchedulingDateAllowed('2026-08-21T15:00', now), false);
  assert.equal(isSchedulingDateAllowed('2026-08-22T15:00', now), false);
  assert.equal(isSchedulingDateAllowed('2026-08-23T00:00', now), true);
  assert.equal(isSchedulingDateAllowed('2026-11-19T00:00', now), false);
});

test('scheduling cutoff follows Ljubljana calendar days across a DST change', () => {
  const now = new Date('2026-10-24T22:30:00.000Z');

  assert.equal(getEarliestSchedulingDateKey(now), '2026-10-28');
  assert.equal(isSchedulingDateAllowed('2026-10-27T23:59', now), false);
  assert.equal(isSchedulingDateAllowed('2026-10-28T00:00', now), true);
});

test('scheduling uses the configured lead and advance window', () => {
  const now = new Date('2026-08-20T10:00:00.000Z');
  const settings = { minimumLeadDays: 5, maximumAdvanceDays: 14 };

  assert.equal(getEarliestSchedulingDateKey(now, settings), '2026-08-25');
  assert.equal(getLatestSchedulingDateKey(now, settings), '2026-09-03');
  assert.equal(isSchedulingDateAllowed('2026-08-24T12:00', now, settings), false);
  assert.equal(isSchedulingDateAllowed('2026-08-25T12:00', now, settings), true);
  assert.equal(isSchedulingDateAllowed('2026-09-03T12:00', now, settings), true);
  assert.equal(isSchedulingDateAllowed('2026-09-04T12:00', now, settings), false);
});
