import { Router } from 'express';
import { getUsers, patchUser, postUser, removeUser } from '../controllers/users.controller';

const router = Router();

// Legacy endpoints: employees are the source of truth for access roles.
router.get('/', getUsers);
router.post('/', postUser);
router.patch('/:id', patchUser);
router.delete('/:id', removeUser);

export default router;
