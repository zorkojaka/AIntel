
# FAZA 1.2 – CRM UI + Core Shell + Dizajn Infrastruktura

## 🎯 Cilj

Vzpostaviti celoten osnovni UI sistem:
- modularen dizajn
- dizajnerska infrastruktura (tokens, CSS var, Tailwind preset)
- delujoča CRM UI (osnovni obrazci, seznami, detajli)
- Core shell (layout, menu, priklop modulov)
- skupna UI knjižnica

---

## 🧱 Tehnologije

- **Monorepo**: pnpm + workspaces
- **Framework**: React + TypeScript + Tailwind
- **Modularizacija**: apps/ + packages/
- **UI knjižnica**: packages/ui
- **Dizajn sistem**: packages/theme (tokens + CSS var)
- **Storybook** za prikaz komponent

---

## 📁 Struktura

```bash
repo/
  apps/
    core-shell/            # Glavna app z layoutom in routerjem
    module-crm/            # CRM UI komponenta (UI + logika)
  packages/
    ui/                    # Skupne UI komponente (Button, Table, Input …)
    theme/                 # CSS var, dizajn tokens, applyTheme()
    icons/                 # (če potrebujemo SVG)
    utils/                 # shared helperji
```

---

## 1. Monorepo Setup

- Inicializiraj monorepo z `pnpm` in dodaj `pnpm-workspace.yaml`
- Vsaka app in package ima svoj `package.json`
- Root `package.json` naj vsebuje skupne skripte in dependencies

---

## 2. packages/theme/

- Ustvari `tokens.ts` z vsemi barvami, spacingom, fonti, radiusi …
- Ustvari `styles.css` z `:root` CSS var definicijami
- Exportaj `applyTheme()` helper za aplikacijo teme (light/dark)

📌 Vsa stilizacija se mora opirati na `var(--color-...)`, ne hex!

---

## 3. packages/ui/

- Tailwind preset z referenco na CSS var
- Komponente:
  - `Button`
  - `Input`
  - `DataTable`
  - `Card`
  - `Heading`, `Text`
- Vsaka komponenta ima svoj folder:
  - `Component.tsx`, `Component.test.tsx`, `index.ts`

⚠️ Komponente naj bodo brez domenskih podatkov (npr. noben `projectId`)

---

## 4. apps/core-shell/

- Postavi `CoreLayout.tsx` (sidebar + topbar + children)
- Postavi router (npr. React Router ali Next.js App Router)
- Sidebar naj dinamično priklaplja `manifest` modulov
- Naj prikazuje CRM (če je manifest naložen)
- Dodaj `.theme-light` razred na `html` ali `body`

---

## 5. apps/module-crm/

- Izvaža `manifest.ts` z:
  - `id`, `version`, `navItems`, `routes`
- Komponente za:
  - `OsebeList`, `PodjetjaList`
  - `NovaOsebaForm`, `NovoPodjetjeForm`
  - `DetajlPodjetja`
- Naj uporablja komponente iz `packages/ui`

---

## 6. Dokumentacija in Testiranje

- Vsaka komponenta ima:
  - story (`.stories.tsx`)
  - test (`.test.tsx`)
  - changelog preko `changesets`
- Dodaj `docs/faze/01-2-CRM-UI.md`
- Posodobi `ARHITEKTURA.md` in `KOORDINACIJA.md`

---

## ✅ Checklista

- [ ] `pnpm` monorepo deluje (`pnpm install`, `pnpm dev`)
- [ ] `theme` uporablja tokens in CSS var
- [ ] `ui` ima vsaj 4 komponente z testom in storyjem
- [ ] `core-shell` prikazuje layout + meni + CRM
- [ ] `module-crm` prikazuje forme in sezname
- [ ] `docs/TODO.md` označen napredek
- [ ] Lokalni `npm run dev` backend + frontend delujeta

---

## 🧠 Pravila za agente

1. Vsi dizajni uporabljajo `packages/theme`
2. Komponente gredo v `ui` samo če so generične
3. Nikoli ne uporabljaj hex vrednosti direktno
4. Modul `crm` se NE povezuje direktno z drugimi
5. Vsak commit dopolni `TODO.md` in doda poročilo v `KOORDINACIJA.md`

---

## 🧪 Test scenariji

- [ ] `/status` prikazuje povezavo z MongoDB
- [ ] `/crm/osebe` prikazuje osebe
- [ ] Dodajanje podjetja in osebe deluje
- [ ] Tema deluje (svetla / temna)
- [ ] UI izgleda konsistentno s CSS var

---

Po uspešno zaključenem koraku:
- Commit veje `faza/1-2-crm-ui`
- PR na `main` z opisom “Faza 1.2: CRM UI + Core Shell + Dizajn sistem”
