import crypto from 'crypto';
import ExcelJS from 'exceljs';
import { Request, Response } from 'express';

import { CategoryModel } from '../../categories/schema';
import { ProductImportRunModel } from '../import-run.model';
import { ProductModel } from '../product.model';
import {
  analyzeProductImportFromItems,
  applyProductImportFromItems,
} from '../services/product-sync.service';

const EXCEL_SOURCE = 'excel';

const PRODUCT_COLUMNS = [
  'externalSource',
  'externalId',
  'externalKey',
  'ime',
  'kategorija',
  'categorySlugs',
  'nabavnaCena',
  'prodajnaCena',
  'purchasePriceWithoutVat',
  'kratekOpis',
  'dolgOpis',
  'povezavaDoSlike',
  'povezavaDoProdukta',
  'proizvajalec',
  'dobavitelj',
  'naslovDobavitelja',
  'casovnaNorma',
  'isService',
] as const;

const SERVICE_EXTRA_COLUMNS = ['defaultExecutionMode', 'defaultInstructionsTemplate'] as const;
const SERVICE_COLUMNS = [...PRODUCT_COLUMNS, ...SERVICE_EXTRA_COLUMNS] as const;
const CATEGORY_COLUMNS = ['name', 'slug', 'color', 'order'] as const;

type ExcelImportMode = 'analyze' | 'apply';

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function getTriggeredBy(req: Request) {
  const user = (req as any)?.user;
  if (!user) return 'system';
  return (
    user.email ||
    user.username ||
    user.userId ||
    user.id ||
    (user._id ? String(user._id) : '') ||
    'system'
  );
}

function buildWarnings(summary: {
  conflictCount: number;
  invalidCount: number;
  toCreateCount: number;
  toUpdateCount: number;
  toSkipCount: number;
}) {
  const warnings: string[] = [];
  if (summary.conflictCount > 0) {
    warnings.push(`${summary.conflictCount} unresolved conflict(s) excluded from auto-apply.`);
  }
  if (summary.invalidCount > 0) {
    warnings.push(`${summary.invalidCount} invalid row(s) skipped from import.`);
  }
  if (
    summary.toCreateCount === 0 &&
    summary.toUpdateCount === 0 &&
    summary.toSkipCount === 0 &&
    (summary.conflictCount > 0 || summary.invalidCount > 0)
  ) {
    warnings.push('No rows were actionable in this run.');
  }
  return warnings;
}

function determineRunStatus(summary: { conflictCount: number; invalidCount: number }) {
  return summary.conflictCount === 0 && summary.invalidCount === 0 ? 'success' : 'partial';
}

function formatRunResponse(run: any) {
  return {
    id: String(run._id),
    source: run.source,
    mode: run.mode,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    triggeredBy: run.triggeredBy || '',
    status: run.status,
    totalSourceRows: run.totalSourceRows ?? 0,
    matchedRows: run.matchedRows ?? 0,
    toCreateCount: run.toCreateCount ?? 0,
    toUpdateCount: run.toUpdateCount ?? 0,
    toSkipCount: run.toSkipCount ?? 0,
    conflictCount: run.conflictCount ?? 0,
    invalidCount: run.invalidCount ?? 0,
    createdCount: run.createdCount ?? 0,
    updatedCount: run.updatedCount ?? 0,
    skippedCount: run.skippedCount ?? 0,
    unresolvedConflictCount: run.unresolvedConflictCount ?? 0,
    sourceFingerprint: run.sourceFingerprint || '',
    warnings: Array.isArray(run.warnings) ? run.warnings : [],
    errorSummary: run.errorSummary || '',
  };
}

function addHeaderStyle(worksheet: ExcelJS.Worksheet) {
  const header = worksheet.getRow(1);
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' },
    };
  });
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function addProductSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  products: any[],
  columns: readonly string[],
) {
  const worksheet = workbook.addWorksheet(name);
  worksheet.columns = columns.map((column) => ({
    header: column,
    key: column,
    width: column === 'dolgOpis' || column === 'defaultInstructionsTemplate' ? 48 : 22,
  }));

  products.forEach((product) => {
    worksheet.addRow({
      ...product,
      categorySlugs: Array.isArray(product.categorySlugs) ? product.categorySlugs.join(';') : '',
      purchasePriceWithoutVat: product.purchasePriceWithoutVat ?? product.nabavnaCena ?? 0,
      isService: Boolean(product.isService),
    });
  });

  addHeaderStyle(worksheet);
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
}

