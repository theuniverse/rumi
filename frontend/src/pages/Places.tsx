import { useState, useEffect, useRef } from "react";
import { Plus, Pencil, Trash2, Check, X, MapPin, Calendar, Navigation } from "lucide-react";
import clsx from "clsx";
import { Tag, Place, PlaceType, getTags, getPlaces, createPlace, updatePlace, deletePlace, setPlaceTags } from "../lib/api";
import { getCurrentLocation } from "../lib/location";

type PlaceWithCount = Place & { session_count: number; tags: Tag[] };

// ── Place type badge ──────────────────────────────────────────────────────────
function PlaceTypeBadge({ type }: { type: PlaceType }) {
  const config = {
    venue: { label: "🎭 Venue", color: "text-purple-400 border-purple-400/30 bg-purple-400/10" },
    club: { label: "🎵 Club", color: "text-blue-400 border-blue-400/30 bg-blue-400/10" },
    other: { label: "🏠 Other", color: "text-amber-400 border-amber-400/30 bg-amber-400/10" },
  };
  const { label, color } = config[type];
  return (
    <span className={clsx("px-1.5 py-0.5 rounded text-[10px] border", color)}>
      {label}
    </span>
  );
}

// ── Coloured tag pills (view mode) ────────────────────────────────────────────
function TagPills({ tags }: { tags: Tag[] }) {
  if (tags.length === 0) return <span className="text-faint text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t.id}
          className="px-1.5 py-0.5 rounded text-[10px] border"
          style={{
            borderColor: (t.color ?? "#8a8a8a") + "55",
            color: t.color ?? "#8a8a8a",
            background: (t.color ?? "#8a8a8a") + "18",
          }}
        >
          {t.name}
        </span>
      ))}
    </div>
  );
}

// ── Tag toggle buttons (edit mode) ────────────────────────────────────────────
function TagPicker({
  allTags,
  selected,
  onToggle,
}: {
  allTags: Tag[];
  selected: Set<number>;
  onToggle: (id: number) => void;
}) {
  if (allTags.length === 0) return <span className="text-faint text-xs">No styles yet</span>;
  return (
    <div className="flex flex-wrap gap-1.5 pt-1 pb-2">
      {allTags.map((t) => {
        const active = selected.has(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onToggle(t.id)}
            className={clsx(
              "px-2 py-0.5 rounded text-xs border transition-colors",
              active
                ? "border-sand/50 text-sand bg-sand/10"
                : "border-rim text-ghost hover:border-muted hover:text-soft"
            )}
            style={
              active
                ? {
                    borderColor: (t.color ?? "#8a8a8a") + "88",
                    color: t.color ?? undefined,
                    background: (t.color ?? "#8a8a8a") + "18",
                  }
                : {}
            }
          >
            {t.name}
          </button>
        );
      })}
    </div>
  );
}

