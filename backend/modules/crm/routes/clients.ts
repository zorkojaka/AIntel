import { Router } from 'express';
import {
  createClient,
  deleteClient,
  getClient,
  getClients,
  updateClient
} from '../controllers/clientController';
import { getClientNotes, postClientNote } from '../controllers/clientNotesController';

const router = Router();

router.get('/', getClients);
router.post('/', createClient);
// Interni zapisi o stranki (dosje) — pred /:id, da se poti ne prekrivata.
router.get('/:clientId/notes', getClientNotes);
router.post('/:clientId/notes', postClientNote);
router.get('/:id', getClient);
router.put('/:id', updateClient);
router.delete('/:id', deleteClient);

export default router;
