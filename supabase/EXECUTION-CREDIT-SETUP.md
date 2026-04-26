# ALTIVOR — Execution Credit Setup Guide

## Overview
After PREPARE completion (status = QUALIFIED), users receive a unique one-time Stripe promotion code worth €20 toward the ALTIVOR US100 Challenge. The code expires after exactly 100 hours and can only be used once.

---

## 1. Run SQL Migration

Open **Supabase Dashboard → SQL Editor → New Query** and paste the contents of:
```
supabase/migrations/20260426_execution_credits.sql
```
Click **Run** to create the `execution_credits` table.

---

## 2. Create Stripe Coupon (if not done)

In **Stripe Dashboard → Coupons → Create**:
- **ID**: `PKngCTYj`
- **Name**: Execution Credit
- **Type**: Fixed amount — €20 off
- **Duration**: Once
- **Applies to**: ALTIVOR US100 Challenge product only

---

## 3. Enable Promotion Codes on Payment Link

In **Stripe Dashboard → Payment Links** for the US100 Challenge:
- Edit the payment link
- Under **Promotion codes** → check **Allow promotion codes**

---

## 4. Set Supabase Secrets

Using the Supabase CLI:
```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_your_key_here
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Optional: for email notifications via Resend.com
supabase secrets set RESEND_API_KEY=re_your_resend_key_here

# Optional: restrict to US100 price IDs only
supabase secrets set US100_PRICE_IDS=price_xxx,price_yyy
```

Or via **Supabase Dashboard → Edge Functions → Secrets**.

---

## 5. Deploy Edge Functions

```bash
# From project root
supabase functions deploy generate-execution-credit
supabase functions deploy stripe-webhook --no-verify-jwt
```

Note: `stripe-webhook` must be deployed with `--no-verify-jwt` since Stripe sends requests without a Supabase JWT.

---

## 6. Configure Stripe Webhook

In **Stripe Dashboard → Developers → Webhooks → Add endpoint**:
- **Endpoint URL**: `https://lssedurdadjngqbchjbj.supabase.co/functions/v1/stripe-webhook`
- **Events to send**: `checkout.session.completed`
- Copy the **Signing secret** (`whsec_...`) and set it as `STRIPE_WEBHOOK_SECRET` (step 4)

---

## Architecture

```
User completes PREPARE (10/10 compliant trades)
    ↓
Frontend (execution-credit.js) detects status = QUALIFIED
    ↓
Calls Edge Function: generate-execution-credit
    ↓
Edge Function:
  1. Verifies user JWT
  2. Checks DB — already has code? → return existing
  3. Generates ALTIVOR-XXXXXX code
  4. Creates Stripe promotion code via API (coupon PKngCTYj, 100h expiry, max 1 redemption)
  5. Saves to execution_credits table
  6. Sends email via Resend (optional)
  7. Returns code to frontend
    ↓
Frontend shows modal + caches in localStorage
    ↓
User applies code at US100 Challenge checkout
    ↓
Stripe sends checkout.session.completed webhook
    ↓
Edge Function: stripe-webhook
  1. Verifies Stripe signature
  2. Checks payment_status = paid
  3. Extracts promotion code from session discounts
  4. Marks execution_credits row: used = true, used_at, session_id, payment_intent
```

## Rules Enforced
- **One code per user** — DB unique constraint + check on generation
- **100-hour expiry** — Set via Stripe `expires_at` parameter; Stripe rejects expired codes automatically
- **Single use** — `max_redemptions: 1` in Stripe
- **Used only after payment** — Webhook marks as used, NOT frontend
- **No global discount** — Each code is unique per user with metadata tracking

## Files
| File | Purpose |
|------|---------|
| `supabase/migrations/20260426_execution_credits.sql` | Database table |
| `supabase/functions/generate-execution-credit/index.ts` | Code generation edge function |
| `supabase/functions/stripe-webhook/index.ts` | Payment confirmation webhook |
| `site/execution-credit.js` | Frontend detection, API calls, modal UI, profile widget |

## LocalStorage Keys
- `altivor-prepare-status` — PREPARE completion status (read)
- `altivor_execution_credit_{email}` — Cached credit data (write)
- `altivor_ec_modal_shown` (sessionStorage) — Prevents re-showing modal per session
