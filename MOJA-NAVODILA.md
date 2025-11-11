
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

---

## 🚧 Git – varnostna kopija lokalnih sprememb

### 🧱 1. Ustvari lokalno varnostno kopijo
```bash
mkdir ../AIntel_backup
cp -r . ../AIntel_backup
```

### 🧱 2. Shrani v novo Git vejo (opcijsko)
```bash
git checkout -b varnostna-kopija
git add .
git commit -m "Varnostna kopija"
git push --set-upstream origin varnostna-kopija
```

---

## 🚀 Zagon aplikacije (lokalno)

### 📦 1. Namesti odvisnosti
```bash
pnpm install
```

### 💻 2. Zaženi backend (v mapi `backend/`)
```bash
cd backend
pnpm run dev
```

### 🖥️ 3. Zaženi frontend (iz root mape)
```bash
pnpm run dev:stack
```

- Odpri: http://localhost:5173
- Backend API: http://localhost:3000

---

## 📁 `.gitignore` (da ne objaviš smeti)

V korenu projekta dodaj `.gitignore` s tem:
```gitignore
node_modules
dist
.env
.DS_Store
.vscode
*.log
*.test.ts
```

