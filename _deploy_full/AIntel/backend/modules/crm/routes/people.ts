import { Router } from 'express';
import {
  createPerson,
  deletePerson,
  getPeople,
  updatePerson
} from '../controllers/peopleController';

const router = Router();

router.get('/', getPeople);
router.post('/', createPerson);
router.put('/:id', updatePerson);
router.delete('/:id', deletePerson);

export default router;
