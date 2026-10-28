import { withScheduledEmail } from '../../communication/services/scheduled-email.service';
import { Router } from 'express';
import { requireRoles } from '../../../middlewares/auth';
import { ROLE_ADMIN, ROLE_EXECUTION, ROLE_FINANCE, ROLE_ORGANIZER, ROLE_SALES } from '../../../utils/roles';
import { getProjectClientNotes, postProjectClientNote } from '../../crm/controllers/clientNotesController';
import {
  addItem,
  addItemFromCenik,
  createProject,
  cloneProject,
  deleteItem,
  getProject,
  listClientProjects,
  listProjects,
  receiveDelivery,
  saveSignature,
  updateItem,
  deleteProject,
  updateStatus,
  updateProject,
  getOfferCandidates,
  calculateProjectKm,
  updateProjectAssignments,
  updateProjectLifecycle,
} from '../controllers/project.controller';
import {
  applyOfferTemplate,
  deleteOfferTemplate,
  exportOfferPdf,
  renameOfferTemplate,
  saveOfferVersion,
  saveOfferTemplate,
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
import * as creditNoteController from '../controllers/credit-note.controller';
import {
  sendInstallerPreparationCommunicationController,
  sendInvoiceCommunicationController,
  sendCreditNoteCommunicationController,
  sendOfferCommunicationController,
  sendWorkOrderConfirmationCommunicationController,
} from '../../communication/controllers/project-communication.controller';
import { supplierOrderEmailController } from '../../suppliers/supplier.routes';
import { bookingInviteController } from '../../availability/availability.routes';

const router = Router();
const requireProjectWrite = requireRoles([ROLE_ADMIN, ROLE_SALES, ROLE_FINANCE]);
const requirePreparationAccess = requireRoles([ROLE_ORGANIZER]);
const requireWorkOrderWrite = requireRoles([ROLE_ADMIN, ROLE_SALES, ROLE_FINANCE, ROLE_EXECUTION, ROLE_ORGANIZER]);
const requireOfferConfirmationWrite = requireRoles([ROLE_ADMIN, ROLE_SALES, ROLE_FINANCE, ROLE_ORGANIZER]);
// Monterji (EXECUTION) ne vidijo naših cen: ponudb, predlog ponudb in računov.
const requirePriceAccess = requireRoles([ROLE_ADMIN, ROLE_SALES, ROLE_FINANCE, ROLE_ORGANIZER]);

router.get('/', listProjects);
router.get('/offer-templates', requirePriceAccess, listOfferTemplates);
router.post('/', requireProjectWrite, createProject);
// Interni zapisi o stranki projekta — monter (EXECUTION) jih mora videti in dopisovati
// iz delovnega naloga; zapis se shrani na stranko, projekt je le izvor.
router.get('/:projectId/client-notes', getProjectClientNotes);
router.post('/:projectId/client-notes', requireWorkOrderWrite, postProjectClientNote);
router.post('/:id/clone', requireProjectWrite, cloneProject);
router.get('/:id', getProject);
router.get('/:id/client-projects', listClientProjects);
router.patch('/:id/assignments', requireProjectWrite, updateProjectAssignments);
router.post('/:id/lifecycle', requireProjectWrite, updateProjectLifecycle);
router.post('/:id/status', requireProjectWrite, updateStatus);
router.put('/:id', requireProjectWrite, updateProject);
router.delete('/:id', requireProjectWrite, deleteProject);
router.get('/:id/offer-candidates', requirePriceAccess, getOfferCandidates);
router.post('/:id/izracunaj-km', requireWorkOrderWrite, calculateProjectKm);
router.post('/:id/items', requireProjectWrite, addItem);
router.post('/:id/items/from-cenik', requireProjectWrite, addItemFromCenik);
router.put('/:id/items/:itemId', requireProjectWrite, updateItem);
router.delete('/:id/items/:itemId', requireProjectWrite, deleteItem);
router.post('/:projectId/offers', requireProjectWrite, saveOfferVersion);
router.get('/:projectId/offers', requirePriceAccess, listOffersForProject);
router.post('/:projectId/offer-templates', requireProjectWrite, saveOfferTemplate);
router.post('/:projectId/offer-templates/:templateId/apply', requireProjectWrite, applyOfferTemplate);
router.put('/:projectId/offer-templates/:templateId', requireProjectWrite, renameOfferTemplate);
router.delete('/:projectId/offer-templates/:templateId', requireProjectWrite, deleteOfferTemplate);
router.get('/:projectId/offers/:offerId', requirePriceAccess, getOfferById);
router.put('/:projectId/offers/:offerId', requireProjectWrite, updateOfferVersion);
router.delete('/:projectId/offers/:offerId', requireProjectWrite, deleteOfferVersion);
router.get('/:projectId/offers/:offerVersionId/pdf', requirePriceAccess, exportOfferPdf);
router.post('/:projectId/offers/:offerVersionId/send', requireProjectWrite, withScheduledEmail('sendOfferCommunicationController', sendOfferCommunicationController, requireProjectWrite));
router.post('/:projectId/work-orders/:workOrderId/send-confirmation', requireWorkOrderWrite, withScheduledEmail('sendWorkOrderConfirmationCommunicationController', sendWorkOrderConfirmationCommunicationController, requireWorkOrderWrite));
router.post('/:projectId/work-orders/:workOrderId/send-installer-preparation', requireWorkOrderWrite, withScheduledEmail('sendInstallerPreparationCommunicationController', sendInstallerPreparationCommunicationController, requireWorkOrderWrite));
router.post('/:projectId/work-orders/:workOrderId/accept-assignment', requireWorkOrderWrite, logisticsController.acceptInstallerAssignment);
router.post('/:projectId/work-orders/:workOrderId/confirm-all-installer-assignments', requireRoles([ROLE_ADMIN]), logisticsController.confirmAllInstallerAssignmentsByAdmin);
router.get('/:projectId/offer', requirePriceAccess, getActiveOffer);
router.post('/:projectId/offers/:offerId/confirm', requireProjectWrite, logisticsController.confirmOffer);
router.get('/:projectId/execution-definition', logisticsController.getProjectExecutionDefinition);
router.put('/:projectId/execution-definition', requireWorkOrderWrite, logisticsController.updateProjectExecutionDefinition);
router.post('/:projectId/logistics/cancel-confirmation', requireOfferConfirmationWrite, cancelOfferConfirmation);
router.get('/:projectId/logistics', logisticsController.getProjectLogistics);
router.get('/:projectId/logistics/installer-availability/:employeeId', requirePreparationAccess, logisticsController.getInstallerAvailability);
router.post('/:projectId/work-orders/:workOrderId/booking-invite', requirePreparationAccess, withScheduledEmail('bookingInviteController', bookingInviteController, requirePreparationAccess));
router.put('/:projectId/work-orders/:workOrderId', requireWorkOrderWrite, logisticsController.updateWorkOrder);
router.post('/:projectId/work-orders/:workOrderId/start-correction', requireWorkOrderWrite, logisticsController.startWorkOrderConfirmationCorrection);
router.post('/:projectId/material-orders/:materialOrderId/mark-equipment-ready', requireWorkOrderWrite, logisticsController.markEquipmentReady);
router.post('/:projectId/material-orders/:materialOrderId/advance', requirePreparationAccess, logisticsController.advanceMaterialOrderStep);
router.post('/:projectId/material-orders/:materialOrderId/supplier-order-email', requirePreparationAccess, withScheduledEmail('supplierOrderEmailController', supplierOrderEmailController, requirePreparationAccess));
router.get('/:projectId/work-orders/:workOrderId/pdf', logisticsController.exportWorkOrderPdf);
router.get('/:projectId/material-orders/:materialOrderId/pdf', logisticsController.exportMaterialOrderPdf);
router.get('/:projectId/invoices', requirePriceAccess, invoiceController.listInvoices);
router.post('/:projectId/invoices/from-closing', requireProjectWrite, invoiceController.createInvoice);
router.get('/:projectId/invoices/next-number', requireProjectWrite, invoiceController.nextInvoiceNumber);
router.patch('/:projectId/invoices/:versionId', requireProjectWrite, invoiceController.updateInvoice);
router.post('/:projectId/invoices/:versionId/issue', requireProjectWrite, invoiceController.issueInvoice);
router.post('/:projectId/invoices/:versionId/send', requireProjectWrite, withScheduledEmail('sendInvoiceCommunicationController', sendInvoiceCommunicationController, requireProjectWrite));
router.post('/:projectId/invoices/:versionId/clone-for-edit', requireProjectWrite, invoiceController.cloneInvoiceForEdit);
router.delete('/:projectId/invoices/:versionId', requireProjectWrite, invoiceController.cancelInvoice);
router.get('/:projectId/invoices/:versionId/pdf', requirePriceAccess, invoiceController.exportInvoicePdf);
router.get('/:projectId/invoices/:versionId/credit-notes', requireProjectWrite, creditNoteController.listCreditNotes);
router.post('/:projectId/invoices/:versionId/credit-notes/preview', requireProjectWrite, creditNoteController.previewCredit);
router.post('/:projectId/invoices/:versionId/credit-notes', requireProjectWrite, creditNoteController.issueCredit);
router.get('/:projectId/invoices/:versionId/credit-notes/:noteId/pdf', requireProjectWrite, creditNoteController.exportCreditPdf);
router.post('/:projectId/invoices/:versionId/credit-notes/:noteId/send', requireProjectWrite, withScheduledEmail('sendCreditNoteCommunicationController', sendCreditNoteCommunicationController, requireProjectWrite));
router.post('/:id/deliveries/:deliveryId/receive', requireProjectWrite, receiveDelivery);
router.post('/:id/signature', requireWorkOrderWrite, saveSignature);

export default router;

