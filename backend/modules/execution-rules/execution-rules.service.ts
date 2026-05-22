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
  {
    type: 'izvedba',
    ime: 'Izvedba',
    storitve: [],
    defaultEstimates: {
      napeljavaUrPerKamera: 0,
      utpKabelMetrovPerKamera: 0,
      kanalMetrovPerKamera: 0,
      kilometrinaKm: 0,
    },
  },
  {
    type: 'izvedba_napeljava',
    ime: 'Izvedba z napeljavo',
    storitve: [],
    defaultEstimates: {
      napeljavaUrPerKamera: 2,
      utpKabelMetrovPerKamera: 20,
      kanalMetrovPerKamera: 4,
      kilometrinaKm: 0,
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
        kilometrinaKm: cleanNumber(
          source.defaultEstimates?.kilometrinaKm,
          fallback.defaultEstimates?.kilometrinaKm ?? 0,
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
  const priceListItems = await ProductModel.find({ isActive: { $ne: false } }).sort({ ime: 1 }).lean();
  const services = priceListItems.filter((product) => product.isService);
  const normalizedProductName = (product: any) =>
    cleanText(product.ime)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const findService = (patterns: RegExp[], rejectPatterns: RegExp[] = []) =>
    services.find((service) => {
      const name = normalizedProductName(service);
      return patterns.some((pattern) => pattern.test(name)) && !rejectPatterns.some((pattern) => pattern.test(name));
    });
  const findServices = (patterns: RegExp[]) =>
    services.filter((service) => patterns.some((pattern) => pattern.test(normalizedProductName(service))));
  const findProduct = (patterns: RegExp[], rejectPatterns: RegExp[] = []) =>
    priceListItems.find((product) => {
      const name = normalizedProductName(product);
      return patterns.some((pattern) => pattern.test(name)) && !rejectPatterns.some((pattern) => pattern.test(name));
    });

  const cameraInstall =
    findService([/^montaza.*kamer/, /montaza in konfiguracija.*kamer/], [/demontaz/, /remontaz/])
    ?? findService([/konfiguracija.*kamer/, /kamer.*konfiguracija/], [/demontaz/, /remontaz/]);
  const recorderServices = findServices([/zagon.*snemaln/, /konfiguracija.*snemaln/, /zagon.*nvr/, /nvr.*zagon/]);
  const recorderByChannels = [4, 8, 16, 32, 64]
    .map((channels) => ({
      channels,
      service: recorderServices.find((service) => {
        const name = normalizedProductName(service);
        return new RegExp(`(^|\\D)${channels}\\s*(ch|kanal|kanalni|kanalov)`).test(name);
      }),
    }))
    .filter((entry): entry is { channels: number; service: any } => Boolean(entry.service));
  const recorderFallback = recorderByChannels.length === 0 ? recorderServices[0] : null;
  const recorderRules = recorderByChannels.length
    ? recorderByChannels.map(({ channels, service }) => ({
        id: makeId('suggested-rule'),
        triggerType: 'classification' as const,
        triggerValue: 'snemalnik',
        triggerField: 'nvrChannels',
        triggerFieldValue: String(channels),
        serviceProductId: String(service._id),
        serviceProduct: serviceSummary(service),
        quantityRule: { type: 'fixed' as const, value: 1, field: '' },
        isActive: true,
        reason: `Najdena storitev za zagon snemalnika ${channels}ch.`,
      }))
    : recorderFallback
      ? [{
          id: makeId('suggested-rule'),
          triggerType: 'classification' as const,
          triggerValue: 'snemalnik',
          triggerField: '',
          triggerFieldValue: '',
          serviceProductId: String(recorderFallback._id),
          serviceProduct: serviceSummary(recorderFallback),
          quantityRule: { type: 'fixed' as const, value: 1, field: '' },
          isActive: true,
          reason: 'Najdena splošna storitev za zagon snemalnika.',
        }]
      : [];
  const appTransfer = findService([/prenos.*aplikacij/, /prikaz.*uporabe/, /namestitev.*aplikacij/]);
  const delivery = findService([/postnin/, /dostav/, /posiljan/]);
  const mileage = findService([/kilometrin/, /prevoz/, /\bkm\b/, /potni.*stroski/]);
  const cabling = findService([/napeljav/, /delovn.*ur/, /ura.*napeljav/]);
  const utpCable = findProduct([/\butp\b.*kabel/, /kabel.*\butp\b/, /vodnik/, /kabel/], [/baloon/, /balun/, /adapter/, /delovn.*ur/])
    ?? findProduct([/\butp\b/], [/baloon/, /balun/, /adapter/]);
  const channel = findProduct([/zascitn.*kanal/, /kanal.*zascitn/, /kabelsk.*kanal/, /\bkanal\b/, /\bcev\b/]);

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
      ...recorderRules,
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
        ? { type: 'izvedba' as ExecutionScenarioType, serviceProductId: String(mileage._id), serviceProduct: serviceSummary(mileage), description: 'Kilometrina', quantityRule: { type: 'per_classification_field' as const, value: 1, field: 'kilometrinaKm' } }
        : null,
      cabling
        ? { type: 'izvedba_napeljava' as ExecutionScenarioType, serviceProductId: String(cabling._id), serviceProduct: serviceSummary(cabling), description: 'Delovne ure napeljave', quantityRule: { type: 'per_classification_field' as const, value: 1, field: 'napeljavaUr' } }
        : null,
      utpCable
        ? { type: 'izvedba_napeljava' as ExecutionScenarioType, serviceProductId: String(utpCable._id), serviceProduct: serviceSummary(utpCable), description: 'UTP kabel', quantityRule: { type: 'per_classification_field' as const, value: 1, field: 'utpKabelMetrov' } }
        : null,
      channel
        ? { type: 'izvedba_napeljava' as ExecutionScenarioType, serviceProductId: String(channel._id), serviceProduct: serviceSummary(channel), description: 'Zaščitni kanal', quantityRule: { type: 'per_classification_field' as const, value: 1, field: 'kanalMetrov' } }
        : null,
      mileage
        ? { type: 'izvedba_napeljava' as ExecutionScenarioType, serviceProductId: String(mileage._id), serviceProduct: serviceSummary(mileage), description: 'Kilometrina', quantityRule: { type: 'per_classification_field' as const, value: 1, field: 'kilometrinaKm' } }
        : null,
    ].filter(Boolean),
  };
}
