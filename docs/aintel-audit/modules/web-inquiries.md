# Module: web-inquiries (backend) + web-widget (frontend)

Reviewed at `c0afad8` — depth: deep. This branch's feature module.

## Purpose
Public lead intake from inteligent.si with a fully automated quote engine:
inquiry → CRM client → project → zahteva → priced offer → email, with photo upload,
customer next-step choice, and public reviews endpoints. Admin side: inquiry list,
settings (which cenik products the engine uses per pillar), review moderation.

## Surface
- Public `/api/public/*` (mounted pre-CORS/auth in `core/app.ts`, X-API-Key +
  in-memory rate limit): options, products (cached 10 min), inquiries (+photos,
  next-step), clients/equipment (portal), reviews (list/by-token GET+POST).
- Admin `/api/web-inquiries` (ADMIN, SALES): list, settings GET/PUT, reviews list +
  status PUT.
- Service `web-inquiry.service.ts` (943): payload validation per pillar
  (videonadzor/wifi kamere/alarm/domofon/pametni dom), find-or-create client,
  project creation (+km calc), zahteva builders per pillar, recorder/disk selection
  from cenik classification, discount by offer value, async offer email.
- Widget `apps/web-widget/videonadzor-widget.js` — vanilla JS, self-contained,
  configured via `window.AINTEL`.

## Strengths
- Best input validation in the codebase (structured `WebInquiryError` with codes).
- End-to-end automation is the strongest expression of the "wheel" vision to date.
- Settings-driven product selection (not hardcoded product ids) with clear
  NOT_CONFIGURED errors.

## Problems
1. **S1 (Critical)**: same shared API key gates browser widget and the
   customer-equipment endpoint; key published in website HTML. Split + rotate.
2. Rate limit in-memory/per-process, keyed by spoofable XFF; no captcha → spam can
   mass-create clients/projects/emails (S10).
3. Reaches into 6 modules incl. dynamic model imports (TD-C2); equipment endpoint
   joins client→projects by `customer.name` (TD-D1).
4. Pillar logic is Inteligent-specific by design — fine, but should live behind an
   "intake engine" interface for productization (CORE_VS_CUSTOM).
5. Photos: MIME-only filter; public upload remains allowed for inquiry intake, but
   stored `/uploads` reads now require an authenticated AIntel session (S2 resolved by
   AIN-P0-03).

## Reuse potential
The intake pattern (form → validated payload → configured engine → offer) is highly
reusable; the pillar rules are configuration to extract.

## Confidence
Confirmed for routes/validation; engine internals High confidence.
