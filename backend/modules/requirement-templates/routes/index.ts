import { Router } from 'express';
import {
  createRequirementTemplate,
  deleteRequirementTemplate,
  listRequirementTemplates,
  updateRequirementTemplate,
} from '../controllers/template.controller';

const router = Router();

router.get('/', listRequirementTemplates);
router.post('/', createRequirementTemplate);
router.put('/:id', updateRequirementTemplate);
router.delete('/:id', deleteRequirementTemplate);

export default router;
