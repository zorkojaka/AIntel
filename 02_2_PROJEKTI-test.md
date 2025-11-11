## Diagnostika: Napaka 404 pri zagonu Frontenda (CoreShell)

Ta dokument opisuje korake za odpravo napake 404 na `http://localhost:5173/` pri razvoju aplikacije AIntel. Namenjen je AI agentom in razvijalcem, da zagotovijo zanesljiv prikaz CoreShell frontenda.

---

### ✅ Cilj
Frontend mora biti dostopen na `http://localhost:5173/`, kjer se prikazuje glavni CoreShell (host) s priklopljenimi moduli (CRM, Projekti ...).

---

### 🔧 Koraki za odpravo napake

#### 1. Preveri aktivni port:
```bash
lsof -i :5173
```
Preveri, ali na tem portu teče `apps/core-shell`. Če ne, nadaljuj s spodnjimi koraki.

---

#### 2. Poženi CoreShell frontend:
```bash
pnpm --filter @aintel/core-shell dev
```
Če dobis napako, popraviti moraš vite config, entry point ali manjkajoče datoteke.

---

#### 3. Preveri main.tsx:
Preveri, da obstaja `apps/core-shell/src/main.tsx` s spodnjo vsebino:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

---

#### 4. Preveri index.html:
`apps/core-shell/index.html` mora imeti:
```html
<body>
  <div id="root"></div>
</body>
```

---

#### 5. Vite konfiguracija:
`vite.config.ts` mora biti prisotna in pravilno konfigurirana za CoreShell, z ustreznim root path in output.

---

#### 6. Preveri brskalnik:
- F12 → Console: napake?
- Network → `localhost:5173/`: preveri status in response body.

---

#### 7. Testna stran:
Začasno v `index.html` dodaj:
```html
<body>
  <h1>Test stran deluje</h1>
</body>
```
Če se prikaže, frontend teče, React ne.

---

#### 8. Preveri App.tsx:
Poskrbi, da `App.tsx` vsebuje vsebino:
```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
```

---

#### 9. Poženi clean build:
```bash
pnpm --filter @aintel/core-shell clean
pnpm --filter @aintel/core-shell dev
```

---

### 💡 Dodatno:
Dodaj v `main.tsx`:
```ts
console.log('✅ CoreShell app se je zagnala')
```
Preveri, če se log izpiše v konzolo.

---

### 🚀 Ciljno stanje
Ko so zgornji koraki uspešni, mora biti CoreShell frontend viden in prikazovati delujoč UI.

---

### 💪 Agentovo dejanje
Ko je vse preverjeno in deluje:
- označi fazo kot zaključeno v `docs/TODO.md`
- naredi `git commit` z opisom npr. "Fix: frontend 404 resolved, core-shell running"
- poženi `pnpm build` za test, če je potreben produkcijski izvoz
- naredi `push` na veji trenutne faze

