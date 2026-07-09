import mongoose, { Document, Model, Schema } from 'mongoose';

// AIN-P1-11 (AINTEL_WHEEL_SPEC §9): per-rule kill switches + parameters.
// Every rule ships DISABLED and is enabled one by one (this is also the
// rollback mechanism — disabling a rule returns the system to manual work;
// tasks are additive data, nothing to clean up).

export const WHEEL_RULE_KEYS = [
  'inquiry.first_contact',
  'inquiry.next_step',
  'inquiry.stale_escalation',
  'offer.follow_up',
  'offer.expiry',
] as const;
export type WheelRuleKey = (typeof WHEEL_RULE_KEYS)[number];

export interface WheelParams {
  offerFollowUpDays: number; // days of silence after sentAt before a follow-up task
  inquiryStaleBusinessDays: number; // business days before an uncontacted inquiry escalates
  workStartHour: number; // working window for due-date computation (Mon–Fri)
  workEndHour: number;
}

export interface WheelSettingsDocument extends Document {
  _id: string;
  rules: Record<string, { enabled: boolean }>;
  params: WheelParams;
  updatedAt: Date;
}

const WheelSettingsSchema = new Schema<WheelSettingsDocument>(
  {
    _id: { type: String, default: 'wheel' },
    rules: { type: Schema.Types.Mixed, default: {} },
    params: {
      type: {
        offerFollowUpDays: { type: Number, default: 3 },
        inquiryStaleBusinessDays: { type: Number, default: 1 },
        workStartHour: { type: Number, default: 8 },
        workEndHour: { type: Number, default: 16 },
      },
      _id: false,
      default: () => ({ offerFollowUpDays: 3, inquiryStaleBusinessDays: 1, workStartHour: 8, workEndHour: 16 }),
    },
  },
  { timestamps: true, collection: 'wheel_settings' },
);

export const WheelSettingsModel: Model<WheelSettingsDocument> =
  mongoose.models.WheelSettings || mongoose.model<WheelSettingsDocument>('WheelSettings', WheelSettingsSchema);

const DEFAULT_PARAMS: WheelParams = { offerFollowUpDays: 3, inquiryStaleBusinessDays: 1, workStartHour: 8, workEndHour: 16 };

export type WheelConfig = { rules: Record<string, { enabled: boolean }>; params: WheelParams };

let cache: { value: WheelConfig; at: number } | null = null;
const CACHE_MS = 60 * 1000;

// Rule keys contain dots ('offer.follow_up'), which MongoDB update paths treat
// as nesting — store them with '__' instead and translate at the boundary.
const encodeKey = (key: string) => key.replace(/\./g, '__');
const decodeKey = (key: string) => key.replace(/__/g, '.');

export function invalidateWheelConfigCache() {
  cache = null;
}

export async function getWheelConfig(): Promise<WheelConfig> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const doc = await WheelSettingsModel.findById('wheel').lean();
  const storedRules = (doc?.rules as WheelConfig['rules']) ?? {};
  const rules: WheelConfig['rules'] = {};
  for (const [key, value] of Object.entries(storedRules)) rules[decodeKey(key)] = value;
  const value: WheelConfig = {
    rules,
    params: { ...DEFAULT_PARAMS, ...(doc?.params ?? {}) },
  };
  cache = { value, at: Date.now() };
  return value;
}

export async function isRuleEnabled(key: WheelRuleKey): Promise<boolean> {
  const config = await getWheelConfig();
  return config.rules[key]?.enabled === true;
}

export async function setWheelConfig(input: { rules?: Record<string, { enabled?: unknown }>; params?: Partial<WheelParams> }) {
  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.rules ?? {})) {
    if (!WHEEL_RULE_KEYS.includes(key as WheelRuleKey)) {
      throw new Error(`Neznano pravilo "${key}". Dovoljena: ${WHEEL_RULE_KEYS.join(', ')}`);
    }
    update[`rules.${encodeKey(key)}.enabled`] = value?.enabled === true;
  }
  for (const [key, value] of Object.entries(input.params ?? {})) {
    if (!(key in DEFAULT_PARAMS)) throw new Error(`Neznan parameter "${key}".`);
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 30) throw new Error(`Neveljavna vrednost parametra "${key}".`);
    update[`params.${key}`] = n;
  }
  const doc = await WheelSettingsModel.findByIdAndUpdate(
    'wheel',
    { $set: update, $setOnInsert: { _id: 'wheel' } },
    { new: true, upsert: true },
  ).lean();
  invalidateWheelConfigCache();
  return doc;
}
