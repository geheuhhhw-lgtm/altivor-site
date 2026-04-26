// ═══════════════════════════════════════════════════════════════════════════
// ALTIVOR — Stripe Webhook Handler (Supabase Edge Function)
// ─────────────────────────────────────────────────────────────────────────
// Handles checkout.session.completed events to mark Execution Credits
// as used ONLY after successful payment confirmation.
//
// Required Supabase Secrets:
//   STRIPE_SECRET_KEY       — Stripe secret key
//   STRIPE_WEBHOOK_SECRET   — Stripe webhook signing secret (whsec_...)
//
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
//
// Stripe Dashboard → Webhooks → Add endpoint:
//   URL: https://lssedurdadjngqbchjbj.supabase.co/functions/v1/stripe-webhook
//   Events: checkout.session.completed
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// US100 Challenge Stripe Price ID — update if your price ID differs
// You can find this in Stripe Dashboard → Products → US100 Challenge → Price ID
const US100_PRICE_IDS = Deno.env.get('US100_PRICE_IDS')?.split(',') || []

/** Verify Stripe webhook signature (HMAC-SHA256) */
async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const parts = signature.split(',')
  const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2)
  const v1Sig = parts.find((p) => p.startsWith('v1='))?.slice(3)

  if (!timestamp || !v1Sig) return false

  // Reject if timestamp is older than 5 minutes (replay protection)
  const ts = parseInt(timestamp, 10)
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false

  const signedPayload = `${timestamp}.${payload}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedPayload)
  )
  const expectedSig = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return expectedSig === v1Sig
}

/** Retrieve full Checkout Session with discounts from Stripe API */
async function getSessionWithDiscounts(sessionId: string) {
  const url = `https://api.stripe.com/v1/checkout/sessions/${sessionId}?expand[]=total_details.breakdown&expand[]=line_items`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  })
  return res.json()
}

serve(async (req) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await req.text()
    const signature = req.headers.get('stripe-signature')

    if (!signature) {
      console.error('[Webhook] Missing stripe-signature header')
      return new Response('Missing signature', { status: 400 })
    }

    // ── 1. Verify signature ───────────────────────────────────────────
    const isValid = await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET)
    if (!isValid) {
      console.error('[Webhook] Invalid signature')
      return new Response('Invalid signature', { status: 400 })
    }

    const event = JSON.parse(body)
    console.log(`[Webhook] Received event: ${event.type} (${event.id})`)

    // ── 2. Only handle checkout.session.completed ─────────────────────
    if (event.type !== 'checkout.session.completed') {
      return new Response(JSON.stringify({ received: true, action: 'ignored_event_type' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const session = event.data.object

    // ── 3. Verify payment_status = paid ───────────────────────────────
    if (session.payment_status !== 'paid') {
      console.log(`[Webhook] Session ${session.id} — payment_status: ${session.payment_status} — skipping`)
      return new Response(JSON.stringify({ received: true, action: 'skipped_unpaid' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── 4. Check for discount usage ───────────────────────────────────
    const totalDiscount = session.total_details?.amount_discount || 0
    if (totalDiscount === 0) {
      console.log(`[Webhook] Session ${session.id} — no discount applied — skipping`)
      return new Response(JSON.stringify({ received: true, action: 'no_discount' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── 5. Retrieve full session with discount breakdown ──────────────
    const fullSession = await getSessionWithDiscounts(session.id)

    // Extract promotion code IDs from discounts
    const discounts = fullSession.total_details?.breakdown?.discounts || []
    const promotionCodeIds: string[] = discounts
      .filter((d: any) => d.discount?.promotion_code)
      .map((d: any) => d.discount.promotion_code)

    if (promotionCodeIds.length === 0) {
      console.log(`[Webhook] Session ${session.id} — discount found but no promotion code — skipping`)
      return new Response(JSON.stringify({ received: true, action: 'no_promo_code_id' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── 6. (Optional) Verify the purchased product is US100 Challenge
    //        If US100_PRICE_IDS env var is set, enforce product check.
    if (US100_PRICE_IDS.length > 0) {
      const lineItems = fullSession.line_items?.data || []
      const hasUS100 = lineItems.some((li: any) =>
        US100_PRICE_IDS.includes(li.price?.id)
      )
      if (!hasUS100) {
        console.log(`[Webhook] Session ${session.id} — product is not US100 Challenge — skipping`)
        return new Response(JSON.stringify({ received: true, action: 'wrong_product' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // ── 7. Mark matching execution credits as used ────────────────────
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    for (const promoCodeId of promotionCodeIds) {
      const { data: credit } = await supabase
        .from('execution_credits')
        .select('*')
        .eq('stripe_promotion_code_id', promoCodeId)
        .eq('used', false)
        .maybeSingle()

      if (credit) {
        const { error: updateErr } = await supabase
          .from('execution_credits')
          .update({
            used: true,
            used_at: new Date().toISOString(),
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: session.payment_intent,
          })
          .eq('id', credit.id)

        if (updateErr) {
          console.error(`[Webhook] Failed to update credit ${credit.id}:`, updateErr)
        } else {
          console.log(
            `[Webhook] ✓ Execution credit ${credit.promotion_code} marked as used ` +
            `(session: ${session.id}, user: ${credit.email})`
          )
        }
      }
    }

    return new Response(JSON.stringify({ received: true, action: 'processed' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[Webhook] Unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Webhook processing failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
