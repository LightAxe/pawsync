import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')!;
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface StravaActivity {
  id: number;
  athlete: { id: number };
  name: string;
  type: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  start_date: string;
  start_latlng: [number, number] | null;
  end_latlng: [number, number] | null;
  visibility: string;
}

interface StravaStream {
  latlng?: { data: [number, number][] };
  time?: { data: number[] };
  altitude?: { data: number[] };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }), 
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Get user from JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { activityUrl } = await req.json();

    // Extract activity ID from URL
    const urlMatch = activityUrl.match(/\/activities\/(\d+)/);
    if (!urlMatch) {
      return new Response(
        JSON.stringify({ error: 'Invalid Strava activity URL' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const activityId = parseInt(urlMatch[1]);

    // Check if already mirrored
    const { data: existingMirror } = await supabase
      .from('mirrors')
      .select('*')
      .eq('user_id', user.id)
      .eq('source_activity_id', activityId)
      .maybeSingle();

    if (existingMirror) {
      return new Response(
        JSON.stringify({ 
          error: 'Activity already mirrored',
          mirror: existingMirror 
        }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get connections
    const { data: connections, error: connectionsError } = await supabase
      .from('connections')
      .select('*')
      .eq('user_id', user.id);

    if (connectionsError || !connections) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch connections' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const humanConnection = connections.find(c => c.role === 'HUMAN');
    const petConnection = connections.find(c => c.role === 'PET');

    if (!humanConnection || !petConnection) {
      return new Response(
        JSON.stringify({ error: 'Both human and pet connections required' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Refresh tokens if needed
    const humanToken = await refreshTokenIfNeeded(humanConnection);
    const petToken = await refreshTokenIfNeeded(petConnection);

    // Fetch activity details
    const activityResponse = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
      headers: {
        'Authorization': `Bearer ${humanToken}`,
      },
    });

    if (!activityResponse.ok) {
      if (activityResponse.status === 404) {
        return new Response(
          JSON.stringify({ error: 'Activity not found or private' }), 
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: 'Failed to fetch activity' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const activity: StravaActivity = await activityResponse.json();

    // Verify ownership
    if (activity.athlete.id !== humanConnection.athlete_id) {
      return new Response(
        JSON.stringify({ error: 'Activity does not belong to connected human account' }), 
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch activity streams
    const streamsResponse = await fetch(
      `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=latlng,time,altitude&key_by_type=true`,
      {
        headers: {
          'Authorization': `Bearer ${humanToken}`,
        },
      }
    );

    if (!streamsResponse.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch activity streams' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const streams: StravaStream = await streamsResponse.json();

    if (!streams.latlng || !streams.time) {
      return new Response(
        JSON.stringify({ error: 'Activity missing GPS data' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate GPX
    const gpx = generateGPX(activity, streams);

    // Upload to pet account
    const titlePrefix = Deno.env.get('TITLE_PREFIX') || 'Run with 🐾 ';
    const formData = new FormData();
    formData.append('file', new Blob([gpx], { type: 'application/gpx+xml' }), 'activity.gpx');
    formData.append('data_type', 'gpx');
    formData.append('name', `${titlePrefix}${activity.name}`);

    const uploadResponse = await fetch('https://www.strava.com/api/v3/uploads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${petToken}`,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to upload to pet account' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const uploadResult = await uploadResponse.json();

    // Create mirror record
    const { data: mirror, error: mirrorError } = await supabase
      .from('mirrors')
      .insert({
        user_id: user.id,
        source_activity_id: activityId,
        status: 'PENDING'
      })
      .select()
      .single();

    if (mirrorError) {
      console.error('Failed to create mirror record:', mirrorError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        uploadId: uploadResult.id,
        mirror,
        sourceActivity: {
          id: activity.id,
          name: activity.name,
          url: `https://www.strava.com/activities/${activity.id}`
        }
      }), 
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Mirror activity error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function refreshTokenIfNeeded(connection: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  
  if (connection.expires_at > now + 300) { // 5 minutes buffer
    return connection.access_token;
  }

  const clientId = Deno.env.get('STRAVA_CLIENT_ID');
  const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');

  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: connection.refresh_token,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh token');
  }

  const tokenData = await response.json();

  // Update connection in database using SERVICE_ROLE for token refresh only
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  await supabase
    .from('connections')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_at,
    })
    .eq('id', connection.id);

  return tokenData.access_token;
}

function generateGPX(activity: StravaActivity, streams: StravaStream): string {
  const latlng = streams.latlng!.data;
  const time = streams.time!.data;
  const altitude = streams.altitude?.data;

  const startTime = new Date(activity.start_date);

  let trackPoints = '';
  
  for (let i = 0; i < latlng.length; i++) {
    const [lat, lon] = latlng[i];
    const timestamp = new Date(startTime.getTime() + time[i] * 1000).toISOString();
    const ele = altitude ? altitude[i] : null;

    trackPoints += `      <trkpt lat="${lat}" lon="${lon}">
        <time>${timestamp}</time>`;
    
    if (ele !== null) {
      trackPoints += `
        <ele>${ele}</ele>`;
    }
    
    trackPoints += `
      </trkpt>
`;
  }

  const appName = Deno.env.get('APP_NAME') || 'Pet Activity Syncer';
  const titlePrefix = Deno.env.get('TITLE_PREFIX') || 'Run with 🐾 ';

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="${appName}">
  <metadata>
    <name>${titlePrefix}${activity.name}</name>
    <time>${startTime.toISOString()}</time>
  </metadata>
  <trk>
    <name>${titlePrefix}${activity.name}</name>
    <trkseg>
${trackPoints}    </trkseg>
  </trk>
</gpx>`;
}