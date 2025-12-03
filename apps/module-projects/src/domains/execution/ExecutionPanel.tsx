import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Plus } from "lucide-react";
import { SignaturePad } from "../../components/SignaturePad";
import { WorkOrderCard, WorkOrder } from "./WorkOrderCard";
import type { ProjectDetails } from "../../types";

interface ExecutionPanelProps {
  project: ProjectDetails;
  workOrders: WorkOrder[];
  onSaveSignature: (signature: string, signerName: string) => Promise<void> | void;
}

export function ExecutionPanel({ project, workOrders, onSaveSignature }: ExecutionPanelProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold">Izvedba</h3>
            <p className="text-sm text-muted-foreground">Dodeljevanje ekip in spremljanje napredka</p>
          </div>
          <Button variant="ghost" size="sm">
            Napredna orodja
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                {project.customerDetail.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h4 className="m-0">Ekipe na terenu</h4>
                <p className="m-0 text-sm text-muted-foreground">Centralno koordiniraj vse naloge</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-semibold">
                {project.projectNumber ?? "P"}
              </div>
              <div>
                <h4 className="m-0">Izvedba projekta</h4>
                <p className="m-0 text-sm text-muted-foreground">Planiranje, izvedba, evidence</p>
              </div>
            </div>
          </Card>
        </div>

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
