import React, { FormEvent, useMemo, useState } from 'react';
import { Button, Card, Input, Textarea } from '@aintel/ui';
import type { CommunicationAttachmentType, CommunicationTemplate } from '../types';

type EditableTemplate = Omit<CommunicationTemplate, 'id' | 'createdAt' | 'updatedAt'>;

const ATTACHMENT_OPTIONS: Array<{ value: CommunicationAttachmentType; label: string }> = [
  { value: 'offer_pdf', label: 'PDF ponudbe' },
  { value: 'project_pdf', label: 'PDF projekta' },
  { value: 'work_order_confirmation_pdf', label: 'PDF potrdila delovnega naloga' },
];

const TEMPLATE_CATEGORY_OPTIONS = [
  { value: 'offer_send', label: 'Pošiljanje ponudbe' },
  { value: 'work_order_confirmation_send', label: 'Pošiljanje potrdila delovnega naloga' },
] as const;

function createEmptyTemplate(): EditableTemplate {
  return {
    key: '',
    name: '',
    category: 'offer_send',
    subjectTemplate: '',
    bodyTemplate: '',
    defaultAttachments: [],
    isActive: true,
  };
}

interface CommunicationTemplatesSectionProps {
  templates: CommunicationTemplate[];
  onCreate: (value: EditableTemplate) => Promise<void>;
  onUpdate: (templateId: string, value: EditableTemplate) => Promise<void>;
  onDelete: (templateId: string) => Promise<void>;
}

