import type { Employee, EmployeePayload } from '../types';

const API_PREFIX = '/api/employees';

function buildHeaders(extra?: Record<string, string>) {
  return {
    'Content-Type': 'application/json',
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

export async function fetchEmployees(includeDeleted = false): Promise<Employee[]> {
  const query = includeDeleted ? '?includeDeleted=1' : '';
  const response = await fetch(`${API_PREFIX}${query}`, {
    headers: buildHeaders(),
  });
  return handleResponse<Employee[]>(response);
}

export async function createEmployee(payload: EmployeePayload): Promise<Employee> {
  const response = await fetch(API_PREFIX, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<Employee>(response);
}

export async function updateEmployee(id: string, payload: Partial<EmployeePayload>): Promise<Employee> {
  const response = await fetch(`${API_PREFIX}/${id}`, {
    method: 'PATCH',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<Employee>(response);
}

export async function deleteEmployee(id: string): Promise<void> {
  const response = await fetch(`${API_PREFIX}/${id}`, {
    method: 'DELETE',
    headers: buildHeaders(),
  });
  await handleResponse(response);
}

