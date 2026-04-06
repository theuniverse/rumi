# Rumi Events Integration with Scraper - Detailed Implementation Plan

## Executive Summary

Integrate Rumi's event management system with the Scraper's reference data and extracted events to provide personalized event recommendations based on user's followed People and Places.

---

## 1. Current State Analysis

### Rumi Data Structure (Browser SQLite)
- **People**: `id`, `name`, `type`, `city`, `instagram`, `ra_url`, `bio`, `created_at`
  - No `followed` field currently exists
  - Has `person_tags` junction table for style associations

- **Places (Venues)**: `id`, `name`, `type`, `address`, `city`, `latitude`, `longitude`, `ra_id`, `amap_id`, `source`, `created_at`
  - No `followed` field currently exists
  - Has `venue_tags` junction table for style associations

- **Events**: `id`, `ra_event_id`, `title`, `venue_id`, `venue_name`, `date`, `start_time`, `end_time`, `ra_url`, `flyer_url`, `status`, `created_at`
  - Status: `interested`, `attended`, `skipped`
  - Has `event_lineup` table linking to people
  - Has `event_labels` junction table

### Scraper Data Structure (PostgreSQL)
- **RefVenue**: `id`, `name`, `aliases[]`, `type`, `address`, `city`, `ra_id`, `followed`, `created_at`, `updated_at`

- **RefArtist**: `id`, `name`, `aliases[]`, `type`, `city`, `ra_url`, `followed`, `created_at`, `updated_at`

- **RefLabel**: `id`, `name`, `aliases[]`, `type`, `city`, `ra_id`, `followed`, `created_at`, `updated_at`

- **ExtractedEvent**: `id`, `page_id`, `event_name`, `event_date`, `venue`, `city`, `info_level`, `status`, `confidence`, `raw_json`, `ref_venue_id`, `has_followed_match`, `pushed_to_rumi`, `created_at`, `updated_at`
  - Has `timetable_slots` with artist information
  - Has `event_entity_matches` linking to ref entities

### Key Observations
1. **Missing Link**: Rumi People/Places don't have `followed` field yet
2. **Existing API**: Scraper already has `/refdata/matched-events` endpoint
3. **Current Events Page**: Shows only manually added events from Rumi DB
4. **Matching System**: Scraper has entity matching logic already implemented

---

## 2. Data Association Design

### Strategy: Dual-Direction Linking

#### Approach: Manual Linking via UI Dropdown (User-Selected)

Store scraper entity IDs in Rumi for direct lookups:
- Add `scraper_artist_id` to Rumi `people` table
- Add `scraper_venue_id` to Rumi `venues` table
- Add `scraper_label_id` to Rumi `labels` table

**User Workflow**:
1. User edits a Person/Place in Rumi
2. A dropdown/combobox shows available Scraper entities (fetched from API)
3. User selects the matching entity from the dropdown
4. The scraper ID is automatically saved to the Rumi entity
5. Once linked, the entity can be used for event recommendations

**Pros**:
- User has full control over linking
- No false matches
- Clear, explicit associations
- Can suggest matches but user confirms

**Cons**:
- Requires manual action from user
- Initial setup time for linking entities

**Fallback**:
- For unlinked entities, they won't appear in recommendations
- User can link them at any time

### Schema Changes Required

#### Rumi Database (SQLite)
```sql
-- Add followed flag to people
ALTER TABLE people ADD COLUMN followed INTEGER NOT NULL DEFAULT 0;

-- Add scraper reference IDs for linking
ALTER TABLE people ADD COLUMN scraper_artist_id INTEGER;
ALTER TABLE venues ADD COLUMN scraper_venue_id INTEGER;
ALTER TABLE labels ADD COLUMN scraper_label_id INTEGER;

-- Add source field to events to distinguish origin
ALTER TABLE events ADD COLUMN source TEXT DEFAULT 'manual'
  CHECK(source IN ('manual', 'scraper', 'ra_sync'));

-- Add scraper event ID for deduplication
ALTER TABLE events ADD COLUMN scraper_event_id INTEGER;
```

