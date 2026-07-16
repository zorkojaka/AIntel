import { Button } from '@aintel/ui';
import type { DashboardWidgetDefinition, InstallerDashboardWidgetProps } from '../types';
import { formatDate, navigateToProject, renderEmptyState, renderError, showMetaParts } from './utils';

const currencyFormatter = new Intl.NumberFormat('sl-SI', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatEur(value: number) {
  return `${currencyFormatter.format(value)} €`;
}

const STATUS_LABELS: Record<string, string> = {
  ordered: 'Naročeno',
  'in-progress': 'V izvedbi',
  completed: 'Zaključeno',
};

export const earningsForecastWidget: DashboardWidgetDefinition = {
  id: 'earnings-forecast',
  title: 'Moja napoved zaslužka',
  description: 'Predviden zaslužek iz potrjenih, še ne zaračunanih projektov.',
  roles: ['installer'],
  defaultEnabledForRoles: ['installer'],
  size: 'lg',
  render: ({ data, isLoading, error }: InstallerDashboardWidgetProps) => {
    if (isLoading) {
      return renderEmptyState('Nalagam napoved...');
    }
    if (error) {
      return renderError(error);
    }

    const forecast = data.earningsForecast;
    if (!forecast || forecast.projects.length === 0) {
      return renderEmptyState('Ni potrjenih projektov, ki še niso zaračunani.');
    }

    const brezCene = forecast.projects.filter((project) => project.servicesWithoutRate.length > 0);

    return (
      <>
        <div className="dashboard-widget__item">
          <div>
            <div className="dashboard-widget__title">Skupaj predvideno: {formatEur(forecast.totalEarnings)}</div>
            <div className="dashboard-widget__meta">
              Ocena po tvojih cenah storitev. Dokončen znesek je ta, ki ga potrdi izdan račun.
            </div>
          </div>
        </div>

        <ul className="dashboard-widget__list">
          {forecast.months.map((month) => (
            <li key={month.month ?? 'brez'} className="dashboard-widget__item">
              <div>
                <div className="dashboard-widget__title">{month.label}</div>
                <div className="dashboard-widget__meta">
                  {showMetaParts([
                    `${month.projectCount} ${month.projectCount === 1 ? 'projekt' : 'projektov'}`,
                  ])}
                </div>
              </div>
              <div className="dashboard-widget__title">{formatEur(month.earnings)}</div>
            </li>
          ))}
        </ul>

        <ul className="dashboard-widget__list">
          {forecast.projects.map((project) => (
            <li key={project.projectId} className="dashboard-widget__item">
              <div>
                <div className="dashboard-widget__title">
                  {project.code} — {formatEur(project.earnings)}
                </div>
                <div className="dashboard-widget__meta">
                  {showMetaParts([
                    project.customerName,
                    STATUS_LABELS[project.status] ?? project.status,
                    `Potrjeno: ${formatDate(project.acceptedAt)}`,
                  ])}
                </div>
                {project.sharedBetween > 1 && (
                  <div className="dashboard-widget__meta">
                    Deljeno med {project.sharedBetween} monterja — kdo bo kaj opravil, se ve ob izvedbi.
                  </div>
                )}
                {project.servicesWithoutRate.length > 0 && (
                  <div className="dashboard-widget__meta">
                    Brez tvoje cene: {project.servicesWithoutRate.join(', ')} — te storitve niso vštete.
                  </div>
                )}
              </div>
              <Button className="dashboard-widget__cta" variant="ghost" onClick={() => navigateToProject(project.projectId)}>
                Odpri
              </Button>
            </li>
          ))}
        </ul>

        {brezCene.length > 0 && (
          <div className="dashboard-widget__footer">
            Pri {brezCene.length} {brezCene.length === 1 ? 'projektu' : 'projektih'} nekatere storitve nimajo tvoje
            cene, zato je napoved nižja od dejanske. Javi vodji, da jih nastavi.
          </div>
        )}
      </>
    );
  },
};
