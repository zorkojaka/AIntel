import { ROLE_ADMIN, ROLE_ORGANIZER } from "../types/roles";

function normalizeRoles(input?: string[] | null) {
  return Array.isArray(input)
    ? input.filter((role): role is string => typeof role === "string" && role.trim().length > 0)
    : [];
}

export function canAccessPreparation(input?: string[] | null) {
  const roles = normalizeRoles(input);
  return roles.includes(ROLE_ADMIN) || roles.includes(ROLE_ORGANIZER);
}

export function canEditPreparation(input?: string[] | null) {
  return canAccessPreparation(input);
}