---

## 3. Event Discovery Algorithms

### Algorithm 1: Events by Followed People (Artists)

**Input**: List of followed Rumi People with `scraper_artist_id`

**Process**:
1. Query Rumi for all people where `followed = 1`
2. Extract their `scraper_artist_id` values
3. Call scraper API: `GET /refdata/events-by-artists?artist_ids=1,2,3`
4. Scraper queries:
   ```sql
   SELECT DISTINCT e.*
   FROM extracted_events e
   JOIN event_entity_matches m ON e.id = m.event_id
   WHERE m.entity_type = 'artist'
     AND m.entity_id IN (artist_ids)
     AND e.event_date >= CURRENT_DATE
     AND e.status != 'tba'
   ORDER BY e.event_date ASC
   ```

**Scoring Factors**:
- Number of followed artists in lineup (weight: 3x)
- Event date proximity (weight: 2x)
- Venue match if also followed (weight: 1.5x)
- Confidence score from extraction (weight: 1x)

### Algorithm 2: Events by Followed Places (Venues)

**Input**: List of followed Rumi Places with `scraper_venue_id`

**Process**:
1. Query Rumi for all venues where `followed = 1`
2. Extract their `scraper_venue_id` values
3. Call scraper API: `GET /refdata/events-by-venues?venue_ids=1,2,3`
4. Scraper queries:
   ```sql
   SELECT e.*
   FROM extracted_events e
   WHERE e.ref_venue_id IN (venue_ids)
     AND e.event_date >= CURRENT_DATE
     AND e.status != 'tba'
   ORDER BY e.event_date ASC
   ```

**Scoring Factors**:
- Venue is followed (weight: 2x)
- Any followed artists in lineup (weight: 2x)
- Event date proximity (weight: 1.5x)
- Confidence score (weight: 1x)

### Combined Recommendation Algorithm

```typescript
interface RecommendedEvent {
  scraper_event_id: number;
  title: string;
  date: string;
  venue: string;
  artists: string[];
  score: number;
  match_reasons: string[]; // ["2 followed artists", "followed venue"]
  confidence: number;
}

function calculateScore(event, followedArtists, followedVenues): number {
  let score = 0;
  const reasons = [];

  // Artist matches
  const matchedArtists = event.artists.filter(a => followedArtists.includes(a));
  if (matchedArtists.length > 0) {
    score += matchedArtists.length * 3;
    reasons.push(`${matchedArtists.length} followed artist(s)`);
  }

  // Venue match
  if (followedVenues.includes(event.venue_id)) {
    score += 2;
    reasons.push("followed venue");
  }

  // Date proximity (next 30 days = higher score)
  const daysUntil = daysBetween(today, event.date);
  if (daysUntil <= 7) score += 2;
  else if (daysUntil <= 30) score += 1;

  // Confidence
  score += event.confidence;

  return { score, reasons };
}
```

---

## 4. API Design

### New Scraper Endpoints

#### GET `/refdata/events-by-artists`
Query events featuring specific artists.

**Parameters**:
- `artist_ids`: comma-separated list of RefArtist IDs
- `date_from`: optional, default today
- `date_to`: optional, default +90 days
- `limit`: optional, default 50

**Response**:
```json
{
  "items": [
    {
      "id": 123,
      "event_name": "Techno Night",
      "event_date": "2026-04-15",
      "venue": "Club X",
      "ref_venue_id": 5,
      "city": "Shanghai",
      "confidence": 0.95,
      "matched_artists": [
        {"id": 1, "name": "DJ Alpha", "raw_name": "DJ Alpha"}
      ],
      "timetable_slots": [...]
    }
  ]
}
```

#### GET `/refdata/events-by-venues`
Query events at specific venues.

