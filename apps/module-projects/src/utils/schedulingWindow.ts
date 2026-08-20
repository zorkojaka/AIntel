export const DEFAULT_MINIMUM_SCHEDULING_LEAD_DAYS = 3;
export const DEFAULT_MAXIMUM_SCHEDULING_ADVANCE_DAYS = 90;

type SchedulingWindow = {
  minimumLeadDays?: number;
  maximumAdvanceDays?: number;
};

function normalizeDays(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}

function getSchedulingDateTime(daysFromToday: number, now: Date) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysFromToday);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}T00:00`;
}

export function getSchedulingDateTimeRange(settings?: SchedulingWindow, now = new Date()) {
  const minimumLeadDays = normalizeDays(settings?.minimumLeadDays, DEFAULT_MINIMUM_SCHEDULING_LEAD_DAYS);
  const maximumAdvanceDays = Math.max(
    minimumLeadDays,
    normalizeDays(settings?.maximumAdvanceDays, DEFAULT_MAXIMUM_SCHEDULING_ADVANCE_DAYS),
  );
  return {
    min: getSchedulingDateTime(minimumLeadDays, now),
    max: getSchedulingDateTime(maximumAdvanceDays, now),
  };
}

export function isSchedulingDateTimeAllowed(value: string, settings?: SchedulingWindow, now = new Date()) {
  const range = getSchedulingDateTimeRange(settings, now);
  return value >= range.min && value <= range.max;
}
