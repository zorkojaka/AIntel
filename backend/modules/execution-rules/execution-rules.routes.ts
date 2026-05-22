import { Router } from 'express';
import { requireRoles } from '../../middlewares/auth';
import { ROLE_ADMIN, ROLE_SALES } from '../../utils/roles';
import {
  getExecutionRules,
  postExecutionRuleSuggestions,
  putExecutionRules,
} from './execution-rules.controller';

const router = Router();
const requireExecutionRuleWrite = requireRoles([ROLE_ADMIN, ROLE_SALES]);

router.get('/', getExecutionRules);
router.put('/', requireExecutionRuleWrite, putExecutionRules);
router.post('/suggestions', requireExecutionRuleWrite, postExecutionRuleSuggestions);

export default router;
