import type { DashboardWidgetDefinition, DashboardWidgetId } from '../types';
import { agendaWidget } from './agendaWidget';
import { materialOrdersWidget } from './materialOrdersWidget';
import { projectSummaryWidget } from './projectSummaryWidget';
import { upcomingProjectsWidget } from './upcomingProjectsWidget';
import { workOrdersWidget } from './workOrdersWidget';

export const ALL_WIDGETS: DashboardWidgetDefinition[] = [
  agendaWidget,
  projectSummaryWidget,
  upcomingProjectsWidget,
  materialOrdersWidget,
  workOrdersWidget,
];

export function getWidgetById(widgetId: DashboardWidgetId) {
  return ALL_WIDGETS.find((widget) => widget.id === widgetId) ?? null;
}

export function getDefaultWidgetIdsForRoles(roles: string[]) {
  const roleSet = new Set(roles);
  const defaults = ALL_WIDGETS.filter((widget) =>
    widget.defaultEnabledForRoles?.some((role) => roleSet.has(role)),
  ).map((widget) => widget.id);

  if (defaults.length) {
    return defaults;
  }

  return ALL_WIDGETS.map((widget) => widget.id);
}
