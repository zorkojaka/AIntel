import { Request, Response } from 'express';
import type {
  RequirementFieldType,
  RequirementFormulaConfig,
  RequirementTemplateGroup,
  RequirementTemplateRow,
} from '../../shared/requirements.types';
import { RequirementTemplateGroupDocument, RequirementTemplateGroupModel } from '../schemas/template';

const allowedFieldTypes: RequirementFieldType[] = ['number', 'text', 'select', 'boolean'];

function sanitizeFormulaConfig(input: any): RequirementFormulaConfig | null {
  if (!input || typeof input !== 'object') return null;
  const baseFieldId = String(input.baseFieldId ?? '').trim();
  if (!baseFieldId) return null;
  const multiplyByRaw = input.multiplyBy;
  const multiplyBy =
    multiplyByRaw === undefined || Number.isNaN(Number(multiplyByRaw)) ? undefined : Number(multiplyByRaw);
  const notesValue = input.notes;
  const notes = notesValue ? String(notesValue) : undefined;
  return {
    baseFieldId,
    multiplyBy,
    notes,
  };
}

function sanitizeRow(input: any): RequirementTemplateRow {
  const rawLabel = String(input?.label ?? '').trim();
  const fieldType = allowedFieldTypes.includes(input?.fieldType) ? input.fieldType : 'text';
  const options = Array.isArray(input?.options)
    ? input.options.map((opt: any) => String(opt ?? '').trim()).filter(Boolean)
    : undefined;
  const defaultValue = input?.defaultValue !== undefined ? String(input.defaultValue) : undefined;
  const helpText = input?.helpText !== undefined ? String(input.helpText) : undefined;
  const productCategorySlug =
    input?.productCategorySlug === null
      ? null
      : input?.productCategorySlug !== undefined
        ? String(input.productCategorySlug).trim()
        : undefined;

  return {
    id: String(input?.id ?? `rtrow-${Date.now()}`),
    label: rawLabel,
    fieldType,
    options,
    defaultValue,
    helpText,
    productCategorySlug,
    formulaConfig: sanitizeFormulaConfig(input?.formulaConfig),
  };
}

function mapGroup(doc: RequirementTemplateGroupDocument): RequirementTemplateGroup {
  return {
    id: doc.id ?? doc._id.toString(),
    categorySlug: doc.categorySlug,
    label: doc.label,
    rows: (doc.rows ?? []).map((row: RequirementTemplateRow) => ({
      ...row,
      formulaConfig: row.formulaConfig ?? null,
      productCategorySlug: row.productCategorySlug ?? null,
    })),
  };
}

export async function listRequirementTemplates(req: Request, res: Response) {
  try {
    const categorySlug = req.query?.categorySlug ? String(req.query.categorySlug).trim() : '';
    const query = categorySlug ? { categorySlug } : {};
    const groups = await RequirementTemplateGroupModel.find(query).sort({ categorySlug: 1, label: 1 }).lean();
    res.success(groups.map((group) => mapGroup(group as RequirementTemplateGroupDocument)));
  } catch (error) {
    res.fail('Ne morem pridobiti template-ov zahtev.');
  }
}

export async function createRequirementTemplate(req: Request, res: Response) {
  try {
    const label = String(req.body?.label ?? '').trim();
    const categorySlug = String(req.body?.categorySlug ?? '').trim();
    if (!label || !categorySlug) {
      return res.fail('Manjka naziv ali kategorija template-a.', 400);
    }
    const rowsInput = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const rows = rowsInput
      .map(sanitizeRow)
      .filter((row: RequirementTemplateRow) => !!row.label);

    const created = await RequirementTemplateGroupModel.create({
      label,
      categorySlug,
      rows,
    });

    res.success(mapGroup(created), 201);
  } catch (error) {
    res.fail('Template skupine ni bilo mogo�?e ustvariti.');
  }
}

export async function updateRequirementTemplate(req: Request, res: Response) {
  try {
    const label = String(req.body?.label ?? '').trim();
    const categorySlug = String(req.body?.categorySlug ?? '').trim();
    if (!label || !categorySlug) {
      return res.fail('Manjka naziv ali kategorija template-a.', 400);
    }
    const rowsInput = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const rows = rowsInput
      .map(sanitizeRow)
      .filter((row: RequirementTemplateRow) => !!row.label);

    const updated = await RequirementTemplateGroupModel.findByIdAndUpdate(
      req.params.id,
      { label, categorySlug, rows },
      { new: true }
    );

    if (!updated) {
      return res.fail('Template skupina ni najdena.', 404);
    }

    res.success(mapGroup(updated));
  } catch (error) {
    res.fail('Template skupine ni bilo mogo�?e posodobiti.');
  }
}

export async function deleteRequirementTemplate(req: Request, res: Response) {
  try {
    const deleted = await RequirementTemplateGroupModel.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.fail('Template skupina ni najdena.', 404);
    }
    res.success({ id: deleted.id ?? deleted._id.toString() });
  } catch (error) {
    res.fail('Template skupine ni bilo mogo�?e izbrisati.');
  }
}
