import React, { useEffect, useState } from 'react';
import { Card } from '@aintel/ui';
import type { ApiEnvelope, OfferPdfPreviewPayload } from '../types';

interface DocumentPreviewProps {
  docType: OfferPdfPreviewPayload['docType'];
  visible: boolean;
}

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({ docType, visible }) => {
  const [html, setHtml] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    let mounted = true;

    const loadPreview = async () => {
      setLoading(true);
      setError('');
      setHtml('');
      const params = new URLSearchParams({
        docType,
        allowDemo: '1',
        ts: Date.now().toString(),
      });
      try {
        const response = await fetch(`/api/offers/demo/pdf-preview?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error('Predogled ni na voljo.');
        }
        const payload = (await response.json()) as ApiEnvelope<OfferPdfPreviewPayload>;
        if (!payload?.success || !payload.data) {
          throw new Error(payload?.error ?? 'Predogled ni na voljo.');
        }
        const parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null;
        if (parser) {
          const parsed = parser.parseFromString(payload.data.html, 'text/html');
          const styleBlock = parsed.querySelector('style')?.outerHTML ?? '';
          if (mounted) {
            setHtml(`${styleBlock}${parsed.body.innerHTML || payload.data.html}`);
          }
          return;
        }
        if (mounted) {
          setHtml(payload.data.html);
        }
      } catch (previewError) {
        if (!controller.signal.aborted && mounted) {
          setError(previewError instanceof Error ? previewError.message : 'Predogled ni na voljo.');
        }
      } finally {
        if (!controller.signal.aborted && mounted) {
          setLoading(false);
        }
      }
    };

    loadPreview();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [docType, visible]);

  if (!visible) return null;

  return (
    <Card title="PDF predogled">
      <div className="overflow-auto rounded-md border border-border bg-slate-50 p-4">
        <div className="mx-auto min-h-[400px] w-[794px] bg-white p-6 shadow-sm">
          {loading && <p className="text-sm text-muted-foreground">Nalaganje predogleda ...</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!loading && !error && html && (
            <div className="document-preview" dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </div>
      </div>
    </Card>
  );
};
