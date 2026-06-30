import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ProjectSummary } from "../types";

interface ProjectCalendarProps {
  projects: ProjectSummary[];
  categoryLookup: Map<string, string>;
  onSelectProject: (projectId: string) => void;
}

type CalendarItem = {
  project: ProjectSummary;
  workOrderId: string;
  title?: string | null;
  status?: string | null;
  scheduledAt: string | null;
  scheduledConfirmedAt?: string | null;
  scheduledConfirmedBy?: string | null;
};

const monthFormatter = new Intl.DateTimeFormat("sl-SI", { month: "long", year: "numeric" });
const dayKeyFormatter = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit" });
const timeFormatter = new Intl.DateTimeFormat("sl-SI", { hour: "2-digit", minute: "2-digit" });
const dateTimeFormatter = new Intl.DateTimeFormat("sl-SI", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function toDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function dayKey(date: Date) {
  return dayKeyFormatter.format(date);
}

function buildMonthDays(monthDate: Date) {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = new Date(firstOfMonth);
  const mondayBasedOffset = (firstOfMonth.getDay() + 6) % 7;
  start.setDate(firstOfMonth.getDate() - mondayBasedOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function collectCalendarItems(projects: ProjectSummary[]) {
  const items: CalendarItem[] = [];
  for (const project of projects) {
    for (const entry of project.calendarEntries ?? []) {
      items.push({
        project,
        workOrderId: entry.workOrderId,
        title: entry.title,
        status: entry.status,
        scheduledAt: entry.scheduledAt,
        scheduledConfirmedAt: entry.scheduledConfirmedAt,
        scheduledConfirmedBy: entry.scheduledConfirmedBy,
      });
    }
  }
  return items.sort((a, b) => {
    const aDate = toDate(a.scheduledAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bDate = toDate(b.scheduledAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return aDate - bDate;
  });
}

function eventLabel(item: CalendarItem) {
  return item.title?.trim() || item.project.title;
}

export function ProjectCalendar({ projects, categoryLookup, onSelectProject }: ProjectCalendarProps) {
  const [monthDate, setMonthDate] = useState(() => new Date());
  const monthDays = useMemo(() => buildMonthDays(monthDate), [monthDate]);
  const items = useMemo(() => collectCalendarItems(projects), [projects]);
  const confirmedItems = useMemo(() => items.filter((item) => Boolean(item.scheduledAt && item.scheduledConfirmedAt)), [items]);
  const unconfirmedItems = useMemo(() => items.filter((item) => !item.scheduledConfirmedAt), [items]);
  const confirmedByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of confirmedItems) {
      const date = toDate(item.scheduledAt);
      if (!date) continue;
      const key = dayKey(date);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [confirmedItems]);

  const currentMonth = monthDate.getMonth();
  const todayKey = dayKey(new Date());

  return (
    <div className="project-calendar-view">
      <section className="project-calendar-panel">
        <header className="project-calendar-header">
          <div>
            <h2>{monthFormatter.format(monthDate)}</h2>
            <p>{confirmedItems.length} potrjenih terminov</p>
          </div>
          <div className="project-calendar-controls">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
              aria-label="Prejšnji mesec"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setMonthDate(new Date())}>
              Danes
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
              aria-label="Naslednji mesec"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="project-calendar-weekdays">
          {["Pon", "Tor", "Sre", "Čet", "Pet", "Sob", "Ned"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="project-calendar-grid">
          {monthDays.map((date) => {
            const key = dayKey(date);
            const dayItems = confirmedByDay.get(key) ?? [];
            const isOutsideMonth = date.getMonth() !== currentMonth;
            return (
              <div
                key={key}
                className={`project-calendar-day${isOutsideMonth ? " is-muted" : ""}${key === todayKey ? " is-today" : ""}`}
              >
                <div className="project-calendar-day-number">{date.getDate()}</div>
                <div className="project-calendar-events">
                  {dayItems.map((item) => {
                    const scheduledDate = toDate(item.scheduledAt);
                    return (
                      <button
                        key={`${item.project.id}-${item.workOrderId}`}
                        type="button"
                        className="project-calendar-event"
                        onClick={() => onSelectProject(item.project.id)}
                      >
                        <span>{scheduledDate ? timeFormatter.format(scheduledDate) : ""}</span>
                        <strong>{item.project.id}</strong>
                        <small>{eventLabel(item)}</small>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="project-calendar-pending">
        <header>
          <div>
            <h3>Nepotrjeni termini</h3>
            <p>Termini z datumom, ki še niso potrjeni.</p>
          </div>
          <Badge variant="outline">{unconfirmedItems.length}</Badge>
        </header>
        {unconfirmedItems.length === 0 ? (
          <div className="project-calendar-empty">Ni nepotrjenih terminov za prikaz.</div>
        ) : (
          <div className="project-calendar-pending-list">
            {unconfirmedItems.map((item) => {
              const scheduledDate = toDate(item.scheduledAt);
              return (
                <button
                  key={`${item.project.id}-${item.workOrderId}`}
                  type="button"
                  className="project-calendar-pending-item"
                  onClick={() => onSelectProject(item.project.id)}
                >
                  <span className="project-calendar-pending-date">
                    <CalendarDays className="h-4 w-4" />
                    {scheduledDate ? dateTimeFormatter.format(scheduledDate) : "Brez termina"}
                  </span>
                  <strong>{item.project.title}</strong>
                  <span>{item.project.customer}</span>
                  <div>
                    {item.project.categories.slice(0, 3).map((categorySlug) => {
                      const label = categoryLookup.get(categorySlug);
                      return label ? (
                        <Badge key={`${item.project.id}-${categorySlug}`} variant="outline">
                          {label}
                        </Badge>
                      ) : null;
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
