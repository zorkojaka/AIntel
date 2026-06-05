import { Request, Response } from 'express';

import type { CategorySettingsPriority } from '../category-settings.model';
import {
  bulkUpdateCategorySettings,
  listCategorySettings,
  refreshCategoryStatsFromDatabase,
  updateCategorySettingById,
} from '../services/category-settings.service';

function parsePriority(value: unknown) {
  if (value === null || value === undefined) return value;
  const parsed = Number(value);
  if (parsed === 1 || parsed === 2 || parsed === 3) return parsed;
  return value;
}

function parseOptionalPriority(value: unknown): CategorySettingsPriority | undefined | unknown {
  return parsePriority(value);
}

function parseMarginPercent(value: unknown) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function getCategorySettings(_req: Request, res: Response) {
  try {
    return res.success(await listCategorySettings());
  } catch (error) {
    console.error('Fetch category settings failed:', error);
    return res.fail('Nastavitev kategorij ni mogoce pridobiti.', 500);
  }
}

export async function updateCategorySetting(req: Request, res: Response) {
  try {
    const updated = await updateCategorySettingById(req.params.id, {
      isActive: req.body?.isActive,
      priority: parseOptionalPriority(req.body?.priority) as CategorySettingsPriority | undefined,
      marginPercent: parseMarginPercent(req.body?.marginPercent),
      notes: req.body?.notes,
    });

    if (!updated) {
      return res.fail('Nastavitev kategorije ne obstaja.', 404);
    }

    return res.success(updated);
  } catch (error) {
    return res.fail(error instanceof Error ? error.message : 'Nastavitve kategorije ni mogoce posodobiti.', 400);
  }
}

export async function bulkUpdateCategorySettingsController(req: Request, res: Response) {
  try {
    if (!Array.isArray(req.body?.updates)) {
      return res.fail('Manjka seznam posodobitev.', 400);
    }

    const updates = req.body.updates.map((update: Record<string, unknown>) => ({
      path: update.path,
      isActive: update.isActive,
      priority: parsePriority(update.priority),
      marginPercent: parseMarginPercent(update.marginPercent),
      notes: update.notes,
    }));

    return res.success(await bulkUpdateCategorySettings(updates));
  } catch (error) {
    return res.fail(error instanceof Error ? error.message : 'Nastavitev kategorij ni mogoce posodobiti.', 400);
  }
}

export async function refreshCategoryStats(req: Request, res: Response) {
  try {
    return res.success(await refreshCategoryStatsFromDatabase());
  } catch (error) {
    console.error('Refresh category stats failed:', error);
    return res.fail('Statistik kategorij ni mogoce osveziti.', 500);
  }
}
