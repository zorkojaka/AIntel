import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Eye, FileText, Receipt } from "lucide-react";
import { toast } from "sonner";
import { TimelineFeed, TimelineEvent } from "../core/TimelineFeed";

interface ClosingPanelProps {
  events: TimelineEvent[];
  onRefresh: () => void;
}

export function ClosingPanel({ events, onRefresh }: ClosingPanelProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5" />
            <div>
              <p className="m-0 font-medium">Ponudba</p>
              <p className="text-sm text-muted-foreground m-0">v2 - potrjena</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => toast.info("Pretvorjeno v delovni nalog")}>
              Pretvori v DN
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info("Pretvorjeno v račun")}> 
              Pretvori v račun
            </Button>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Receipt className="w-5 h-5" />
            <div>
              <p className="m-0 font-medium">Naročilnica</p>
              <p className="text-sm text-muted-foreground m-0">Aliansa d.o.o.</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => toast.success("Naročilnica poslana")}>
              Pošlji
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.success("Prevzem potrjen")}>
              Potrdi prevzem
            </Button>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5" />
            <div>
              <p className="m-0 font-medium">Dobavnica</p>
              <p className="text-sm text-muted-foreground m-0">Hotel Dolenjc</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => toast.success("Dobavnica potrjena")}>
              Potrdi
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info("Dobavnica poslana")}>
              Pošlji
            </Button>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="m-0">Zgodovina</h3>
            <p className="text-sm text-muted-foreground m-0">Dogodki projekta in statusne spremembe</p>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <Eye className="w-4 h-4 mr-2" />
            Osveži
          </Button>
        </div>
        <TimelineFeed events={events} />
      </div>
    </div>
  );
}
