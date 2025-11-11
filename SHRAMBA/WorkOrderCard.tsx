import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Calendar, MapPin, Users } from "lucide-react";

export interface WorkOrder {
  id: string;
  team: string;
  schedule: string;
  location: string;
  status: "planned" | "in-progress" | "completed" | "cancelled";
  notes?: string;
}

interface WorkOrderCardProps {
  workOrder: WorkOrder;
  onEdit?: () => void;
}

const statusColors: Record<WorkOrder["status"], string> = {
  planned: "bg-blue-100 text-blue-700",
  "in-progress": "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-700",
};

const statusLabels: Record<WorkOrder["status"], string> = {
  planned: "Načrtovano",
  "in-progress": "V teku",
  completed: "Opravljeno",
  cancelled: "Preklicano",
};

export function WorkOrderCard({ workOrder, onEdit }: WorkOrderCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-3 flex-1">
          <div className="flex items-center gap-3">
            <Badge className={statusColors[workOrder.status]}>
              {statusLabels[workOrder.status]}
            </Badge>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span>{workOrder.team}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span>{workOrder.schedule}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <span>{workOrder.location}</span>
            </div>
          </div>
          {workOrder.notes && (
            <p className="text-sm text-muted-foreground mt-2">{workOrder.notes}</p>
          )}
        </div>
        {onEdit && (
          <Button size="sm" variant="outline" onClick={onEdit}>
            Uredi
          </Button>
        )}
      </div>
    </Card>
  );
}
