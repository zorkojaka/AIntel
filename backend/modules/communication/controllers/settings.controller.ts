import { Request, Response } from "express";
import {
  createCommunicationTemplate,
  deleteCommunicationTemplate,
  getCommunicationSenderSettings,
  listCommunicationTemplates,
  updateCommunicationSenderSettings,
  updateCommunicationTemplate,
} from "../services/communication.service";
import { getSmtpDiagnostics } from "../services/email-transport.service";

export async function getCommunicationSettingsController(_req: Request, res: Response) {
  try {
    const settings = await getCommunicationSenderSettings();
    return res.success(settings);
  } catch (error) {
    console.error("Communication settings load failed", error);
    return res.fail("Nastavitev komunikacije ni mogoče naložiti.", 500);
  }
}

export async function getCommunicationHealthController(_req: Request, res: Response) {
  try {
    const [senderSettings, smtp] = await Promise.all([
      getCommunicationSenderSettings(),
      Promise.resolve(getSmtpDiagnostics()),
    ]);

    return res.success({
      senderSettings: {
        configured: Boolean(senderSettings.senderName && senderSettings.senderEmail),
        enabled: Boolean(senderSettings.enabled),
      },
      smtp,
    });
  } catch (error) {
    console.error("Communication health load failed", error);
    return res.fail("Stanja komunikacije ni mogoče naložiti.", 500);
  }
}

export async function updateCommunicationSettingsController(req: Request, res: Response) {
  try {
    const payload = req.body ?? {};
    if (!payload.senderName || !payload.senderEmail) {
      return res.fail("Ime in email pošiljatelja sta obvezna.", 400);
    }
    const updated = await updateCommunicationSenderSettings(payload);
    return res.success(updated);
  } catch (error) {
    console.error("Communication settings update failed", error);
    return res.fail("Nastavitev komunikacije ni mogoče shraniti.", 500);
  }
}

export async function listCommunicationTemplatesController(req: Request, res: Response) {
  try {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const templates = await listCommunicationTemplates(category as any);
    return res.success(templates);
  } catch (error) {
    console.error("Communication templates load failed", error);
    return res.fail("Predlog ni mogoče naložiti.", 500);
  }
}

export async function createCommunicationTemplateController(req: Request, res: Response) {
  try {
    const payload = req.body ?? {};
    if (!payload.key || !payload.name || !payload.subjectTemplate || !payload.bodyTemplate) {
      return res.fail("Ključ, naziv, zadeva in vsebina predloge so obvezni.", 400);
    }
    const created = await createCommunicationTemplate(payload);
    return res.success(created, 201);
  } catch (error) {
    console.error("Communication template create failed", error);
    return res.fail("Predloge ni mogoče ustvariti.", 500);
  }
}

export async function updateCommunicationTemplateController(req: Request, res: Response) {
  try {
    const updated = await updateCommunicationTemplate(req.params.id, req.body ?? {});
    return res.success(updated);
  } catch (error) {
    console.error("Communication template update failed", error);
    return res.fail(error instanceof Error ? error.message : "Predloge ni mogoče posodobiti.", 400);
  }
}

export async function deleteCommunicationTemplateController(req: Request, res: Response) {
  try {
    const deleted = await deleteCommunicationTemplate(req.params.id);
    return res.success(deleted);
  } catch (error) {
    console.error("Communication template delete failed", error);
    return res.fail("Predloge ni mogoče izbrisati.", 500);
  }
}
