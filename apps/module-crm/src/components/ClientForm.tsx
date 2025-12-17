import React, { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button, Input, Textarea } from "@aintel/ui";
import { z } from "zod";
import { Client, ClientFormPayload, ClientType } from "../types/client";

const POSTAL_CODE_LOOKUP: Record<string, string> = {
  "1000": "Ljubljana",
  "1129": "Ljubljana-Zalog",
  "2000": "Maribor",
  "3000": "Celje",
  "4000": "Kranj",
  "5000": "Nova Gorica",
  "6000": "Koper",
  "8000": "Novo mesto",
  "9200": "Lendava",
  "8210": "Slovenj Gradec",
  "8270": "Krško",
  "3270": "Laško",
  "1234": "SomeTown",
  "2230": "Škofja Loka",
};

const CITY_TO_CODE = Object.entries(POSTAL_CODE_LOOKUP).reduce<Record<string, string>>(
  (acc, [code, city]) => {
    acc[city.toLowerCase()] = code;
    return acc;
  },
  {},
);

const postalOptions = Object.entries(POSTAL_CODE_LOOKUP).map(([code, city]) => ({
  code,
  label: `${code} ${city}`,
}));

const clientFormSchema = z
  .object({
    name: z.string().min(1, "Naziv stranke je obvezen"),
    type: z.enum(["company", "individual"]),
    vatNumber: z.string().optional(),
    address: z.string().optional(),
    street: z.string().optional(),
    postalCode: z.string().optional(),
    postalCity: z.string().optional(),
    email: z.string().email("Neveljaven email").optional(),
    phone: z.string().optional(),
    contactPerson: z.string().optional(),
    tags: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.type === "company") {
      const vatString = values.vatNumber?.trim();
      if (!vatString) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["vatNumber"],
          message: "DDV je obvezen za podjetja",
        });
        return;
      }

      if (!/^SI\d{8}$/.test(vatString.toUpperCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["vatNumber"],
          message: "DDV mora biti v obliki SI12345678",
        });
      }
    }
  });

interface ClientFormProps {
  open: boolean;
  mode?: "create" | "edit";
  client?: Client;
  onClose: () => void;
  onSubmit: (payload: ClientFormPayload) => Promise<void>;
  onSuccess?: () => void;
}

const initialState = {
  name: "",
  type: "individual" as ClientType,
  vatNumber: "",
  street: "",
  postalCode: "",
  postalCity: "",
  email: "",
  phone: "",
  contactPerson: "",
  tags: "",
  notes: "",
};

