import { Download, Loader2 } from "lucide-react";

import { Button } from "../../components/ui/button";

type OfferPdfActionGroupProps = {
  previewLabel: string;
  downloadLabel: string;
  onPreview: () => void;
  onDownload: () => void;
  previewing: boolean;
  downloading: boolean;
  disabled: boolean;
};

export function OfferPdfActionGroup({
  previewLabel,
  downloadLabel,
  onPreview,
  onDownload,
  previewing,
  downloading,
  disabled,
}: OfferPdfActionGroupProps) {
  return (
    <div className="inline-flex h-8 items-center rounded-md border border-border/70 bg-background">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 rounded-none border-r border-border/70 px-3"
        onClick={onPreview}
        disabled={disabled}
      >
        {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {previewLabel}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 rounded-none px-3"
        onClick={onDownload}
        disabled={disabled}
      >
        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {downloadLabel}
      </Button>
    </div>
  );
}
