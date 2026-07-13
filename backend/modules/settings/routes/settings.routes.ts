import { Router } from 'express';
import { getSettingsController, updateSettingsController } from '../controllers/settings.controller';
import { requireRoles } from '../../../middlewares/auth';
import { ROLE_ADMIN } from '../../../utils/roles';

const router = Router();

router.get('/', getSettingsController);
router.put('/', requireRoles([ROLE_ADMIN]), updateSettingsController);

export default router;