**Parameters**:
- `venue_ids`: comma-separated list of RefVenue IDs
- `date_from`: optional
- `date_to`: optional
- `limit`: optional

**Response**: Similar structure to events-by-artists

#### GET `/refdata/recommended-events`
Combined recommendation endpoint (optional, for convenience).

**Parameters**:
- `artist_ids`: optional
- `venue_ids`: optional
- `label_ids`: optional
- `limit`: optional

**Response**: Merged and scored results from all sources

### Rumi Frontend API Extensions

Update `frontend/src/lib/scraper-api.ts`:

```typescript
export const scraperApi = {
  // ... existing methods ...

  getEventsByArtists: (artistIds: number[], params?: {
    date_from?: string;
    date_to?: string;
    limit?: number
  }) =>
    get<{ items: RecommendedEvent[] }>(
      "/refdata/events-by-artists",
      { artist_ids: artistIds.join(','), ...params }
    ),

  getEventsByVenues: (venueIds: number[], params?: {
    date_from?: string;
    date_to?: string;
    limit?: number
  }) =>
    get<{ items: RecommendedEvent[] }>(
      "/refdata/events-by-venues",
      { venue_ids: venueIds.join(','), ...params }
    ),
};
```

---

## 5. UI/UX Design

### Events Page Redesign

