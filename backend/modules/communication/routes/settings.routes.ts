import { Router } from "express";
import { requireRoles } from "../../../middlewares/auth";
import { ROLE_ADMIN } from "../../../utils/roles";
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
const adminOnly = requireRoles([ROLE_ADMIN]);

router.get("/", getCommunicationSettingsController);
router.get("/health", getCommunicationHealthController);
router.put("/", adminOnly, updateCommunicationSettingsController);
router.get("/templates", listCommunicationTemplatesController);
router.post("/templates", adminOnly, createCommunicationTemplateController);
router.put("/templates/:id", adminOnly, updateCommunicationTemplateController);
router.delete("/templates/:id", adminOnly, deleteCommunicationTemplateController);

export default router;
