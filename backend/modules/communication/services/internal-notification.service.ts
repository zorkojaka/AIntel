import { ProjectModel, newTimelineEventId } from '../../projects/schemas/project';
import { WorkOrderModel } from '../../projects/schemas/work-order';
import { getConfig } from '../../settings/config/config-store.service';
import { getInternalNotificationSettings, type InternalNotificationEvent } from './internal-notification-settings.service';
import { sendBookingSelectedInternalEmail, sendInstallerPreparationEmail } from './communication.service';

export async function notifyInternalWorkOrderEvent(input: {
  projectId: string;
  workOrderId: string;
  event: InternalNotificationEvent;
  customerSelected?: boolean;
  baseUrl?: string;
  actorDisplayName?: string;
}) {
  // Notification failures must not undo a saved work-order change.
  async function recordFailure(error: unknown) {
    console.error('Interno obveščanje ni uspelo.', error);
    try {
      await ProjectModel.updateOne({ id: input.projectId }, { $push: { timeline: {
        id: newTimelineEventId(), type: 'edit', timestamp: new Date().toISOString(), user: 'Sistem',
        title: 'Interno obvestilo ni bilo poslano',
        description: error instanceof Error ? error.message : 'Pošiljanje ni uspelo.',
        metadata: { workOrderId: input.workOrderId, event: input.event },
      } } });
    } catch (loggingError) { console.error('Napake internega obveščanja ni mogoče zabeležiti.', loggingError); }
  }

  try {
    const workOrder = await WorkOrderModel.findOne({ _id: input.workOrderId, projectId: input.projectId }).lean();
    if (!workOrder) throw new Error('Delovni nalog ni najden.');
    const settings = await getInternalNotificationSettings();
    let installerRecipients: string[] = [];
    if (settings.EXECUTION?.[input.event]) {
      try {
        const config = input.baseUrl ? null : await getConfig<{ bookingPageUrl?: string }>('platform.general');
        const origin = input.baseUrl || new URL(config?.bookingPageUrl || 'https://dev.inteligent.si').origin;
        const result = await sendInstallerPreparationEmail({
          projectId: input.projectId, workOrderId: input.workOrderId,
          projectLink: `${origin}/projects/${encodeURIComponent(input.projectId)}`,
          acceptanceBaseUrl: `${origin}/api/public/installer-accept`, confirmSend: true,
          actorDisplayName: input.actorDisplayName || 'Sistem — interno obveščanje',
        });
        if ('recipients' in result) installerRecipients = result.recipients;
      } catch (error) { await recordFailure(error); }
    }
    try {
      await sendBookingSelectedInternalEmail({
        ...input, scheduledAt: workOrder.scheduledAt ?? undefined,
        customerSelected: input.customerSelected === true, excludeRecipients: installerRecipients,
      });
    } catch (error) { await recordFailure(error); }
  } catch (error) { await recordFailure(error); }
}
