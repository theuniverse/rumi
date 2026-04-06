#!/usr/bin/env python3
"""
Extract all artists from events and add them to RefData if not exists.
"""
import asyncio
import sys
from collections import Counter

# Add parent directory to path
sys.path.insert(0, '/Users/xiqish/Documents/GitHub/personal/rumi/scraper')

from sqlalchemy import select
from app.database import async_session_maker
from app.models import TimetableSlot, RefArtist
import json


async def get_all_artists():
    """Extract all unique artists from timetable slots."""
    async with async_session_maker() as db:
        # Get all timetable slots
        result = await db.execute(select(TimetableSlot))
        slots = result.scalars().all()

        all_artists = []
        for slot in slots:
            if slot.artists_json:
                try:
                    artists = json.loads(slot.artists_json)
                    if isinstance(artists, list):
                        all_artists.extend(artists)
                except:
                    pass

        # Count occurrences
        artist_counts = Counter(all_artists)
        return artist_counts


async def get_existing_artists():
    """Get all existing artists in RefData."""
    async with async_session_maker() as db:
        result = await db.execute(select(RefArtist))
        artists = result.scalars().all()

        # Create a set of normalized names for matching
        existing = set()
        for artist in artists:
            existing.add(artist.name.lower().strip())
            for alias in (artist.aliases or []):
                existing.add(alias.lower().strip())

        return existing, {a.name: a for a in artists}


async def add_artist(name: str):
    """Add a new artist to RefData."""
    async with async_session_maker() as db:
        artist = RefArtist(
            name=name,
            type="dj",
            city="",
            aliases=[],
            followed=False
        )
        db.add(artist)
        await db.commit()
        await db.refresh(artist)
        return artist


async def main():
    print("Extracting artists from events...")
    artist_counts = await get_all_artists()
    print(f"Found {len(artist_counts)} unique artists")
    print(f"Total appearances: {sum(artist_counts.values())}\n")

    print("Checking existing RefData...")
    existing_normalized, existing_artists = await get_existing_artists()
    print(f"Existing artists in RefData: {len(existing_artists)}\n")

    # Find artists not in RefData
    new_artists = []
    for artist_name, count in artist_counts.most_common():
        normalized = artist_name.lower().strip()
        if normalized not in existing_normalized:
            new_artists.append((artist_name, count))

    print(f"Artists to add: {len(new_artists)}\n")

    if not new_artists:
        print("All artists already in RefData!")
        return

    # Show what will be added
    print("New artists (sorted by frequency):")
    for name, count in new_artists:
        print(f"  {name} ({count} appearances)")

    # Ask for confirmation
    response = input(f"\nAdd {len(new_artists)} artists to RefData? (y/n): ")
    if response.lower() != 'y':
        print("Cancelled.")
        return

    # Add artists
    print("\nAdding artists...")
    added = []
    for name, count in new_artists:
        try:
            artist = await add_artist(name)
            added.append(artist)
            print(f"  ✓ Added: {artist.name} (ID={artist.id})")
        except Exception as e:
            print(f"  ✗ Failed to add {name}: {e}")

    print(f"\n✅ Successfully added {len(added)} artists to RefData!")

    # Show summary
    print("\nSummary:")
    print(f"  Total unique artists in events: {len(artist_counts)}")
    print(f"  Previously in RefData: {len(existing_artists)}")
    print(f"  Newly added: {len(added)}")
    print(f"  Total in RefData now: {len(existing_artists) + len(added)}")


if __name__ == "__main__":
    asyncio.run(main())

# Made with Bob
