import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import type { ProjectSummary } from '../types';

export function ProjectCloseDialog({ project, action, onClose, onSubmit }: {
  project: ProjectSummary;
  action: 'close' | 'reject';
  onClose: () => void;
  onSubmit: (reason: string) => Promise<boolean | void>;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{action === 'reject' ? 'Označi projekt kot zavrnjen' : 'Zaključi projekt'}</DialogTitle>
          <DialogDescription>
            {project.title} bo premaknjen v Arhiv. Zabeležena bosta uporabnik in čas zaprtja.
          </DialogDescription>
        </DialogHeader>
        <label className="space-y-2 text-sm">
          <span>Razlog zaprtja (neobvezno)</span>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} rows={4} disabled={saving}
            placeholder="Npr. stranka je izbrala drugega izvajalca." />
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Prekliči</Button>
          <Button type="button" disabled={saving} onClick={async () => {
            setSaving(true);
            try { if (await onSubmit(reason)) onClose(); }
            finally { setSaving(false); }
          }}>{saving ? 'Shranjujem …' : action === 'reject' ? 'Zavrni in zapri projekt' : 'Zaključi in arhiviraj'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
