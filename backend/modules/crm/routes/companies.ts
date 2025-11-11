import { Router } from 'express';
import {
  createCompany,
  getCompanies,
  getCompanyDetails
} from '../controllers/companyController';

const router = Router();

router.get('/', getCompanies);
router.post('/', createCompany);
router.get('/:id', getCompanyDetails);

export default router;
