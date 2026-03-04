import { Router } from 'express';
import {
  createClient,
  deleteClient,
  getClient,
  getClients,
  updateClient
} from '../controllers/clientController';

const router = Router();

router.get('/', getClients);
router.post('/', createClient);
router.get('/:id', getClient);
router.put('/:id', updateClient);
router.delete('/:id', deleteClient);

export default router;
