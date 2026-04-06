/**
 * Event recommendation logic - fetches and scores events from scraper
 * based on user's followed people and places.
 */

import { scraperApi, type RecommendedEvent } from "./scraper-api";
import { getFollowedPeopleWithScraperIds, getFollowedVenuesWithScraperIds, isScraperEventAdded } from "./db";

export interface ScoredEvent extends RecommendedEvent {
  score: number;
  matchReasons: string[];
  isAdded: boolean;
}

/**
 * Fetch all recommended events based on followed entities
 */
export async function fetchRecommendedEvents(): Promise<ScoredEvent[]> {
  try {
    console.log('[fetchRecommendedEvents] Starting fetch...');

    // Get followed entities with scraper IDs
    const [followedPeople, followedVenues] = await Promise.all([
      getFollowedPeopleWithScraperIds(),
      getFollowedVenuesWithScraperIds(),
    ]);

    console.log('[fetchRecommendedEvents] Followed people:', followedPeople);
    console.log('[fetchRecommendedEvents] Followed venues:', followedVenues);

    const artistIds = followedPeople.map(p => p.scraper_artist_id);
    const venueIds = followedVenues.map(v => v.scraper_venue_id);

    console.log('[fetchRecommendedEvents] Artist IDs:', artistIds);
    console.log('[fetchRecommendedEvents] Venue IDs:', venueIds);

    // Fetch events from both sources
    const promises: Promise<{ items: RecommendedEvent[] }>[] = [];

    if (artistIds.length > 0) {
      console.log('[fetchRecommendedEvents] Fetching events by artists...');
      promises.push(scraperApi.getEventsByArtists(artistIds, { limit: 100 }));
    }

    if (venueIds.length > 0) {
      console.log('[fetchRecommendedEvents] Fetching events by venues...');
      promises.push(scraperApi.getEventsByVenues(venueIds, { limit: 100 }));
    }

    if (promises.length === 0) {
      console.log('[fetchRecommendedEvents] No followed entities with scraper links');
      return []; // No followed entities with scraper links
    }

    console.log('[fetchRecommendedEvents] Waiting for API responses...');
    const results = await Promise.all(promises);
    console.log('[fetchRecommendedEvents] API results:', results);

    // Merge and deduplicate events
    const eventMap = new Map<number, RecommendedEvent>();
    for (const result of results) {
      for (const event of result.items) {
        if (!eventMap.has(event.id)) {
          eventMap.set(event.id, event);
        }
      }
    }

    // Score and add metadata
    const scoredEvents = Array.from(eventMap.values()).map(event =>
      scoreEvent(event, artistIds, venueIds)
    );

    // Sort by score (highest first), then by date
    scoredEvents.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.event_date || '').localeCompare(b.event_date || '');
    });

    return scoredEvents;
  } catch (error) {
    console.error('Failed to fetch recommended events:', error);
    return [];
  }
}

/**
 * Calculate relevance score for an event
 */
function scoreEvent(
  event: RecommendedEvent,
  followedArtistIds: number[],
  followedVenueIds: number[]
): ScoredEvent {
  let score = 0;
  const matchReasons: string[] = [];

  // Check if already added to My Events
  const isAdded = isScraperEventAdded(event.id);

  // Artist matches (weight: 3 points per artist)
  const matchedArtists = event.entity_matches.filter(
    m => m.entity_type === 'artist' && followedArtistIds.includes(m.entity_id)
  );

  if (matchedArtists.length > 0) {
    score += matchedArtists.length * 3;
    if (matchedArtists.length === 1) {
      matchReasons.push(`${matchedArtists[0].raw_name}`);
    } else {
      matchReasons.push(`${matchedArtists.length} followed artists`);
    }
  }

  // Venue match (weight: 2 points)
  if (event.ref_venue_id && followedVenueIds.includes(event.ref_venue_id)) {
    score += 2;
    matchReasons.push(`at ${event.venue}`);
  }

  // Date proximity bonus (next 7 days: +2, next 30 days: +1)
  if (event.event_date) {
    const daysUntil = daysBetween(new Date(), new Date(event.event_date));
    if (daysUntil >= 0 && daysUntil <= 7) {
      score += 2;
    } else if (daysUntil > 7 && daysUntil <= 30) {
      score += 1;
    }
  }

  // Confidence bonus (0-1 point based on extraction confidence)
  score += event.confidence;

  // Info level bonus (more complete events get higher score)
  if (event.info_level >= 3) {
    score += 0.5; // Has full timetable
  }

  return {
    ...event,
    score,
    matchReasons,
    isAdded,
  };
}

/**
 * Calculate days between two dates
 */
function daysBetween(date1: Date, date2: Date): number {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round((date2.getTime() - date1.getTime()) / oneDay);
}

/**
 * Get recommended events grouped by time period
 */
export async function getRecommendedEventsByPeriod() {
  const events = await fetchRecommendedEvents();
  const today = new Date().toISOString().slice(0, 10);

  const thisWeek: ScoredEvent[] = [];
  const thisMonth: ScoredEvent[] = [];
  const later: ScoredEvent[] = [];

  const oneWeekFromNow = new Date();
  oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
  const oneWeekStr = oneWeekFromNow.toISOString().slice(0, 10);

  const oneMonthFromNow = new Date();
  oneMonthFromNow.setDate(oneMonthFromNow.getDate() + 30);
  const oneMonthStr = oneMonthFromNow.toISOString().slice(0, 10);

  for (const event of events) {
    if (!event.event_date || event.event_date < today) continue;

    if (event.event_date <= oneWeekStr) {
      thisWeek.push(event);
    } else if (event.event_date <= oneMonthStr) {
      thisMonth.push(event);
    } else {
      later.push(event);
    }
  }

  return { thisWeek, thisMonth, later };
}

// Made with Bob
