import { Router } from 'express';

import { me, myEarnings, myProjectEarnings, myProjects, myServiceRates } from '../controllers/profile.controller';

const router = Router();

router.get('/me', me);
router.get('/my-projects', myProjects);
router.get('/my-earnings', myEarnings);
router.get('/my-project-earnings', myProjectEarnings);
router.get('/my-service-rates', myServiceRates);

export default router;
