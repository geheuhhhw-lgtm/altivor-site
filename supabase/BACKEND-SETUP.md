# ALTIVOR — Production Backend Setup Guide (v2)

## Overview

Complete production backend powered by Supabase + Stripe webhooks. localStorage is **cache only** — Supabase is the sole source of truth for entitlements, trades, challenge state, scoring, Wall of Traders, weekly check-ins, and broker statements.

---

## 1. Database Tables — Two Migrations

### Migration 1 — Core Tables
Run in **Supabase Dashboard → SQL Editor → New Query**:
```
File: supabase/migrations/20260427_platform_tables.sql
```

Creates 7 tables:

| Table | Purpose | RLS |
|---|---|---|
| `user_entitlements` | Product access (webhook-only write) | SELECT own |
| `challenges` | Active challenge state | SELECT/INSERT/UPDATE own |
| `trades` | All trade submissions | SELECT/INSERT/UPDATE own |
| `challenge_attempts` | Second Life archive | SELECT/INSERT own |
| `wall_of_traders` | Verified traders (public read) | SELECT public+own |
| `weekly_checkins` | Weekly equity check-ins | SELECT/INSERT own |
| `broker_statements` | Broker statement submissions | SELECT/INSERT own |

Also creates `get_user_id_by_email()` and `set_updated_at()` trigger.

### Migration 2 — Pending Entitlements + Hardening
```
File: supabase/migrations/20260427b_pending_entitlements_hardening.sql
```

Creates:

| Table/Function | Purpose |
|---|---|
| `pending_entitlements` | Stores payments for users who haven't registered yet |
| `trade_audit_results` | Server-side per-trade audit trail |
| `claim_pending_entitlements()` | RPC function to claim on login |
| RLS hardening | Removes WoT user INSERT, adds WoT update-own-visible |

---

## 2. Supabase Secrets

Set in **Supabase Dashboard → Settings → Edge Functions → Secrets**:

| Secret | Value | Required By |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` or `sk_test_...` | Webhook |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Webhook |
| `PRODUCT_PRICE_MAP` | JSON (see below) | Webhook |

### PRODUCT_PRICE_MAP Format

```json
{
  "price_XXXXXXXXX": "prepare",
  "price_YYYYYYYYY": "frameworkPack",
  "price_ZZZZZZZZZ": "us100Framework",
  "price_AAAAAAAAA": "accessories"
}
```

**How to find Price IDs:** Stripe Dashboard → Products → click product → copy Price ID.
Fallback: amount-based matching (€29/€59/€129/€79).

---

## 3. Deploy Edge Functions

```bash
supabase functions deploy stripe-entitlement-webhook --no-verify-jwt
supabase functions deploy challenge-sync --no-verify-jwt
```

---

## 4. Stripe Webhook Configuration

**Stripe Dashboard → Developers → Webhooks → Add Endpoint:**

| Field | Value |
|---|---|
| **URL** | `https://lssedurdadjngqbchjbj.supabase.co/functions/v1/stripe-entitlement-webhook` |
| **Events** | `checkout.session.completed`, `charge.refunded`, `customer.subscription.deleted` |

Copy the Signing Secret → set as `STRIPE_WEBHOOK_SECRET`.

> Keep the existing `stripe-webhook` function for execution credits.

---

## 5. Files Created / Modified

### New Files
| File | Purpose |
|---|---|
| `supabase/migrations/20260427_platform_tables.sql` | 7 core tables + RLS |
| `supabase/migrations/20260427b_pending_entitlements_hardening.sql` | pending_entitlements + trade_audit_results + hardening |
| `supabase/functions/stripe-entitlement-webhook/index.ts` | Webhook: grant/pending/revoke entitlements |
| `supabase/functions/challenge-sync/index.ts` | Full server-side challenge engine v2 |
| `site/supabase-backend.js` | Frontend sync layer + retry queue + toasts |

### Modified Files
| File | Change |
|---|---|
| `site/page-gate.js` | Async Supabase entitlement verification |
| `site/challenge-engine.js` | Backend sync + Second Life |
| `site/challenge-completion.js` | Backend WoT trigger |
| `site/verification-trades.html` | Backend trade save + sync |

### HTML pages with `supabase-backend.js`:
index.html, prepare.html, profile.html, social-proof.html, verification.html, verification-trades.html, verification-status.html, verification-drawdown.html, verification-profit.html, verification-weekly.html, verification-statement.html

---

## 6. Data Flow Architecture

