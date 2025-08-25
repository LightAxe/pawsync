import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, User, Heart, CheckCircle, AlertCircle } from 'lucide-react';

interface Connection {
  id: string;
  role: 'HUMAN' | 'PET';
  athlete_id: number;
  athlete_username: string;
  athlete_fullname: string;
  athlete_avatar?: string;
  expires_at: number;
}

interface ConnectionWizardProps {
  humanConnection: Connection | undefined;
  petConnection: Connection | undefined;
  onConnectionUpdate: () => void;
}

export function ConnectionWizard({ humanConnection, petConnection, onConnectionUpdate }: ConnectionWizardProps) {
  const [isConnecting, setIsConnecting] = useState<'HUMAN' | 'PET' | null>(null);

  const handleConnect = async (role: 'HUMAN' | 'PET') => {
    setIsConnecting(role);
    
    try {
      // Get current user - in reality this would come from auth context
      const userId = 'current-user'; // TODO: Replace with actual user ID from auth context
      
      // Call our OAuth authorization endpoint
      const response = await fetch(`${window.location.origin}/functions/v1/oauth-authorize?role=${role}&userId=${userId}`);
      
      if (!response.ok) {
        throw new Error('Failed to get authorization URL');
      }
      
      const { authUrl } = await response.json();
      
      // Redirect to Strava OAuth
      window.location.href = authUrl;
      
    } catch (error) {
      console.error('OAuth error:', error);
      setIsConnecting(null);
      // TODO: Show error toast
    }
  };

  const currentStep = !humanConnection ? 1 : !petConnection ? 2 : 3;

  return (
    <div className="space-y-6">
      {/* Progress Indicator */}
      <div className="flex items-center justify-center gap-4">
        <div className={`flex items-center gap-2 ${currentStep >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            currentStep >= 1 ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
          }`}>
            {humanConnection ? <CheckCircle className="w-4 h-4" /> : '1'}
          </div>
          <span className="text-sm font-medium">Connect Human</span>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground" />
        <div className={`flex items-center gap-2 ${currentStep >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            currentStep >= 2 ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
          }`}>
            {petConnection ? <CheckCircle className="w-4 h-4" /> : '2'}
          </div>
          <span className="text-sm font-medium">Connect Pet</span>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground" />
        <div className={`flex items-center gap-2 ${currentStep >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            currentStep >= 3 ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
          }`}>
            3
          </div>
          <span className="text-sm font-medium">Mirror Activity</span>
        </div>
      </div>

      {/* Step 1: Connect Human Account */}
      {!humanConnection && (
        <Card className="shadow-medium border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-6 h-6 text-primary" />
              Step 1: Connect Your Human Account
            </CardTitle>
            <CardDescription>
              Connect your personal Strava account to read activity data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-accent mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">Important:</p>
                  <p className="text-muted-foreground">
                    Make sure you're logged into Strava with your personal account. 
                    If you see the wrong account, log out of Strava first or use an incognito window.
                  </p>
                </div>
              </div>
            </div>
            <Button 
              variant="connect" 
              size="lg" 
              className="w-full"
              onClick={() => handleConnect('HUMAN')}
              disabled={isConnecting === 'HUMAN'}
            >
              {isConnecting === 'HUMAN' ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <User className="w-4 h-4" />
                  Connect Human Account
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Connect Pet Account */}
      {humanConnection && !petConnection && (
        <Card className="shadow-medium border-accent/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="w-6 h-6 text-accent" />
              Step 2: Connect Your Pet's Account
            </CardTitle>
            <CardDescription>
              Connect your pet's Strava account to upload mirrored activities
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-accent/10 rounded-lg p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-accent mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">Important:</p>
                  <p className="text-muted-foreground">
                    Log out of Strava (or open a private window) and log in as your pet's account. 
                    Pet accounts need their own Strava login (you can use an email alias).
                  </p>
                </div>
              </div>
            </div>
            <Button 
              variant="accent" 
              size="lg" 
              className="w-full"
              onClick={() => handleConnect('PET')}
              disabled={isConnecting === 'PET'}
            >
              {isConnecting === 'PET' ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Heart className="w-4 h-4" />
                  Connect Pet Account
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Success State */}
      {humanConnection && petConnection && (
        <Card className="shadow-medium border-success/20 bg-success/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-6 h-6 text-success" />
              Ready to Sync!
            </CardTitle>
            <CardDescription>
              Both accounts are connected. You can now mirror activities!
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}