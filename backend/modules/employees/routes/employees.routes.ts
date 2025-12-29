import { Router } from 'express';
import { getEmployeeUser, getEmployees, patchEmployee, postEmployee, removeEmployee } from '../controllers/employee.controller';

const router = Router();

router.get('/', getEmployees);
router.get('/:id/user', getEmployeeUser);
router.post('/', postEmployee);
router.patch('/:id', patchEmployee);
router.delete('/:id', removeEmployee);

export default router;
