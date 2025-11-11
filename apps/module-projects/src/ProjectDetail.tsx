import React from 'react';
import { Card } from '@aintel/ui';
import { Timeline } from './components/Timeline';
import { STATUS_LABELS } from './constants/status';
import { ProjectRecord } from './types/project';

interface ProjectDetailProps {
  project: ProjectRecord | null;
  onConfirmPhase: (phase: string) => void;
  loading?: boolean;
}

export const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, onConfirmPhase, loading }) => {
  if (!project) {
    return (
      <Card title="Podrobnosti projekta">
        <p>Izberi projekt, da vidiš časovnico in dokumente.</p>
      </Card>
    );
  }

  const startDate = project.startDate
    ? new Date(project.startDate).toLocaleDateString('sl')
    : 'Ni določeno';
  const endDate = project.endDate
    ? new Date(project.endDate).toLocaleDateString('sl')
    : 'Ni določeno';

  const documents = Object.entries(project.documents ?? {}).filter(([, value]) => Boolean(value));

  return (
    <Card title={`Projekt ${project.name}`}>
      <div className="project-detail__grid">
        <div className="project-detail__meta">
          <p>
            <strong>Status:</strong> {STATUS_LABELS[project.status]}
          </p>
          <p>
            <strong>Stranka:</strong> {project.companyName ?? 'Neznano'}
          </p>
          <p>
            <strong>Kontakt:</strong> {project.contactName ?? 'Neznano'}
          </p>
          <p>
            <strong>Datum začetka:</strong> {startDate}
          </p>
          <p>
            <strong>Predvideni zaključek:</strong> {endDate}
          </p>
        </div>
        <div className="project-detail__timeline">
          <Timeline
            timeline={project.timeline}
            onConfirmPhase={(phase) => onConfirmPhase(phase)}
            disabled={loading}
          />
        </div>
      </div>
      <div className="project-detail__documents">
        <h3>Dokumenti</h3>
        {documents.length ? (
          <ul>
            {documents.map(([key, value]) => (
              <li key={key}>
                <strong>{key}</strong>: <code>{value}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p>Zaenkrat ni povezanih dokumentov.</p>
        )}
      </div>
    </Card>
  );
};
