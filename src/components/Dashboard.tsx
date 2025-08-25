import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { User, Session } from '@supabase/supabase-js';
import { LogOut, User as UserIcon, Heart, Link, ArrowRight, Activity } from 'lucide-react';
import { ConnectionWizard } from './ConnectionWizard';
import { ActivityMirror } from './ActivityMirror';

interface Connection {
  id: string;
  role: 'HUMAN' | 'PET';
  athlete_id: number;
  athlete_username: string;
  athlete_fullname: string;
  athlete_avatar?: string;
  expires_at: number;
}

interface DashboardProps {
  user: User;
  session: Session;
  onSignOut: () => void;
}

export function Dashboard({ user, session, onSignOut }: DashboardProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      const { data, error } = await supabase
        .from('connections')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setConnections(data || []);
    } catch (error: any) {
      toast({
        title: 'Error loading connections',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    onSignOut();
  };

  const humanConnection = connections.find(c => c.role === 'HUMAN');
  const petConnection = connections.find(c => c.role === 'PET');
  const bothConnected = humanConnection && petConnection;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-primary rounded-xl flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Activity Syncer</h1>
              <p className="text-sm text-muted-foreground">Sync activities with your pet</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserIcon className="w-4 h-4" />
              {user.email}
            </div>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Connection Status Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Human Connection */}
          <Card className="shadow-subtle hover:shadow-medium transition-smooth">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <UserIcon className="w-5 h-5 text-primary" />
                  Human Account
                </CardTitle>
                {humanConnection && (
                  <Badge variant="secondary" className="bg-success/10 text-success border-success/20">
                    Connected
                  </Badge>
                )}
              </div>
              <CardDescription>
                Your personal Strava account for reading activities
              </CardDescription>
            </CardHeader>
            <CardContent>
              {humanConnection ? (
                <div className="flex items-center gap-3">
                  {humanConnection.athlete_avatar && (
                    <img 
                      src={humanConnection.athlete_avatar} 
                      alt="Profile"
                      className="w-12 h-12 rounded-full border-2 border-primary/20"
                    />
                  )}
                  <div>
                    <p className="font-medium">{humanConnection.athlete_fullname}</p>
                    <p className="text-sm text-muted-foreground">@{humanConnection.athlete_username}</p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">Not connected</p>
              )}
            </CardContent>
          </Card>

          {/* Pet Connection */}
          <Card className="shadow-subtle hover:shadow-medium transition-smooth">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Heart className="w-5 h-5 text-accent" />
                  Pet Account
                </CardTitle>
                {petConnection && (
                  <Badge variant="secondary" className="bg-success/10 text-success border-success/20">
                    Connected
                  </Badge>
                )}
              </div>
              <CardDescription>
                Your pet's Strava account for uploading activities
              </CardDescription>
            </CardHeader>
            <CardContent>
              {petConnection ? (
                <div className="flex items-center gap-3">
                  {petConnection.athlete_avatar && (
                    <img 
                      src={petConnection.athlete_avatar} 
                      alt="Pet Profile"
                      className="w-12 h-12 rounded-full border-2 border-accent/20"
                    />
                  )}
                  <div>
                    <p className="font-medium">{petConnection.athlete_fullname}</p>
                    <p className="text-sm text-muted-foreground">@{petConnection.athlete_username}</p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">Not connected</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        {!bothConnected ? (
          <ConnectionWizard 
            humanConnection={humanConnection}
            petConnection={petConnection}
            onConnectionUpdate={loadConnections}
          />
        ) : (
          <ActivityMirror 
            humanConnection={humanConnection}
            petConnection={petConnection}
          />
        )}

        {/* Info Section */}
        <Card className="mt-8 border-accent/20 bg-gradient-to-r from-accent/5 to-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link className="w-5 h-5 text-accent" />
              How it works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• We only copy GPS route data, timestamps, and optional elevation</p>
            <p>• No heart rate, cadence, or power data is transferred</p>
            <p>• Your pet's activities will have their own Strava privacy settings</p>
            <p>• All connections use secure OAuth authentication</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}