// supabase/functions/stripe-webhook/index.ts
// Deno TypeScript Edge Function for handling Stripe webhook events and reconciling credits in Supabase.

import Stripe from 'npm:stripe';

// Read environment variables — set these in the Supabase Edge Function config
const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET') || ''; // stripe webhook signing secret
const STRIPE_API_KEY = Deno.env.get('STRIPE_API_KEY') || ''; // stripe secret key
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''; // https://xyz.supabase.co
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''; // service_role key

const stripe = new Stripe(STRIPE_API_KEY, { apiVersion: '2022-11-15' });

export default async (req: Request) => {
  try{
    const body = await req.text();
    const sig = req.headers.get('stripe-signature') || '';

    let event: Stripe.Event;
    try{
      event = stripe.webhooks.constructEvent(body, sig, STRIPE_SECRET);
    }catch(err){
      console.error('Webhook signature verification failed', err.message);
      return new Response(JSON.stringify({error: 'invalid_signature'}), { status: 400 });
    }

    if(event.type === 'checkout.session.completed'){
      const session = event.data.object as Stripe.Checkout.Session;
      // Retrieve metadata set on the Checkout Session to map to a user
      const userId = session.metadata?.supabase_user_id || session.client_reference_id || null;
      const credits = Number(session.metadata?.credits || session.amount_total || 0) || 0;

      if(!userId){
        console.warn('No user id found on session metadata; skipping');
        return new Response(JSON.stringify({ok:true}), { status: 200 });
      }

      // Upsert user credits into profiles table using Supabase REST API with service role key
      const payload = {
        // We assume profiles table has: id (pk), credits (numeric), last_purchase_at (timestamp)
        credits: credits,
        last_purchase_at: new Date().toISOString()
      };

      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify(payload)
      });

      if(!res.ok){
        const text = await res.text();
        console.error('Failed to update profile credits', res.status, text);
        return new Response(JSON.stringify({ error: 'supabase_update_failed' }), { status: 500 });
      }

      console.log(`Credits updated for user ${userId}: +${credits}`);
    }

    return new Response(JSON.stringify({received: true}), { status: 200 });
  }catch(err){
    console.error('Unhandled error in webhook', err);
    return new Response(JSON.stringify({error: 'internal_error'}), { status: 500 });
  }
};
