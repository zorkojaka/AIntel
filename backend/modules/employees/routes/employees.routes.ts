import { Router } from 'express';
import { getEmployees, patchEmployee, postEmployee, removeEmployee } from '../controllers/employee.controller';

const router = Router();

router.get('/', getEmployees);
router.post('/', postEmployee);
router.patch('/:id', patchEmployee);
router.delete('/:id', removeEmployee);

export default router;
