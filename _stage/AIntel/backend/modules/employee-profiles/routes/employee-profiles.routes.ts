import { Router } from 'express';
import {
  getEmployeeProfiles,
  patchEmployeeProfile,
  postEmployeeProfile,
} from '../controllers/employee-profile.controller';

const router = Router();

router.get('/', getEmployeeProfiles);
router.post('/', postEmployeeProfile);
router.patch('/:id', patchEmployeeProfile);

export default router;
