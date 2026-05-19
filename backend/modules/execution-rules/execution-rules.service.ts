import mongoose from 'mongoose';
import { ProductModel } from '../cenik/product.model';
import {
  ExecutionQuantityRule,
  ExecutionRuleSettingsDocument,
  ExecutionRuleSettingsModel,
  ExecutionScenario,
  ExecutionScenarioType,
  ProductServiceExecutionRule,
} from './execution-rules.model';

export const DEFAULT_EXECUTION_SCENARIOS: ExecutionScenario[] = [
  { type: 'posiljanje', ime: 'Pošiljanje', storitve: [] },
  { type: 'izvedba', ime: 'Izvedba', storitve: [] },
  {
    type: 'izvedba_napeljava',
    ime: 'Izvedba z napeljavo',
    storitve: [],
    defaultEstimates: {
      napeljavaUrPerKamera: 2,
      utpKabelMetrovPerKamera: 20,
      kanalMetrovPerKamera: 4,
    },
  },
];

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.normalize('NFC').trim() : '';
}

function cleanNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function cleanQuantityRule(input: any): ExecutionQuantityRule {
  const type = ['fixed', 'per_unit', 'per_classification_field'].includes(input?.type) ? input.type : 'fixed';
  return {
    type,
    value: cleanNumber(input?.value, 1),
    field: cleanText(input?.field),
  };
}

function makeId(prefix: string, existingId?: unknown) {
  const provided = cleanText(existingId);
  return provided || `${prefix}-${new mongoose.Types.ObjectId().toString()}`;
}

export function normalizeScenarios(input: any[]): ExecutionScenario[] {
  const byType = new Map((Array.isArray(input) ? input : []).map((scenario) => [scenario?.type, scenario]));
  return DEFAULT_EXECUTION_SCENARIOS.map((fallback) => {
    const source = byType.get(fallback.type) ?? {};
    return {
      type: fallback.type,
      ime: cleanText(source.ime) || fallback.ime,
      storitve: Array.isArray(source.storitve)
        ? source.storitve
            .filter((service: any) => mongoose.isValidObjectId(service?.serviceProductId))
            .map((service: any) => ({
              id: makeId('scenario-service', service.id),
              serviceProductId: service.serviceProductId,
              quantityRule: cleanQuantityRule(service.quantityRule),
              description: cleanText(service.description),
            }))
        : [],
      defaultEstimates: {
        napeljavaUrPerKamera: cleanNumber(
          source.defaultEstimates?.napeljavaUrPerKamera,
          fallback.defaultEstimates?.napeljavaUrPerKamera ?? 2,
        ),
        utpKabelMetrovPerKamera: cleanNumber(
          source.defaultEstimates?.utpKabelMetrovPerKamera,
          fallback.defaultEstimates?.utpKabelMetrovPerKamera ?? 20,
        ),
        kanalMetrovPerKamera: cleanNumber(
          source.defaultEstimates?.kanalMetrovPerKamera,
          fallback.defaultEstimates?.kanalMetrovPerKamera ?? 4,
        ),
      },
    };
  });
}

export function normalizeProductServiceRules(input: any[]): ProductServiceExecutionRule[] {
  return (Array.isArray(input) ? input : [])
    .filter((rule) => mongoose.isValidObjectId(rule?.serviceProductId))
    .map((rule) => ({
      id: makeId('rule', rule.id),
      triggerType: ['product', 'classification', 'category', 'project'].includes(rule.triggerType)
        ? rule.triggerType
        : 'classification',
      triggerValue: cleanText(rule.triggerValue),
      triggerField: cleanText(rule.triggerField),
      triggerFieldValue: cleanText(rule.triggerFieldValue),
      serviceProductId: rule.serviceProductId,
      quantityRule: cleanQuantityRule(rule.quantityRule),
      isActive: rule.isActive !== false,
    }))
    .filter((rule) => rule.triggerValue);
}

export async function getExecutionRuleSettings(tenantId: string) {
  const settings = await ExecutionRuleSettingsModel.findOne({ tenantId }).lean();
  if (!settings) {
    return {
      id: null,
      tenantId,
      productServiceRules: [],
      scenarios: DEFAULT_EXECUTION_SCENARIOS,
      isConfigured: false,
    };
  }
  return {
    id: String(settings._id),
    tenantId: settings.tenantId,
    productServiceRules: settings.productServiceRules ?? [],
    scenarios: normalizeScenarios(settings.scenarios ?? []),
    isConfigured: (settings.productServiceRules?.length ?? 0) > 0 || (settings.scenarios ?? []).some((s) => s.storitve.length > 0),
  };
}

