import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-erpposs-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const body = await req.json()
    const {
      connection_id,
      provider_message_id,
      sender_email,
      sender_verified = true,
      subject = '',
      received_at = new Date().toISOString(),
      payload,
    } = body || {}

    if (!connection_id || !provider_message_id || !payload) {
      return new Response(
        JSON.stringify({ error: 'connection_id, provider_message_id, dan payload wajib diisi.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify webhook secret from private table bank_email_connection_secrets when called by external forwarder
    const webhookSecret = req.headers.get('x-erpposs-webhook-secret')
    if (webhookSecret) {
      const { data: secRow } = await supabase
        .from('bank_email_connection_secrets')
        .select('inbound_webhook_secret')
        .eq('connection_id', connection_id)
        .maybeSingle()
      if (!secRow || secRow.inbound_webhook_secret !== webhookSecret) {
        return new Response(JSON.stringify({ error: 'Invalid inbound webhook secret' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const { data, error } = await supabase.rpc('fn_ingest_mandiri_normalized_tx', {
      p_connection_id: connection_id,
      p_provider_message_id: provider_message_id,
      p_sender_email: sender_email || 'noreply.livin@bankmandiri.co.id',
      p_sender_verified: Boolean(sender_verified),
      p_subject: subject,
      p_received_at: received_at,
      p_payload: payload,
    })

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error)?.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
