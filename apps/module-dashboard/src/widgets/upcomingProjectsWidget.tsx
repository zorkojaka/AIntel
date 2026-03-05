import { Button } from '@aintel/ui';
import type { DashboardWidgetDefinition, InstallerDashboardWidgetProps } from '../types';
import { formatDate, navigateToProject, renderEmptyState, renderError, showMetaParts } from './utils';

export const upcomingProjectsWidget: DashboardWidgetDefinition = {
  id: 'upcoming-projects',
  title: 'Prihajajoci projekti (potrjena ponudba)',
  description: 'Najbližji projekti s potrjeno ponudbo.',
  roles: ['installer'],
  defaultEnabledForRoles: ['installer'],
  size: 'lg',
  render: ({ data, isLoading, error }: InstallerDashboardWidgetProps) => {
    if (isLoading) {
      return renderEmptyState('Nalagam projekte...');
    }
    if (error) {
      return renderError(error);
    }
    if (!data.upcomingConfirmedProjects.length) {
      return renderEmptyState('Ni potrjenih projektov.');
    }

    return (
      <>
        <ul className="dashboard-widget__list">
          {data.upcomingConfirmedProjects.slice(0, 10).map((project) => (
            <li key={project.id} className="dashboard-widget__item">
              <div>
                <div className="dashboard-widget__title">{project.code ?? project.id}</div>
                <div className="dashboard-widget__meta">
                  {showMetaParts([project.customerName, project.customerAddress ?? undefined])}
                </div>
                <details className="dashboard-widget__details">
                  <summary>Podrobnosti</summary>
                  <div className="dashboard-widget__details-content">
                    <div className="dashboard-widget__meta">
                      {showMetaParts([
                        project.confirmedOfferVersionLabel
                          ? `Ponudba: ${project.confirmedOfferVersionLabel}`
                          : project.confirmedOfferVersionId
                            ? `Ponudba: ${project.confirmedOfferVersionId}`
                            : 'Ponudba ni oznacena',
                      ])}
                    </div>
                    <div className="dashboard-widget__meta">
                      {showMetaParts([
                        `Ustvarjeno: ${formatDate(project.createdAt)}`,
                        `Posodobljeno: ${formatDate(project.updatedAt)}`,
                      ])}
                    </div>
                  </div>
                </details>
              </div>
              <Button variant="ghost" onClick={() => navigateToProject(project.id)}>
                Odpri projekt
              </Button>
            </li>
          ))}
        </ul>
        <div className="dashboard-widget__footer">
          <Button variant="ghost" onClick={() => window.location.assign('/projects')}>
            Pokaži vse
          </Button>
        </div>
      </>
    );
  },
};
