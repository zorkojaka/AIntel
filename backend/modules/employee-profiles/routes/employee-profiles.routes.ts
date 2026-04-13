import { Router } from 'express';
import {
  copyEmployeeServiceRatesFrom,
  getEmployeeProfiles,
  getEmployeeServiceRates,
  patchEmployeeProfile,
  postEmployeeProfile,
  postEmployeeServiceRates,
} from '../controllers/employee-profile.controller';

const router = Router();

router.get('/', getEmployeeProfiles);
router.post('/', postEmployeeProfile);
router.patch('/:id', patchEmployeeProfile);

router.get('/:employeeId/service-rates', getEmployeeServiceRates);
router.post('/:employeeId/service-rates', postEmployeeServiceRates);
router.post('/:employeeId/service-rates/copy-from/:sourceEmployeeId', copyEmployeeServiceRatesFrom);

export default router;
