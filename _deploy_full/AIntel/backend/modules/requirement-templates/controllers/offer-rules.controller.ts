import { Request, Response } from 'express';
import type { OfferGenerationRule } from '../../shared/requirements.types';
import { OfferGenerationRuleModel } from '../schemas/offer-rules';

function sanitizeRule(body: any): Omit<OfferGenerationRule, 'id'> {
  return {
    categorySlug: String(body?.categorySlug ?? '').trim(),
    variantSlug: String(body?.variantSlug ?? '').trim(),
    label: String(body?.label ?? '').trim(),
    targetProductCategorySlug: String(body?.targetProductCategorySlug ?? '').trim(),
    conditionExpression: body?.conditionExpression ? String(body.conditionExpression) : undefined,
    quantityExpression: String(body?.quantityExpression ?? '').trim(),
    productSelectionMode: (body?.productSelectionMode ?? 'auto-first') as OfferGenerationRule['productSelectionMode'],
  };
}

export async function listOfferRules(req: Request, res: Response) {
  try {
    const categorySlug = req.query?.category ? String(req.query.category).trim() : '';
    const variantSlug = req.query?.variant ? String(req.query.variant).trim() : '';
    const query: Record<string, string> = {};
    if (categorySlug) query.categorySlug = categorySlug;
    if (variantSlug) query.variantSlug = variantSlug;
    const rules = await OfferGenerationRuleModel.find(query).lean();
    res.success(
      rules.map((rule) => ({
        ...rule,
        id: rule.id ?? rule._id?.toString(),
      }))
    );
  } catch (error) {
    res.fail('Ne morem pridobiti pravil za ponudbo.');
  }
}

export async function createOfferRule(req: Request, res: Response) {
  try {
    const payload = sanitizeRule(req.body);
    if (!payload.categorySlug || !payload.variantSlug || !payload.label || !payload.targetProductCategorySlug || !payload.quantityExpression) {
      return res.fail('Manjkajo obvezna polja za pravilo.', 400);
    }
    const created = await OfferGenerationRuleModel.create(payload);
    res.success({ ...created.toObject(), id: created.id ?? created._id.toString() }, 201);
  } catch (error) {
    res.fail('Pravila ni bilo mogoče ustvariti.');
  }
}

export async function updateOfferRule(req: Request, res: Response) {
  try {
    const payload = sanitizeRule(req.body);
    const updated = await OfferGenerationRuleModel.findByIdAndUpdate(req.params.id, payload, { new: true });
    if (!updated) {
      return res.fail('Pravilo ni najdeno.', 404);
    }
    res.success({ ...updated.toObject(), id: updated.id ?? updated._id.toString() });
  } catch (error) {
    res.fail('Pravila ni bilo mogoče posodobiti.');
  }
}

export async function deleteOfferRule(req: Request, res: Response) {
  try {
    const deleted = await OfferGenerationRuleModel.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.fail('Pravilo ni najdeno.', 404);
    }
    res.success({ id: deleted.id ?? deleted._id.toString() });
  } catch (error) {
    res.fail('Pravila ni bilo mogoče izbrisati.');
  }
}
