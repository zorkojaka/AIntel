// AIN-P2-08: service module routi (ServiceTicket + MaintenancePlan). Mount +
// role guard v routes.ts.
import { Router } from 'express';

import {
  getServiceTickets,
  getOneServiceTicket,
  postServiceTicket,
  patchServiceTicket,
} from './service-ticket.controller';
import {
  getMaintenancePlans,
  getOneMaintenancePlan,
  postMaintenancePlan,
  postMaintenancePlanFromProject,
  patchMaintenancePlan,
  runDueMaintenance,
} from './maintenance-plan.controller';

const router = Router();

// Servisni zahtevki (rez 1)
router.get('/tickets', getServiceTickets);
router.get('/tickets/:id', getOneServiceTicket);
router.post('/tickets', postServiceTicket);
router.patch('/tickets/:id', patchServiceTicket);

// Načrti vzdrževanja (rez 2)
router.get('/maintenance-plans', getMaintenancePlans);
router.get('/maintenance-plans/:id', getOneMaintenancePlan);
router.post('/maintenance-plans', postMaintenancePlan);
router.post('/maintenance-plans/from-project', postMaintenancePlanFromProject);
router.post('/maintenance-plans/run-due', runDueMaintenance);
router.patch('/maintenance-plans/:id', patchMaintenancePlan);

export default router;
