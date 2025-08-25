-- Create enum for connection roles
CREATE TYPE public.connection_role AS ENUM ('HUMAN', 'PET');

-- Create enum for mirror status
CREATE TYPE public.mirror_status AS ENUM ('PENDING', 'DONE', 'ERROR');

-- Create connections table
CREATE TABLE public.connections (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role connection_role NOT NULL,
    athlete_id BIGINT NOT NULL,
    athlete_username TEXT NOT NULL,
    athlete_fullname TEXT NOT NULL,
    athlete_avatar TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, role),
    UNIQUE(user_id, athlete_id)
);

-- Create mirrors table for tracking mirrored activities
CREATE TABLE public.mirrors (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_activity_id BIGINT NOT NULL,
    dog_activity_id BIGINT,
    status mirror_status NOT NULL DEFAULT 'PENDING',
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, source_activity_id)
);

-- Create profiles table for additional user info
CREATE TABLE public.profiles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mirrors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for connections
CREATE POLICY "Users can view their own connections" 
ON public.connections 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own connections" 
ON public.connections 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own connections" 
ON public.connections 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own connections" 
ON public.connections 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create RLS policies for mirrors
CREATE POLICY "Users can view their own mirrors" 
ON public.mirrors 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own mirrors" 
ON public.mirrors 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own mirrors" 
ON public.mirrors 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create RLS policies for profiles
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_connections_updated_at
    BEFORE UPDATE ON public.connections
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_mirrors_updated_at
    BEFORE UPDATE ON public.mirrors
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_connections_user_id ON public.connections(user_id);
CREATE INDEX idx_connections_athlete_id ON public.connections(athlete_id);
CREATE INDEX idx_mirrors_user_id ON public.mirrors(user_id);
CREATE INDEX idx_mirrors_source_activity ON public.mirrors(source_activity_id);
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);