export const ROLE_ADMIN = "ADMIN";
export const ROLE_SALES = "SALES";
export const ROLE_EXECUTION = "EXECUTION";
export const ROLE_FINANCE = "FINANCE";
export const ROLE_ORGANIZER = "ORGANIZER";

export const APP_ROLE_VALUES = [
  ROLE_ADMIN,
  ROLE_SALES,
  ROLE_EXECUTION,
  ROLE_FINANCE,
  ROLE_ORGANIZER,
] as const;

export type AppRole = (typeof APP_ROLE_VALUES)[number];
