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
  label: string;
  rows: RequirementTemplateRow[];
}
