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

const router = Router();

// Link za oceno projekta - uporabi se kot {{review.link}} v mailu za racun (rocno posiljanje).
router.get("/:projectId/review-link", async (req, res) => {
  try {
    const project = await ProjectModel.findOne({ id: req.params.projectId });
    if (!project) return res.fail(`Projekt ${req.params.projectId} ni najden.`, 404);
    const url = await ensureReviewLinkForProject(project);
    return res.success({ url });
  } catch (error) {
    return res.fail(error instanceof Error ? error.message : "Linka za oceno ni bilo mogoče pripraviti.", 500);
  }
});

router.get("/:projectId/communication/feed", getProjectCommunicationFeedController);
router.get("/:projectId/communication/thread", getProjectThreadController);
router.get("/:projectId/offers/:offerVersionId/messages", getOfferMessagesController);
router.get("/:projectId/work-orders/:workOrderId/installer-preparation-messages", getInstallerPreparationMessagesController);
router.get("/:projectId/messages/:messageId", getCommunicationMessageController);

export default router;
