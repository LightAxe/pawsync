import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    let state;
    try {
      state = JSON.parse(stateParam);
    } catch {
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${Deno.env.get('SUPABASE_URL')}?error=invalid_state`
        }
      });
    }

    const { userId, role, codeVerifier } = state;

    // Exchange code for tokens
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

    // Initialize Supabase client
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

    // Redirect back to app with success
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