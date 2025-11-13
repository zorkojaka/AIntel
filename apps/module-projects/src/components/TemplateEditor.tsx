import { useState } from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Badge } from "./ui/badge";
import { Plus, Edit, Trash2, Copy, FileText } from "lucide-react";
import { toast } from "sonner";

export interface Template {
  id: string;
  name: string;
  description: string;
  category: "offer" | "invoice" | "work-order";
  content: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TemplateEditorProps {
  templates: Template[];
  onSave: (template: Template) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}

const DEFAULT_OFFER_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Inter', sans-serif; color: #1f2937; max-width: 800px; margin: 0 auto; padding: 40px; }
    .header { margin-bottom: 40px; border-bottom: 2px solid #2563EB; padding-bottom: 20px; }
    .header h1 { color: #2563EB; margin: 0 0 10px 0; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 40px; }
    .info-section h3 { color: #6b7280; font-size: 12px; text-transform: uppercase; margin: 0 0 10px 0; }
    .info-section p { margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; margin: 30px 0; }
    th { background: #f3f4f6; padding: 12px; text-align: left; font-weight: 600; }
    td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
    .totals { margin-top: 30px; text-align: right; }
    .totals .row { display: flex; justify-content: flex-end; gap: 100px; padding: 8px 0; }
    .totals .total { font-weight: bold; font-size: 18px; color: #2563EB; }
    .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Ponudba #{{offerVersion}}</h1>
    <p>{{projectTitle}}</p>
  </div>

  <div class="info-grid">
    <div class="info-section">
      <h3>Stranka</h3>
      <p><strong>{{customerName}}</strong></p>
      <p>{{customerAddress}}</p>
      <p>ID za DDV: {{customerTaxId}}</p>
    </div>
    <div class="info-section">
      <h3>Podrobnosti ponudbe</h3>
      <p>Datum: {{offerDate}}</p>
      <p>Projekt ID: {{projectId}}</p>
      <p>Veljavnost: 30 dni</p>
    </div>
  </div>

  <div class="description">
    <h3>Opis projekta</h3>
    <p>{{projectDescription}}</p>
  </div>

  <h3>Postavke</h3>
  <table>
    <thead>
      <tr>
        <th>Opis</th>
        <th>Količina</th>
        <th>Enota</th>
        <th style="text-align: right">Cena</th>
        <th style="text-align: right">DDV</th>
        <th style="text-align: right">Skupaj</th>
      </tr>
    </thead>
    <tbody>
      {{items}}
    </tbody>
  </table>

  <div class="totals">
    <div class="row">
      <span>Neto znesek:</span>
      <span>€ {{totalNet}}</span>
    </div>
    <div class="row">
      <span>DDV:</span>
      <span>€ {{totalVAT}}</span>
    </div>
    <div class="row total">
      <span>Skupaj z DDV:</span>
      <span>€ {{totalGross}}</span>
    </div>
  </div>

  <div class="footer">
    <p>Plačilni pogoji: {{paymentTerms}}</p>
    <p>Zahvaljujemo se vam za zaupanje!</p>
  </div>
</body>
</html>`;

const PLACEHOLDER_INFO = [
  { key: "{{customerName}}", desc: "Naziv stranke" },
  { key: "{{customerAddress}}", desc: "Naslov stranke" },
  { key: "{{customerTaxId}}", desc: "Davčna številka stranke" },
  { key: "{{projectTitle}}", desc: "Naziv projekta" },
  { key: "{{projectDescription}}", desc: "Opis projekta" },
  { key: "{{projectId}}", desc: "ID projekta" },
  { key: "{{offerVersion}}", desc: "Verzija ponudbe" },
  { key: "{{offerDate}}", desc: "Datum ponudbe" },
  { key: "{{offerAmount}}", desc: "Vrednost ponudbe" },
  { key: "{{items}}", desc: "Tabela postavk (avtomatska)" },
  { key: "{{totalNet}}", desc: "Neto znesek" },
  { key: "{{totalVAT}}", desc: "DDV znesek" },
  { key: "{{totalGross}}", desc: "Bruto znesek" },
  { key: "{{paymentTerms}}", desc: "Plačilni pogoji" },
  { key: "{{problemSummary}}", desc: "Povzetek problema (AI)" },
  { key: "{{solutionDescription}}", desc: "Opis rešitve (AI)" },
  { key: "{{milestones}}", desc: "Časovnica (AI)" },
];

export function TemplateEditor({ templates, onSave, onDelete, onSetDefault }: TemplateEditorProps) {
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "offer" as Template["category"],
    content: DEFAULT_OFFER_TEMPLATE,
  });

  const handleCreate = () => {
    setFormData({
      name: "",
      description: "",
      category: "offer",
      content: DEFAULT_OFFER_TEMPLATE,
    });
    setEditingTemplate(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (template: Template) => {
    setFormData({
      name: template.name,
      description: template.description,
      category: template.category,
      content: template.content,
    });
    setEditingTemplate(template);
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!formData.name || !formData.content) {
      toast.error("Izpolnite vsa obvezna polja");
      return;
    }

    const template: Template = {
      id: editingTemplate?.id || `tpl-${Date.now()}`,
      name: formData.name,
      description: formData.description,
      category: formData.category,
      content: formData.content,
      isDefault: editingTemplate?.isDefault || false,
      createdAt: editingTemplate?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(template);
    setIsDialogOpen(false);
    toast.success(editingTemplate ? "Predloga posodobljena" : "Predloga ustvarjena");
  };

  const handleDuplicate = (template: Template) => {
    const newTemplate: Template = {
      ...template,
      id: `tpl-${Date.now()}`,
      name: `${template.name} (kopija)`,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onSave(newTemplate);
    toast.success("Predloga podvojena");
  };

  const handleInsertPlaceholder = (placeholder: string) => {
    setFormData({
      ...formData,
      content: `${formData.content} ${placeholder}`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="mb-2">PDF Predloge</h2>
          <p className="text-sm text-muted-foreground">
            Upravljajte predloge za ponudbe, račune in delovne naloge
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nova predloga
        </Button>
      </div>

      <div className="grid gap-4">
        {templates.map((template) => (
          <Card key={template.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="mb-2 flex items-center gap-3">
                  <h3 className="m-0">{template.name}</h3>
                  <Badge
                    className={
                      template.category === "offer"
                        ? "bg-blue-100 text-blue-700"
                        : template.category === "invoice"
                        ? "bg-green-100 text-green-700"
                        : "bg-purple-100 text-purple-700"
                    }
                  >
                    {template.category === "offer"
                      ? "Ponudba"
                      : template.category === "invoice"
                      ? "Račun"
                      : "Delovni nalog"}
                  </Badge>
                  {template.isDefault && (
                    <Badge className="bg-primary text-primary-foreground">Privzeto</Badge>
                  )}
                </div>
                <p className="mb-2 text-sm text-muted-foreground">{template.description}</p>
                <div className="text-xs text-muted-foreground">
                  Nazadnje posodobljeno: {new Date(template.updatedAt).toLocaleDateString("sl-SI")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => handleEdit(template)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleDuplicate(template)}>
                  <Copy className="h-4 w-4" />
                </Button>
                {!template.isDefault && (
                  <Button size="sm" variant="outline" onClick={() => onSetDefault(template.id)}>
                    <FileText className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (confirm("Ali ste prepričani, da želite izbrisati to predlogo?")) {
                      onDelete(template.id);
                    }
                  }}
                  disabled={template.isDefault}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}

        {templates.length === 0 && (
          <Card className="p-12 text-center">
            <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-4 text-muted-foreground">Še ni ustvarjenih predlog</p>
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Ustvari prvo predlogo
            </Button>
          </Card>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Uredi predlogo" : "Nova predloga"}</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Naziv predloge *</Label>
                <Input
                  value={formData.name}
                  onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                  placeholder="npr. Standardna ponudba"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Kategorija *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value as Template["category"] })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="offer">Ponudba</SelectItem>
                    <SelectItem value="invoice">Račun</SelectItem>
                    <SelectItem value="work-order">Delovni nalog</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Opis</Label>
              <Input
                value={formData.description}
                onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                placeholder="Kratek opis predloge"
                className="mt-1"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Vsebina predloge (HTML) *</Label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setFormData({ ...formData, content: DEFAULT_OFFER_TEMPLATE })}
                  >
                    Naloži privzeto predlogo
                  </Button>
                </div>
              </div>
              <Textarea
                value={formData.content}
                onChange={(event) => setFormData({ ...formData, content: event.target.value })}
                placeholder="HTML vsebina predloge..."
                rows={12}
                className="font-mono text-xs"
              />
            </div>

            <div>
              <Label className="mb-2 block">Spremenljivke</Label>
              <div className="max-h-60 overflow-y-auto rounded-[var(--radius-card)] border bg-muted/30 p-4">
                <div className="grid grid-cols-2 gap-2">
                  {PLACEHOLDER_INFO.map((placeholder) => (
                    <button
                      key={placeholder.key}
                      onClick={() => handleInsertPlaceholder(placeholder.key)}
                      className="group rounded p-2 text-left transition-colors hover:bg-background"
                    >
                      <code className="text-xs text-primary group-hover:underline">{placeholder.key}</code>
                      <div className="text-xs text-muted-foreground">{placeholder.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Prekliči
              </Button>
              <Button onClick={handleSave}>{editingTemplate ? "Posodobi" : "Ustvari"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
