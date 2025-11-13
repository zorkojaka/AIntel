import type { ComponentType } from "react";
import { Badge } from "./ui/badge";
import { FileText, Package, CheckCircle, Clock, Edit } from "lucide-react";

export interface TimelineEvent {
  id: string;
  type: "offer" | "po" | "delivery" | "execution" | "invoice" | "status-change" | "edit";
  title: string;
  description?: string;
  timestamp: string;
  user?: string;
  metadata?: Record<string, string>;
}

interface TimelineFeedProps {
  events: TimelineEvent[];
}

const eventIcons: Record<TimelineEvent["type"], ComponentType<{ className?: string }>> = {
  offer: FileText,
  po: Package,
  delivery: Package,
  execution: CheckCircle,
  invoice: FileText,
  "status-change": Clock,
  edit: Edit,
};

const eventColors: Record<TimelineEvent["type"], string> = {
  offer: "bg-blue-500",
  po: "bg-purple-500",
  delivery: "bg-green-500",
  execution: "bg-yellow-500",
  invoice: "bg-indigo-500",
  "status-change": "bg-gray-500",
  edit: "bg-orange-500",
};

export function TimelineFeed({ events }: TimelineFeedProps) {
  return (
    <div className="space-y-6">
      {events.map((event, index) => {
        const Icon = eventIcons[event.type];
        const isLast = index === events.length - 1;

        return (
          <div key={event.id} className="relative flex gap-4">
            {!isLast && <div className="absolute left-4 top-10 h-full w-0.5 bg-border" />}
            <div
              className={`relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${eventColors[event.type]}`}
            >
              <Icon className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 pb-6">
              <div className="mb-1 flex items-start justify-between">
                <h4 className="font-medium">{event.title}</h4>
                <span className="ml-4 whitespace-nowrap text-sm text-muted-foreground">
                  {event.timestamp}
                </span>
              </div>
              {event.description && (
                <p className="mb-2 text-sm text-muted-foreground">{event.description}</p>
              )}
              {event.user && <p className="text-xs text-muted-foreground">{event.user}</p>}
              {event.metadata && Object.keys(event.metadata).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(event.metadata).map(([key, value]) => (
                    <Badge key={key} variant="outline" className="text-xs">
                      {key}: {value}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
