import type { MaterialOrder, ProjectLogisticsSnapshot, WorkOrder } from '../logistics';

export interface ProjectLogistics {
  workOrders: WorkOrder[];
  materialOrders: MaterialOrder[];
  materialOrder?: MaterialOrder | null;
  workOrder?: WorkOrder | null;
  acceptedOfferId?: ProjectLogisticsSnapshot['acceptedOfferId'];
  confirmedOfferVersionId?: ProjectLogisticsSnapshot['confirmedOfferVersionId'];
  offerVersions?: ProjectLogisticsSnapshot['offerVersions'];
}
