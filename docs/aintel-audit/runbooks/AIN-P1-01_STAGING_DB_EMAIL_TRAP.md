# AIN-P1-01 Runbook — Staging DB Split + Email Trap

Status: agent code/docs support added; owner env/ops rollout still required.

## Goal

Staging must not write to production MongoDB data and staging email sends must be
clearly marked and redirected to a controlled trap inbox.

## Code Support

- AIntel already selects Mongo database name from `MONGO_DB`
  (`backend/db/mongo.ts`) and logs the selected database name at startup.
- AIN-P1-01 adds a central email trap in
  `backend/modules/communication/services/email-transport.service.ts`.
- When `AINTEL_EMAIL_TRAP_TO` is set, all email sent through AIntel's shared
  `sendEmail()` helper is redirected to that address, `cc`/`bcc` are removed, subject
  is prefixed, and original recipients are preserved in `X-AIntel-Original-*` headers.
- The trap covers project communication emails, web-inquiry offer email, and review
  request email because these paths use the shared transport.

## Owner Rollout

Do not paste secrets into docs, tickets, or chat.

1. Create a staging Mongo database name, for example `aintel_staging`.
2. Update the staging runtime environment only:
   - `MONGO_DB=aintel_staging`
   - keep `MONGO_URI` pointed at the approved Atlas cluster/connection string
   - `AINTEL_EMAIL_TRAP_TO=<controlled trap inbox>`
   - `AINTEL_EMAIL_SUBJECT_PREFIX=[AINTEL STAGING]`
3. Keep production runtime on `MONGO_DB=inteligent` and do not set
   `AINTEL_EMAIL_TRAP_TO` in production.
4. Deploy/restart staging through the normal owner-controlled process.
5. Confirm startup logs show the staging database name, not `inteligent`.
6. Send one controlled staging email and verify:
   - it arrives only at the trap inbox,
   - subject starts with `[AINTEL STAGING]`,
   - original recipient is present only in `X-AIntel-Original-To`.

## Data Copy Guidance

Because staging currently shared production data historically, data copy must be an
owner-run operation. Use a conscious backup/restore/export/import procedure outside the
app process; do not run application seed/migration scripts against the shared
production database from staging.

Recommended policy:

- copy only a minimal sanitized subset when possible,
- never copy secrets into repository files,
- document the exact source/target database names and timestamp in a private ops note,
- run `pnpm test` only with `mongodb-memory-server`, not against Atlas.

## Rollback

- To stop the email trap in staging, remove `AINTEL_EMAIL_TRAP_TO` and restart staging.
- To return staging to the previous database, set `MONGO_DB=inteligent` and restart
  staging. This reintroduces the S5 risk and must be treated as an explicit rollback.

## Acceptance Evidence

AIN-P1-01 can be marked done only after owner verifies:

- staging startup logs show a non-production `MONGO_DB`,
- a staging write lands in the staging database only,
- a staging email is redirected and marked by the trap,
- production email behavior is unchanged.
