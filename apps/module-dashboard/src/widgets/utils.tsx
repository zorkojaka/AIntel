export function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return date.toLocaleDateString('sl-SI');
}

export function navigateToProject(projectId: string, tab?: string) {
  const params = new URLSearchParams();
  params.set('projectId', projectId);
  if (tab) {
    params.set('tab', tab);
  }
  window.location.assign(`/projects?${params.toString()}`);
}

export function showMetaParts(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(' • ');
}

export function renderEmptyState(message: string) {
  return <p className="dashboard-widget__empty">{message}</p>;
}

export function renderError(message: string) {
  return <p className="dashboard-widget__error">{message}</p>;
}
