import type { User } from '@aintel/shared/types/user';
import { buildTenantHeaders } from '@aintel/shared/utils/tenant';

const USERS_API = '/api/users';
const EMPLOYEES_API = '/api/employees';

function buildHeaders(extra?: Record<string, string>) {
  return {
    'Content-Type': 'application/json',
    ...buildTenantHeaders(),
    ...(extra ?? {}),
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  const parsed = await response.json();
  if (!parsed?.success) {
    throw new Error(parsed?.error || 'Zahteva ni uspela.');
  }
  return parsed.data as T;
}

export async function fetchUsers(params?: { search?: string; includeDeleted?: boolean }): Promise<User[]> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.includeDeleted) query.set('includeDeleted', '1');
  const qs = query.toString() ? `?${query.toString()}` : '';
  const response = await fetch(`${USERS_API}${qs}`, {
    headers: buildHeaders(),
  });
  return handleResponse<User[]>(response);
}

export async function createUser(payload: Partial<User>): Promise<User> {
  const response = await fetch(USERS_API, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<User>(response);
}

export async function updateUser(id: string, payload: Partial<User>): Promise<User> {
  const response = await fetch(`${USERS_API}/${id}`, {
    method: 'PATCH',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<User>(response);
}

export async function deleteUser(id: string): Promise<void> {
  const response = await fetch(`${USERS_API}/${id}`, {
    method: 'DELETE',
    headers: buildHeaders(),
  });
  await handleResponse(response);
}

export async function getEmployeeUser(employeeId: string): Promise<User | null> {
  const response = await fetch(`${EMPLOYEES_API}/${employeeId}/user`, {
    headers: buildHeaders(),
  });
  return handleResponse<User | null>(response);
}
