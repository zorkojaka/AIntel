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
  'material.late_delivery',
  'email.ingest',
  'maintenance.due',
  'service.ticket_intake',
] as const;
export type WheelRuleKey = (typeof WHEEL_RULE_KEYS)[number];

// Vsako pravilo ima tri stanja (lastnikova zahteva 2026-07-10):
//   off    — pravilo ne dela nič;
//   manual — sistem pripravi, uporabnik z enim klikom potrdi (npr. checkbox
//            »follow-up« ob pošiljanju ponudbe — nič se ne izpolnjuje ročno);
//   auto   — zgodi se samo od sebe.
// Za pravila, ki zgolj ustvarjajo opravila, se manual obnaša kot auto (opravilo
// samo po sebi je poziv človeku); razlika je pomembna pri pravilih z akcijo.
export const WHEEL_RULE_MODES = ['off', 'manual', 'auto'] as const;
export type WheelRuleMode = (typeof WHEEL_RULE_MODES)[number];

export interface WheelParams {
  offerFollowUpDays: number; // days of silence after sentAt before a follow-up task
  inquiryStaleBusinessDays: number; // business days before an uncontacted inquiry escalates
  materialLateGraceDays: number; // calendar grace days after expectedAt before late-delivery task
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
        offerFollowUpDays: { type: Number, default: 7 },
        inquiryStaleBusinessDays: { type: Number, default: 1 },
        materialLateGraceDays: { type: Number, default: 0 },
        workStartHour: { type: Number, default: 8 },
        workEndHour: { type: Number, default: 16 },
      },
      _id: false,
      default: () => ({ offerFollowUpDays: 7, inquiryStaleBusinessDays: 1, materialLateGraceDays: 0, workStartHour: 8, workEndHour: 16 }),
    },
  },
  { timestamps: true, collection: 'wheel_settings' },
);

export const WheelSettingsModel: Model<WheelSettingsDocument> =
  mongoose.models.WheelSettings || mongoose.model<WheelSettingsDocument>('WheelSettings', WheelSettingsSchema);

// offerFollowUpDays=7: lastnik želi follow-up po enem tednu tišine.
const DEFAULT_PARAMS: WheelParams = { offerFollowUpDays: 7, inquiryStaleBusinessDays: 1, materialLateGraceDays: 0, workStartHour: 8, workEndHour: 16 };

export type WheelConfig = {
  rules: Record<string, { enabled: boolean; mode?: WheelRuleMode }>;
  params: WheelParams;
};

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

// Star zapis pozna samo enabled:boolean — beremo mode z izpeljavo, pišemo oboje.
export async function getRuleMode(key: WheelRuleKey): Promise<WheelRuleMode> {
  const config = await getWheelConfig();
  const entry = config.rules[key];
  if (entry?.mode && WHEEL_RULE_MODES.includes(entry.mode)) return entry.mode;
  return entry?.enabled === true ? 'auto' : 'off';
}

export async function isRuleEnabled(key: WheelRuleKey): Promise<boolean> {
  return (await getRuleMode(key)) !== 'off';
}

export async function setWheelConfig(input: {
  rules?: Record<string, { enabled?: unknown; mode?: unknown }>;
  params?: Partial<WheelParams>;
}) {
  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.rules ?? {})) {
    if (!WHEEL_RULE_KEYS.includes(key as WheelRuleKey)) {
      throw new Error(`Neznano pravilo "${key}". Dovoljena: ${WHEEL_RULE_KEYS.join(', ')}`);
    }
    let mode: WheelRuleMode;
    if (value?.mode !== undefined) {
      if (!WHEEL_RULE_MODES.includes(value.mode as WheelRuleMode)) {
        throw new Error(`Neveljaven način "${String(value.mode)}" za pravilo "${key}". Dovoljeni: ${WHEEL_RULE_MODES.join(', ')}`);
      }
      mode = value.mode as WheelRuleMode;
    } else {
      mode = value?.enabled === true ? 'auto' : 'off';
    }
    update[`rules.${encodeKey(key)}.mode`] = mode;
    update[`rules.${encodeKey(key)}.enabled`] = mode !== 'off';
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
