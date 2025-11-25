import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';

export interface TableRowActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  deleteConfirmTitle?: string;
  deleteConfirmMessage?: string;
}

const confirmTitleDefault = 'Izbriši';
const confirmMessageDefault = 'Si prepričan, da želiš izbrisati ta element?';

const iconButtonClasses =
  'inline-flex h-8 w-8 items-center justify-center rounded border border-border/70 bg-card text-foreground transition hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export function TableRowActions({
  onEdit,
  onDelete,
  deleteConfirmTitle,
  deleteConfirmMessage
}: TableRowActionsProps) {
  const handleDelete = () => {
    if (!onDelete) {
      return;
    }

    const title = deleteConfirmTitle ?? confirmTitleDefault;
    const message = deleteConfirmMessage ?? confirmMessageDefault;
    const fullMessage = `${title}\n\n${message}`;

    if (globalThis.confirm(fullMessage)) {
      onDelete();
    }
  };

  return (
    <div className="flex items-center gap-1">
      {onEdit && (
        <button type="button" aria-label="Uredi" className={`${iconButtonClasses}`} onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </button>
      )}
      {onDelete && (
        <button type="button" aria-label="Izbriši" className={`${iconButtonClasses}`} onClick={handleDelete}>
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
