# OSINT Research Platform Upgrade Guide

## Overview

Real World Opera has been upgraded with open-source intelligence (OSINT) research capabilities. The system now supports automated web searching, natural language processing for entity extraction, cross-referencing, and iterative research cycles with user review.

## What's New

### Core Features

1. **Automated Web Search** - Multi-provider search across DuckDuckGo, Bing, and Google
2. **NLP Entity Extraction** - Automatic extraction of people, locations, organizations, and keywords from web content
3. **Cross-Referencing** - Match newly discovered entities with existing project items to avoid duplicates
4. **Review Queue** - User workflow to approve or reject findings before adding to project
5. **Automatic Geocoding** - Location findings are automatically geocoded and added to the map
6. **Research Cycles** - Iterative research that generates new queries from approved findings

### Database Schema

New tables added (run `database/migration_osint.sql` in Supabase):

- `sources` - Discovered web sources
- `source_items` - Links between sources and items
- `search_queries` - Tracked searches
- `research_cycles` - Investigation iterations
- `review_queue` - Pending findings awaiting review

### New Services

- **searchEngine.js** - Multi-provider search service
- **webScraper.js** - Content extraction from web pages
- **entityExtractor.js** - NLP entity extraction using compromise.js
- **locationParser.js** - Location extraction and geocoding
- **crossReference.js** - Entity matching and deduplication
- **queryGenerator.js** - Generate search queries from project items
- **cycleManager.js** - Research cycle orchestration
- **reviewQueue.js** - Review workflow management
- **jobQueue.js** - Background job processing

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

New packages added:
- `compromise` - NLP extraction
- `compromise-dates` - Date parsing
- `natural` - TF-IDF keyword extraction
- `cheerio` - HTML parsing
- `axios` - HTTP client
- `bottleneck` - Rate limiting
- `string-similarity` - Fuzzy matching
- `uuid` - Job IDs

### 2. Run Database Migration

In Supabase SQL Editor, run:

```sql
-- Copy entire contents of database/migration_osint.sql
-- Paste and execute
```

This creates all necessary tables and functions for OSINT features.

### 3. Configure API Keys (Optional)

Add to `.env` file:

```env
# Optional: For additional search providers
BING_API_KEY=your_bing_api_key
GOOGLE_API_KEY=your_google_api_key
GOOGLE_CX=your_custom_search_cx
```

**Note:** DuckDuckGo works without any API key, so the system functions with just the basic setup.

### 4. Start the Server

```bash
npm start
```

## Usage Guide

### Basic Workflow

1. **Start a Project**
   ```
   #myinvestigation
   ```

2. **Add Starter Items**
   ```
   +entity john doe
   +entity jane smith
   +keyword cryptocurrency
   +loc new york
   ```

3. **Start Research Cycle**
   ```
   /research start
   ```

4. **Monitor Progress**
   - System searches for combinations of your items
   - Extracts entities and locations from results
   - Cross-references with existing items
   - Adds findings to review queue

5. **Review Findings**
   ```
   /review
   ```

   Shows pending findings with context and confidence scores.

6. **Approve Relevant Findings**
   ```
   /approve 1
   /approve 2
   ```

   Approved items are automatically added to the project.

7. **Locations Auto-Added to Map**
   - Approved location findings are geocoded
   - Automatically added to map visualization
   - Project reloads to show new items

8. **Run Additional Cycles**
   ```
   /research start
   ```

   New queries are generated from recently added items.

### Commands Reference

#### Research Commands
- `/research` - Show research command help
- `/research start` - Start a new research cycle
- `/research stop` - Cancel current research cycle
- `/research status` - Show cycle progress and statistics

#### Review Commands
- `/review` - Show pending findings queue
- `/approve [number]` - Approve finding by index
- `/reject [number]` - Reject finding by index

#### Item Commands (Existing)
- `+entity [name]` - Add person/organization
- `+loc [address]` - Add location by address
- `+coords [lat,lng]` - Add location by coordinates
- `!itemname` - Query item details

## How It Works

### Research Cycle Flow

