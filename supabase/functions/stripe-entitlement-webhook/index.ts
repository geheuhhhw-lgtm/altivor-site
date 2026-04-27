// ═══════════════════════════════════════════════════════════════════════════
// ALTIVOR — Stripe Entitlement Webhook (Supabase Edge Function)
// ─────────────────────────────────────────────────────────────────────────
// Handles checkout.session.completed → writes user_entitlements row.
// Also handles execution credit redemption (backward compat).
//
// Required Supabase Secrets:
//   STRIPE_SECRET_KEY       — sk_live_... or sk_test_...
//   STRIPE_WEBHOOK_SECRET   — whsec_...
//   PRODUCT_PRICE_MAP       — JSON: {"price_xxx":"prepare","price_yyy":"frameworkPack",...}
//
// Deploy:
//   supabase functions deploy stripe-entitlement-webhook --no-verify-jwt
//
// Stripe Dashboard → Webhooks → Add endpoint:
//   URL:    https://lssedurdadjngqbchjbj.supabase.co/functions/v1/stripe-entitlement-webhook
//   Events: checkout.session.completed, customer.subscription.deleted,
//           charge.refunded
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/* ── Environment ────────────────────────────────────────────────────────── */
const STRIPE_SECRET_KEY     = Deno.env.get('STRIPE_SECRET_KEY')!
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Map Stripe Price IDs → ALTIVOR product keys.
// Set PRODUCT_PRICE_MAP secret as JSON, e.g.:
// {"price_1Qxxx":"prepare","price_1Qyyy":"frameworkPack","price_1Qzzz":"us100Framework","price_1Qaaa":"accessories"}
let PRICE_MAP: Record<string, string> = {}
try {
  const raw = Deno.env.get('PRODUCT_PRICE_MAP')
  if (raw) PRICE_MAP = JSON.parse(raw)
} catch { /* ignore parse errors */ }

