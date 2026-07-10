// AIN-P2-08: service module routi (v1: ServiceTicket). Mount + role guard v routes.ts.
import { Router } from 'express';

import {
  getServiceTickets,
  getOneServiceTicket,
  postServiceTicket,
  patchServiceTicket,
} from './service-ticket.controller';

const router = Router();

router.get('/tickets', getServiceTickets);
router.get('/tickets/:id', getOneServiceTicket);
router.post('/tickets', postServiceTicket);
router.patch('/tickets/:id', patchServiceTicket);

export default router;