export async function saveExecutionRuleSettings(tenantId: string, actorId: string | null, body: any) {
  const productServiceRules = normalizeProductServiceRules(body?.productServiceRules);
  const scenarios = normalizeScenarios(body?.scenarios);
  const update: Partial<ExecutionRuleSettingsDocument> = {
    tenantId,
    productServiceRules,
    scenarios,
  };
  if (actorId && mongoose.isValidObjectId(actorId)) {
    update.createdBy = new mongoose.Types.ObjectId(actorId);
  }
  const saved = await ExecutionRuleSettingsModel.findOneAndUpdate(
    { tenantId },
    { $set: update },
    { upsert: true, new: true, runValidators: true },
  ).lean();
  return {
    id: String(saved._id),
    tenantId: saved.tenantId,
    productServiceRules: saved.productServiceRules ?? [],
    scenarios: normalizeScenarios(saved.scenarios ?? []),
    isConfigured: (saved.productServiceRules?.length ?? 0) > 0 || (saved.scenarios ?? []).some((s) => s.storitve.length > 0),
  };
}

function serviceSummary(product: any) {
  return {
    id: String(product._id),
    name: product.ime,
    unitPrice: Number(product.prodajnaCena ?? 0),
  };
}

export async function suggestExecutionRulesFromPriceList() {
  const services = await ProductModel.find({ isService: true, isActive: { $ne: false } }).sort({ ime: 1 }).lean();
  const findService = (patterns: RegExp[]) =>
    services.find((service) => patterns.some((pattern) => pattern.test(cleanText(service.ime).toLowerCase())));

  const cameraInstall = findService([/monta[zž]a.*kamer/, /kamer.*monta[zž]a/]);
  const recorderStart = findService([/zagon.*snemaln/, /snemaln.*zagon/]);
  const appTransfer = findService([/prenos.*aplikacij/, /aplikacij.*prenos/]);
  const delivery = findService([/po[sš]tnin/, /dostav/]);
  const mileage = findService([/kilometrin/, /prevoz/]);
  const cabling = findService([/napeljav/, /kablir/]);

  return {
    productServiceRules: [
      cameraInstall
        ? {
            id: makeId('suggested-rule'),
            triggerType: 'classification',
            triggerValue: 'kamera',
            serviceProductId: String(cameraInstall._id),
            serviceProduct: serviceSummary(cameraInstall),
            quantityRule: { type: 'per_unit', value: 1, field: '' },
            isActive: true,
            reason: 'Najdena storitev za montažo kamer.',
          }
        : null,
      recorderStart
        ? {
            id: makeId('suggested-rule'),
            triggerType: 'classification',
            triggerValue: 'snemalnik',
            triggerField: 'nvrChannels',
            triggerFieldValue: '',
            serviceProductId: String(recorderStart._id),
            serviceProduct: serviceSummary(recorderStart),
            quantityRule: { type: 'fixed', value: 1, field: '' },
            isActive: true,
            reason: 'Najdena storitev za zagon snemalnika.',
          }
        : null,
      appTransfer
        ? {
            id: makeId('suggested-rule'),
            triggerType: 'project',
            triggerValue: 'videonadzor',
            serviceProductId: String(appTransfer._id),
            serviceProduct: serviceSummary(appTransfer),
            quantityRule: { type: 'fixed', value: 1, field: '' },
            isActive: true,
            reason: 'Najdena storitev za aplikacijo na projektu.',
          }
        : null,
    ].filter(Boolean),
    scenarios: [
      delivery
        ? { type: 'posiljanje' as ExecutionScenarioType, serviceProductId: String(delivery._id), serviceProduct: serviceSummary(delivery), description: 'Poštnina' }
        : null,
      mileage
        ? { type: 'izvedba' as ExecutionScenarioType, serviceProductId: String(mileage._id), serviceProduct: serviceSummary(mileage), description: 'Kilometrina' }
        : null,
      cabling
        ? { type: 'izvedba_napeljava' as ExecutionScenarioType, serviceProductId: String(cabling._id), serviceProduct: serviceSummary(cabling), description: 'Napeljava' }
        : null,
    ].filter(Boolean),
  };
}
