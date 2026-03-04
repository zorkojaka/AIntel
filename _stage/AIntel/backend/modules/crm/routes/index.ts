import { Router } from 'express';
import peopleRoutes from './people';
import companiesRoutes from './companies';
import notesRoutes from './notes';
import clientsRoutes from './clients';

const router = Router();

router.use('/people', peopleRoutes);
router.use('/companies', companiesRoutes);
router.use('/notes', notesRoutes);
router.use('/clients', clientsRoutes);

export default router;