// ── Inline-editable place row ─────────────────────────────────────────────────
function PlaceRow({
  place,
  allTags,
  onUpdated,
  onDeleted,
}: {
  place: PlaceWithCount;
  allTags: Tag[];
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName]       = useState(place.name);
  const [type, setType]       = useState<PlaceType>(place.type);
  const [address, setAddress] = useState(place.address ?? "");
  const [latitude, setLatitude] = useState<string>(place.latitude?.toString() ?? "");
  const [longitude, setLongitude] = useState<string>(place.longitude?.toString() ?? "");
  const [tagIds, setTagIds]   = useState<Set<number>>(new Set(place.tags.map((t) => t.id)));
  const [gettingLocation, setGettingLocation] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) nameRef.current?.focus();
  }, [editing]);

  const toggle = (id: number) =>
    setTagIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const save = async () => {
    if (!name.trim()) return;
    const lat = latitude.trim() ? parseFloat(latitude) : null;
    const lng = longitude.trim() ? parseFloat(longitude) : null;
    await updatePlace(place.id, {
      name: name.trim(),
      type,
      city: place.city ?? "Shanghai",
      address: address.trim() || null,
      latitude: lat,
      longitude: lng,
    });
    await setPlaceTags(place.id, [...tagIds]);
    setEditing(false);
    onUpdated();
  };

  const useCurrentLocation = async () => {
    setGettingLocation(true);
    const location = await getCurrentLocation();
    if (location) {
      setLatitude(location.lat.toFixed(6));
      setLongitude(location.lng.toFixed(6));
    }
    setGettingLocation(false);
  };

  const cancel = () => {
    setName(place.name);
    setType(place.type);
    setAddress(place.address ?? "");
    setLatitude(place.latitude?.toString() ?? "");
    setLongitude(place.longitude?.toString() ?? "");
    setTagIds(new Set(place.tags.map((t) => t.id)));
    setEditing(false);
  };

  const remove = async () => {
    const msg =
      place.session_count > 0
        ? `Delete "${place.name}"? It has ${place.session_count} session(s) linked to it.`
        : `Delete "${place.name}"?`;
    if (!confirm(msg)) return;
    await deletePlace(place.id);
    onDeleted();
  };

  return (
    <div className={clsx("border-b border-rim/60 transition-colors", editing ? "bg-elevated" : "hover:bg-elevated/40 group")}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3 text-sm">
        {/* Name & Type */}
        <div className="w-40 shrink-0">
          {editing ? (
            <div className="space-y-1.5">
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
                placeholder="Place name"
                className="w-full bg-transparent text-soft outline-none border-b border-sand/50 pb-px placeholder:text-faint"
              />
              <select
                value={type}
                onChange={(e) => setType(e.target.value as PlaceType)}
                className="w-full bg-surface border border-rim rounded px-1.5 py-0.5 text-xs text-soft focus:outline-none focus:border-muted"
              >
                <option value="venue">🎭 Venue</option>
                <option value="club">🎵 Club</option>
                <option value="other">🏠 Other</option>
              </select>
            </div>
          ) : (
            <div className="space-y-1">
              <span className="text-soft font-medium truncate block">{place.name}</span>
              <PlaceTypeBadge type={place.type} />
            </div>
          )}
        </div>

        {/* Address */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
              placeholder="Address (optional)"
              className="w-full bg-transparent text-ghost outline-none border-b border-sand/30 pb-px placeholder:text-faint"
            />
          ) : place.address ? (
            <span className="text-ghost text-xs truncate block">{place.address}</span>
          ) : (
            <span className="text-faint text-xs italic">No address</span>
          )}
        </div>

        {/* Styles (view) */}
        <div className="w-48 shrink-0">
          {!editing && <TagPills tags={place.tags} />}
        </div>

        {/* Sessions */}
        <div className="w-14 shrink-0 flex justify-end">
          {place.session_count > 0 ? (
            <span className="flex items-center gap-1 text-xs text-ghost">
              <Calendar size={10} className="text-faint" />
              {place.session_count}
            </span>
          ) : (
            <span className="text-xs text-faint">—</span>
          )}
        </div>

        {/* Actions */}
        <div
          className={clsx(
            "flex items-center gap-1 w-12 shrink-0 justify-end",
            editing ? "visible" : "invisible group-hover:visible"
          )}
        >
          {editing ? (
            <>
              <button onClick={save} disabled={!name.trim()} className="p-1 text-live hover:text-live/80 disabled:opacity-40 transition-colors">
                <Check size={13} />
              </button>
              <button onClick={cancel} className="p-1 text-ghost hover:text-soft transition-colors">
                <X size={13} />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="p-1 text-ghost hover:text-soft transition-colors">
                <Pencil size={13} />
              </button>
              <button onClick={remove} className="p-1 text-ghost hover:text-red-400 transition-colors">
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expanded edit section */}
      {editing && (
        <div className="px-4 pb-3 space-y-3">
          {/* Coordinates */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MapPin size={12} className="text-faint" />
              <span className="text-xs text-ghost">Coordinates (Optional)</span>
            </div>
            <div className="flex gap-2 items-start">
              <div className="flex-1 space-y-1.5">
                <input
                  type="text"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="Latitude (e.g., 31.2304)"
                  className="w-full px-2 py-1 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted placeholder:text-faint"
                />
                <input
                  type="text"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="Longitude (e.g., 121.4737)"
                  className="w-full px-2 py-1 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted placeholder:text-faint"
                />
              </div>
              <button
                type="button"
                onClick={useCurrentLocation}
                disabled={gettingLocation}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-rim text-ghost hover:text-soft hover:border-muted transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <Navigation size={10} className={gettingLocation ? "animate-pulse" : ""} />
                {gettingLocation ? "Getting..." : "Use Current"}
              </button>
            </div>
            {(latitude || longitude) && (
              <p className="text-[10px] text-faint mt-1">
                {latitude && longitude ? `📍 ${parseFloat(latitude).toFixed(4)}, ${parseFloat(longitude).toFixed(4)}` : "Enter both latitude and longitude"}
              </p>
            )}
          </div>

          {/* Tags */}
          <div>
            <TagPicker allTags={allTags} selected={tagIds} onToggle={toggle} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add place form ────────────────────────────────────────────────────────────
function AddPlaceForm({
  allTags,
  onCreated,
  onCancel,
}: {
  allTags: Tag[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName]     = useState("");
  const [type, setType]     = useState<PlaceType>("club");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [tagIds, setTagIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  const toggle = (id: number) =>
    setTagIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const lat = latitude.trim() ? parseFloat(latitude) : null;
      const lng = longitude.trim() ? parseFloat(longitude) : null;
      const place = await createPlace({
        name: name.trim(),
        type,
        city: "Shanghai",
        address: address.trim() || null,
        latitude: lat,
        longitude: lng,
      });
      if (tagIds.size > 0) await setPlaceTags(place.id, [...tagIds]);
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  const useCurrentLocation = async () => {
    setGettingLocation(true);
    const location = await getCurrentLocation();
    if (location) {
      setLatitude(location.lat.toFixed(6));
      setLongitude(location.lng.toFixed(6));
    }
    setGettingLocation(false);
  };

  return (
    <form onSubmit={submit} className="border-b border-rim bg-elevated">
      <div className="flex items-center gap-3 px-4 py-3 text-sm">
        <div className="w-40 shrink-0 space-y-1.5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onCancel()}
            placeholder="Place name *"
            className="w-full bg-transparent text-soft outline-none border-b border-sand/50 pb-px placeholder:text-faint"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as PlaceType)}
            className="w-full bg-surface border border-rim rounded px-1.5 py-0.5 text-xs text-soft focus:outline-none focus:border-muted"
          >
            <option value="venue">🎭 Venue</option>
            <option value="club">🎵 Club</option>
            <option value="other">🏠 Other</option>
          </select>
        </div>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Address (optional)"
          className="flex-1 min-w-0 bg-transparent text-ghost outline-none border-b border-sand/30 pb-px placeholder:text-faint"
        />
        {/* spacer for styles + sessions columns */}
        <div className="w-48 shrink-0" />
        <div className="w-14 shrink-0" />
        <div className="flex items-center gap-1 w-12 shrink-0 justify-end">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="px-2.5 py-1 rounded bg-sand/15 text-sand text-xs hover:bg-sand/25 disabled:opacity-40 transition-colors"
          >
            Add
          </button>
          <button type="button" onClick={onCancel} className="p-1 text-ghost hover:text-soft transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Expanded section for coordinates and tags */}
      <div className="px-4 pb-3 space-y-3">
        {/* Coordinates */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <MapPin size={12} className="text-faint" />
            <span className="text-xs text-ghost">Coordinates (Optional)</span>
          </div>
          <div className="flex gap-2 items-start">
            <div className="flex-1 space-y-1.5">
              <input
                type="text"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="Latitude (e.g., 31.2304)"
                className="w-full px-2 py-1 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted placeholder:text-faint"
              />
              <input
                type="text"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="Longitude (e.g., 121.4737)"
                className="w-full px-2 py-1 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted placeholder:text-faint"
              />
            </div>
            <button
              type="button"
              onClick={useCurrentLocation}
              disabled={gettingLocation}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-rim text-ghost hover:text-soft hover:border-muted transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <Navigation size={10} className={gettingLocation ? "animate-pulse" : ""} />
              {gettingLocation ? "Getting..." : "Use Current"}
            </button>
          </div>
          {(latitude || longitude) && (
            <p className="text-[10px] text-faint mt-1">
              {latitude && longitude ? `📍 ${parseFloat(latitude).toFixed(4)}, ${parseFloat(longitude).toFixed(4)}` : "Enter both latitude and longitude"}
            </p>
          )}
        </div>

        {/* Tags */}
        {allTags.length > 0 && (
          <div>
            <TagPicker allTags={allTags} selected={tagIds} onToggle={toggle} />
          </div>
        )}
      </div>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Places() {
  const [places, setPlaces]   = useState<PlaceWithCount[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding]   = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, t] = await Promise.all([
        getPlaces() as Promise<PlaceWithCount[]>,
        getTags(),
      ]);
      setPlaces(p);
      setAllTags(t);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-3xl mx-auto px-8 py-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-soft tracking-tight mb-1">Places</h1>
          <p className="text-ghost text-sm">Clubs, venues, and spaces you've visited.</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-rim text-ghost text-xs hover:text-soft hover:border-muted transition-colors"
        >
          <Plus size={13} />
          Add place
        </button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-rim overflow-hidden">
        {/* Column headers */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-surface border-b border-rim text-xs text-faint uppercase tracking-wider">
          <span className="w-40 shrink-0">Name & Type</span>
          <span className="flex-1">Address</span>
          <span className="w-48 shrink-0">Styles</span>
          <span className="w-14 shrink-0 text-right">Sessions</span>
          <span className="w-12 shrink-0" />
        </div>

        {/* Add form */}
        {adding && (
          <AddPlaceForm
            allTags={allTags}
            onCreated={() => { setAdding(false); load(); }}
            onCancel={() => setAdding(false)}
          />
        )}

        {/* Rows */}
        {loading ? (
          <div className="px-4 py-10 text-center text-ghost text-sm">Loading…</div>
        ) : places.length === 0 && !adding ? (
          <div className="px-4 py-12 text-center">
            <MapPin size={28} className="text-faint mx-auto mb-3" strokeWidth={1} />
            <p className="text-ghost text-sm mb-1">No places yet.</p>
            <p className="text-faint text-xs mb-4">Add your first club, venue, or personal space.</p>
            <button
              onClick={() => setAdding(true)}
              className="px-3 py-1.5 rounded border border-rim text-ghost text-xs hover:text-soft hover:border-muted transition-colors"
            >
              <Plus size={12} className="inline mr-1" />
              Add place
            </button>
          </div>
        ) : (
          places.map((p) => (
            <PlaceRow
              key={p.id}
              place={p}
              allTags={allTags}
              onUpdated={load}
              onDeleted={load}
            />
          ))
        )}
      </div>

      {places.length > 0 && (
        <p className="mt-4 text-xs text-faint">
          {places.length} place{places.length !== 1 ? "s" : ""} total
        </p>
      )}
    </div>
  );
}

// Made with Bob
