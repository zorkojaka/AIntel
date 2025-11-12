# Debug: Rešitev za manjkajoč Tailwind dizajn v CoreShell

## Povzetek

Root cause: moduli so uporabljali prilagojene Tailwind razrede (npr. `bg-background`, `border-border`) in `@apply` na razrede, ki niso bili generirani s Tailwindom. CoreShell ni vedno procesiral modulnih CSS-ov, ker niso bili pravilno deep-exportani ali vključeni v Tailwind `content`.

Posledica: PostCSS/Tailwind je padel med razširitvijo `@apply` in CSS ni bil uporabljen, ko je modul naložen iz CoreShell.

---

## Kaj sem popravil (konkretno)

- Dodal/posodobil `apps/core-shell/tailwind.config.ts` in `apps/core-shell/postcss.config.cjs` tako, da CoreShell procesira Tailwind za vse module.
- V `apps/core-shell/src/main.tsx` uvozil modularne CSS datoteke (`@aintel/module-projects/src/globals.css` / `styles.css`, in `@aintel/module-crm/src/styles.css`).
- V `apps/module-projects/src/globals.css` zamenjal neveljavni `@apply border-border` z `border: 1px solid var(--border)` in dodal `@layer utilities` z mapiranimi util-razredi (npr. `.bg-background`, `.text-foreground`, `.border-border`) da jih Tailwind prepozna.
- Posodobil `package.json` modulov (`exports`) za deep-import CSS poti in namestil manjkajoče dev-dependece (tailwindcss, postcss, autoprefixer, @types/react, @types/react-dom).
- Prilagodil `tsconfig.json` include, da `tailwind.config.ts` in `vite.config.ts` niso izključeni iz TypeScript programa.

---

## Navodila za naprej (operativno)

1) Modulni CSS in exports
  - Vsak modul z UI naj ima jasno CSS entry v `src` (npr. `src/globals.css` ali `src/styles.css`).
  - V `package.json` modula izvozite te poti, npr:

```json
"exports": {
  "./src/globals.css": "./src/globals.css",
  "./src/styles.css": "./src/styles.css",
  ".": { "import": "./src/index.ts", "types": "./src/index.ts" }
}
```

2) Centralna Tailwind konfiguracija
  - `apps/core-shell/tailwind.config.ts` naj vključuje module v `content`:

```ts
content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx,css}',
  '../module-projects/src/**/*.{js,ts,jsx,tsx,css}',
  '../module-crm/src/**/*.{js,ts,jsx,tsx,css}',
],
```

3) PostCSS
  - `apps/core-shell/postcss.config.cjs` naj vsebuje tailwindcss in autoprefixer:

```js
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

4) Definirajte custom util razrede ali uporabljajte CSS spremenljivke
  - Če uporabljate razrede kot `bg-background`, `text-foreground`, `border-border`, definirajte jih v `@layer utilities` v modulu ali v skupnem CSS, npr:

```css
@layer utilities {
  .bg-background { background-color: var(--background); }
  .text-foreground { color: var(--foreground); }
  .border-border { border-color: var(--border); }
}
```

  - Alternativa: uporabljajte eksplicitne CSS lastnosti ali CSS spremenljivke namesto `@apply` na ne-generirane razrede.

5) Dev-deps in TypeScript
  - Namestite `tailwindcss`, `postcss`, `autoprefixer`, `@types/react`, `@types/react-dom` v projektu (root ali `apps/core-shell`).
  - Poskrbite, da `tailwind.config.ts` in `vite.config.ts` niso izključeni iz `tsconfig.json` (dodajte jih v `include`).

6) Editor
  - Namestite Tailwind CSS IntelliSense.
  - Če editor kaže lažne opozorila za unknown at-rules, lahko v `.vscode/settings.json` dodate: `{ "css.lint.unknownAtRules": "ignore" }`.

---

## Kratek checklist pri dodajanju novega modula

- [ ] Modul ima `src/globals.css` ali `src/styles.css`.
- [ ] `package.json` modula ima exports za CSS deep-imports.
- [ ] CoreShell `tailwind.config.ts` vključuje modulove `src` poti.
- [ ] CoreShell `postcss.config.cjs` vsebuje tailwindcss in autoprefixer.
- [ ] V modulih so custom util razredi definirani v `@layer utilities` ali uporabljajte eksplicitne CSS lastnosti.
- [ ] Restart `pnpm run dev:stack` in preveri `http://localhost:5174`.

Če želiš, naredim še primer `exports` in `@layer utilities` commit v repo — povej, če želiš, da to storim.
