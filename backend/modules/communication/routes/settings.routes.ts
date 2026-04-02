import { Router } from "express";
import {
  createCommunicationTemplateController,
  deleteCommunicationTemplateController,
  getCommunicationHealthController,
  getCommunicationSettingsController,
  listCommunicationTemplatesController,
  updateCommunicationSettingsController,
  updateCommunicationTemplateController,
} from "../controllers/settings.controller";

const router = Router();

router.get("/", getCommunicationSettingsController);
router.get("/health", getCommunicationHealthController);
router.put("/", updateCommunicationSettingsController);
router.get("/templates", listCommunicationTemplatesController);
router.post("/templates", createCommunicationTemplateController);
router.put("/templates/:id", updateCommunicationTemplateController);
router.delete("/templates/:id", deleteCommunicationTemplateController);

export default router;
