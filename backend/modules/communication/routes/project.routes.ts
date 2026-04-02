import { Router } from "express";
import {
  getCommunicationMessageController,
  getOfferMessagesController,
  getProjectCommunicationFeedController,
} from "../controllers/project-communication.controller";

const router = Router();

router.get("/:projectId/communication/feed", getProjectCommunicationFeedController);
router.get("/:projectId/offers/:offerVersionId/messages", getOfferMessagesController);
router.get("/:projectId/messages/:messageId", getCommunicationMessageController);

export default router;
