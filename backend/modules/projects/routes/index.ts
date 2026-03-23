import { Router } from 'express';
import { requireRoles } from '../../../middlewares/auth';
import { ROLE_ADMIN, ROLE_FINANCE, ROLE_SALES } from '../../../utils/roles';
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
  updateProjectAssignments,
} from '../controllers/project.controller';
import {
  applyOfferTemplate,
  deleteOfferTemplate,
  exportOfferPdf,
  renameOfferTemplate,
  saveOfferVersion,
  saveOfferTemplate,
  sendOfferVersionStub,
  getActiveOffer,
  listOfferTemplates,
  listOffersForProject,
  getOfferById,
  updateOfferVersion,
  deleteOfferVersion,
} from '../controllers/offer-version.controller';
import * as logisticsController from '../controllers/logistics.controller';
import { cancelOfferConfirmation } from '../controllers/logistics.controller';
import * as invoiceController from '../controllers/invoice.controller';

const router = Router();
const requireProjectWrite = requireRoles([ROLE_ADMIN, ROLE_SALES, ROLE_FINANCE]);

router.get('/', listProjects);
router.get('/offer-templates', listOfferTemplates);
router.post('/', requireProjectWrite, createProject);
router.get('/:id', getProject);
router.patch('/:id/assignments', requireProjectWrite, updateProjectAssignments);
router.post('/:id/status', requireProjectWrite, updateStatus);
router.put('/:id', requireProjectWrite, updateProject);
router.delete('/:id', requireProjectWrite, deleteProject);
router.get('/:id/offer-candidates', getOfferCandidates);
router.post('/:id/items', requireProjectWrite, addItem);
router.post('/:id/items/from-cenik', requireProjectWrite, addItemFromCenik);
router.put('/:id/items/:itemId', requireProjectWrite, updateItem);
router.delete('/:id/items/:itemId', requireProjectWrite, deleteItem);
router.post('/:projectId/offers', requireProjectWrite, saveOfferVersion);
router.get('/:projectId/offers', listOffersForProject);
router.post('/:projectId/offer-templates', requireProjectWrite, saveOfferTemplate);
router.post('/:projectId/offer-templates/:templateId/apply', requireProjectWrite, applyOfferTemplate);
router.put('/:projectId/offer-templates/:templateId', requireProjectWrite, renameOfferTemplate);
router.delete('/:projectId/offer-templates/:templateId', requireProjectWrite, deleteOfferTemplate);
router.get('/:projectId/offers/:offerId', getOfferById);
router.put('/:projectId/offers/:offerId', requireProjectWrite, updateOfferVersion);
router.delete('/:projectId/offers/:offerId', requireProjectWrite, deleteOfferVersion);
router.get('/:projectId/offers/:offerVersionId/pdf', exportOfferPdf);
router.post('/:projectId/offers/:offerVersionId/send', requireProjectWrite, sendOfferVersionStub);
router.get('/:projectId/offer', getActiveOffer);
router.post('/:projectId/offers/:offerId/confirm', requireProjectWrite, logisticsController.confirmOffer);
router.post('/:projectId/logistics/cancel-confirmation', requireProjectWrite, cancelOfferConfirmation);
router.get('/:projectId/logistics', logisticsController.getProjectLogistics);
router.get('/:projectId/logistics/installer-availability/:employeeId', logisticsController.getInstallerAvailability);
router.put('/:projectId/work-orders/:workOrderId', requireProjectWrite, logisticsController.updateWorkOrder);
router.post('/:projectId/material-orders/:materialOrderId/advance', requireProjectWrite, logisticsController.advanceMaterialOrderStep);
router.get('/:projectId/work-orders/:workOrderId/pdf', logisticsController.exportWorkOrderPdf);
router.get('/:projectId/material-orders/:materialOrderId/pdf', logisticsController.exportMaterialOrderPdf);
router.get('/:projectId/invoices', invoiceController.listInvoices);
router.post('/:projectId/invoices/from-closing', requireProjectWrite, invoiceController.createInvoice);
router.patch('/:projectId/invoices/:versionId', requireProjectWrite, invoiceController.updateInvoice);
router.post('/:projectId/invoices/:versionId/issue', requireProjectWrite, invoiceController.issueInvoice);
router.post('/:projectId/invoices/:versionId/clone-for-edit', requireProjectWrite, invoiceController.cloneInvoiceForEdit);
router.get('/:projectId/invoices/:versionId/pdf', invoiceController.exportInvoicePdf);
router.post('/:id/deliveries/:deliveryId/receive', requireProjectWrite, receiveDelivery);
router.post('/:id/signature', requireProjectWrite, saveSignature);

export default router;
