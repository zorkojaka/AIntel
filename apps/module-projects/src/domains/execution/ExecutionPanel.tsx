import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Plus } from "lucide-react";
import { WorkOrderCard, WorkOrder } from "../logistics/WorkOrderCard";
import { SignaturePad } from "./SignaturePad";

interface ExecutionPanelProps {
  workOrders: WorkOrder[];
  onSaveSignature: (signature: string, signerName: string) => void | Promise<void>;
}

export function ExecutionPanel({ workOrders, onSaveSignature }: ExecutionPanelProps) {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3>Delovni nalogi</h3>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Dodeli ekipo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dodeli nov delovni nalog</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Ekipa</Label>
                  <Input placeholder="Ekipa A - Janez, Marko" />
                </div>
                <div className="space-y-2">
                  <Label>Termin</Label>
                  <Input placeholder="14.11.2024 08:00" />
                </div>
                <div className="space-y-2">
                  <Label>Lokacija</Label>
                  <Input placeholder="Tržaška cesta 12, Ljubljana" />
                </div>
                <div className="space-y-2">
                  <Label>Opombe</Label>
                  <Textarea placeholder="Posebna navodila" />
                </div>
                <Button className="w-full">Shrani</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {workOrders.length > 0 ? (
          <div className="space-y-3">
            {workOrders.map((wo) => (
              <WorkOrderCard key={wo.id} workOrder={wo} />
            ))}
          </div>
        ) : (
          <Card className="p-6 text-center text-muted-foreground">Ni dodeljenih delovnih nalogov</Card>
        )}
      </div>

      <div className="space-y-4">
        <h3>Potrditev zaključka</h3>
        <Card className="p-6">
          <SignaturePad onSign={onSaveSignature} />
        </Card>
      </div>
    </div>
  );
}
