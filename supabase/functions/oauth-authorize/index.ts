import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Security helpers
function base64urlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode.apply(null, Array.from(data)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function hmacSha256(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return base64urlEncode(new Uint8Array(signature));
}

function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return base64urlEncode(array);
}

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')!;
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const role = url.searchParams.get('role');
    const userId = url.searchParams.get('userId');

    if (!role || !userId || !['HUMAN', 'PET'].includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Invalid role or userId' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clientId = Deno.env.get('STRAVA_CLIENT_ID');
    if (!clientId) {
      console.error('STRAVA_CLIENT_ID not configured');
      return new Response(
        JSON.stringify({ error: 'OAuth not configured' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate PKCE code verifier and challenge (S256)
    const codeVerifier = generateRandomString(43); // 43-128 chars URL-safe
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const codeChallenge = base64urlEncode(new Uint8Array(hashBuffer));

    // Create signed, expiring state
    const stateSecret = Deno.env.get('STATE_SECRET');
    if (!stateSecret) {
      console.error('STATE_SECRET not configured');
      return new Response(
        JSON.stringify({ error: 'OAuth not configured' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const nonce = generateRandomString(16);
    const exp = Math.floor(Date.now() / 1000) + (10 * 60); // 10 minutes
    
    const statePayload = {
      userId,
      role,
      exp,
      nonce,
      codeVerifier
    };

    const canonicalJson = JSON.stringify(statePayload);
    const signature = await hmacSha256(canonicalJson, stateSecret);
    const state = base64urlEncode(new TextEncoder().encode(canonicalJson + '.' + signature));

    // Determine scopes based on role
    const scopes = role === 'HUMAN' 
      ? 'read,activity:read,activity:read_all'
      : 'activity:write';

    // Build Strava OAuth URL
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback`;
    const stravaAuthUrl = new URL('https://www.strava.com/oauth/authorize');
    stravaAuthUrl.searchParams.set('client_id', clientId);
    stravaAuthUrl.searchParams.set('redirect_uri', redirectUri);
    stravaAuthUrl.searchParams.set('response_type', 'code');
    stravaAuthUrl.searchParams.set('scope', scopes);
    stravaAuthUrl.searchParams.set('state', state);
    stravaAuthUrl.searchParams.set('code_challenge', codeChallenge);
    stravaAuthUrl.searchParams.set('code_challenge_method', 'S256');

    console.log('OAuth redirect:', { role, userId, redirectUri });

    return new Response(
      JSON.stringify({ authUrl: stravaAuthUrl.toString() }), 
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('OAuth authorize error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
})