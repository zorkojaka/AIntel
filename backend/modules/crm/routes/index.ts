import { Router } from 'express';
import peopleRoutes from './people';
import companiesRoutes from './companies';
import notesRoutes from './notes';

const router = Router();

router.use('/people', peopleRoutes);
router.use('/companies', companiesRoutes);
router.use('/notes', notesRoutes);

export default router;
