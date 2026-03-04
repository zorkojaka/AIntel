import { Router } from 'express';
import { getSettingsController, updateSettingsController } from '../controllers/settings.controller';

const router = Router();

router.get('/', getSettingsController);
router.put('/', updateSettingsController);

export default router;
