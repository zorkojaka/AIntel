import { Request, Response, NextFunction } from 'express';
import { resolveActorId, resolveTenantId } from '../../utils/tenant';
import {
  getExecutionRuleSettings,
  saveExecutionRuleSettings,
  suggestExecutionRulesFromPriceList,
} from './execution-rules.service';

export async function getExecutionRules(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = resolveTenantId(req) ?? 'inteligent';
    const settings = await getExecutionRuleSettings(tenantId);
    return res.success(settings);
  } catch (error) {
    next(error);
  }
}

export async function putExecutionRules(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = resolveTenantId(req) ?? 'inteligent';
    const actorId = resolveActorId(req);
    const settings = await saveExecutionRuleSettings(tenantId, actorId, req.body ?? {});
    return res.success(settings);
  } catch (error) {
    next(error);
  }
}

export async function postExecutionRuleSuggestions(_req: Request, res: Response, next: NextFunction) {
  try {
    const suggestions = await suggestExecutionRulesFromPriceList();
    return res.success(suggestions);
  } catch (error) {
    next(error);
  }
}
