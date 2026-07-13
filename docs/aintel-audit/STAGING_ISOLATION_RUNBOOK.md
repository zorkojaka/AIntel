# Staging Isolation Runbook

AIN-P1-01 separates staging from production data and prevents staging emails from
reaching customers.

## Required staging environment

Set these in the staging `.env` outside git:

```bash
AINTEL_ENV=staging
MONGO_DB=inteligent_staging
AINTEL_EMAIL_TRAP_TO=<internal-trap-mailbox>
AINTEL_EMAIL_SUBJECT_PREFIX=[STAGING]
```

Keep `MONGO_URI` pointed at Atlas only if the Atlas user is allowed to access the
staging database. Do not reuse `MONGO_DB=inteligent` in staging. The backend now refuses
to boot when `AINTEL_ENV=staging` (or `AINTEL_DEPLOY_ENV=staging` / `APP_ENV=staging`)
is paired with the production database name.

## Owner-run data copy

The agent must not run this against Atlas. Jaka runs it manually after confirming the
source and target database names:

1. Take a fresh Atlas backup/snapshot of production database `inteligent`.
2. Restore or copy it into `inteligent_staging`.
3. Rotate or redact any staging-only secrets outside Mongo if copied operationally.
4. Start staging with `AINTEL_ENV=staging` and `MONGO_DB=inteligent_staging`.
5. Confirm startup logs show `database = inteligent_staging`.
6. Send one staging email and confirm it arrives only at `AINTEL_EMAIL_TRAP_TO` with
   the `[STAGING]` subject prefix and original recipients listed in the message body.

## Email behavior

When `AINTEL_EMAIL_TRAP_TO` is set, all outgoing AIntel emails are redirected to that
mailbox, and `cc`/`bcc` are cleared. When `AINTEL_EMAIL_SUBJECT_PREFIX` is set, the
prefix is prepended to outgoing subjects. Both settings are safe in local/staging and
must not be set in production.

## Verification

Repository-side tests:

```bash
pnpm test
```

Operational verification is owner-owned because it requires staging `.env`, Atlas, PM2,
and mailbox access.
