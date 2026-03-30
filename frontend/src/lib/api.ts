/**
 * api.ts — bridge layer.
 *
 * All data functions now go through browser SQLite (db.ts).
 * The axios HTTP client is removed; only the WebSocket URL helper remains.
 * Pages that import from this file need zero changes.
 */

// Re-export types so pages can still do: import { Tag } from "../lib/api"
export type { Tag, Place, PlaceType, Person, PersonType, Venue, Session, Recording, AnalysisSnapshot } from "./types";

// Re-export all DB functions under the same names pages were already using
export {
  getTags,
  getTagTree,
  createTag,
  updateTag,
  deleteTag,
  // New Place functions
  getPlaces,
  createPlace,
  updatePlace,
  deletePlace,
  setPlaceTags,
  // Deprecated Venue aliases (for backward compatibility)
  getVenues,
  createVenue,
  updateVenue,
  deleteVenue,
  setVenueTags,
  // People
  getPeople,
  createPerson,
  updatePerson,
  deletePerson,
  setPersonTags,
  startRecording,
  stopRecording,
  getRecentRecordings,
  deleteRecording,
  addRecordingTags,
  getTagsForRecording,
  updateRecordingSession,
  updateRecordingAudioUrl,
  getRecordingsForSession,
  deleteSession,
  getSessions,
  createSession,
  endSession,
  addSnapshot,
  exportAllData,
  clearAllData,
  pruneSnapshots,
} from "./db";
