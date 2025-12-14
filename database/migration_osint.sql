-- Migration: Add OSINT research capabilities tables
-- Run this after schema.sql and migration_items.sql

-- ===========================================
-- SOURCES TABLE
-- Stores discovered web sources (articles, pages, social media posts)
-- ===========================================

CREATE TABLE IF NOT EXISTS public.sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  snippet TEXT,
  full_text TEXT,  -- Optional, for storing scraped content
  discovered_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  source_type TEXT CHECK (source_type IN ('web', 'social', 'news', 'public_record', 'archive')),
  provider TEXT,  -- Which search provider found it (duckduckgo, bing, etc.)
  credibility_score NUMERIC(3,1) DEFAULT 0,  -- 0-10 scale
  
  -- Additional metadata
  metadata JSONB DEFAULT '{}'::jsonb,  -- Store author, date, etc.
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sources_url_idx ON public.sources(url);
CREATE INDEX IF NOT EXISTS sources_type_idx ON public.sources(source_type);
CREATE INDEX IF NOT EXISTS sources_discovered_date_idx ON public.sources(discovered_date DESC);
CREATE INDEX IF NOT EXISTS sources_metadata_idx ON public.sources USING GIN (metadata);

-- ===========================================
-- SOURCE_ITEMS JUNCTION TABLE
-- Links sources to items that were mentioned/found in them
-- ===========================================

CREATE TABLE IF NOT EXISTS public.source_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID REFERENCES public.sources(id) ON DELETE CASCADE NOT NULL,
  item_id UUID REFERENCES public.items(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  
  -- Context of how the item appeared in the source
  context TEXT,  -- Snippet showing how it appeared
  mention_count INTEGER DEFAULT 1,  -- How many times mentioned
  confidence NUMERIC(3,1) DEFAULT 0,  -- Confidence this is the same entity
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(source_id, item_id)
);

CREATE INDEX IF NOT EXISTS source_items_source_id_idx ON public.source_items(source_id);
CREATE INDEX IF NOT EXISTS source_items_item_id_idx ON public.source_items(item_id);
CREATE INDEX IF NOT EXISTS source_items_project_id_idx ON public.source_items(project_id);

-- ===========================================
-- SEARCH_QUERIES TABLE
-- Tracks automated searches performed
-- ===========================================

CREATE TABLE IF NOT EXISTS public.search_queries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  cycle_id UUID,  -- References research_cycles table (created below)
  
  query_string TEXT NOT NULL,
  entity_combinations TEXT[],  -- Which items were combined for this query
  
  -- Search execution details
  status TEXT CHECK (status IN ('pending', 'searching', 'completed', 'failed')) DEFAULT 'pending',
  results_count INTEGER DEFAULT 0,
  providers_tried TEXT[] DEFAULT '{}',
  providers_succeeded TEXT[] DEFAULT '{}',
  error_message TEXT,
  
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS search_queries_project_id_idx ON public.search_queries(project_id);
CREATE INDEX IF NOT EXISTS search_queries_cycle_id_idx ON public.search_queries(cycle_id);
CREATE INDEX IF NOT EXISTS search_queries_status_idx ON public.search_queries(status);
CREATE INDEX IF NOT EXISTS search_queries_created_at_idx ON public.search_queries(created_at DESC);

-- ===========================================
-- RESEARCH_CYCLES TABLE
-- Tracks investigation iterations
-- ===========================================