/* ── Stripe signature verification (HMAC-SHA256) ────────────────────────── */
async function verifySignature(payload: string, sig: string, secret: string): Promise<boolean> {
  const parts = sig.split(',')
  const ts  = parts.find(p => p.startsWith('t='))?.slice(2)
  const v1  = parts.find(p => p.startsWith('v1='))?.slice(3)
  if (!ts || !v1) return false
  if (Math.abs(Date.now() / 1000 - parseInt(ts, 10)) > 300) return false

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${payload}`))
  const expected = Array.from(new Uint8Array(signed)).map(b => b.toString(16).padStart(2, '0')).join('')
  return expected === v1
}

/* ── Stripe API helper ──────────────────────────────────────────────────── */
async function stripeGet(path: string) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  })
  return res.json()
}

/* ── Resolve product_key from Checkout Session line items ───────────────── */
async function resolveProduct(sessionId: string): Promise<string | null> {
  // 1. Check session metadata first (most reliable if configured)
  const session = await stripeGet(`/checkout/sessions/${sessionId}`)
  if (session.metadata?.product_key) return session.metadata.product_key

  // 2. Fall back to Price ID → product_key mapping
  const lineItems = await stripeGet(`/checkout/sessions/${sessionId}/line_items`)
  const items = lineItems?.data || []

  for (const li of items) {
    const priceId = li.price?.id
    if (priceId && PRICE_MAP[priceId]) return PRICE_MAP[priceId]
  }

  // 3. Heuristic: match by amount (cents) — fallback only
  const amountTotal = session.amount_total || 0
  const currency = (session.currency || '').toLowerCase()
  if (currency === 'eur') {
    if (amountTotal === 2900)  return 'prepare'
    if (amountTotal === 5900)  return 'frameworkPack'
    if (amountTotal === 12900) return 'us100Framework'
    if (amountTotal === 7900)  return 'accessories'
  }

  return null
}

/* ── Main handler ───────────────────────────────────────────────────────── */
serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  try {
    const body = await req.text()
    const sig = req.headers.get('stripe-signature')
    if (!sig) return new Response('Missing signature', { status: 400 })
    if (!(await verifySignature(body, sig, STRIPE_WEBHOOK_SECRET))) {
      return new Response('Invalid signature', { status: 400 })
    }

    const event = JSON.parse(body)
    console.log(`[Webhook] ${event.type} (${event.id})`)

    // ═══════════════════════════════════════════════════════════════════════
    // EVENT: checkout.session.completed → grant entitlement
    // ═══════════════════════════════════════════════════════════════════════
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      if (session.payment_status !== 'paid') {
        return json({ received: true, action: 'skipped_unpaid' })
      }

      const email = (session.customer_details?.email || session.customer_email || '').trim().toLowerCase()
      if (!email) {
        console.error('[Webhook] No customer email in session', session.id)
        return json({ received: true, action: 'no_email' })
      }

      // Resolve product
      const productKey = await resolveProduct(session.id)
      if (!productKey) {
        console.warn('[Webhook] Could not resolve product for session', session.id)
        return json({ received: true, action: 'unknown_product' })
      }

      // Lookup user_id by email
      const { data: userId } = await supabase.rpc('get_user_id_by_email', { lookup_email: email })

      if (!userId) {
        console.warn(`[Webhook] No auth user found for ${email} — creating pending entitlement`)

        // Check idempotency on pending table too
        const { data: existingPending } = await supabase
          .from('pending_entitlements')
          .select('id')
          .eq('stripe_checkout_session_id', session.id)
          .maybeSingle()

        if (existingPending) {
          return json({ received: true, action: 'pending_already_exists' })
        }

        const { error: pendingErr } = await supabase
          .from('pending_entitlements')
          .insert({
            email,
            product_key: productKey,
            stripe_customer_id: session.customer || null,
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: session.payment_intent || null,
            amount_total: session.amount_total || null,
            currency: session.currency || null,
            status: 'pending',
          })

        if (pendingErr) {
          console.error('[Webhook] Failed to insert pending entitlement:', pendingErr)
          return json({ error: 'pending_insert_failed' }, 500)
        }

        console.log(`[Webhook] ✓ Pending entitlement created: ${email} → ${productKey}`)
        return json({ received: true, action: 'pending_entitlement_created', email, product: productKey })
      }

      // Idempotency: skip if this session was already processed
      const { data: existing } = await supabase
        .from('user_entitlements')
        .select('id')
        .eq('stripe_checkout_session_id', session.id)
        .maybeSingle()

      if (existing) {
        console.log(`[Webhook] Session ${session.id} already processed — skipping`)
        return json({ received: true, action: 'already_processed' })
      }

      // Determine expiration (accessories = subscription, others = permanent)
      let expiresAt: string | null = null
      if (productKey === 'accessories' && session.mode === 'subscription') {
        // Will be managed by subscription lifecycle events
        expiresAt = null
      }

      // Insert entitlement
      const { error: insertErr } = await supabase
        .from('user_entitlements')
        .insert({
          user_id: userId,
          email,
          product_key: productKey,
          stripe_customer_id: session.customer || null,
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: session.payment_intent || null,
          status: 'active',
          purchased_at: new Date().toISOString(),
          expires_at: expiresAt,
        })

      if (insertErr) {
        console.error('[Webhook] Failed to insert entitlement:', insertErr)
        return json({ error: 'insert_failed' }, 500)
      }

      console.log(`[Webhook] ✓ Entitlement granted: ${email} → ${productKey} (session: ${session.id})`)

      // If challenge product, auto-create challenge record
      if (productKey === 'frameworkPack' || productKey === 'us100Framework') {
        const { data: existingChallenge } = await supabase
          .from('challenges')
          .select('id')
          .eq('user_id', userId)
          .not('status', 'in', '("failed","invalidated")')
          .maybeSingle()

        if (!existingChallenge) {
          const { error: chErr } = await supabase
            .from('challenges')
            .insert({
              user_id: userId,
              product_key: productKey,
              status: 'active',
              attempt_number: 1,
            })
          if (chErr) {
            console.error('[Webhook] Failed to create challenge:', chErr)
          } else {
            console.log(`[Webhook] ✓ Challenge created for ${email}`)
          }
        }
      }

      // Also handle execution credit redemption (backward compat)
      const totalDiscount = session.total_details?.amount_discount || 0
      if (totalDiscount > 0) {
        await handleExecutionCredit(supabase, session)
      }

      return json({ received: true, action: 'entitlement_granted', product: productKey })
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EVENT: charge.refunded → revoke entitlement
    // ═══════════════════════════════════════════════════════════════════════
    if (event.type === 'charge.refunded') {
      const charge = event.data.object
      const paymentIntent = charge.payment_intent

      if (paymentIntent) {
        const { error } = await supabase
          .from('user_entitlements')
          .update({ status: 'refunded', updated_at: new Date().toISOString() })
          .eq('stripe_payment_intent_id', paymentIntent)

        if (!error) {
          console.log(`[Webhook] ✓ Entitlement revoked (refund) for PI: ${paymentIntent}`)
        }

        // Also refund any pending entitlements
        await supabase
          .from('pending_entitlements')
          .update({ status: 'refunded' })
          .eq('stripe_payment_intent_id', paymentIntent)
          .eq('status', 'pending')
      }
      return json({ received: true, action: 'refund_processed' })
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EVENT: customer.subscription.deleted → cancel accessories
    // ═══════════════════════════════════════════════════════════════════════
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object
      const customerId = sub.customer

      if (customerId) {
        const { error } = await supabase
          .from('user_entitlements')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('stripe_customer_id', customerId)
          .eq('product_key', 'accessories')
          .eq('status', 'active')

        if (!error) {
          console.log(`[Webhook] ✓ Accessories cancelled for customer: ${customerId}`)
        }
      }
      return json({ received: true, action: 'subscription_cancelled' })
    }

    // Unhandled event type
    return json({ received: true, action: 'ignored' })

  } catch (err) {
    console.error('[Webhook] Error:', err)
    return json({ error: 'processing_failed' }, 500)
  }
})

/* ── Execution credit backward compat ───────────────────────────────────── */
async function handleExecutionCredit(supabase: any, session: any) {
  try {
    const full = await stripeGet(`/checkout/sessions/${session.id}?expand[]=total_details.breakdown`)
    const discounts = full.total_details?.breakdown?.discounts || []
    const promoIds: string[] = discounts
      .filter((d: any) => d.discount?.promotion_code)
      .map((d: any) => d.discount.promotion_code)

    for (const pid of promoIds) {
      const { data: credit } = await supabase
        .from('execution_credits')
        .select('*')
        .eq('stripe_promotion_code_id', pid)
        .eq('used', false)
        .maybeSingle()

      if (credit) {
        await supabase
          .from('execution_credits')
          .update({
            used: true,
            used_at: new Date().toISOString(),
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: session.payment_intent,
          })
          .eq('id', credit.id)
        console.log(`[Webhook] ✓ Execution credit ${credit.promotion_code} marked used`)
      }
    }
  } catch (e) {
    console.warn('[Webhook] Execution credit processing error:', e)
  }
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
