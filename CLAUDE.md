# AIntel – Project Context for AI Agent

## What is this project
AIntel is an internal business execution system for a company that installs security systems, cameras, and smart home solutions. It manages the full project lifecycle from customer inquiry to invoice.

## Core project flow
```
Stranka → Projekt → Ponudba → Potrditev → Delovni nalog + Material → Izvedba → Predaja → Račun
```

1. **Nov projekt** – prodajnik vnese stranko, zahteve, kategorije
2. **Ponudba** – postavke iz cenika (material + storitve), popusti, ekipa
3. **Potrditev** – sistem generira naročila materiala + delovni nalog (status: priprava)
4. **Priprava** – material: naročeno → prevzeto → pripravljeno; termin + ekipa
5. **Izvedba** – monterji kljukajo opravljene korake, plačilo vezano na opravljeno
6. **Predaja** – podpis stranke
7. **Račun** – generira se iz delovnega naloga
8. **Finance** – statistika, favorites, same-basket za prihodnje ponudbe

## Repo structure
```
AINTEL/
├── apps/                    # Frontend modules (Vite/Vue or React SPA)
│   ├── core-shell/          # Main shell app
│   ├── module-cenik/        # Price list module
│   ├── module-crm/          # CRM module
│   ├── module-dashboard/    # Dashboard module
│   ├── module-employees/    # Employees module
│   ├── module-finance/      # Finance module
│   ├── module-projects/     # Projects module (central)
│   └── module-settings/     # Settings module
├── backend/                 # Node.js backend
│   ├── core/                # Core app setup
│   ├── data/                # Static data / seeds
│   ├── db/                  # MongoDB connection
│   ├── middlewares/         # Express middlewares
│   ├── modules/             # Feature modules (routes + controllers + models)
│   ├── scripts/             # Utility scripts
│   ├── seeds/               # DB seed scripts
│   ├── types/               # TypeScript types
│   ├── utils/               # Helper functions
│   ├── routes.ts            # Main route registry
│   ├── loadEnv.ts           # Env loader
│   └── Dockerfile           # Docker config
└── _stage/                  # Staging environment config
```

## Tech stack
- **Backend**: Node.js + TypeScript, Express (assumed), MongoDB (Mongoose)
- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS (micro-frontend architecture)
- **Database**: MongoDB
- **Hosting**: Hetzner VPS, domain: aintel.inteligent.si
- **Container**: Docker (Dockerfile present in backend)
- **Env**: `.env` in backend root — never modify .env

## Key domain concepts
- **Projekt** – central entity, has phases/statuses
- **Ponudba** – offer with line items from Cenik
- **Delovni nalog** – work order, central execution object
- **ExecutionUnits** – individual product units with location
- **Cenik** – unified price list (products + services)
- **Material tracking** – statuses: za naročit → naročeno → prevzeto → pripravljeno
- **Vloge** – prodajnik, monter, admin, računovodja, vodstvo

## Coding rules
- TypeScript everywhere — no `any` unless absolutely necessary
- Backend modules follow existing pattern in `backend/modules/`
- Never modify `.env` file
- Never change existing DB schema without explicit instruction
- Always check existing models before creating new ones
- Frontend modules must match existing module structure in `apps/`
- Run `npm run build` after backend changes to check for TS errors
- Keep API routes RESTful and consistent with existing routes in `routes.ts`

## What NOT to do
- Do not refactor existing working code unless explicitly asked
- Do not install new npm packages without asking first
- Do not change Docker config or deployment scripts
- Do not touch `_stage/` folder
- Do not delete any files — move or archive instead

## When task is complete
1. Summarize what was changed (files + brief description)
2. List any open questions or things to verify
3. Note if tests or build check is needed
