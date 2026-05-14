import { Router } from 'express';

import { me, myEarnings, myProjects, myServiceRates } from '../controllers/profile.controller';

const router = Router();

router.get('/me', me);
router.get('/my-projects', myProjects);
router.get('/my-earnings', myEarnings);
router.get('/my-service-rates', myServiceRates);

export default router;
