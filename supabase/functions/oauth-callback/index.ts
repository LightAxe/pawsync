import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Security helpers
function base64urlDecode(input: string): Uint8Array {
  // Add padding if needed
  let str = input.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return new Uint8Array(Array.from(atob(str), c => c.charCodeAt(0)));
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
  const array = new Uint8Array(signature);
  return btoa(String.fromCharCode.apply(null, Array.from(array)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
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
    const code = url.searchParams.get('code');
    const stateParam = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      console.error('OAuth error:', error);
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${Deno.env.get('SUPABASE_URL')}?error=oauth_denied`
        }
      });
    }

    if (!code || !stateParam) {
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${Deno.env.get('SUPABASE_URL')}?error=invalid_request`
        }
      });
    }

    // Validate signed state
    const stateSecret = Deno.env.get('STATE_SECRET');
    if (!stateSecret) {
      console.error('STATE_SECRET not configured');
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${Deno.env.get('SUPABASE_URL')}?error=server_error`
        }
      });
    }

    let statePayload;
    try {
      const stateData = base64urlDecode(stateParam);
      const stateStr = new TextDecoder().decode(stateData);
      const [jsonPart, providedSignature] = stateStr.split('.');
      
      if (!jsonPart || !providedSignature) {
        throw new Error('Invalid state format');
      }

      const expectedSignature = await hmacSha256(jsonPart, stateSecret);
      const providedSigBytes = new TextEncoder().encode(providedSignature);
      const expectedSigBytes = new TextEncoder().encode(expectedSignature);
      
      if (!constantTimeEqual(providedSigBytes, expectedSigBytes)) {
        throw new Error('Invalid state signature');
      }

      statePayload = JSON.parse(jsonPart);
      
      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (statePayload.exp < now) {
        throw new Error('State expired');
      }
      
    } catch (err) {
      console.error('State validation failed:', err);
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${Deno.env.get('SUPABASE_URL')}?error=invalid_state`
        }
      });
    }

    const { userId, role, codeVerifier } = statePayload;

    // Exchange code for tokens using PKCE
    const clientId = Deno.env.get('STRAVA_CLIENT_ID');
    const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');
    
    if (!clientId || !clientSecret) {
      console.error('Strava credentials not configured');
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${Deno.env.get('SUPABASE_URL')}?error=server_error`
        }
      });
    }

    const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier
      })
    });

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', await tokenResponse.text());
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${Deno.env.get('SUPABASE_URL')}?error=token_exchange_failed`
        }
      });
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_at, athlete } = tokenData;

    // Initialize Supabase client with SERVICE_ROLE for connections table only
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check for existing connection with same athlete_id for this user
    const { data: existingConnection } = await supabase
      .from('connections')
      .select('*')
      .eq('user_id', userId)
      .eq('athlete_id', athlete.id)
      .maybeSingle();

    if (existingConnection && existingConnection.role !== role) {
      console.log('Athlete already connected with different role');
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${Deno.env.get('SUPABASE_URL')}?error=athlete_role_conflict&athlete_id=${athlete.id}`
        }
      });
    }

    // Upsert connection
    const { error: upsertError } = await supabase
      .from('connections')
      .upsert({
        user_id: userId,
        role: role,
        athlete_id: athlete.id,
        athlete_username: athlete.username || '',
        athlete_fullname: `${athlete.firstname || ''} ${athlete.lastname || ''}`.trim(),
        athlete_avatar: athlete.profile || athlete.profile_medium || null,
        access_token: access_token,
        refresh_token: refresh_token,
        expires_at: expires_at
      }, {
        onConflict: 'user_id,role'
      });

    if (upsertError) {
      console.error('Database error:', upsertError);
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${Deno.env.get('SUPABASE_URL')}?error=database_error`
        }
      });
    }

    console.log('Connection saved:', { role, athleteId: athlete.id, userId });

    // Redirect back to app with success (no token leakage)
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${Deno.env.get('SUPABASE_URL')}?oauth_success=true&role=${role}`
      }
    });

  } catch (error) {
    console.error('OAuth callback error:', error);
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${Deno.env.get('SUPABASE_URL')}?error=server_error`
      }
    });
  }
})