export const CommunicationTemplatesSection: React.FC<CommunicationTemplatesSectionProps> = ({
  templates,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const [draft, setDraft] = useState<EditableTemplate>(createEmptyTemplate());
  const [savingDraft, setSavingDraft] = useState(false);
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, EditableTemplate>>({});

  const sortedTemplates = useMemo(
    () => templates.slice().sort((a, b) => a.name.localeCompare(b.name, 'sl-SI')),
    [templates]
  );

  const updateDraftAttachment = (attachment: CommunicationAttachmentType, checked: boolean) => {
    setDraft((prev) => ({
      ...prev,
      defaultAttachments: checked
        ? Array.from(new Set([...prev.defaultAttachments, attachment]))
        : prev.defaultAttachments.filter((value) => value !== attachment),
    }));
  };

  const updateTemplateAttachment = (
    templateId: string,
    attachment: CommunicationAttachmentType,
    checked: boolean
  ) => {
    setEditing((prev) => {
      const current = prev[templateId] ?? createEmptyTemplate();
      return {
        ...prev,
        [templateId]: {
          ...current,
          defaultAttachments: checked
            ? Array.from(new Set([...(current.defaultAttachments ?? []), attachment]))
            : (current.defaultAttachments ?? []).filter((value) => value !== attachment),
        },
      };
    });
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingDraft(true);
    try {
      await onCreate({
        ...draft,
        key: draft.key.trim().toLowerCase(),
        name: draft.name.trim(),
        subjectTemplate: draft.subjectTemplate.trim(),
        bodyTemplate: draft.bodyTemplate.trim(),
      });
      setDraft(createEmptyTemplate());
    } finally {
      setSavingDraft(false);
    }
  };

  const handleUpdate = async (templateId: string) => {
    const payload = editing[templateId];
    if (!payload) {
      return;
    }
    setSavingTemplateId(templateId);
    try {
      await onUpdate(templateId, {
        ...payload,
        key: payload.key.trim().toLowerCase(),
        name: payload.name.trim(),
        subjectTemplate: payload.subjectTemplate.trim(),
        bodyTemplate: payload.bodyTemplate.trim(),
      });
    } finally {
      setSavingTemplateId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card title="Email predloge">
        <form className="space-y-4" onSubmit={handleCreate}>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Naziv"
              value={draft.name}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
            <Input
              label="Ključ"
              value={draft.key}
              onChange={(event) => setDraft((prev) => ({ ...prev, key: event.target.value }))}
              required
            />
            <label className="space-y-2 text-sm">
              <span className="font-medium">Kategorija</span>
              <select
                value={draft.category}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, category: event.target.value as EditableTemplate['category'] }))
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              >
                {TEMPLATE_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) => setDraft((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              Predloga je aktivna
            </label>
          </div>
          <Input
            label="Zadeva"
            value={draft.subjectTemplate}
            onChange={(event) => setDraft((prev) => ({ ...prev, subjectTemplate: event.target.value }))}
            required
          />
          <Textarea
            rows={6}
            placeholder="Pozdravljeni {{customer.name}}, ..."
            value={draft.bodyTemplate}
            onChange={(event) => setDraft((prev) => ({ ...prev, bodyTemplate: event.target.value }))}
            required
          />
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">Privzete priloge</div>
            <div className="flex flex-wrap gap-3">
              {ATTACHMENT_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.defaultAttachments.includes(option.value)}
                    onChange={(event) => updateDraftAttachment(option.value, event.target.checked)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Placeholderji: {'{{customer.name}}'}, {'{{customer.email}}'}, {'{{project.name}}'}, {'{{offer.number}}'}, {'{{offer.total}}'},
            {' {{workOrder.identifier}}'}, {'{{confirmation.date}}'}, {'{{company.name}}'}, {'{{sender.name}}'}, {'{{sender.email}}'},
            {'{{sender.phone}}'}, {'{{sender.role}}'}
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={savingDraft}>
              {savingDraft ? 'Shranjujem ...' : 'Dodaj predlogo'}
            </Button>
          </div>
        </form>
      </Card>

      {sortedTemplates.map((template) => {
        const current = editing[template.id] ?? {
          key: template.key,
          name: template.name,
          category: template.category,
          subjectTemplate: template.subjectTemplate,
          bodyTemplate: template.bodyTemplate,
          defaultAttachments: template.defaultAttachments,
          isActive: template.isActive,
        };

        return (
          <Card key={template.id} title={template.name}>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Naziv"
                  value={current.name}
                  onChange={(event) =>
                    setEditing((prev) => ({
                      ...prev,
                      [template.id]: { ...current, name: event.target.value },
                    }))
                  }
                />
                <Input
                  label="Ključ"
                  value={current.key}
                  onChange={(event) =>
                    setEditing((prev) => ({
                      ...prev,
                      [template.id]: { ...current, key: event.target.value },
                    }))
                  }
                />
                <label className="space-y-2 text-sm">
                  <span className="font-medium">Kategorija</span>
                  <select
                    value={current.category}
                    onChange={(event) =>
                      setEditing((prev) => ({
                        ...prev,
                        [template.id]: {
                          ...current,
                          category: event.target.value as EditableTemplate['category'],
                        },
                      }))
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {TEMPLATE_CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={current.isActive}
                    onChange={(event) =>
                      setEditing((prev) => ({
                        ...prev,
                        [template.id]: { ...current, isActive: event.target.checked },
                      }))
                    }
                  />
                  Predloga je aktivna
                </label>
              </div>
              <Input
                label="Zadeva"
                value={current.subjectTemplate}
                onChange={(event) =>
                  setEditing((prev) => ({
                    ...prev,
                    [template.id]: { ...current, subjectTemplate: event.target.value },
                  }))
                }
              />
              <Textarea
                rows={6}
                value={current.bodyTemplate}
                onChange={(event) =>
                  setEditing((prev) => ({
                    ...prev,
                    [template.id]: { ...current, bodyTemplate: event.target.value },
                  }))
                }
              />
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">Privzete priloge</div>
                <div className="flex flex-wrap gap-3">
                  {ATTACHMENT_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={current.defaultAttachments.includes(option.value)}
                        onChange={(event) => updateTemplateAttachment(template.id, option.value, event.target.checked)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={() => void handleUpdate(template.id)} disabled={savingTemplateId === template.id}>
                  {savingTemplateId === template.id ? 'Shranjujem ...' : 'Shrani spremembe'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void (async () => {
                    setDeletingTemplateId(template.id);
                    try {
                      await onDelete(template.id);
                    } finally {
                      setDeletingTemplateId(null);
                    }
                  })()}
                  disabled={deletingTemplateId === template.id}
                >
                  {deletingTemplateId === template.id ? 'Brišem ...' : 'Izbriši'}
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};