function cellValueToString(value: ExcelJS.CellValue) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? '').join('');
    }
    if ('result' in value) return cellValueToString(value.result as ExcelJS.CellValue);
    if ('hyperlink' in value && 'text' in value && typeof value.text === 'string') return value.text;
  }
  return String(value);
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function mapHeader(value: string) {
  const normalized = normalizeHeader(value);
  const map: Record<string, string> = {
    externalid: 'externalId',
    externalsource: 'externalSource',
    externalkey: 'externalKey',
    ime: 'ime',
    kategorija: 'kategorija',
    categoryslugs: 'categorySlugs',
    nabavnacena: 'nabavnaCena',
    prodajnacena: 'prodajnaCena',
    purchasepricewithoutvat: 'purchasePriceWithoutVat',
    kratekopis: 'kratekOpis',
    dolgopis: 'dolgOpis',
    povezavadoslike: 'povezavaDoSlike',
    povezavadoprodukta: 'povezavaDoProdukta',
    proizvajalec: 'proizvajalec',
    dobavitelj: 'dobavitelj',
    naslovdobavitelja: 'naslovDobavitelja',
    casovnanorma: 'casovnaNorma',
    isservice: 'isService',
    defaultexecutionmode: 'defaultExecutionMode',
    defaultinstructionstemplate: 'defaultInstructionsTemplate',
  };
  return map[normalized] ?? '';
}

function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'da' || normalized === 'yes';
}

