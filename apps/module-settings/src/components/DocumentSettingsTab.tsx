import React, { FormEvent, useMemo, useState } from 'react';
import { Button, Card, Input, Textarea } from '@aintel/ui';
import { DocumentTypeKey, NoteCategory, NoteDto } from '../types';

interface DocumentSettingsTabProps {
  docType: DocumentTypeKey;
  label: string;
  pattern: string;
  patternExample: string;
  onPatternChange: (value: string) => void;
  notes: NoteDto[];
  activeDocDefaults: string[];
  onDocDefaultsChange: (defaults: string[]) => void;
  onNotesChange: (notes: NoteDto[]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  saving: boolean;
  loading: boolean;
  previewVisible: boolean;
  onTogglePreview: () => void;
  preview: React.ReactNode;
}

const NUMBERING_TOKENS = '{YYYY}, {YY}, {MM}, {DD}, {SEQ:000}'

const noteCategoryLabels: Record<NoteCategory, string> = {
  payment: 'Plačilni pogoji',
  delivery: 'Dostava',
  note: 'Opomba',
  costs: 'Dodatni stroški',
};

const generateNoteId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const DocumentSettingsTab: React.FC<DocumentSettingsTabProps> = ({
  docType,
  label,
  pattern,
  patternExample,
  onPatternChange,
  notes,
  activeDocDefaults,
  onDocDefaultsChange,
  onNotesChange,
  onSubmit,
  saving,
  loading,
  previewVisible,
  onTogglePreview,
  preview,
}) => {
  const [showNumberingHelp, setShowNumberingHelp] = useState(false);

  const sortedNotes = useMemo(
    () =>
      notes
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((note, index) => ({ ...note, sortOrder: index })),
    [notes]
  );

  return (
    <div className="space-y-6">
      <form className="space-y-6" onSubmit={onSubmit} data-doc-type={docType}>
        <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
          <label className="text-sm font-medium text-foreground">Številčenje dokumenta</label>
          <Textarea
            rows={2}
            className="min-h-[48px] w-full resize-none font-mono text-base leading-relaxed"
            value={pattern}
            onChange={(event) => onPatternChange(event.target.value)}
            placeholder={pattern}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Podprti tokeni: {NUMBERING_TOKENS}</span>
              <button
                type="button"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-[11px] text-foreground transition hover:bg-background"
                onClick={() => setShowNumberingHelp((prev) => !prev)}
                aria-label="Pomoč pri številčenju"
              >
                ?
              </button>
            </div>
            <span className="rounded-full border border-border bg-background px-3 py-1 font-mono text-[11px] text-foreground">
              Primer: {patternExample}
            </span>
          </div>
          {showNumberingHelp && (
            <div className="rounded-md border border-dashed border-border bg-background/70 p-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Primeri:</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>PONUDBA-{`{YYYY}`}-{`{SEQ:000}`} → PONUDBA-2025-001</li>
                <li>O-{`{YY}`}{`{MM}`}-{`{SEQ:0000}`} → O-2512-0001</li>
                <li>PRJ-{`{SEQ:000}`} → PRJ-001</li>
              </ul>
            </div>
          )}
        </div>

        <NotesManager
          notes={sortedNotes}
          activeDocumentLabel={label}
          activeDocDefaults={activeDocDefaults}
          onDocDefaultsChange={onDocDefaultsChange}
          onNotesChange={onNotesChange}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving || loading}>
            {saving ? 'Shranjujem ...' : 'Shrani dokument'}
          </Button>
          <Button type="button" variant="ghost" onClick={onTogglePreview}>
            {previewVisible ? 'Skrij PDF predogled' : 'Predogled PDF'}
          </Button>
        </div>
      </form>

      {previewVisible && preview}
    </div>
  );
};

interface NotesManagerProps {
  notes: NoteDto[];
  activeDocumentLabel: string;
  activeDocDefaults: string[];
  onDocDefaultsChange: (defaults: string[]) => void;
  onNotesChange: (notes: NoteDto[]) => void;
}