```
┌─────────────────────────────────────────────────────┐
│ Events                                              │
│ Discover events from your followed artists & venues │
├─────────────────────────────────────────────────────┤
│                                                     │
│ [My Events] [Recommended] [All]                     │
│                                                     │
│ ┌─ My Events ─────────────────────────────────┐   │
│ │                                              │   │
│ │ ⏰ Upcoming                                  │   │
│ │ ┌──────────────────────────────────────┐    │   │
│ │ │ Apr 15  Techno Night                 │    │   │
│ │ │         Club X                       │    │   │
│ │ │         [Attending ✓] [RA] [×]       │    │   │
│ │ └──────────────────────────────────────┘    │   │
│ │                                              │   │
│ │ ✓ Past                                       │   │
│ │ ...                                          │   │
│ └──────────────────────────────────────────────┘   │
│                                                     │
│ ┌─ Recommended for You ───────────────────────┐   │
│ │                                              │   │
│ │ ┌──────────────────────────────────────┐    │   │
│ │ │ Apr 20  House Session                │    │   │
│ │ │         Warehouse Y                  │    │   │
│ │ │         🎧 2 followed artists         │    │   │
│ │ │         [I'm Attending] [RA] [Skip]  │    │   │
│ │ └──────────────────────────────────────┘    │   │
│ │                                              │   │
│ └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Event Card Components

**My Events Card**:
- Date & time
- Event title
- Venue name
- Status badge (Attending/Attended/Skipped)
- Quick actions: View on RA, Delete
- Expandable: Show lineup

**Recommended Event Card**:
- Date & time
- Event title
- Venue name
- Match indicators (badges showing why recommended)
- Primary action: "I'm Attending" button
- Secondary actions: View on RA, Skip
- Expandable: Show full lineup and details

### Button States

**"I'm Attending" Button**:
1. Default: Outlined button, "I'm Attending"
2. On click: Add to Rumi events with status='interested'
3. After add: Changes to "Attending ✓" (filled button)
4. Can cycle through: Attending → Attended → Skipped → Remove

---

## 6. Implementation Phases

### Phase 1: Data Architecture & Schema (2-3 days)

**Tasks**:
- [ ] Add `followed` column to Rumi `people` table
- [ ] Add `followed` column to Rumi `venues` table (if not exists)
- [ ] Add scraper reference ID columns (`scraper_artist_id`, `scraper_venue_id`, `scraper_label_id`)
- [ ] Add `source` and `scraper_event_id` columns to `events` table
- [ ] Create database migration script
- [ ] Update TypeScript types in `frontend/src/lib/types.ts`
- [ ] Update `frontend/src/lib/db.ts` with new schema and helper functions

**Deliverables**:
- Updated database schema
- Migration script
- Updated TypeScript interfaces

### Phase 2: Scraper Backend (3-4 days)

**Tasks**:
- [ ] Create `/refdata/events-by-artists` endpoint in `scraper/app/routers/refdata.py`
- [ ] Create `/refdata/events-by-venues` endpoint
- [ ] Implement event scoring logic
- [ ] Add filtering by date range
- [ ] Add pagination support
- [ ] Write unit tests for endpoints
- [ ] Update API documentation

**Deliverables**:
- New scraper API endpoints
- Test coverage
- API documentation

### Phase 3: Frontend Data Layer (2-3 days)

**Tasks**:
- [ ] Update `frontend/src/lib/scraper-api.ts` with new endpoint methods
- [ ] Add helper functions in `frontend/src/lib/db.ts`:
  - `getFollowedPeople()` - returns people where followed=1
  - `getFollowedVenues()` - returns venues where followed=1
  - `addEventFromScraper(scraperEvent)` - converts and saves scraper event
  - `isEventInMyEvents(scraperEventId)` - checks if already added
- [ ] Create `frontend/src/lib/event-recommendations.ts`:
  - `fetchRecommendedEvents()` - orchestrates API calls
  - `mergeAndScoreEvents()` - combines results
  - `deduplicateEvents()` - removes duplicates
- [ ] Update existing event management functions

**Deliverables**:
- Updated API client
- Event recommendation logic
- Helper functions

### Phase 4: UI Components (3-4 days)

**Tasks**:
- [ ] Redesign `frontend/src/pages/Events.tsx`:
  - Add tab navigation (My Events / Recommended)
  - Create `MyEventsSection` component
  - Create `RecommendedEventsSection` component
- [ ] Create `RecommendedEventCard` component:
  - Display event details
  - Show match reasons (badges)
  - "I'm Attending" button with state management
  - Skip functionality
- [ ] Update existing `EventRow` component if needed
- [ ] Add loading states and error handling
- [ ] Add empty states for each section
- [ ] Implement real-time updates when adding events

**Deliverables**:
- Redesigned Events page
- New UI components
- Responsive design

### Phase 5: Follow Feature & Linking UI (3-4 days)

**Tasks**:
- [ ] Update `frontend/src/pages/People.tsx`:
  - Add "Link to Scraper" dropdown/combobox in edit mode
  - Fetch available RefArtists from scraper API
  - Display dropdown with searchable list
  - Save selected `scraper_artist_id` on selection
  - Show linked status (e.g., "Linked to: DJ Alpha ✓")
  - Ensure follow button works with new schema
  - Update API calls to save `followed` flag
- [ ] Update `frontend/src/pages/Places.tsx`:
  - Add "Link to Scraper" dropdown/combobox in edit mode
  - Fetch available RefVenues from scraper API
  - Display dropdown with searchable list
  - Save selected `scraper_venue_id` on selection
  - Show linked status (e.g., "Linked to: Club X ✓")
  - Ensure follow button works with new schema
  - Update API calls to save `followed` flag
- [ ] Create reusable `ScraperEntitySelector` component:
  - Props: entity type (artist/venue/label), current value, onChange
  - Searchable dropdown with fuzzy matching
  - Shows entity name, city, type
  - "Clear link" option
- [ ] Add visual indicators for followed and linked entities
- [ ] Test follow/unfollow flow
- [ ] Test linking/unlinking flow

**Deliverables**:
- Working follow functionality
- Entity linking UI with dropdown selectors
- Visual feedback for linked status

### Phase 6: Synchronization & Smart Suggestions (2 days)

**Tasks**:
- [ ] Implement smart suggestions in dropdown:
  - When user opens dropdown, highlight suggested matches
  - Match by `ra_id` or `ra_url` if available
  - Match by name similarity (show confidence %)
  - Sort suggestions by confidence
- [ ] Add "Sync Recommendations" button on Events page
- [ ] Implement deduplication logic for events
- [ ] Handle edge cases:
  - Deleted scraper events
  - Updated scraper entity names
  - Broken links (entity deleted in scraper)
- [ ] Add bulk linking helper (optional):
  - Show list of unlinked entities
  - Suggest matches for each
  - Allow quick review and linking

**Deliverables**:
- Smart matching suggestions in dropdowns
- Sync mechanism
- Deduplication logic
- Bulk linking helper (optional)

### Phase 7: Testing & Polish (2-3 days)

**Tasks**:
- [ ] End-to-end testing:
  - Follow a person → see their events in recommendations
  - Follow a venue → see venue events in recommendations
  - Add event to "My Events" → verify it appears correctly
  - Cycle through event statuses
- [ ] Performance testing:
  - Test with large numbers of followed entities
  - Optimize queries if needed
- [ ] UI/UX polish:
  - Smooth transitions
  - Loading states
  - Error messages
- [ ] Documentation:
  - Update README
  - Add user guide
  - Document API changes

**Deliverables**:
- Tested, working feature
- Documentation
- Performance optimizations

---

## 7. Technical Considerations

### Performance Optimization

1. **Caching**: Cache scraper API responses for 5-10 minutes
2. **Pagination**: Load recommendations in batches
3. **Lazy Loading**: Load event details on expand
4. **Debouncing**: Debounce follow/unfollow actions

### Error Handling

1. **Network Errors**: Graceful fallback, retry logic
2. **Missing Data**: Handle events without venue/artist matches
3. **Stale Data**: Show last updated timestamp
4. **API Limits**: Respect rate limits, show appropriate messages

### Data Consistency

1. **Deduplication**: Check `scraper_event_id` before adding
2. **Updates**: Handle when scraper event details change
3. **Deletions**: Handle when scraper events are removed
4. **Conflicts**: Resolve when same event exists in both systems

### Security & Privacy

1. **API Authentication**: Ensure scraper API is properly secured
2. **Data Validation**: Validate all inputs from scraper
3. **XSS Prevention**: Sanitize event titles and descriptions
4. **Rate Limiting**: Implement on both frontend and backend

---

## 8. Future Enhancements

### Phase 8+ (Optional)

1. **Smart Notifications**:
   - Notify when followed artists announce new events
   - Weekly digest of upcoming events

2. **Calendar Integration**:
   - Export to Google Calendar / iCal
   - Sync with device calendar

3. **Social Features**:
   - See which friends are attending
   - Share events

4. **Advanced Filtering**:
   - Filter by genre/style tags
   - Filter by date range
   - Filter by city

5. **Event History & Analytics**:
   - Track attendance patterns
   - Discover new artists based on history
   - Generate year-in-review

6. **Ticket Integration**:
   - Link to ticket platforms
   - Track ticket purchases

---

## 9. Success Metrics

### Key Performance Indicators

1. **Adoption**: % of users who follow at least one artist/venue
2. **Engagement**: Average number of events added per user per month
3. **Accuracy**: % of recommended events that users add to "My Events"
4. **Coverage**: % of followed entities that have upcoming events
5. **Performance**: API response time < 500ms for recommendations

### User Feedback

1. Survey users after 2 weeks of usage
2. Track feature usage analytics
3. Monitor error rates and user complaints
4. A/B test different recommendation algorithms

---

## 10. Risk Mitigation

### Potential Risks

1. **Data Quality**: Scraper events may have incomplete/incorrect data
   - **Mitigation**: Show confidence scores, allow user corrections

2. **Performance**: Too many followed entities → slow recommendations
   - **Mitigation**: Implement pagination, caching, limits

3. **Maintenance**: Scraper schema changes break integration
   - **Mitigation**: Version API, comprehensive tests, monitoring

4. **User Confusion**: Complex UI with two event sources
   - **Mitigation**: Clear labeling, onboarding guide, tooltips

---

## 11. Timeline Summary

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Data Architecture | 2-3 days | None |
| Phase 2: Scraper Backend | 3-4 days | Phase 1 |
| Phase 3: Frontend Data Layer | 2-3 days | Phase 1, 2 |
| Phase 4: UI Components | 3-4 days | Phase 3 |
| Phase 5: Follow Integration | 2 days | Phase 4 |
| Phase 6: Linking & Sync | 2-3 days | Phase 5 |
| Phase 7: Testing & Polish | 2-3 days | All previous |
| **Total** | **16-22 days** | |

---

## 12. Next Steps

1. **Review this plan** with stakeholders
2. **Prioritize phases** based on business needs
3. **Set up development environment** for scraper integration
4. **Create detailed tickets** for each task
5. **Begin Phase 1** implementation

---

## Appendix A: Data Flow Diagram

```
┌─────────────┐
│   User      │
│  Interface  │
└──────┬──────┘
       │
       │ 1. User follows Artist/Venue
       ↓