function parseNumber(value: string) {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function splitCategorySlugs(value: string) {
  return value
    .split(/[;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function rowHasAnyValue(row: Record<string, string>) {
  return Object.values(row).some((value) => value.trim() !== '');
}

function parseProductWorksheet(worksheet: ExcelJS.Worksheet, expectedIsService: boolean) {
  const headerRow = worksheet.getRow(1);
  const headers = headerRow.values as ExcelJS.CellValue[];
  const mappedHeaders = headers.map((value) => mapHeader(cellValueToString(value)));
  const items: Record<string, unknown>[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const rawRow: Record<string, string> = {};
    mappedHeaders.forEach((field, index) => {
      if (!field) return;
      rawRow[field] = cellValueToString(row.getCell(index).value).trim();
    });

    if (!rowHasAnyValue(rawRow)) return;

    const item: Record<string, unknown> = {
      isService: expectedIsService,
    };
    const providedFields = new Set<string>(['isService']);

    for (const [field, value] of Object.entries(rawRow)) {
      if (value === '') continue;

      if (field === 'categorySlugs') {
        item.categorySlugs = splitCategorySlugs(value);
      } else if (field === 'nabavnaCena' || field === 'prodajnaCena' || field === 'purchasePriceWithoutVat') {
        const parsed = parseNumber(value);
        if (parsed !== undefined) item[field] = parsed;
      } else if (field === 'isService') {
        item.isService = parseBoolean(value);
      } else {
        item[field] = value;
      }
      providedFields.add(field);
    }

    if (!item.externalSource && typeof item.externalKey === 'string' && item.externalKey.includes(':')) {
      item.externalSource = item.externalKey.split(':')[0];
      providedFields.add('externalSource');
    }
    if (!item.externalId && typeof item.externalKey === 'string' && item.externalKey.includes(':')) {
      item.externalId = item.externalKey.slice(item.externalKey.indexOf(':') + 1);
      providedFields.add('externalId');
    }

    item.__providedFields = Array.from(providedFields);
    items.push(item);
  });

  return items;
}

async function parseExcelItems(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const productsSheet = workbook.getWorksheet('Produkti');
  const servicesSheet = workbook.getWorksheet('Storitve');
  const items: Record<string, unknown>[] = [];

  if (productsSheet) {
    items.push(...parseProductWorksheet(productsSheet, false));
  }
  if (servicesSheet) {
    items.push(...parseProductWorksheet(servicesSheet, true));
  }

  if (!productsSheet && !servicesSheet) {
    throw new Error('Excel datoteka mora vsebovati list "Produkti" ali "Storitve".');
  }

  return items;
}

export async function exportCenikExcel(_req: Request, res: Response) {
  try {
    const [products, services, categories] = await Promise.all([
      ProductModel.find({ isService: { $ne: true }, isActive: { $ne: false } })
        .sort({ ime: 1 })
        .lean(),
      ProductModel.find({ isService: true, isActive: { $ne: false } }).sort({ ime: 1 }).lean(),
      CategoryModel.find().sort({ order: 1, name: 1 }).lean(),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AIntel';
    workbook.created = new Date();

    addProductSheet(workbook, 'Produkti', products, PRODUCT_COLUMNS);
    addProductSheet(workbook, 'Storitve', services, SERVICE_COLUMNS);

    const categoriesSheet = workbook.addWorksheet('Kategorije');
    categoriesSheet.columns = CATEGORY_COLUMNS.map((column) => ({
      header: column,
      key: column,
      width: 24,
    }));
    categories.forEach((category) => {
      categoriesSheet.addRow({
        name: category.name,
        slug: category.slug,
        color: category.color ?? '',
        order: category.order ?? 0,
      });
    });
    addHeaderStyle(categoriesSheet);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const fileName = `cenik-${formatDate(new Date())}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(buffer.length));
    return res.send(buffer);
  } catch (error) {
    console.error('Cenik Excel export failed:', error);
    return res.fail('Izvoz cenika v Excel ni uspel.', 500);
  }
}

async function importCenikExcel(req: Request, res: Response, mode: ExcelImportMode) {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file?.buffer) {
    return res.fail('Excel datoteka je obvezna.', 400);
  }

  const startedAt = new Date();
  const triggeredBy = getTriggeredBy(req);
  const sourceFingerprint = crypto.createHash('sha1').update(file.buffer).digest('hex');
  const run = await ProductImportRunModel.create({
    source: EXCEL_SOURCE,
    mode,
    startedAt,
    triggeredBy,
    status: 'failed',
    warnings: [],
    sourceFingerprint,
  });

  try {
    const items = await parseExcelItems(file.buffer);
    const result =
      mode === 'apply'
        ? await applyProductImportFromItems({ source: EXCEL_SOURCE, items })
        : await analyzeProductImportFromItems({ source: EXCEL_SOURCE, items });
    const summary = result.summary;
    const warnings = buildWarnings(summary);
    const status = determineRunStatus(summary);

    const update: Record<string, unknown> = {
      finishedAt: new Date(),
      status,
      totalSourceRows: summary.totalSourceRows,
      matchedRows: summary.matchedRows,
      toCreateCount: summary.toCreateCount,
      toUpdateCount: summary.toUpdateCount,
      toSkipCount: summary.toSkipCount,
      conflictCount: summary.conflictCount,
      invalidCount: summary.invalidCount,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: summary.toSkipCount,
      unresolvedConflictCount: summary.conflictCount,
      sourceFingerprint,
      warnings,
      errorSummary: '',
    };

    if ('applied' in result && result.applied && typeof result.applied === 'object') {
      const applied = result.applied as {
        createdCount?: number;
        updatedCount?: number;
        skippedCount?: number;
        excludedConflictCount?: number;
      };
      update.createdCount = Number(applied.createdCount ?? 0);
      update.updatedCount = Number(applied.updatedCount ?? 0);
      update.skippedCount = Number(applied.skippedCount ?? 0);
      update.unresolvedConflictCount = Number(applied.excludedConflictCount ?? 0);
    }

    const savedRun = await ProductImportRunModel.findByIdAndUpdate(run._id, update, {
      new: true,
    }).lean();

    return res.success({ mode, source: EXCEL_SOURCE, run: savedRun ? formatRunResponse(savedRun) : null, ...result });
  } catch (error) {
    console.error('Cenik Excel import failed:', error);
    await ProductImportRunModel.findByIdAndUpdate(run._id, {
      finishedAt: new Date(),
      status: 'failed',
      errorSummary: error instanceof Error ? error.message : 'Excel import failed.',
      warnings: ['Excel import failed before completion.'],
    }).catch(() => undefined);
    return res.fail(error instanceof Error ? error.message : 'Uvoz cenika iz Excela ni uspel.', 400);
  }
}

export async function analyzeCenikExcelImport(req: Request, res: Response) {
  return importCenikExcel(req, res, 'analyze');
}

export async function applyCenikExcelImport(req: Request, res: Response) {
  return importCenikExcel(req, res, 'apply');
}
