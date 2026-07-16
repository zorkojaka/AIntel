import { useCallback, useEffect, useState } from "react";
import { Loader2, Lock, Plus } from "lucide-react";
import { parseApiEnvelope } from "@aintel/shared/utils/api-client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";

export interface ClientNote {
  _id: string;
  content: string;
  projectId: string | null;
  projectTitle: string | null;
  createdByName: string;
  createdAt: string;
}

interface ClientNotesResponse {
  clientId: string;
  notes: ClientNote[];
}

interface ClientNotesCardProps {
  projectId: string;
  /** Projekt, s katerega gledamo — zapisi z drugih projektov se posebej označijo. */
  currentProjectId?: string;
  canAdd?: boolean;
}

const dateFormatter = new Intl.DateTimeFormat("sl-SI", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : dateFormatter.format(parsed);
}

export function ClientNotesCard({ projectId, currentProjectId, canAdd = true }: ClientNotesCardProps) {
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState("");
  const [napaka, setNapaka] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/client-notes`);
      const data = await parseApiEnvelope<ClientNotesResponse>(response, "Zapisov o stranki ni bilo mogoče naložiti.");
      setNotes(data.notes ?? []);
      setNapaka(null);
    } catch (error) {
      setNapaka(error instanceof Error ? error.message : "Zapisov o stranki ni bilo mogoče naložiti.");
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    const content = draft.trim();
    if (!content || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/client-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      await parseApiEnvelope<{ note: ClientNote }>(response, "Zapisa ni bilo mogoče shraniti.");
      setDraft("");
      toast.success("Zapis shranjen k stranki.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Zapisa ni bilo mogoče shraniti.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Zapisi o stranki
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
            <Lock className="h-3 w-3" />
            interno
          </span>
        </CardTitle>
        <p className="m-0 text-sm text-muted-foreground">
          Zbrano z vseh projektov te stranke. Stranki se ne prikaže — ne v ponudbi, ne na računu, ne na portalu.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {napaka && <p className="m-0 text-sm text-destructive">{napaka}</p>}

        {loading ? (
          <p className="m-0 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Nalagam zapise …
          </p>
        ) : notes.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">Za to stranko še ni zapisov.</p>
        ) : (
          <ul className="m-0 list-none space-y-2 p-0">
            {notes.map((note) => {
              const izDrugegaProjekta = !!note.projectId && !!currentProjectId && note.projectId !== currentProjectId;
              return (
                <li key={note._id} className="rounded-md border border-border/70 bg-muted/30 p-3">
                  <p className="m-0 whitespace-pre-wrap text-sm">{note.content}</p>
                  <p className="m-0 mt-2 text-xs text-muted-foreground">
                    {note.createdByName} · {formatDate(note.createdAt)}
                    {note.projectTitle && (
                      <>
                        {" · "}
                        <span className={izDrugegaProjekta ? "font-medium text-foreground" : undefined}>
                          {izDrugegaProjekta ? `z drugega projekta: ${note.projectTitle}` : note.projectTitle}
                        </span>
                      </>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {canAdd && !napaka && (
          <div className="space-y-2 border-t border-border/70 pt-3">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Kaj si opazil pri stranki? (npr. omarica v kleti, pes na dvorišču, poseben dostop)"
              rows={3}
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={handleAdd} disabled={!draft.trim() || saving}>
                {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
                Dodaj zapis
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