┌─────────────────────────────────┐
│  Rumi Frontend (Browser)        │
│  - Updates local SQLite DB      │
│  - Sets followed=1              │
└──────┬──────────────────────────┘
       │
       │ 2. Fetch recommendations
       ↓
┌─────────────────────────────────┐
│  Scraper API                    │
│  GET /refdata/events-by-artists │
│  GET /refdata/events-by-venues  │
└──────┬──────────────────────────┘
       │
       │ 3. Query matched events
       ↓
┌─────────────────────────────────┐
│  Scraper Database (PostgreSQL)  │
│  - extracted_events             │
│  - event_entity_matches         │
│  - ref_artists, ref_venues      │
└──────┬──────────────────────────┘
       │
       │ 4. Return scored events
       ↓
┌─────────────────────────────────┐
│  Rumi Frontend                  │
│  - Display recommendations      │
│  - User clicks "I'm Attending"  │
└──────┬──────────────────────────┘
       │
       │ 5. Add to My Events
       ↓
┌─────────────────────────────────┐
│  Rumi SQLite DB                 │
│  - INSERT into events table     │
│  - source='scraper'             │
│  - scraper_event_id=123         │
└─────────────────────────────────┘
```

---

## Appendix B: Example API Responses

### GET `/refdata/events-by-artists?artist_ids=1,2&limit=10`

```json
{
  "items": [
    {
      "id": 456,
      "event_name": "Techno Marathon",
      "event_date": "2026-04-20",
      "start_time": "22:00",
      "end_time": "06:00",
      "venue": "Warehouse X",
      "ref_venue_id": 12,
      "city": "Shanghai",
      "info_level": 3,
      "status": "complete",
      "confidence": 0.95,
      "matched_artists": [
        {
          "entity_id": 1,
          "name": "DJ Alpha",
          "raw_name": "DJ Alpha",
          "confidence": 1.0
        },
        {
          "entity_id": 2,
          "name": "Producer Beta",
          "raw_name": "Beta",
          "confidence": 0.9
        }
      ],
      "timetable_slots": [
        {
          "stage_name": "Main Floor",
          "start_time": "22:00",
          "end_time": "00:00",
          "artists": ["DJ Alpha"],
          "is_b2b": false,
          "set_type": "DJ"
        },
        {
          "stage_name": "Main Floor",
          "start_time": "02:00",
          "end_time": "04:00",
          "artists": ["Producer Beta"],
          "is_b2b": false,
          "set_type": "Live"
        }
      ],
      "page_url": "https://example.com/event-page",
      "created_at": "2026-04-01T10:00:00Z"
    }
  ],
  "total": 15,
  "has_more": true
}
```

---

*End of Plan*
