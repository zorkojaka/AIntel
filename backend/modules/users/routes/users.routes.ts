import { Router } from 'express';
import { getUsers, patchUser, postUser, removeUser } from '../controllers/users.controller';

const router = Router();

router.get('/', getUsers);
router.post('/', postUser);
router.patch('/:id', patchUser);
router.delete('/:id', removeUser);

export default router;
