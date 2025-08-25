import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Activity, Link, ExternalLink, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface Connection {
  id: string;
  role: 'HUMAN' | 'PET';
  athlete_id: number;
  athlete_username: string;
  athlete_fullname: string;
  athlete_avatar?: string;
  expires_at: number;
}

interface ActivityMirrorProps {
  humanConnection: Connection;
  petConnection: Connection;
}

interface MirrorResult {
  sourceActivityId: string;
  dogActivityId?: string;
  status: 'PENDING' | 'DONE' | 'ERROR';
  errorMessage?: string;
}

export function ActivityMirror({ humanConnection, petConnection }: ActivityMirrorProps) {
  const [activityUrl, setActivityUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mirrorResult, setMirrorResult] = useState<MirrorResult | null>(null);
  const { toast } = useToast();

  const parseActivityId = (url: string): string | null => {
    // Parse Strava activity URL: https://www.strava.com/activities/12345678
    const match = url.match(/\/activities\/(\d+)/);
    return match ? match[1] : null;
  };

  const handleMirror = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const activityId = parseActivityId(activityUrl);
    if (!activityId) {
      toast({
        title: 'Invalid URL',
        description: 'Please enter a valid Strava activity URL',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setMirrorResult({ sourceActivityId: activityId, status: 'PENDING' });

    try {
      // In a real implementation, this would call your backend API
      // const response = await fetch('/api/mirror', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ activityUrl })
      // });
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Simulate successful mirror
      const dogActivityId = Math.random().toString().substr(2, 8);
      setMirrorResult({
        sourceActivityId: activityId,
        dogActivityId,
        status: 'DONE'
      });

      toast({
        title: 'Activity mirrored successfully! 🐾',
        description: `View on Strava: https://www.strava.com/activities/${dogActivityId}`,
      });
    } catch (error: any) {
      setMirrorResult({
        sourceActivityId: activityId,
        status: 'ERROR',
        errorMessage: error.message
      });
      
      toast({
        title: 'Mirror failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Mirror Activity Card */}
      <Card className="shadow-medium">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Mirror Activity
          </CardTitle>
          <CardDescription>
            Paste a Strava activity URL from your human account to copy it to your pet's account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleMirror} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="activity-url" className="flex items-center gap-2">
                <Link className="w-4 h-4" />
                Strava Activity URL
              </Label>
              <Input
                id="activity-url"
                type="url"
                value={activityUrl}
                onChange={(e) => setActivityUrl(e.target.value)}
                placeholder="https://www.strava.com/activities/12345678"
                required
                className="transition-smooth focus:ring-primary"
              />
              <p className="text-xs text-muted-foreground">
                Copy the URL from your browser when viewing the activity on Strava
              </p>
            </div>
            
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-primary mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-primary">What gets copied:</p>
                  <ul className="text-muted-foreground mt-1 space-y-1">
                    <li>• GPS route (latitude/longitude points)</li>
                    <li>• Timestamps for each point</li>
                    <li>• Elevation data (if available)</li>
                    <li>• Activity name with 🐾 prefix</li>
                  </ul>
                  <p className="font-medium text-primary mt-2">What doesn't get copied:</p>
                  <ul className="text-muted-foreground mt-1 space-y-1">
                    <li>• Heart rate data</li>
                    <li>• Cadence or power metrics</li>
                    <li>• Personal performance data</li>
                  </ul>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              variant="hero"
              size="lg"
              className="w-full"
              disabled={isLoading || !activityUrl}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Mirroring Activity...
                </>
              ) : (
                <>
                  <Activity className="w-4 h-4" />
                  Mirror Activity
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Mirror Result */}
      {mirrorResult && (
        <Card className={`shadow-medium border-2 ${
          mirrorResult.status === 'DONE' ? 'border-success/20 bg-success/5' :
          mirrorResult.status === 'ERROR' ? 'border-destructive/20 bg-destructive/5' :
          'border-primary/20 bg-primary/5'
        }`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {mirrorResult.status === 'DONE' && <CheckCircle className="w-5 h-5 text-success" />}
              {mirrorResult.status === 'ERROR' && <AlertCircle className="w-5 h-5 text-destructive" />}
              {mirrorResult.status === 'PENDING' && <Loader2 className="w-5 h-5 text-primary animate-spin" />}
              
              {mirrorResult.status === 'DONE' && 'Activity Mirrored Successfully!'}
              {mirrorResult.status === 'ERROR' && 'Mirror Failed'}
              {mirrorResult.status === 'PENDING' && 'Mirroring in Progress...'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-background rounded-lg">
              <div>
                <p className="text-sm font-medium">Source Activity</p>
                <p className="text-xs text-muted-foreground">@{humanConnection.athlete_username}</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a
                  href={`https://www.strava.com/activities/${mirrorResult.sourceActivityId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="w-3 h-3" />
                  View
                </a>
              </Button>
            </div>

            {mirrorResult.dogActivityId && (
              <div className="flex items-center justify-between p-3 bg-accent/10 rounded-lg">
                <div>
                  <p className="text-sm font-medium">Pet Activity</p>
                  <p className="text-xs text-muted-foreground">@{petConnection.athlete_username}</p>
                </div>
                <Button variant="accent" size="sm" asChild>
                  <a
                    href={`https://www.strava.com/activities/${mirrorResult.dogActivityId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View on Strava
                  </a>
                </Button>
              </div>
            )}

            {mirrorResult.errorMessage && (
              <div className="p-3 bg-destructive/10 rounded-lg">
                <p className="text-sm text-destructive">{mirrorResult.errorMessage}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Account Summary */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="shadow-subtle">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              {humanConnection.athlete_avatar && (
                <img 
                  src={humanConnection.athlete_avatar} 
                  alt="Human"
                  className="w-10 h-10 rounded-full border-2 border-primary/20"
                />
              )}
              <div>
                <p className="font-medium">{humanConnection.athlete_fullname}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">Human</Badge>
                  <span className="text-xs text-muted-foreground">@{humanConnection.athlete_username}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-subtle">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              {petConnection.athlete_avatar && (
                <img 
                  src={petConnection.athlete_avatar} 
                  alt="Pet"
                  className="w-10 h-10 rounded-full border-2 border-accent/20"
                />
              )}
              <div>
                <p className="font-medium">{petConnection.athlete_fullname}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-accent/10 text-accent text-xs">Pet</Badge>
                  <span className="text-xs text-muted-foreground">@{petConnection.athlete_username}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}