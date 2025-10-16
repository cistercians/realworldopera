-- Migration: Add flexible items table to replace rigid locations-only structure
-- Run this after the initial schema.sql

-- Drop the old locations table (if you have data, export it first!)
-- If you have existing data, skip this line and manually migrate
DROP TABLE IF EXISTS public.locations CASCADE;

-- Create new flexible items table
CREATE TABLE IF NOT EXISTS public.items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  
  -- Item identification
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('location', 'entity', 'organization', 'keyword', 'custom')),
  description TEXT,
  
  -- Geospatial data (only for location items)
  coords GEOMETRY(POINT, 4326),  -- For point locations
  bbox GEOMETRY(POLYGON, 4326),  -- For area/polygon locations
  
  -- Flexible data storage (JSONB for any additional fields)
  data JSONB DEFAULT '{}'::jsonb,
  
  -- Common fields that might be useful
  tags TEXT[] DEFAULT '{}',
  links TEXT[] DEFAULT '{}',
  notes TEXT[] DEFAULT '{}',
  
  -- Metadata
  added_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint: location items must have coords OR bbox
  CONSTRAINT location_must_have_geometry CHECK (
    type != 'location' OR 
    (coords IS NOT NULL OR bbox IS NOT NULL)
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS items_project_id_idx ON public.items(project_id);
CREATE INDEX IF NOT EXISTS items_type_idx ON public.items(type);
CREATE INDEX IF NOT EXISTS items_name_idx ON public.items(name);
CREATE INDEX IF NOT EXISTS items_coords_idx ON public.items USING GIST (coords);
CREATE INDEX IF NOT EXISTS items_bbox_idx ON public.items USING GIST (bbox);
CREATE INDEX IF NOT EXISTS items_data_idx ON public.items USING GIN (data);
CREATE INDEX IF NOT EXISTS items_tags_idx ON public.items USING GIN (tags);
CREATE INDEX IF NOT EXISTS items_created_at_idx ON public.items(created_at DESC);

-- Full text search on name and description
CREATE INDEX IF NOT EXISTS items_search_idx ON public.items 
  USING GIN (to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- Trigger for updated_at
CREATE TRIGGER update_items_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ===========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ===========================================

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

-- Users can view items from projects they have access to
CREATE POLICY "Items viewable if project is accessible"
  ON public.items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = items.project_id
      AND (
        NOT projects.locked OR
        auth.uid() = projects.created_by OR
        auth.uid() = ANY(projects.user_list)
      )
    )
  );

-- Users can add items to projects they're members of
CREATE POLICY "Project members can add items"
  ON public.items FOR INSERT
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

-- Users can update items in their projects
CREATE POLICY "Project members can update items"
  ON public.items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = items.project_id
      AND (
        auth.uid() = projects.created_by OR
        auth.uid() = ANY(projects.user_list)
      )
    )
  );

-- Users can delete items from their projects
CREATE POLICY "Project members can delete items"
  ON public.items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = items.project_id
      AND (
        auth.uid() = projects.created_by OR
        auth.uid() = ANY(projects.user_list)
      )
    )
  );

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Function to search items by text
CREATE OR REPLACE FUNCTION search_items(
  p_project_id UUID,
  p_query TEXT
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  type TEXT,
  description TEXT,
  relevance REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.name,
    i.type,
    i.description,
    ts_rank(
      to_tsvector('english', i.name || ' ' || COALESCE(i.description, '')),
      plainto_tsquery('english', p_query)
    ) as relevance
  FROM public.items i
  WHERE i.project_id = p_project_id
  AND to_tsvector('english', i.name || ' ' || COALESCE(i.description, '')) @@ plainto_tsquery('english', p_query)
  ORDER BY relevance DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get items by type
CREATE OR REPLACE FUNCTION get_items_by_type(
  p_project_id UUID,
  p_type TEXT
)
RETURNS SETOF public.items AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.items
  WHERE project_id = p_project_id
  AND type = p_type
  ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to add custom data to an item
CREATE OR REPLACE FUNCTION add_item_data(
  p_item_id UUID,
  p_key TEXT,
  p_value JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_data JSONB;
BEGIN
  UPDATE public.items
  SET data = data || jsonb_build_object(p_key, p_value)
  WHERE id = p_item_id
  RETURNING data INTO v_data;
  
  RETURN v_data;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- EXAMPLE DATA STRUCTURES
-- ===========================================

-- Example location item:
-- {
--   "name": "times square",
--   "type": "location",
--   "coords": POINT(-73.9855, 40.7580),
--   "data": {
--     "address": "Manhattan, NY 10036",
--     "city": "New York",
--     "country": "USA",
--     "neighbourhood": "Midtown"
--   },
--   "tags": ["landmark", "tourist", "commercial"],
--   "links": ["https://..."]
-- }

-- Example entity (person):
-- {
--   "name": "john doe",
--   "type": "entity",
--   "data": {
--     "title": "CEO",
--     "company": "Acme Corp",
--     "bio": "...",
--     "contact": {...}
--   },
--   "tags": ["executive", "tech"],
--   "links": ["https://linkedin.com/..."]
-- }

-- Example organization:
-- {
--   "name": "acme corporation",
--   "type": "organization",
--   "data": {
--     "industry": "Technology",
--     "founded": "2010",
--     "employees": "500-1000",
--     "headquarters": "San Francisco"
--   },
--   "tags": ["tech", "startup"],
--   "links": ["https://acme.com"]
-- }

-- Example custom type (keyword/concept):
-- {
--   "name": "quantum computing",
--   "type": "keyword",
--   "data": {
--     "category": "technology",
--     "related_topics": ["physics", "ai"],
--     "importance": "high"
--   },
--   "tags": ["research", "emerging-tech"]
-- }

-- Grant permissions
GRANT ALL ON public.items TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Items table created successfully!';
  RAISE NOTICE 'This replaces the old locations-only structure';
  RAISE NOTICE 'Supported types: location, entity, organization, keyword, custom';
  RAISE NOTICE 'Flexible JSONB data field for any additional information';
  RAISE NOTICE 'PostGIS support maintained for geospatial queries';
END $$;

