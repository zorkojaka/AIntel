import { getConfig, setConfig } from '../../settings/config/config-store.service';
import { hasConfigNamespace, registerConfigNamespace } from '../../settings/config/config-registry';
import { v } from '../../settings/config/config-validator';
import { UserModel } from '../../users/schemas/user';
import { toCanonicalRole } from '../../../utils/roles';

export const INTERNAL_NOTIFICATION_EVENTS = [
  { key: 'issued', label: 'Delovni nalog izdan' },
  { key: 'scheduled', label: 'Termin nastavljen ali spremenjen' },
  { key: 'completed', label: 'Delovni nalog zaključen' },
] as const;
export type InternalNotificationEvent = typeof INTERNAL_NOTIFICATION_EVENTS[number]['key'];
export const INTERNAL_NOTIFICATION_ROLES = [
  { key: 'EXECUTION', label: 'Monter', description: 'Dodeljeni monterji delovnega naloga.', events: ['issued', 'scheduled'], defaults: ['issued', 'scheduled'] },
  { key: 'SALES', label: 'Prodajalec', description: 'Odgovorni prodajalec projekta.', events: ['scheduled', 'completed'], defaults: ['scheduled', 'completed'] },
  { key: 'FINANCE', label: 'Finance', description: 'Aktivni uporabniki z vlogo Finance.', events: ['completed'], defaults: [] },
  { key: 'ORGANIZER', label: 'Organizator', description: 'Aktivni uporabniki z vlogo Organizator.', events: ['issued', 'scheduled', 'completed'], defaults: [] },
  { key: 'ADMIN', label: 'Administrator', description: 'Vsi aktivni administratorji.', events: ['issued', 'scheduled', 'completed'], defaults: ['issued', 'scheduled', 'completed'] },
];
export type InternalNotificationSettings = Record<string, Record<string, boolean>>;
const NAMESPACE = 'communication.internal';

function registerSettings() {
  if (hasConfigNamespace(NAMESPACE)) return;
  const shape = Object.fromEntries(INTERNAL_NOTIFICATION_ROLES.map((role) => [role.key,
    v.object(Object.fromEntries(role.events.map((event) => [event, v.boolean().default(role.defaults.includes(event))]))).default(
      Object.fromEntries(role.events.map((event) => [event, role.defaults.includes(event)])),
    ),
  ]));
  registerConfigNamespace({ namespace: NAMESPACE, description: 'Interno e-poštno obveščanje po vlogah.', schema: v.object(shape) });
}

export async function getInternalNotificationSettings() {
  registerSettings();
  return getConfig<InternalNotificationSettings>(NAMESPACE);
}

export async function saveInternalNotificationSettings(value: unknown, updatedBy?: string) {
  registerSettings();
  return setConfig<InternalNotificationSettings>(NAMESPACE, value, { updatedBy });
}

export async function getInternalNotificationOptions() {
  return { events: INTERNAL_NOTIFICATION_EVENTS, roles: INTERNAL_NOTIFICATION_ROLES, value: await getInternalNotificationSettings() };
}

export async function resolveInternalNotificationRecipients(event: InternalNotificationEvent, salesUserId?: unknown) {
  const settings = await getInternalNotificationSettings();
  const users = await UserModel.find({
    tenantId: 'inteligent', active: true, deletedAt: null, status: { $nin: ['DISABLED', 'INVITED'] },
  }).select({ email: 1, roles: 1 }).lean();
  return Array.from(new Set<string>(users.filter((user) => {
    const roles = (user.roles ?? []).map(toCanonicalRole);
    return (String(user._id) === String(salesUserId) && settings.SALES?.[event]) ||
      roles.some((role) => role && role !== 'SALES' && role !== 'EXECUTION' && settings[role]?.[event]);
  }).map((user) => String(user.email ?? '').trim().toLowerCase()).filter(Boolean)));
}
