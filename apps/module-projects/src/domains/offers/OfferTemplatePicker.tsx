import { ArrowDown, ArrowLeft, Check, ChevronsUpDown, Loader2, Pencil, Trash2 } from "lucide-react";

import type { OfferTemplateSummary } from "@aintel/shared/types/offers";

import { Button } from "../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

type OfferTemplatePickerProps = {
  templates: OfferTemplateSummary[];
  selectedTemplate: OfferTemplateSummary | null;
  selectedTemplateId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (templateId: string) => void;
  formatCurrency: (value: number) => string;
  templateSaving: boolean;
  templateCreating: boolean;
  onRenameSelected: () => void;
  onDeleteSelected: () => void;
  onRenameTemplate: (template: OfferTemplateSummary) => void;
  onDeleteTemplate: (template: OfferTemplateSummary) => void;
  onCreateTemplate: () => void;
  onApplyTemplate: () => void;
};

export function OfferTemplatePicker({
  templates,
  selectedTemplate,
  selectedTemplateId,
  open,
  onOpenChange,
  onSelectTemplate,
  formatCurrency,
  templateSaving,
  templateCreating,
  onRenameSelected,
  onDeleteSelected,
  onRenameTemplate,
  onDeleteTemplate,
  onCreateTemplate,
  onApplyTemplate,
}: OfferTemplatePickerProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Template
        </span>
        <div className="hidden items-center gap-2">
          <Select value={selectedTemplateId ?? ""} onValueChange={onSelectTemplate}>
            <SelectTrigger className="min-w-[260px]">
              <SelectValue placeholder="Izberi template" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((template) => (
                <SelectItem key={template._id} value={template._id}>
                  {template.title} {"-"} {formatCurrency(template.totalGrossAfterDiscount ?? template.totalWithVat ?? 0)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-9 shrink-0"
            disabled={!selectedTemplateId}
            onClick={onRenameSelected}
            aria-label="Preimenuj template"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={!selectedTemplateId}
            onClick={onDeleteSelected}
            aria-label="Izbriši template"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <Popover open={open} onOpenChange={onOpenChange}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="min-w-[320px] justify-between"
            >
              <span className="truncate text-left">
                {selectedTemplate
                  ? `${selectedTemplate.title} - ${formatCurrency(selectedTemplate.totalGrossAfterDiscount ?? selectedTemplate.totalWithVat ?? 0)}`
                  : "Izberi template"}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[360px] p-2">
            <div className="space-y-1">
              {templates.length === 0 ? (
                <div className="px-3 py-5 text-sm text-muted-foreground">Ni shranjenih template-ov.</div>
              ) : (
                templates.map((template) => {
                  const isSelected = template._id === selectedTemplateId;
                  return (
                    <div
                      key={template._id}
                      role="button"
                      tabIndex={0}
                      className={`group flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                        isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/70"
                      }`}
                      onClick={() => {
                        onSelectTemplate(template._id);
                        onOpenChange(false);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectTemplate(template._id);
                          onOpenChange(false);
                        }
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {isSelected && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                          <span className="truncate font-medium">{template.title}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {formatCurrency(template.totalGrossAfterDiscount ?? template.totalWithVat ?? 0)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          aria-label={`Preimenuj ${template.title}`}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            onRenameTemplate(template);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Izbriši ${template.title}`}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteTemplate(template);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={onCreateTemplate} disabled={templateSaving}>
          {templateSaving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ArrowLeft className="mr-2 h-4 w-4" />
          )}
          Shrani template
        </Button>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={onApplyTemplate}
          disabled={!selectedTemplateId || templateCreating}
        >
          {templateCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Vnos podatkov
          {!templateCreating && <ArrowDown className="ml-2 h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
