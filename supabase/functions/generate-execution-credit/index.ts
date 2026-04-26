// ═══════════════════════════════════════════════════════════════════════════
// ALTIVOR — Generate Execution Credit (Supabase Edge Function)
// ─────────────────────────────────────────────────────────────────────────
// Triggered after PREPARE completion. Creates a unique one-time Stripe
// promotion code worth €20 toward ALTIVOR US100 Challenge.
//
// Required Supabase Secrets (set via CLI or Dashboard):
//   STRIPE_SECRET_KEY       — Stripe secret key (sk_live_... or sk_test_...)
//   RESEND_API_KEY          — (optional) Resend.com API key for email
//
// Deploy:  supabase functions deploy generate-execution-credit
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''

const COUPON_ID = 'PKngCTYj'
const EXPIRY_HOURS = 100

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Generate ALTIVOR-XXXXXX code (no ambiguous chars) */
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'ALTIVOR-'
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

/** Build HTML email body */
function buildEmailHtml(code: string, expiresAt: Date): string {
  const expiresFormatted = expiresAt.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  })

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Inter',Helvetica,Arial,sans-serif;color:#e5e5e5">
<div style="max-width:560px;margin:0 auto;padding:2.5rem 1.5rem">
  <div style="text-align:center;margin-bottom:2rem">
    <span style="font-family:'DM Serif Display',Georgia,serif;font-size:1.1rem;color:rgba(214,190,150,0.9);letter-spacing:0.08em">ALTIVOR INSTITUTE</span>
  </div>
  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(214,190,150,0.1);border-radius:16px;padding:2rem 1.75rem;text-align:center">
    <div style="width:56px;height:56px;border-radius:50%;background:rgba(214,190,150,0.06);border:2px solid rgba(214,190,150,0.12);display:inline-flex;align-items:center;justify-content:center;margin-bottom:1.25rem">
      <span style="font-size:1.5rem">🎫</span>
    </div>
    <h1 style="font-family:'DM Serif Display',Georgia,serif;font-size:1.4rem;color:rgba(214,190,150,0.9);margin:0 0 0.5rem">Execution Credit Unlocked</h1>
    <p style="font-size:0.85rem;color:rgba(255,255,255,0.5);line-height:1.6;margin:0 0 1.5rem">
      You have successfully completed PREPARE.<br>
      Your Execution Credit for the ALTIVOR US100 Challenge has been unlocked.
    </p>
    <div style="background:rgba(214,190,150,0.04);border:1px solid rgba(214,190,150,0.1);border-radius:10px;padding:1.25rem;margin-bottom:1.25rem">
      <div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:rgba(255,255,255,0.3);margin-bottom:0.5rem">Your Promotion Code</div>
      <div style="font-family:'JetBrains Mono','Courier New',monospace;font-size:1.5rem;font-weight:700;color:rgba(214,190,150,0.9);letter-spacing:0.15em">${code}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:1.5rem" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:0.6rem;text-align:center;border:1px solid rgba(255,255,255,0.05);border-radius:8px 0 0 8px">
          <div style="font-size:0.55rem;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:rgba(255,255,255,0.3)">Value</div>
          <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.1rem;color:rgba(214,190,150,0.85)">€20</div>
        </td>
        <td style="padding:0.6rem;text-align:center;border:1px solid rgba(255,255,255,0.05)">
          <div style="font-size:0.55rem;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:rgba(255,255,255,0.3)">Valid For</div>
          <div style="font-size:0.85rem;font-weight:600;color:rgba(255,255,255,0.7)">100 hours</div>
        </td>
        <td style="padding:0.6rem;text-align:center;border:1px solid rgba(255,255,255,0.05);border-radius:0 8px 8px 0">
          <div style="font-size:0.55rem;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:rgba(255,255,255,0.3)">Expires</div>
          <div style="font-size:0.75rem;font-weight:600;color:rgba(255,255,255,0.7)">${expiresFormatted}</div>
        </td>
      </tr>
    </table>
    <p style="font-size:0.72rem;color:rgba(255,255,255,0.35);line-height:1.5;margin:0">
      After expiration, the code will no longer be valid and will not be accepted during checkout.
    </p>
  </div>
  <div style="text-align:center;margin-top:2rem;padding-top:1.5rem;border-top:1px solid rgba(255,255,255,0.04)">
    <p style="font-size:0.65rem;color:rgba(255,255,255,0.2);margin:0;line-height:1.5">
      ALTIVOR INSTITUTE — Operational frameworks for disciplined market execution.<br>
      This is an automated message. Do not reply.
    </p>
  </div>
</div>
</body>
</html>`
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── 1. Authenticate user ──────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user || !user.email) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 2. Check if user already has a credit ─────────────────────────
    const { data: existing } = await supabase
      .from('execution_credits')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) {
      return new Response(JSON.stringify({
        success: true,
        already_exists: true,
        promotion_code: existing.promotion_code,
        expires_at: existing.expires_at,
        used: existing.used,
        used_at: existing.used_at,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 3. Generate unique code ───────────────────────────────────────
    const code = generateCode()
    const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000)
    const expiresAtUnix = Math.floor(expiresAt.getTime() / 1000)

    // ── 4. Create Stripe promotion code ───────────────────────────────
    const stripeBody = new URLSearchParams({
      coupon: COUPON_ID,
      code: code,
      max_redemptions: '1',
      expires_at: expiresAtUnix.toString(),
      'metadata[user_id]': user.id,
      'metadata[user_email]': user.email,
      'metadata[source]': 'prepare_completion',
    })

    const stripeRes = await fetch('https://api.stripe.com/v1/promotion_codes', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: stripeBody.toString(),
    })

    const stripeData = await stripeRes.json()

    if (!stripeRes.ok) {
      console.error('[ExecutionCredit] Stripe error:', stripeData)
      return new Response(JSON.stringify({
        error: 'Failed to create Stripe promotion code',
        detail: stripeData.error?.message,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 5. Save to database ───────────────────────────────────────────
    const { error: dbError } = await supabase
      .from('execution_credits')
      .insert({
        user_id: user.id,
        email: user.email,
        promotion_code: code,
        stripe_promotion_code_id: stripeData.id,
        expires_at: expiresAt.toISOString(),
        used: false,
      })

    if (dbError) {
      console.error('[ExecutionCredit] DB error:', dbError)
      return new Response(JSON.stringify({
        error: 'Failed to save execution credit',
        detail: dbError.message,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 6. Send email (optional — requires RESEND_API_KEY) ────────────
    if (RESEND_API_KEY) {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'ALTIVOR INSTITUTE <noreply@altivor.institute>',
            to: [user.email],
            subject: 'Your ALTIVOR Execution Credit is unlocked',
            html: buildEmailHtml(code, expiresAt),
          }),
        })
        if (!emailRes.ok) {
          const errBody = await emailRes.text()
          console.error('[ExecutionCredit] Email send failed:', errBody)
        } else {
          console.log('[ExecutionCredit] Email sent to', user.email)
        }
      } catch (emailErr) {
        console.error('[ExecutionCredit] Email error:', emailErr)
      }
    } else {
      console.log('[ExecutionCredit] RESEND_API_KEY not set — skipping email')
    }

    // ── 7. Return success ─────────────────────────────────────────────
    return new Response(JSON.stringify({
      success: true,
      promotion_code: code,
      stripe_promotion_code_id: stripeData.id,
      expires_at: expiresAt.toISOString(),
      used: false,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[ExecutionCredit] Unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
