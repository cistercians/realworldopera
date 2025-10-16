-- Function to get items with geometries as text
CREATE OR REPLACE FUNCTION get_project_items(p_project_id UUID)
RETURNS TABLE (
  id UUID,
  project_id UUID,
  name TEXT,
  type TEXT,
  description TEXT,
  data JSONB,
  tags TEXT[],
  links TEXT[],
  notes TEXT[],
  added_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  coords_text TEXT,
  bbox_text TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id,
    i.project_id,
    i.name,
    i.type,
    i.description,
    i.data,
    i.tags,
    i.links,
    i.notes,
    i.added_by,
    i.created_at,
    i.updated_at,
    ST_AsText(i.coords) as coords_text,
    ST_AsText(i.bbox) as bbox_text
  FROM items i
  WHERE i.project_id = p_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

