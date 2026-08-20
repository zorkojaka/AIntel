const SCHEDULING_TIME_ZONE = 'Europe/Ljubljana';

export const DEFAULT_MINIMUM_SCHEDULING_LEAD_DAYS = 3;
export const DEFAULT_MAXIMUM_SCHEDULING_ADVANCE_DAYS = 90;

type SchedulingWindow = {
  minimumLeadDays?: number;
  maximumAdvanceDays?: number;
};

function getDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHEDULING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function toDateKey(year: number, month: number, day: number) {
  return [year, month, day].map((value, index) => String(value).padStart(index === 0 ? 4 : 2, '0')).join('-');
}

function normalizeDays(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}

function addCalendarDays(date: Date, days: number) {
  const { year, month, day } = getDateParts(date);
  const result = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + days));
  return toDateKey(result.getUTCFullYear(), result.getUTCMonth() + 1, result.getUTCDate());
}

export function getEarliestSchedulingDateKey(now = new Date(), settings?: SchedulingWindow) {
  const minimumLeadDays = normalizeDays(settings?.minimumLeadDays, DEFAULT_MINIMUM_SCHEDULING_LEAD_DAYS);
  return addCalendarDays(now, minimumLeadDays);
}

export function getLatestSchedulingDateKey(now = new Date(), settings?: SchedulingWindow) {
  const maximumAdvanceDays = normalizeDays(settings?.maximumAdvanceDays, DEFAULT_MAXIMUM_SCHEDULING_ADVANCE_DAYS);
  return addCalendarDays(now, maximumAdvanceDays);
}

export function isSchedulingDateAllowed(value: string, now = new Date(), settings?: SchedulingWindow) {
  const earliestDateKey = getEarliestSchedulingDateKey(now, settings);
  const latestDateKey = getLatestSchedulingDateKey(now, settings);
  let selectedDateKey: string;

  const localDateTimeMatch = value.match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/);
  if (localDateTimeMatch) {
    selectedDateKey = localDateTimeMatch[1];
  } else {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) return false;

    const { year, month, day } = getDateParts(parsed);
    selectedDateKey = toDateKey(Number(year), Number(month), Number(day));
  }

  return selectedDateKey >= earliestDateKey && selectedDateKey <= latestDateKey;
}
