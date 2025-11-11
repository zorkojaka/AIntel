import { Badge } from "./ui/badge";
import { FileText, Package, Send, CheckCircle, XCircle, Clock, Calendar, Edit } from "lucide-react";

export interface TimelineEvent {
  id: string;
  type: "offer" | "po" | "delivery" | "execution" | "invoice" | "status-change" | "edit";
  title: string;
  description?: string;
  timestamp: string;
  user?: string;
  metadata?: Record<string, any>;
}

interface TimelineFeedProps {
  events: TimelineEvent[];
}

const eventIcons: Record<TimelineEvent["type"], React.ComponentType<{ className?: string }>> = {
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
            {!isLast && (
              <div className="absolute left-4 top-10 w-0.5 h-full bg-border" />
            )}
            <div className={`relative z-10 w-8 h-8 rounded-full ${eventColors[event.type]} flex items-center justify-center flex-shrink-0`}>
              <Icon className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 pb-6">
              <div className="flex items-start justify-between mb-1">
                <h4 className="font-medium">{event.title}</h4>
                <span className="text-sm text-muted-foreground whitespace-nowrap ml-4">
                  {event.timestamp}
                </span>
              </div>
              {event.description && (
                <p className="text-sm text-muted-foreground mb-2">{event.description}</p>
              )}
              {event.user && (
                <p className="text-xs text-muted-foreground">
                  {event.user}
                </p>
              )}
              {event.metadata && Object.keys(event.metadata).length > 0 && (
                <div className="mt-2 flex gap-2 flex-wrap">
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
