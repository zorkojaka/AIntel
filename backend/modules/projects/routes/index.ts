import { Router } from 'express';
import {
  addItem,
  addItemFromCenik,
  createProject,
  deleteItem,
  getProject,
  listProjects,
  receiveDelivery,
  saveSignature,
  updateItem,
  deleteProject,
  updateStatus,
  updateProject,
  getOfferCandidates,
} from '../controllers/project.controller';
import {
  exportOfferPdf,
  saveOfferVersion,
  sendOfferVersionStub,
  getActiveOffer,
  listOffersForProject,
  getOfferById,
  updateOfferVersion,
  deleteOfferVersion,
} from '../controllers/offer-version.controller';
import * as logisticsController from '../controllers/logistics.controller';
import { cancelOfferConfirmation } from '../controllers/logistics.controller';

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
router.post('/:projectId/offers', saveOfferVersion);
router.get('/:projectId/offers', listOffersForProject);
router.get('/:projectId/offers/:offerId', getOfferById);
router.put('/:projectId/offers/:offerId', updateOfferVersion);
router.delete('/:projectId/offers/:offerId', deleteOfferVersion);
router.get('/:projectId/offers/:offerVersionId/pdf', exportOfferPdf);
router.post('/:projectId/offers/:offerVersionId/send', sendOfferVersionStub);
router.get('/:projectId/offer', getActiveOffer);
router.post('/:projectId/offers/:offerId/confirm', logisticsController.confirmOffer);
router.post('/:projectId/logistics/cancel-confirmation', cancelOfferConfirmation);
router.get('/:projectId/logistics', logisticsController.getProjectLogistics);
router.put('/:projectId/work-orders/:workOrderId', logisticsController.updateWorkOrder);
router.post('/:id/deliveries/:deliveryId/receive', receiveDelivery);
router.post('/:id/signature', saveSignature);

export default router;