const NotesManager: React.FC<NotesManagerProps> = ({
  notes,
  activeDocumentLabel,
  activeDocDefaults,
  onDocDefaultsChange,
  onNotesChange,
}) => {
  const [modalState, setModalState] = useState<{
    id?: string;
    title: string;
    text: string;
    category: NoteCategory;
  } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const openModal = (note?: NoteDto) => {
    setModalError(null);
    setModalState({
      id: note?.id,
      title: note?.title ?? '',
      text: note?.text ?? '',
      category: note?.category ?? 'note',
    });
  };

  const closeModal = () => {
    setModalState(null);
    setModalError(null);
  };

  const saveNote = () => {
    if (!modalState) return;
    const title = modalState.title.trim();
    const text = modalState.text.trim();
    if (!title || !text) {
      setModalError('Naslov in besedilo sta obvezna.');
      return;
    }

    if (modalState.id) {
      const updated = notes.map((note) =>
        note.id === modalState.id ? { ...note, title, text, category: modalState.category } : note
      );
      onNotesChange(updated.map((note, index) => ({ ...note, sortOrder: index })));
    } else {
      const updated = [
        ...notes,
        {
          id: generateNoteId(),
          title,
          text,
          category: modalState.category,
          sortOrder: notes.length,
        },
      ];
      onNotesChange(updated.map((note, index) => ({ ...note, sortOrder: index })));
    }

    closeModal();
  };

  const deleteNote = (id: string) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Želite izbrisati opombo?')
    ) {
      return;
    }
    const updated = notes.filter((note) => note.id !== id).map((note, index) => ({ ...note, sortOrder: index }));
    onNotesChange(updated);
  };

  const moveNote = (id: string, direction: -1 | 1) => {
    const index = notes.findIndex((note) => note.id === id);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= notes.length) return;
    const updated = [...notes];
    const [removed] = updated.splice(index, 1);
    updated.splice(target, 0, removed);
    onNotesChange(updated.map((note, idx) => ({ ...note, sortOrder: idx })));
  };

  const toggleDefault = (id: string, checked: boolean) => {
    const selected = new Set(activeDocDefaults);
    if (checked) {
      selected.add(id);
    } else {
      selected.delete(id);
    }
    const ordered = notes.map((note) => note.id).filter((noteId) => selected.has(noteId));
    onDocDefaultsChange(ordered);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={`Privzete opombe za ${activeDocumentLabel}`}>
        <div className="max-h-64 space-y-3 overflow-auto">
          {notes.length === 0 && (
            <p className="text-sm text-muted-foreground">Ni dodanih opomb.</p>
          )}
          {notes.map((note) => (
            <label key={note.id} className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={activeDocDefaults.includes(note.id)}
                onChange={(event) => toggleDefault(note.id, event.target.checked)}
              />
              <div className="space-y-1">
                <p className="font-medium text-foreground">{note.title}</p>
                <p className="text-xs text-muted-foreground">{note.text}</p>
              </div>
            </label>
          ))}
        </div>
      </Card>

      <Card title="Opombe (knjižnica)">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Upravljaj vse opombe, ki jih lahko dodaš na dokument.</p>
          <Button type="button" onClick={() => openModal()}>
            Dodaj opombo
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {notes.length === 0 && (
            <p className="text-sm text-muted-foreground">Začni z dodajanjem prve opombe.</p>
          )}
          {notes.map((note, index) => (
            <div key={note.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{note.title}</p>
                  <p className="text-xs text-muted-foreground">{noteCategoryLabels[note.category]}</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                    onClick={() => moveNote(note.id, -1)}
                    disabled={index === 0}
                  >
                    Gor
                  </button>
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                    onClick={() => moveNote(note.id, 1)}
                    disabled={index === notes.length - 1}
                  >
                    Dol
                  </button>
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 text-muted-foreground hover:text-foreground"
                    onClick={() => openModal(note)}
                  >
                    Uredi
                  </button>
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 text-destructive hover:text-destructive/80"
                    onClick={() => deleteNote(note.id)}
                  >
                    Izbriši
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{note.text}</p>
            </div>
          ))}
        </div>

        {modalState && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg space-y-4 rounded-md border border-border bg-background p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-foreground">
                {modalState.id ? 'Uredi opombo' : 'Dodaj opombo'}
              </h3>
              {modalError && <p className="text-sm text-destructive">{modalError}</p>}
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Naslov"
                  value={modalState.title}
                  onChange={(event) => setModalState((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
                />
                <label className="text-sm font-medium text-foreground">
                  Kategorija
                  <select
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                    value={modalState.category}
                    onChange={(event) =>
                      setModalState((prev) => (prev ? { ...prev, category: event.target.value as NoteCategory } : prev))
                    }
                  >
                    {Object.entries(noteCategoryLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Textarea
                label="Besedilo opombe"
                rows={5}
                value={modalState.text}
                onChange={(event) => setModalState((prev) => (prev ? { ...prev, text: event.target.value } : prev))}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={closeModal}>
                  Preklic
                </Button>
                <Button type="button" onClick={saveNote}>
                  Shrani
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