CREATE TABLE IF NOT EXISTS public.research_cycles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  cycle_number INTEGER NOT NULL,
  
  -- Statistics
  items_added INTEGER DEFAULT 0,
  sources_found INTEGER DEFAULT 0,
  queries_executed INTEGER DEFAULT 0,
  findings_count INTEGER DEFAULT 0,  -- Items in review queue
  
  -- Status
  status TEXT CHECK (status IN ('pending', 'generating_queries', 'searching', 'scraping', 'extracting', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',
  
  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Options
  auto_search BOOLEAN DEFAULT false,  -- If true, triggers next cycle automatically
  max_depth INTEGER DEFAULT 3,  -- Maximum cycle depth
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- One cycle at a time per project
  UNIQUE(project_id, cycle_number)
);

CREATE INDEX IF NOT EXISTS research_cycles_project_id_idx ON public.research_cycles(project_id);
CREATE INDEX IF NOT EXISTS research_cycles_status_idx ON public.research_cycles(status);
CREATE INDEX IF NOT EXISTS research_cycles_started_at_idx ON public.research_cycles(started_at DESC);

-- Add cycle_id to search_queries now that the table exists
ALTER TABLE public.search_queries 
  ADD CONSTRAINT search_queries_cycle_id_fkey 
  FOREIGN KEY (cycle_id) REFERENCES public.research_cycles(id) ON DELETE CASCADE;

-- ===========================================
-- REVIEW_QUEUE TABLE
-- Pending findings awaiting user review
-- ===========================================

CREATE TABLE IF NOT EXISTS public.review_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  cycle_id UUID REFERENCES public.research_cycles(id) ON DELETE CASCADE NOT NULL,
  source_id UUID REFERENCES public.sources(id) ON DELETE CASCADE NOT NULL,
  
  -- Extracted data
  extracted_data JSONB NOT NULL,  -- The actual finding (entity name, location, etc.)
  finding_type TEXT CHECK (finding_type IN ('entity', 'location', 'organization', 'keyword', 'custom')) NOT NULL,
  confidence_score NUMERIC(3,1) NOT NULL,  -- 0-10 confidence this is relevant
  
  -- Context
  context_snippet TEXT,  -- Where/when this was found
  source_url TEXT,  -- Duplicate for easy access
  
  -- Review status
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES auth.users(id),
  approved BOOLEAN,  -- true/false/null
  review_notes TEXT,
  
  -- If approved, the created item_id
  item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Priority queue by confidence, then date
  CONSTRAINT valid_review_state CHECK (
    (reviewed_at IS NULL) = (reviewed_by IS NULL) = (approved IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS review_queue_project_id_idx ON public.review_queue(project_id);
CREATE INDEX IF NOT EXISTS review_queue_cycle_id_idx ON public.review_queue(cycle_id);
CREATE INDEX IF NOT EXISTS review_queue_approved_idx ON public.review_queue(approved);
CREATE INDEX IF NOT EXISTS review_queue_confidence_idx ON public.review_queue(confidence_score DESC);
CREATE INDEX IF NOT EXISTS review_queue_created_at_idx ON public.review_queue(created_at);
CREATE INDEX IF NOT EXISTS review_queue_pending_idx ON public.review_queue(project_id, approved) WHERE approved IS NULL;

-- ===========================================
-- TRIGGERS FOR UPDATED_AT
-- ===========================================

CREATE TRIGGER update_sources_updated_at
  BEFORE UPDATE ON public.sources
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ===========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ===========================================

ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_queue ENABLE ROW LEVEL SECURITY;

-- SOURCES POLICIES
CREATE POLICY "Sources viewable if project accessible"
  ON public.sources FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.source_items
      WHERE source_items.source_id = sources.id
      AND EXISTS (
        SELECT 1 FROM public.projects
        WHERE projects.id = source_items.project_id
        AND (
          NOT projects.locked OR
          auth.uid() = projects.created_by OR
          auth.uid() = ANY(projects.user_list)
        )
      )
    )
  );

-- SOURCE_ITEMS POLICIES
CREATE POLICY "Source items viewable if project accessible"
  ON public.source_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = source_items.project_id
      AND (
        NOT projects.locked OR
        auth.uid() = projects.created_by OR
        auth.uid() = ANY(projects.user_list)
      )
    )
  );

