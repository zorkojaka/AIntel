import { Router } from 'express';
import {
  createRequirementTemplate,
  deleteRequirementTemplate,
  listRequirementTemplates,
  listTemplateVariants,
  updateRequirementTemplate,
} from '../controllers/template.controller';
import {
  listOfferRules,
  createOfferRule,
  updateOfferRule,
  deleteOfferRule,
} from '../controllers/offer-rules.controller';

const router = Router();

router.get('/', listRequirementTemplates);
router.post('/', createRequirementTemplate);
router.put('/:id', updateRequirementTemplate);
router.delete('/:id', deleteRequirementTemplate);

router.get('/variants', listTemplateVariants);
router.get('/offer-rules', listOfferRules);
router.post('/offer-rules', createOfferRule);
router.patch('/offer-rules/:id', updateOfferRule);
router.delete('/offer-rules/:id', deleteOfferRule);

export default router;