```
 ╔═══════════════════════════════════════════════════════════════╗
 ║  STRIPE PAYMENT                                               ║
 ║  User clicks Buy → Stripe Checkout → payment succeeds         ║
 ║  ↓                                                            ║
 ║  Webhook: stripe-entitlement-webhook                          ║
 ║    ├─ User exists? → INSERT user_entitlements (active)        ║
 ║    ├─ User missing? → INSERT pending_entitlements (pending)   ║
 ║    └─ Challenge product? → INSERT challenges (auto-create)    ║
 ╚═══════════════════════════════════════════════════════════════╝

 ╔═══════════════════════════════════════════════════════════════╗
 ║  LOGIN / PAGE LOAD                                            ║
 ║  supabase-backend.js auto-init:                               ║
 ║    1. Claim pending entitlements (paid before register)        ║
 ║    2. Migrate localStorage → Supabase (one-time)              ║
 ║    3. Sync: entitlements → challenge → trades → checkins      ║
 ║    4. Process retry queue (failed writes)                     ║
 ║    5. Verify entitlements (anti-tampering)                    ║
 ╚═══════════════════════════════════════════════════════════════╝

 ╔═══════════════════════════════════════════════════════════════╗
 ║  TRADE SUBMISSION                                             ║
 ║  User submits trade → saveTrade() → trades table              ║
 ║  → triggerChallengeSync() → challenge-sync edge function      ║
 ║    ├─ Classifies ALL trades server-side                       ║
 ║    ├─ Calculates challenge score + trader score               ║
 ║    ├─ Writes trade_audit_results per trade                    ║
 ║    ├─ Updates challenges table                                ║
 ║    ├─ Auto-adds to wall_of_traders on completion              ║
 ║    └─ Returns audit result + summary to frontend              ║
 ║  Frontend displays server-generated audit result              ║
 ╚═══════════════════════════════════════════════════════════════╝

 ╔═══════════════════════════════════════════════════════════════╗
 ║  FAILED WRITES → RETRY QUEUE                                  ║
 ║  If backend unavailable:                                      ║
 ║    → Save to altivor_sync_queue localStorage                  ║
 ║    → Show toast: "Saved locally. Sync pending."               ║
 ║    → Auto-retry on: page load, login, online event, 15s timer ║
 ║    → On success: remove from queue, show "Synced" toast       ║
 ╚═══════════════════════════════════════════════════════════════╝
```

---

## 7. Security Model

| Threat | Defense |
|---|---|
| Fake entitlements via DevTools | Entitlements written only by service role (webhook). page-gate.js does async verification and revokes fake localStorage keys. |
| Fake trade count / validation | challenge-sync re-classifies ALL trades server-side. Client status is overridden if inconsistent. |
| Fake challenge completion | Completion determined server-side only. WoT INSERT removed from user policies. |
| Fake Wall of Traders entry | Only service role (challenge-sync) can insert into WoT. verified=true set server-side. |
| Fake Second Life usage | Second Life tracked in challenges table. Server checks second_life_used before allowing. |
| Fake broker statement / checkins | Server counts rows for eligibility. Frontend cannot fake counts. |
| Fake challenge score | Score calculated server-side from trade data. Client value ignored. |

---

## 8. Server-Side Scoring Logic (challenge-sync v2)

### Challenge Score (starts at 100):
- 1st invalid: −6
- 2nd invalid: −8
- 3rd invalid: −10
- 4th+ invalid: −12 each
- Per warning: −2
- Overtrading day: −4
- Revenge trading: −3
- Risk inconsistency: −3
- Per valid clean trade: +1 (max +5 total)
- Below 60 = failing (hard fail if 10+ trades)
- Capped at 0–100

### Trader Score (starts at 100):
- Per invalid: −3 base, −1 escalating
- Per strike: −10
- Per warning: −2
- Per clean valid: +0.5

### Trade Classification:
- **INVALID**: no SL, risk >2%, no docs, no framework, missing fields, non-compliant checklist
- **VALIDATED WITH WARNINGS**: missing screenshot (notes ok), outside session, overtrading, revenge trading, risk inconsistency
- **STRIKE**: SL widening >15%
- **VALIDATED**: all rules pass

### Hard Fail:
- Drawdown ≥10%
- 3 strikes
- Challenge score <60 (with 10+ trades)

---

## 9. Test Scenarios

- [ ] Run BOTH migration SQL files in Supabase SQL Editor
- [ ] Set all 3 secrets
- [ ] Deploy both edge functions
- [ ] Configure Stripe webhook endpoint
- [ ] **Scenario 1**: User pays for PREPARE → PREPARE unlocks
- [ ] **Scenario 2**: User pays for US100 → 55 Trade Cycle unlocks
- [ ] **Scenario 3**: User edits localStorage entitlement → access revoked after backend check
- [ ] **Scenario 4**: Valid trade submitted → counts toward 55
- [ ] **Scenario 5**: Trade without SL → server classifies as invalid, does not count
- [ ] **Scenario 6**: Trade missing screenshot but has notes → validated with warning
- [ ] **Scenario 7**: Trade with >2% risk → invalid
- [ ] **Scenario 8**: SL widened >15% → strike issued
- [ ] **Scenario 9**: 3 strikes → challenge failed
- [ ] **Scenario 10**: Drawdown >10% → instant fail
- [ ] **Scenario 11**: 55 validated but no statement → not eligible
- [ ] **Scenario 12**: 55 + 8 checkins + 6% + statement → ready for verification
- [ ] **Scenario 13**: Completed user appears on Wall of Traders
- [ ] **Scenario 14**: Failed user uses Second Life once → challenge resets
- [ ] **Scenario 15**: Second fail → requires repurchase
- [ ] **Scenario 16**: Backend offline → retry queue stores and syncs later
- [ ] **Scenario 17**: User pays before registering → pending entitlement claimed on login
- [ ] **Scenario 18**: Cross-device login → all data loads from Supabase
- [ ] **Scenario 19**: Refund processed → entitlement revoked
