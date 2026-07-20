// Koledarski dogodek za potrditveni e-mail termina montaže: .ics priloga
// (Apple Mail, Outlook) + povezava za Google Koledar (spletna pošta).
// Čas je "lebdeč" (brez cone) — koledar ga prikaže v lokalnem času gledalca;
// stranka je v istem časovnem pasu kot montaža, zato je ura pravilna.

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Iz lokalnega "YYYY-MM-DDTHH:mm:ss" v koledarski "YYYYMMDDTHHMMSS". */
function toCalendarStamp(local: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!match) return '';
  const [, y, mo, d, h, mi] = match;
  return `${y}${mo}${d}T${h}${mi}00`;
}

/** Prišteje ure lokalnemu času in vrne koledarski žig konca. */
function addHoursStamp(local: string, hours: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!match) return '';
  const [, y, mo, d, h, mi] = match.map(Number) as unknown as number[];
  const date = new Date(y, mo - 1, d, h, mi, 0);
  date.setHours(date.getHours() + Math.max(1, Math.round(hours)));
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

function escapeIcsText(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export interface CalendarEventInput {
  /** Lokalni začetek "YYYY-MM-DDTHH:mm:ss". */
  start: string;
  durationHours: number;
  summary: string;
  description?: string;
  location?: string;
  uid: string;
}

export function buildIcsEvent(input: CalendarEventInput): string {
  const dtStart = toCalendarStamp(input.start);
  const dtEnd = addHoursStamp(input.start, input.durationHours);
  const now = new Date();
  const dtStamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Inteligent//AIntel//SL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(input.uid)}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(input.summary)}`,
    input.description ? `DESCRIPTION:${escapeIcsText(input.description)}` : '',
    input.location ? `LOCATION:${escapeIcsText(input.location)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

export function googleCalendarLink(input: CalendarEventInput): string {
  const dates = `${toCalendarStamp(input.start)}/${addHoursStamp(input.start, input.durationHours)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.summary,
    dates,
  });
  if (input.description) params.set('details', input.description);
  if (input.location) params.set('location', input.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
