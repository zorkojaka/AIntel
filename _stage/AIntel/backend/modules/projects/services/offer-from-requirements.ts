import { ProductModel } from '../../cenik/product.model';
import { OfferGenerationRuleModel } from '../../requirement-templates/schemas/offer-rules';
import type { ProjectDocument, ProjectRequirement } from '../schemas/project';
import type { OfferGenerationRule } from '../../shared/requirements.types';

export interface OfferCandidate {
  ruleId: string;
  productCategorySlug: string;
  suggestedProductId?: string;
  suggestedName: string;
  quantity: number;
}

type ValuesMap = Record<string, number | boolean | string | null>;

function parseRequirementValue(req: ProjectRequirement): number | boolean | string | null {
  if (req.fieldType === 'boolean') {
    const normalized = (req.value ?? '').toString().trim().toLowerCase();
    if (normalized === 'true' || normalized === 'da' || normalized === 'yes' || normalized === '1') return true;
    if (normalized === 'false' || normalized === 'ne' || normalized === '0') return false;
  }
  const num = Number(req.value);
  if (!Number.isNaN(num)) return num;
  if (typeof req.value === 'string') return req.value.trim();
  return null;
}

function buildValues(requirements: ProjectRequirement[]): ValuesMap {
  const values: ValuesMap = {};
  requirements.forEach((req) => {
    const key = req.templateRowId || req.label || req.id;
    values[key] = parseRequirementValue(req);
  });
  return values;
}

function safeEvalExpression(expression: string, values: ValuesMap): any {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('values', 'Math', `"use strict"; return (${expression});`);
    return fn(values, Math);
  } catch {
    return null;
  }
}

async function pickProductByCategory(slug: string) {
  if (!slug) return null;
  const product = await ProductModel.findOne({ categorySlugs: slug }).lean();
  return product;
}

export async function getOfferCandidatesFromRequirements(project: ProjectDocument): Promise<OfferCandidate[]> {
  const requirements = project.requirements ?? [];
  if (!requirements.length) return [];
  const categories = project.categories ?? [];
  const variantSlug = project.requirementsTemplateVariantSlug ?? '';

  const values = buildValues(requirements);

  const ruleQuery: Record<string, any> = {};
  if (categories.length) {
    ruleQuery.categorySlug = { $in: categories };
  }
  if (variantSlug) {
    ruleQuery.variantSlug = variantSlug;
  }

  const rules = await OfferGenerationRuleModel.find(ruleQuery).lean();

  const candidates: OfferCandidate[] = [];
  for (const rule of rules as OfferGenerationRule[]) {
    const conditionOk = rule.conditionExpression
      ? Boolean(safeEvalExpression(rule.conditionExpression, values))
      : true;
    if (!conditionOk) continue;
    const quantityRaw = safeEvalExpression(rule.quantityExpression, values);
    const quantity = Number(quantityRaw);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const product = await pickProductByCategory(rule.targetProductCategorySlug);
    const suggestedName = product?.ime ?? rule.label;

    candidates.push({
      ruleId: rule.id ?? (rule as any)._id?.toString(),
      productCategorySlug: rule.targetProductCategorySlug,
      suggestedProductId: product?._id?.toString(),
      suggestedName,
      quantity: Number(quantity.toFixed(2)),
    });
  }

  return candidates;
}
