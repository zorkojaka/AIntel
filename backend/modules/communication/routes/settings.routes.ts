import { Router } from "express";
import { requireRoles } from "../../../middlewares/auth";
import { ROLE_ADMIN } from "../../../utils/roles";
import { getInternalNotificationOptions, saveInternalNotificationSettings } from '../services/internal-notification-settings.service';
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
router.get('/internal-notifications', async (_req, res) => {
  try { return res.success(await getInternalNotificationOptions()); }
  catch (error) { return res.fail('Nastavitev internega obveščanja ni mogoče naložiti.', 500); }
});
router.put('/internal-notifications', adminOnly, async (req, res) => {
  try {
    const value = await saveInternalNotificationSettings(req.body, (req as any).context?.actorUserId);
    return res.success(value);
  } catch (error) {
    return res.fail(error instanceof Error ? error.message : 'Shranjevanje ni uspelo.', (error as any)?.statusCode === 400 ? 400 : 500);
  }
});
router.put("/", adminOnly, updateCommunicationSettingsController);
router.get("/templates", listCommunicationTemplatesController);
router.post("/templates", adminOnly, createCommunicationTemplateController);
router.put("/templates/:id", adminOnly, updateCommunicationTemplateController);
router.delete("/templates/:id", adminOnly, deleteCommunicationTemplateController);

export default router;
