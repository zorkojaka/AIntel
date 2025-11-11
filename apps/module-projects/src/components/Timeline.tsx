import React from 'react';
import { Button } from '@aintel/ui';
import { PHASE_LABELS, PHASE_STATUS_LABELS } from '../constants/phases';
import { TimelineEvent } from '../types/project';
import './Timeline.css';

interface TimelineProps {
  timeline: TimelineEvent[];
  onConfirmPhase: (phase: string) => void;
  disabled?: boolean;
}

export const Timeline: React.FC<TimelineProps> = ({ timeline, onConfirmPhase, disabled }) => (
  <div className="project-timeline">
    {timeline.map((event) => (
      <article
        key={event.phase}
        className={`project-timeline__item project-timeline__item--${event.status}`}
      >
        <div className="project-timeline__header">
          <strong className="project-timeline__phase">
            {PHASE_LABELS[event.phase as keyof typeof PHASE_LABELS] ?? event.phase}
          </strong>
          <span className="project-timeline__badge">
            {PHASE_STATUS_LABELS[event.status]}
          </span>
        </div>
        <p className="project-timeline__date">
          {event.createdAt ? new Date(event.createdAt).toLocaleDateString('sl') : 'Brez datuma'}
        </p>
        {event.status !== 'completed' && (
          <Button
            variant="ghost"
            onClick={() => onConfirmPhase(event.phase)}
            disabled={disabled}
          >
            Potrdi {PHASE_LABELS[event.phase as keyof typeof PHASE_LABELS] ?? event.phase}
          </Button>
        )}
      </article>
    ))}
  </div>
);
