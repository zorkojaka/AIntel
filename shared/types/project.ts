export type RequirementFieldType = 'number' | 'text' | 'select' | 'boolean';

export interface RequirementFormulaConfig {
  baseFieldId: string;
  multiplyBy?: number;
  notes?: string;
}

export interface RequirementTemplateRow {
  id: string;
  label: string;
  fieldType: RequirementFieldType;
  options?: string[];
  defaultValue?: string;
  helpText?: string;
  productCategorySlug?: string | null;
  formulaConfig?: RequirementFormulaConfig | null;
}

export interface RequirementTemplateGroup {
  id: string;
  categorySlug: string;
  variantSlug: string;
  label: string;
  rows: RequirementTemplateRow[];
}

export interface RequirementTemplateVariant {
  variantSlug: string;
  label: string;
}

export interface OfferGenerationRule {
  id: string;
  categorySlug: string;
  variantSlug: string;
  label: string;
  targetProductCategorySlug: string;
  conditionExpression?: string;
  quantityExpression: string;
  productSelectionMode: 'auto-first' | 'manual';
}

export interface ProjectRequirement {
  id: string;
  label: string;
  categorySlug: string;
  notes?: string;
  value?: string;
  templateRowId?: string;
  fieldType?: RequirementFieldType;
  productCategorySlug?: string | null;
  formulaConfig?: RequirementFormulaConfig | null;
}

export interface Project {
  id: string;
  name: string;
  categories: string[];
  requirements?: ProjectRequirement[];
}
