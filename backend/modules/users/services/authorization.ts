export const roleKeys = ['ADMIN', 'SALES', 'EXECUTION', 'FINANCE'] as const;

export type RoleKey = (typeof roleKeys)[number];

export async function assertCan(_action: string, _actor: any, _resource: any) {
  return true;
}

export function hasCapability(_role: RoleKey, _action: string) {
  return true;
}
