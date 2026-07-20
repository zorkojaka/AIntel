import assert from 'node:assert/strict';
import test from 'node:test';

import { buildIcsEvent, googleCalendarLink } from '../modules/availability/calendar-event';

const BASE = {
  start: '2026-07-22T08:00:00',
  durationHours: 8,
  summary: 'Montaža — PRJ-500',
  description: 'Izvedba montaže.',
  location: 'Agrokombinatska 12, Ljubljana',
  uid: 'booking-abc@inteligent.si',
};

test('ICS: veljaven dogodek z začetkom in koncem po trajanju', () => {
  const ics = buildIcsEvent(BASE);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /DTSTART:20260722T080000/);
  assert.match(ics, /DTEND:20260722T160000/, '8 ur → konec ob 16:00');
  assert.match(ics, /UID:booking-abc@inteligent\.si/);
  assert.match(ics, /SUMMARY:Montaža — PRJ-500/);
  assert.match(ics, /END:VCALENDAR/);
});

test('ICS: konec prek polnoči se prenese na naslednji dan', () => {
  const ics = buildIcsEvent({ ...BASE, start: '2026-07-22T20:00:00', durationHours: 6 });
  assert.match(ics, /DTSTART:20260722T200000/);
  assert.match(ics, /DTEND:20260723T020000/, '20:00 + 6 h → naslednji dan 02:00');
});

test('ICS: posebni znaki v besedilu so pobegnjeni', () => {
  const ics = buildIcsEvent({ ...BASE, summary: 'Montaža; kamere, alarm' });
  assert.match(ics, /SUMMARY:Montaža\\; kamere\\, alarm/);
});

test('Google Calendar povezava: pravi datumski razpon in naslov', () => {
  const link = googleCalendarLink(BASE);
  assert.match(link, /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
  assert.match(link, /action=TEMPLATE/);
  assert.match(link, /dates=20260722T080000%2F20260722T160000/);
  assert.match(link, /location=Agrokombinatska/);
});
