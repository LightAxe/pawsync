import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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

    // Generate PKCE code verifier and challenge
    const codeVerifier = crypto.randomUUID() + crypto.randomUUID();
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const codeChallenge = btoa(String.fromCharCode.apply(null, hashArray))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Create state with user info and PKCE verifier
    const state = JSON.stringify({ 
      userId, 
      role,
      codeVerifier
    });

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