export function ClientForm({ open, client, mode = "create", onClose, onSubmit, onSuccess }: ClientFormProps) {
  const [formValues, setFormValues] = useState(initialState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");

  const handlePostalCodeChange = (value: string) => {
    const code = value.trim();
    const city = POSTAL_CODE_LOOKUP[code];
    setFormValues((prev) => ({
      ...prev,
      postalCode: code,
      postalCity: city ?? prev.postalCity,
    }));
  };

  const handlePostalCityChange = (value: string) => {
    const trimmed = value.trim();
    const code = CITY_TO_CODE[trimmed.toLowerCase()];
    setFormValues((prev) => ({
      ...prev,
      postalCity: trimmed,
      postalCode: code ?? prev.postalCode,
    }));
  };

  useEffect(() => {
    if (!open) {
      setFormValues(initialState);
      setSubmissionError("");
      return;
    }

    if (client) {
      setFormValues({
        name: client.name,
        type: client.type,
        vatNumber: client.vatNumber ?? "",
        street: client.street ?? "",
        postalCode: client.postalCode ?? "",
        postalCity: client.postalCity ?? "",
        email: client.email ?? "",
        phone: client.phone ?? "",
        contactPerson: client.contactPerson ?? "",
        tags: client.tags.join(", "),
        notes: client.notes ?? "",
      });
    } else {
      setFormValues(initialState);
    }
  }, [client, open]);

  const title = mode === "edit" ? "Uredi stranko" : "Dodaj stranko";
  const submitLabel = mode === "edit" ? "Shrani spremembe" : "Shrani stranko";

  const handleInput = (field: keyof typeof initialState, value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const cleanValue = (value: string) => value.trim() || undefined;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmissionError("");

    const normalized = {
      name: formValues.name.trim(),
      type: formValues.type,
      vatNumber: formValues.vatNumber.trim() || undefined,
      street: cleanValue(formValues.street),
      postalCode: cleanValue(formValues.postalCode),
      postalCity: cleanValue(formValues.postalCity),
      email: cleanValue(formValues.email),
      phone: cleanValue(formValues.phone),
      contactPerson: cleanValue(formValues.contactPerson),
      tags: cleanValue(formValues.tags),
      notes: cleanValue(formValues.notes),
    };

    try {
      const parsed = clientFormSchema.parse(normalized);
      const tagArray = parsed.tags
        ? parsed.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [];

      const streetLine = parsed.street;
      const postalLine = parsed.postalCode ? `${parsed.postalCode} ${parsed.postalCity ?? ""}`.trim() : parsed.postalCity;
      const addressLine = [streetLine, postalLine].filter(Boolean).join(", ") || undefined;

      const payload: ClientFormPayload = {
        name: parsed.name,
        type: parsed.type,
        vatNumber: parsed.type === "company" && parsed.vatNumber ? parsed.vatNumber.toUpperCase() : undefined,
        address: addressLine,
        street: parsed.street,
        postalCode: parsed.postalCode,
        postalCity: parsed.postalCity,
        email: parsed.email,
        phone: parsed.phone,
        contactPerson: parsed.contactPerson,
        notes: parsed.notes,
        tags: tagArray,
      };

      setIsSubmitting(true);
      await onSubmit(payload);
      onSuccess?.();
    } catch (error) {
      if (error instanceof z.ZodError) {
        setSubmissionError(error.issues[0]?.message ?? "Neveljaven vnos");
        return;
      }

      if (error instanceof Error) {
        setSubmissionError(error.message);
        return;
      }

      setSubmissionError("Prišlo je do napake");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="client-modal__overlay" />
        <DialogPrimitive.Content className="client-modal__dialog" onOpenAutoFocus={(event) => event.preventDefault()}>
          <header className="client-modal__header">
            <h2>{title}</h2>
            <DialogPrimitive.Close asChild>
              <button type="button" className="client-modal__close" aria-label="Zapri">
                <X className="h-4 w-4" />
              </button>
            </DialogPrimitive.Close>
          </header>
          <form className="client-form" onSubmit={handleSubmit}>
            <div className="client-form__grid">
              <Input
                label="Naziv stranke"
                value={formValues.name}
                onChange={(event) => handleInput("name", event.target.value)}
                required
              />
              <label className="client-form__checkbox">
                <input
                  type="checkbox"
                  checked={formValues.type === "company"}
                  onChange={(event) => {
                    const nextType = event.target.checked ? "company" : "individual";
                    setFormValues((prev) => ({
                      ...prev,
                      type: nextType,
                      vatNumber: event.target.checked ? prev.vatNumber : "",
                    }));
                  }}
                />
                <span>Podjetje</span>
              </label>
              {formValues.type === "company" && (
                <Input
                  label="DDV"
                  placeholder="SI12345678"
                  value={formValues.vatNumber}
                  onChange={(event) => handleInput("vatNumber", event.target.value)}
                />
              )}
              <Input label="Ulica" value={formValues.street} onChange={(event) => handleInput("street", event.target.value)} />
              <Input
                label="Poštna številka"
                list="postal-codes"
                value={formValues.postalCode}
                onChange={(event) => handlePostalCodeChange(event.target.value)}
              />
              <datalist id="postal-codes">
                {postalOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </datalist>
              <Input
                label="Pošta"
                value={formValues.postalCity}
                onChange={(event) => handlePostalCityChange(event.target.value)}
              />
              <Input
                label="E-pošta"
                type="email"
                value={formValues.email}
                onChange={(event) => handleInput("email", event.target.value)}
              />
              <Input label="Telefon" value={formValues.phone} onChange={(event) => handleInput("phone", event.target.value)} />
              <Input
                label="Kontaktna oseba"
                value={formValues.contactPerson}
                onChange={(event) => handleInput("contactPerson", event.target.value)}
              />
              <Input
                label="Oznake"
                placeholder="npr. VIP, počasni plačniki"
                value={formValues.tags}
                onChange={(event) => handleInput("tags", event.target.value)}
              />
              <Textarea
                label="Opombe"
                value={formValues.notes}
                onChange={(event) => handleInput("notes", event.target.value)}
                rows={3}
              />
            </div>
            {submissionError && <p className="client-modal__error">{submissionError}</p>}
            <div className="client-modal__footer">
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" type="button">
                  Prekliči
                </Button>
              </DialogPrimitive.Close>
              <Button type="submit" disabled={isSubmitting}>
                {submitLabel}
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
