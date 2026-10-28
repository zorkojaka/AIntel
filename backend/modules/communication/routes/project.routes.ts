import { Router } from "express";
import {
  getCommunicationMessageController,
  getInstallerPreparationMessagesController,
  getOfferMessagesController,
  getProjectCommunicationFeedController,
  getProjectThreadController,
} from "../controllers/project-communication.controller";
import { ProjectModel } from "../../projects/schemas/project";
import { ensureReviewLinkForProject } from "../../reviews/review.service";
import { renderBookingReviewTemplate } from '../services/booking-review-templates.service';
import { buildTemplateContext } from '../services/template-render.service';
import { getCommunicationSenderSettings } from '../services/communication.service';
import { getSettings } from '../../settings/settings.service';
import { requireRoles } from '../../../middlewares/auth';
import { PRICE_ROLES } from '../../../utils/roles';

const router = Router();
// Sent offers and invoices carry our prices; monters and organizers must not read them.
const requirePriceAccess = requireRoles(PRICE_ROLES);

// Link za oceno projekta - uporabi se kot {{review.link}} v mailu za racun (rocno posiljanje).
router.get("/:projectId/review-link", requirePriceAccess, async (req, res) => {
  try {
    const project = await ProjectModel.findOne({ id: req.params.projectId });
    if (!project) return res.fail(`Projekt ${req.params.projectId} ni najden.`, 404);
    const url = await ensureReviewLinkForProject(project);
    const [sender, settings] = await Promise.all([getCommunicationSenderSettings(), getSettings()]);
    const rendered = await renderBookingReviewTemplate('invoice_review_request', buildTemplateContext({
      customerName: project.customer?.name ?? '', projectName: project.title ?? '',
      offerNumber: '', offerTotal: '', companyName: settings.companyName ?? '', sender, reviewLink: url,
    }), url);
    return res.success({ url, text: rendered.body });
  } catch (error) {
    return res.fail(error instanceof Error ? error.message : "Linka za oceno ni bilo mogoče pripraviti.", 500);
  }
});

router.get("/:projectId/communication/feed", requirePriceAccess, getProjectCommunicationFeedController);
router.get("/:projectId/communication/thread", getProjectThreadController);
router.get("/:projectId/offers/:offerVersionId/messages", requirePriceAccess, getOfferMessagesController);
router.get("/:projectId/work-orders/:workOrderId/installer-preparation-messages", getInstallerPreparationMessagesController);
router.get("/:projectId/messages/:messageId", requirePriceAccess, getCommunicationMessageController);

export default router;