```
START
  ↓
[1] Generate search queries from current items
    - Single items: "john doe"
    - Pairs: "john doe cryptocurrency"
    - Triples: "john doe cryptocurrency new york"
  ↓
[2] Execute searches across providers
    - DuckDuckGo (no key needed)
    - Bing (if key provided)
    - Google CSE (if key provided)
  ↓
[3] Scrape content from result URLs
    - Extract title, snippet, full text
    - Rate limited to respect servers
  ↓
[4] Extract entities via NLP
    - People names
    - Organizations
    - Locations with geocoding
    - Keywords using TF-IDF
  ↓
[5] Cross-reference with existing items
    - Match against current project items
    - Calculate confidence scores
    - Mark as new or duplicate
  ↓
[6] Add to review queue
    - Only high-confidence findings (≥50%)
    - Includes context snippets
    - Linked to source URLs
  ↓
[STOP] - Wait for user review
  ↓
[USER REVIEWS]
  ↓
[7] Approved items → Add to project
  ↓
[8] Auto-geocode locations → Add to map
  ↓
COMPLETE
```

### Query Generation Strategy

Queries are generated intelligently based on item types:

- **Single terms**: Entity names, keywords
- **Entity + Keyword**: "person topic"
- **Entity + Location**: "person location"
- **Organization + Location**: "org location"
- **Triples**: "entity keyword location"

Maximum 50 queries per cycle to avoid rate limits.

### Confidence Scoring

Findings receive confidence scores (0-10) based on:

- Source credibility
- Entity mention frequency
- Cross-reference match quality
- Source type (news/public records higher)

Only findings with confidence ≥5.0 are queued for review.

## Architecture

### Service Layer

```
server/services/
├── osint/
│   ├── searchEngine.js      # Multi-provider search
│   └── webScraper.js        # Content extraction
├── nlp/
│   ├── entityExtractor.js   # NLP extraction
│   └── locationParser.js    # Location parsing
├── research/
│   ├── cycleManager.js      # Cycle orchestration
│   ├── queryGenerator.js    # Query creation
│   ├── crossReference.js    # Entity matching
│   └── reviewQueue.js       # Review workflow
└── queue/
    └── jobQueue.js          # Background jobs
```

### Database Tables

- `sources` - Web sources discovered
- `search_queries` - Queries executed
- `research_cycles` - Cycle tracking
- `review_queue` - Pending findings
- `source_items` - Source-item links
- `items` - Project items (existing)

### Real-Time Updates

Socket.io events emitted during research:

- `research:cycle_started` - Cycle beginning
- `research:query_generation_complete` - Queries generated
- `research:searching` - Search in progress
- `research:found` - Sources discovered
- `research:extraction_complete` - Entities extracted
- `research:review_ready` - Ready for review
- `research:cycle_complete` - Cycle finished

## Performance Considerations

### Rate Limiting

- DuckDuckGo: 1 req/sec
- Bing: 2 req/sec
- Google: 2 req/sec
- Geocoding: 500ms delay between requests
- Scraping: 1 req/sec with robots.txt respect

### Resource Usage

- Memory: ~200MB per active cycle
- CPU: Moderate during NLP processing
- Network: ~1MB per source scraped
- Storage: ~50KB per source (if storing full text)

### Scaling

For larger projects:

- Run database migration on Supabase
- Increase `maxQueries` in query generation
- Add more search API keys
- Consider Redis for distributed job queue

## Troubleshooting

### Research Not Starting

Check:
1. User is logged in (`/login`)
2. Project is open (`#projectname`)
3. Project has items to search

### No Results Found

Possible causes:
1. Item names too vague
2. Rate limits reached (wait 15min)
3. No search API keys configured (DuckDuckGo should still work)
4. Network issues

### Review Queue Empty

Possible causes:
1. All findings were duplicates
2. Confidence scores too low
3. Research still in progress

Check status: `/research status`

### Locations Not Appearing on Map

Check:
1. Location was approved (`/approve`)
2. Geocoding succeeded (check confidence)
3. Project reloads after approval

## Future Enhancements

Potential additions:

1. **Social Media Integration** - Twitter/X, Reddit APIs
2. **News APIs** - NewsAPI integration
3. **AI Extraction** - Optional OpenAI/Claude for deeper analysis
4. **Relationship Graph** - Visualize entity connections
5. **Timeline View** - Chronological event tracking
6. **Export Reports** - Generate investigation reports
7. **Auto-Search Mode** - Automatic cycles without review
8. **Collaborative Review** - Multiple users reviewing findings

## Security Notes

- No authentication required for DuckDuckGo search
- API keys stored in `.env` (not in code)
- Rate limiting prevents abuse
- User-controlled review workflow
- No automatic data sharing
- All data stored in user's Supabase project

## Support

For issues or questions:

1. Check `/research status` for errors
2. Review server logs for details
3. Verify database migration ran successfully
4. Check `.env` configuration

---

**Note:** This is an advanced feature. Start with simple item combinations and gradually expand as you become familiar with the system.

