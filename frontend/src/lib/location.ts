/**
 * Location utilities for calculating distances and finding nearby places
 */

import type { Place } from "./types";

/**
 * Convert degrees to radians
 */
function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param lat1 Latitude of point 1
 * @param lon1 Longitude of point 1
 * @param lat2 Latitude of point 2
 * @param lon2 Longitude of point 2
 * @returns Distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

/**
 * Format distance for display
 * @param km Distance in kilometers
 * @returns Formatted string (e.g., "120m" or "1.5km")
 */
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  return `${km.toFixed(1)}km`;
}

export interface PlaceWithDistance extends Place {
  distance: number;
}

/**
 * Find places near a given location
 * @param currentLat Current latitude
 * @param currentLng Current longitude
 * @param places Array of places to search
 * @param maxDistance Maximum distance in kilometers (default: 0.5km = 500m)
 * @returns Array of places with distance, sorted by proximity
 */
export function findNearbyPlaces(
  currentLat: number,
  currentLng: number,
  places: Place[],
  maxDistance: number = 0.5
): PlaceWithDistance[] {
  return places
    .filter((p) => p.latitude !== null && p.longitude !== null)
    .map((p) => ({
      ...p,
      distance: calculateDistance(
        currentLat,
        currentLng,
        p.latitude!,
        p.longitude!
      ),
    }))
    .filter((p) => p.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance);
}

/**
 * Get current user location using browser geolocation API
 * @returns Promise with coordinates or null if unavailable
 */
export function getCurrentLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );
  });
}

// Made with Bob
