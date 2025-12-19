import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '@aintel/ui';
import type { OfferPdfPreviewPayload } from '../types';

interface DocumentPreviewProps {
  docType: OfferPdfPreviewPayload['docType'];
  onPreviewUrlChange?: (info: { docType: OfferPdfPreviewPayload['docType']; previewUrl: string }) => void;
}

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({ docType, onPreviewUrlChange }) => {
  const [loading, setLoading] = useState(true);
  const [cacheBuster, setCacheBuster] = useState(() => Date.now());
  const rawBase =
    import.meta.env.VITE_API_BASE_URL ??
    (typeof window !== 'undefined' ? window.location.origin.replace(':4173', ':3001') : '');
  const apiBaseUrl = rawBase.replace(/\/$/, '');

  useEffect(() => {
    setCacheBuster(Date.now());
    setLoading(true);
  }, [docType]);

  const previewUrl = useMemo(() => {
    const params = new URLSearchParams({
      docType,
      allowDemo: '1',
      ts: String(cacheBuster),
    });
    return `${apiBaseUrl}/api/offers/demo/pdf-preview?${params.toString()}`;
  }, [apiBaseUrl, docType, cacheBuster]);

  useEffect(() => {
    if (onPreviewUrlChange) {
      onPreviewUrlChange({ docType, previewUrl });
    }
  }, [docType, previewUrl, onPreviewUrlChange]);

  return (
    <Card title="PDF predogled">
      <div className="overflow-auto rounded-md border border-border bg-slate-50 p-4">
        <div className="mx-auto min-h-[400px] w-[794px] bg-white p-6 shadow-sm">
          {loading && <p className="text-sm text-muted-foreground">Nalaganje predogleda ...</p>}
          <iframe
            key={`${docType}-${cacheBuster}`}
            title={`pdf-preview-${docType}`}
            src={previewUrl}
            className="h-[1000px] w-full rounded-md border border-border"
            onLoad={() => setLoading(false)}
            onError={() => setLoading(false)}
          />
        </div>
      </div>
    </Card>
  );
};
