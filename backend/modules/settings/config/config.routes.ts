// AIN-P2-11: config store routi. Branje je dovoljeno prijavljenim (odvisni moduli),
// pisanje samo ADMIN (guard je na mountu v routes.ts + tu eksplicitno za pisanje).
import { Router } from 'express';

import { requireRoles } from '../../../middlewares/auth';
import { ROLE_ADMIN } from '../../../utils/roles';
import { getAllConfig, getOneConfig, putOneConfig, patchOneConfig } from './config.controller';
import { registerCoreConfigNamespaces } from './config-namespaces';

registerCoreConfigNamespaces();

const router = Router();

router.get('/', getAllConfig);
router.get('/:namespace', getOneConfig);
router.put('/:namespace', requireRoles([ROLE_ADMIN]), putOneConfig);
router.patch('/:namespace', requireRoles([ROLE_ADMIN]), patchOneConfig);

export default router;
