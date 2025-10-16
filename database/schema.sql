-- Real World Opera Database Schema for Supabase/PostgreSQL
-- Run this in Supabase SQL Editor

-- Enable PostGIS extension for geospatial features
CREATE EXTENSION IF NOT EXISTS postgis;

-- ===========================================
-- PROFILES TABLE (extends Supabase auth.users)
-- ===========================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL CHECK (char_length(username) >= 3),
  gematria_value INTEGER,
  last_login TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster username lookups
CREATE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles(username);

-- ===========================================
-- PROJECTS TABLE
-- ===========================================

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL CHECK (char_length(key) >= 2),
  locked BOOLEAN DEFAULT false,
  user_list UUID[] NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster project key lookups
CREATE INDEX IF NOT EXISTS projects_key_idx ON public.projects(key);
CREATE INDEX IF NOT EXISTS projects_created_by_idx ON public.projects(created_by);

-- ===========================================
-- LOCATIONS TABLE (geospatial data)
-- ===========================================

CREATE TABLE IF NOT EXISTS public.locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Geometry columns (PostGIS)
  coords GEOMETRY(POINT, 4326),  -- For point locations
  bbox GEOMETRY(POLYGON, 4326),  -- For area/polygon locations
  
  -- Address components
  address TEXT,
  neighbourhood TEXT,
  city TEXT,
  district TEXT,
  zipcode TEXT,
  state TEXT,
  country TEXT,
  
  -- Arrays for links and notes
  links TEXT[] DEFAULT '{}',
  notes TEXT[] DEFAULT '{}',
  
  added_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint: must have either coords OR bbox, not both
  CONSTRAINT has_location CHECK (
    (coords IS NOT NULL AND bbox IS NULL) OR
    (coords IS NULL AND bbox IS NOT NULL)
  )
);

-- Geospatial index for fast location queries
CREATE INDEX IF NOT EXISTS locations_coords_idx ON public.locations USING GIST (coords);
CREATE INDEX IF NOT EXISTS locations_bbox_idx ON public.locations USING GIST (bbox);
CREATE INDEX IF NOT EXISTS locations_project_id_idx ON public.locations(project_id);

-- ===========================================
-- PROJECT_LOGS TABLE (activity history)
-- ===========================================

CREATE TABLE IF NOT EXISTS public.project_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  body TEXT NOT NULL,
  location JSONB,  -- Store lat/lng, city, region if available
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_logs_project_id_idx ON public.project_logs(project_id);
CREATE INDEX IF NOT EXISTS project_logs_created_at_idx ON public.project_logs(created_at DESC);

-- ===========================================
-- TRIGGERS FOR UPDATED_AT
-- ===========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_locations_updated_at
  BEFORE UPDATE ON public.locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ===========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ===========================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_logs ENABLE ROW LEVEL SECURITY;

-- PROFILES POLICIES
-- Users can view all profiles (for @mentions, etc.)
CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Users can insert their own profile (on signup)
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- PROJECTS POLICIES
-- Users can view projects they're part of OR that are not locked
CREATE POLICY "Projects are viewable by members or if unlocked"
  ON public.projects FOR SELECT
  USING (
    NOT locked OR
    auth.uid() = created_by OR
    auth.uid() = ANY(user_list)
  );

-- Users can create projects
CREATE POLICY "Authenticated users can create projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Users can update projects they created or are members of
CREATE POLICY "Project members can update projects"
  ON public.projects FOR UPDATE
  USING (
    auth.uid() = created_by OR
    auth.uid() = ANY(user_list)
  );

-- LOCATIONS POLICIES
-- Users can view locations from projects they have access to
CREATE POLICY "Locations viewable if project is accessible"
  ON public.locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = locations.project_id
      AND (
        NOT projects.locked OR
        auth.uid() = projects.created_by OR
        auth.uid() = ANY(projects.user_list)
      )
    )
  );

-- Users can add locations to projects they're members of
CREATE POLICY "Project members can add locations"
  ON public.locations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_id
      AND (
        auth.uid() = projects.created_by OR
        auth.uid() = ANY(projects.user_list)
      )
    )
  );

-- Users can update locations in their projects
CREATE POLICY "Project members can update locations"
  ON public.locations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = locations.project_id
      AND (
        auth.uid() = projects.created_by OR
        auth.uid() = ANY(projects.user_list)
      )
    )
  );

-- PROJECT_LOGS POLICIES
-- Users can view logs from projects they have access to
CREATE POLICY "Logs viewable if project is accessible"
  ON public.project_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_logs.project_id
      AND (
        NOT projects.locked OR
        auth.uid() = projects.created_by OR
        auth.uid() = ANY(projects.user_list)
      )
    )
  );

-- Users can add logs to projects they're members of
CREATE POLICY "Project members can add logs"
  ON public.project_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_id
      AND (
        auth.uid() = projects.created_by OR
        auth.uid() = ANY(projects.user_list)
      )
    )
  );

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Function to add user to project
CREATE OR REPLACE FUNCTION add_user_to_project(p_project_key TEXT, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_list UUID[];
BEGIN
  -- Get current user list
  SELECT user_list INTO v_user_list
  FROM public.projects
  WHERE key = p_project_key;
  
  -- Check if user already in list
  IF p_user_id = ANY(v_user_list) THEN
    RETURN true;
  END IF;
  
  -- Add user to list
  UPDATE public.projects
  SET user_list = array_append(user_list, p_user_id)
  WHERE key = p_project_key;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get locations within a radius (for future use)
CREATE OR REPLACE FUNCTION get_locations_near_point(
  p_longitude DOUBLE PRECISION,
  p_latitude DOUBLE PRECISION,
  p_radius_meters INTEGER
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  distance_meters DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.name,
    ST_Distance(
      l.coords::geography,
      ST_MakePoint(p_longitude, p_latitude)::geography
    ) as distance_meters
  FROM public.locations l
  WHERE l.coords IS NOT NULL
  AND ST_DWithin(
    l.coords::geography,
    ST_MakePoint(p_longitude, p_latitude)::geography,
    p_radius_meters
  )
  ORDER BY distance_meters;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- SETUP COMPLETE!
-- ===========================================

-- Create a function to handle new user signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, gematria_value)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    0
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Real World Opera database schema created successfully!';
  RAISE NOTICE 'Tables: profiles, projects, locations, project_logs';
  RAISE NOTICE 'PostGIS extension enabled for geospatial queries';
  RAISE NOTICE 'Row Level Security (RLS) enabled and configured';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Test by creating a user via Supabase Auth';
  RAISE NOTICE '2. Check that a profile was automatically created';
  RAISE NOTICE '3. Start your application with npm start';
END $$;

