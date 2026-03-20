# Mobile smoke test (installer)

## Viewport setup
- Use browser DevTools device emulation.
- Primary viewport: **360x800**.
- Secondary checks: **390x844** and **414x896**.

## Preconditions
- Login with an **installer** account.
- Ensure account has at least one assigned project with a work order in `issued` or `in-progress` state.

## Checklist

### 1) Installer dashboard
1. Open dashboard route after login.
2. Confirm there is **no horizontal page scrolling**.
3. Confirm work-order cards show: project/customer context, schedule, status badge, and a clear open/resume action.
4. Tap `Odpri / nadaljuj` on a work order.

### 2) Work order execution detail
1. Confirm work order page loads without horizontal scroll.
2. In steps/items list:
   - verify card layout on mobile,
   - toggle `Dokončano` on at least one step,
   - add/edit note,
   - adjust executed quantity.
3. Verify status indicators (material status + work order status) remain visible and readable.

### 3) Save + complete actions
1. Scroll through the work order and confirm action controls stay reachable near the bottom (sticky action bar on mobile).
2. Tap `Shrani delovni nalog` and confirm success message appears.
3. Mark all items as completed and tap `Zaključi delovni nalog`.
4. Verify status transitions to `Zaključen` and completion action becomes disabled.

### 4) Regression checks
1. Switch viewport to desktop width (`>=1024px`).
2. Confirm desktop layout remains unchanged (table layout + normal non-sticky action placement).
3. Verify no new console errors were introduced.
