import { RequirementTemplateGroupModel } from '../../requirement-templates/schemas/template';
import type { ProjectRequirement } from '../schemas/project';
import type { RequirementTemplateRow } from '../../shared/requirements.types';

function toRequirementId(groupId: string, rowId: string) {
  return `${groupId}-${rowId}`;
}

export async function generateRequirementsFromTemplates(
  categories: string[],
  variantSlug?: string
): Promise<ProjectRequirement[]> {
  if (!Array.isArray(categories) || categories.length === 0) {
    return [];
  }

  const query: Record<string, any> = { categorySlug: { $in: categories } };
  if (variantSlug) {
    query.variantSlug = variantSlug;
  }

  const groups = await RequirementTemplateGroupModel.find(query).lean();
  const requirements: ProjectRequirement[] = [];

  groups.forEach((group) => {
    const rows: RequirementTemplateRow[] = Array.isArray(group.rows) ? group.rows : [];
    rows.forEach((row) => {
      requirements.push({
        id: toRequirementId(String(group._id), row.id),
        label: row.label,
        categorySlug: group.categorySlug,
        notes: row.helpText ?? '',
        value: row.defaultValue ?? '',
        templateRowId: row.id,
        fieldType: row.fieldType,
        productCategorySlug: row.productCategorySlug ?? null,
        formulaConfig: row.formulaConfig ?? null,
      });
    });
  });

  return requirements;
}
