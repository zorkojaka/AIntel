import React, { useEffect, useState } from 'react';
import { Card } from '@aintel/ui';
import { fetchOfferPdfPreview } from '../api';
import type { OfferPdfPreviewPayload } from '../types';

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
    setLoading(true);
    setError('');
    fetchOfferPdfPreview('demo', { allowDemo: true, docType })
      .then((payload) => {
        const parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null;
        if (parser) {
          const parsed = parser.parseFromString(payload.html, 'text/html');
          const styleBlock = parsed.querySelector('style')?.outerHTML ?? '';
          setHtml(`${styleBlock}${parsed.body.innerHTML || payload.html}`);
          return;
        }
        setHtml(payload.html);
      })
      .catch(() => setError('Predogled ni na voljo.'))
      .finally(() => setLoading(false));
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
