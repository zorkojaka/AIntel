import type { ProjectSummary } from '../types';
import { Badge } from './ui/badge';

export function ProjectClosureInfo({ project }: { project: ProjectSummary }) {
  if (!project.closedAt) return null;
  return (
    <div className="space-y-1 text-xs">
      <Badge variant={project.closureOutcome === 'rejected' ? 'destructive' : 'secondary'}>
        {project.closureOutcome === 'rejected' ? 'Zavrnjen' : 'Zaključen'}
      </Badge>
      <div className="text-muted-foreground">Zaprl: {project.closedBy || 'Ni podatka'} · {new Date(project.closedAt).toLocaleString('sl-SI')}</div>
      {project.closureReason && <p className="m-0 break-words whitespace-pre-wrap">Razlog: {project.closureReason}</p>}
    </div>
  );
}
