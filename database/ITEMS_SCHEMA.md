# Items Table - Flexible Data Model

## Overview

The `items` table replaces the old `locations`-only structure with a **flexible, extensible design** that supports multiple item types.

## Item Types

### 1. **Location** 📍
Places with geographic coordinates
```javascript
{
  name: "times square",
  type: "location",
  coords: POINT(-73.9855, 40.7580),  // PostGIS geometry
  data: {
    address: "Manhattan, NY 10036",
    city: "New York",
    country: "USA",
    neighbourhood: "Midtown"
  },
  tags: ["landmark", "tourist", "commercial"],
  links: ["https://timessquarenyc.org"]
}
```

### 2. **Entity** 👤
Individuals/people
```javascript
{
  name: "elon musk",
  type: "entity",
  data: {
    title: "CEO",
    companies: ["Tesla", "SpaceX", "X"],
    bio: "Entrepreneur and business magnate",
    birthdate: "1971-06-28",
    nationality: "South African, Canadian, American"
  },
  tags: ["tech", "entrepreneur", "billionaire"],
  links: ["https://twitter.com/elonmusk"]
}
```

### 3. **Organization** 🏢
Companies, groups, institutions
```javascript
{
  name: "openai",
  type: "organization",
  data: {
    industry: "Artificial Intelligence",
    founded: "2015",
    founders: ["Sam Altman", "Elon Musk", "..."],
    headquarters: "San Francisco, CA",
    products: ["ChatGPT", "DALL-E", "GPT-4"]
  },
  tags: ["ai", "research", "tech"],
  links: ["https://openai.com"]
}
```

### 4. **Keyword** 🔑
Concepts, topics, research areas
```javascript
{
  name: "quantum computing",
  type: "keyword",
  data: {
    category: "technology",
    definition: "Computing using quantum-mechanical phenomena",
    related_topics: ["physics", "cryptography", "ai"],
    importance: "emerging",
    applications: ["drug discovery", "optimization"]
  },
  tags: ["research", "emerging-tech", "physics"]
}
```

### 5. **Custom** ✨
User-defined types
```javascript
{
  name: "project alpha",
  type: "custom",
  data: {
    // Anything you want!
    status: "active",
    priority: "high",
    deadline: "2025-12-31",
    team_size: 15,
    budget: 500000,
    custom_field_1: "value",
    nested: {
      data: "works too"
    }
  },
  tags: ["internal", "secret"]
}
```

## Schema Structure

```sql
items (
  id              UUID PRIMARY KEY
  project_id      UUID → projects(id)
  name            TEXT NOT NULL
  type            TEXT (location|entity|organization|keyword|custom)
  description     TEXT
  
  -- Geospatial (location items only)
  coords          GEOMETRY(POINT)     -- Single point
  bbox            GEOMETRY(POLYGON)   -- Area/region
  
  -- Flexible data
  data            JSONB               -- Any JSON structure
  tags            TEXT[]              -- Searchable tags
  links           TEXT[]              -- URLs
  notes           TEXT[]              -- Text notes
  
  -- Metadata
  added_by        UUID → users(id)
  created_at      TIMESTAMP
  updated_at      TIMESTAMP
)
```

## Advantages

### ✅ **Flexibility**
- Add any item type without schema changes
- Store different data for different types
- Users can define custom fields

### ✅ **Performance**
- PostGIS indexes for geospatial queries
- GIN index on JSONB for fast JSON queries
- Full-text search on name/description
- Type-specific indexes

### ✅ **Simplicity**
- One table instead of 3+
- Consistent API for all item types
- Easy to maintain

### ✅ **Future-Proof**
- Add new types anytime
- No migrations needed for new fields
- Backwards compatible

## Query Examples

### Get all locations in a project
```sql
SELECT * FROM items
WHERE project_id = 'xxx'
AND type = 'location'
AND coords IS NOT NULL;
```

### Get all entities (people)
```sql
SELECT * FROM items
WHERE project_id = 'xxx'
AND type = 'entity';
```

### Search by name
```sql
SELECT * FROM items
WHERE project_id = 'xxx'
AND name ILIKE '%musk%';
```

### Full-text search
```sql
SELECT * FROM search_items('project-uuid', 'quantum computing');
```

### Query JSONB data
```sql
-- Find all companies founded after 2010
SELECT * FROM items
WHERE type = 'organization'
AND (data->>'founded')::int > 2010;

-- Find entities with specific title
SELECT * FROM items
WHERE type = 'entity'
AND data->>'title' = 'CEO';
```

### Geospatial queries (locations only)
```sql
-- Find locations within 10km of a point
SELECT * FROM items
WHERE type = 'location'
AND ST_DWithin(
  coords::geography,
  ST_MakePoint(-73.9855, 40.7580)::geography,
  10000  -- meters
);
```

### Get items by tag
```sql
SELECT * FROM items
WHERE project_id = 'xxx'
AND 'tech' = ANY(tags);
```

## Migration Steps

### 1. Run the Migration
In Supabase SQL Editor:
```sql
-- Copy entire contents of migration_items.sql
-- Paste and run
```

### 2. Verify Tables
Check that:
- ✅ `items` table exists
- ✅ Old `locations` table removed
- ✅ Indexes created
- ✅ RLS policies active

### 3. Update Application Code
The `projects.js` file will need updates to:
- Use `items` table instead of `locations`
- Handle different item types
- Store flexible data in JSONB

## Example Usage in Code

```javascript
// Add a location
await supabase.from('items').insert({
  project_id: projectId,
  name: 'times square',
  type: 'location',
  coords: `POINT(-73.9855 40.7580)`,
  data: {
    address: 'Manhattan, NY 10036',
    city: 'New York'
  },
  tags: ['landmark', 'tourist'],
  added_by: userId
});

// Add an entity (person)
await supabase.from('items').insert({
  project_id: projectId,
  name: 'elon musk',
  type: 'entity',
  data: {
    title: 'CEO',
    companies: ['Tesla', 'SpaceX']
  },
  tags: ['tech', 'entrepreneur'],
  added_by: userId
});

// Add an organization
await supabase.from('items').insert({
  project_id: projectId,
  name: 'openai',
  type: 'organization',
  data: {
    industry: 'AI',
    founded: '2015'
  },
  tags: ['ai', 'research'],
  added_by: userId
});

// Query items by type
const { data: locations } = await supabase
  .from('items')
  .select('*')
  .eq('project_id', projectId)
  .eq('type', 'location');

// Search items
const { data: results } = await supabase
  .from('items')
  .select('*')
  .eq('project_id', projectId)
  .ilike('name', '%quantum%');

// Add custom data to existing item
await supabase.rpc('add_item_data', {
  p_item_id: itemId,
  p_key: 'custom_field',
  p_value: { foo: 'bar' }
});
```

## Benefits for Your Use Case

1. **Research Projects** - Mix locations, people, and organizations
2. **Investigation** - Link entities to organizations and locations
3. **Flexible Metadata** - Store whatever fields you need
4. **Relationships** - Use JSONB to store connections between items
5. **Extensible** - Add new types without database changes

## Next Steps

1. Run `migration_items.sql` in Supabase
2. Update `server/js/projects.js` to use new schema
3. Test adding different item types
4. Enjoy the flexibility! 🎉

