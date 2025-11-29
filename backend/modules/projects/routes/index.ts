import { Router } from 'express';
import {
  addItem,
  addItemFromCenik,
  addOffer,
  cancelConfirmation,
  confirmOffer,
  createProject,
  deleteItem,
  getProjectOffer,
  getProject,
  listProjects,
  receiveDelivery,
  saveSignature,
  selectOffer,
  sendOffer,
  updateProjectOffer,
  updateItem,
  deleteProject,
  updateStatus,
  updateProject,
  getOfferCandidates,
} from '../controllers/project.controller';

const router = Router();

router.get('/', listProjects);
router.post('/', createProject);
router.get('/:id', getProject);
router.post('/:id/status', updateStatus);
router.put('/:id', updateProject);
router.delete('/:id', deleteProject);
router.get('/:id/offer-candidates', getOfferCandidates);
router.post('/:id/items', addItem);
router.post('/:id/items/from-cenik', addItemFromCenik);
router.put('/:id/items/:itemId', updateItem);
router.delete('/:id/items/:itemId', deleteItem);
router.post('/:id/offers', addOffer);
router.get('/:projectId/offer', getProjectOffer);
router.put('/:projectId/offer', updateProjectOffer);
router.post('/:id/offers/:offerId/send', sendOffer);
router.post('/:id/offers/:offerId/confirm', confirmOffer);
router.post('/:id/offers/:offerId/cancel', cancelConfirmation);
router.post('/:id/offers/:offerId/select', selectOffer);
router.post('/:id/deliveries/:deliveryId/receive', receiveDelivery);
router.post('/:id/signature', saveSignature);

export default router;
