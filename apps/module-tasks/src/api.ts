import { parseApiEnvelope } from '@aintel/shared/utils/api-client';

export type TaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled' | 'blocked';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface TaskItem {
  _id: string;
  type: string;
  title: string;
  description?: string;
  subject: { kind: string; id?: string; label?: string };
  assigneeEmployeeId?: string | null;
  assigneeRole?: string | null;
  status: TaskStatus;
  blockedReason?: string;
  priority: TaskPriority;
  dueAt?: string | null;
  resolution?: { outcome: string; note?: string; resolvedAt: string };
  createdAt: string;
  updatedAt: string;
}

export interface MyTasksResponse {
  tasks: TaskItem[];
  counts: { open: number; overdue: number };
}

export async function fetchMyTasks(params: { status?: string } = {}): Promise<MyTasksResponse> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  const response = await fetch(`/api/tasks/my${query.size ? `?${query}` : ''}`);
  return parseApiEnvelope<MyTasksResponse>(response, 'Opravil ni mogoče naložiti.');
}

export async function fetchMyTaskCounts(): Promise<{ open: number; overdue: number }> {
  const data = await fetchMyTasks();
  return data.counts;
}

export type CreateTaskPayload = {
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueAt?: string;
  assigneeRole?: string;
  assigneeEmployeeId?: string;
};

export async function createTask(payload: CreateTaskPayload): Promise<TaskItem> {
  const response = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseApiEnvelope<TaskItem>(response, 'Opravila ni bilo mogoče ustvariti.');
}

export type TaskAction =
  | { action: 'claim' }
  | { action: 'complete'; resolution: { outcome: string; note?: string } }
  | { action: 'block'; blockedReason: string }
  | { action: 'unblock' }
  | { action: 'cancel' }
  | { action: 'reopen' }
  | { action: 'reschedule'; dueAt?: string };

export async function updateTask(taskId: string, payload: TaskAction): Promise<TaskItem> {
  const response = await fetch(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseApiEnvelope<TaskItem>(response, 'Opravila ni bilo mogoče posodobiti.');
}
