
# Navodila za delo z GitHub in zagon aplikacije

## 🔄 Git / GitHub – dnevno delo

### 📥 1. Kloniranje obstoječega repozitorija
```bash
git clone https://github.com/zorkojaka/AIntel.git
cd AIntel
```

### 🌿 2. Ustvari novo vejo (za novo fazo ali modul)
```bash
git checkout -b faza-3-nastavitve
```

### 💾 3. Shrani svoje spremembe
```bash
git status
git add .
git commit -m "Faza 3: začetek nastavitev"
```

### 🚀 4. Objavi vejo na GitHub
```bash
git push --set-upstream origin faza-3-nastavitve
```

### 🔄 5. Združevanje v glavno vejo (na koncu faze)
1. Pojdi na GitHub: https://github.com/zorkojaka/AIntel
2. Ustvari Pull request iz svoje veje → `main`
3. Preglej, klikni **Merge** → `Confirm`

> Staro vejo lahko pustiš kot arhiv faze ali izbrišeš.



## 🚀 Zagon aplikacije (lokalno)

### 📦 1. Namesti odvisnosti
```bash
pnpm install
```

### 💻 2. Zaženi backend (v mapi `backend/`)
```bash
cd backend
pnpm run build
pnpm run dev
```

### 🖥️ 3. Zaženi frontend (iz root mape)
```bash
pnpm run dev:stack

pnpm --filter aintel-backend build

pnpm --filter @aintel/core-shell build
pnpm --filter @aintel/module-crm build
pnpm --filter @aintel/module-projects build
pnpm --filter @aintel/module-cenik build
pnpm --filter @aintel/module-settings build

posamezno:
pnpm --filter @aintel/core-shell dev
pnpm --filter @aintel/module-crm dev
pnpm --filter @aintel/module-projects dev
pnpm --filter @aintel/module-cenik dev
pnpm --filter @aintel/module-settings dev
```