-- SEARCH_QUERIES POLICIES
CREATE POLICY "Search queries viewable if project accessible"
  ON public.search_queries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = search_queries.project_id
      AND (
        NOT projects.locked OR
        auth.uid() = projects.created_by OR
        auth.uid() = ANY(projects.user_list)
      )
    )
  );

-- RESEARCH_CYCLES POLICIES
CREATE POLICY "Research cycles viewable if project accessible"
  ON public.research_cycles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = research_cycles.project_id
      AND (
        NOT projects.locked OR
        auth.uid() = projects.created_by OR
        auth.uid() = ANY(projects.user_list)
      )
    )
  );

-- REVIEW_QUEUE POLICIES
CREATE POLICY "Review queue viewable if project accessible"
  ON public.review_queue FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = review_queue.project_id
      AND (
        NOT projects.locked OR
        auth.uid() = projects.created_by OR
        auth.uid() = ANY(projects.user_list)
      )
    )
  );

CREATE POLICY "Project members can update review queue"
  ON public.review_queue FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = review_queue.project_id
      AND (
        auth.uid() = projects.created_by OR
        auth.uid() = ANY(projects.user_list)
      )
    )
  );

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Function to get pending review items for a project
CREATE OR REPLACE FUNCTION get_pending_reviews(p_project_id UUID, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id UUID,
  finding_type TEXT,
  extracted_data JSONB,
  confidence_score NUMERIC,
  context_snippet TEXT,
  source_url TEXT,
  source_title TEXT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rq.id,
    rq.finding_type,
    rq.extracted_data,
    rq.confidence_score,
    rq.context_snippet,
    rq.source_url,
    s.title as source_title,
    rq.created_at
  FROM public.review_queue rq
  JOIN public.sources s ON s.id = rq.source_id
  WHERE rq.project_id = p_project_id
  AND rq.approved IS NULL
  ORDER BY rq.confidence_score DESC, rq.created_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get cycle statistics
CREATE OR REPLACE FUNCTION get_cycle_stats(p_cycle_id UUID)
RETURNS TABLE (
  cycle_number INTEGER,
  status TEXT,
  queries_total INTEGER,
  queries_completed INTEGER,
  sources_found INTEGER,
  findings_pending INTEGER,
  findings_approved INTEGER,
  findings_rejected INTEGER,
  items_added INTEGER,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rc.cycle_number,
    rc.status,
    COUNT(DISTINCT sq.id)::INTEGER as queries_total,
    COUNT(DISTINCT CASE WHEN sq.status = 'completed' THEN sq.id END)::INTEGER as queries_completed,
    rc.sources_found,
    COUNT(DISTINCT CASE WHEN rq.approved IS NULL THEN rq.id END)::INTEGER as findings_pending,
    COUNT(DISTINCT CASE WHEN rq.approved = true THEN rq.id END)::INTEGER as findings_approved,
    COUNT(DISTINCT CASE WHEN rq.approved = false THEN rq.id END)::INTEGER as findings_rejected,
    rc.items_added,
    rc.started_at,
    rc.completed_at
  FROM public.research_cycles rc
  LEFT JOIN public.search_queries sq ON sq.cycle_id = rc.id
  LEFT JOIN public.review_queue rq ON rq.cycle_id = rc.id
  WHERE rc.id = p_cycle_id
  GROUP BY rc.cycle_number, rc.status, rc.sources_found, rc.items_added, rc.started_at, rc.completed_at;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- GRANTS
-- ===========================================

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;

-- ===========================================
-- SUCCESS MESSAGE
-- ===========================================

DO $$
BEGIN
  RAISE NOTICE 'OSINT research tables created successfully!';
  RAISE NOTICE 'Tables: sources, source_items, search_queries, research_cycles, review_queue';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Install required npm packages (see plan)';
  RAISE NOTICE '2. Implement search service';
  RAISE NOTICE '3. Implement NLP extraction';
  RAISE NOTICE '4. Build research cycle manager';
END $$;

