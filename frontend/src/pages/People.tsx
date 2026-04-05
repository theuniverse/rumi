import { useState, useEffect, useRef } from "react";
import { Plus, Pencil, Trash2, Check, X, Users, Instagram, ExternalLink, Star } from "lucide-react";
import clsx from "clsx";
import { Tag, Person, PersonType, getTags, getPeople, createPerson, updatePerson, deletePerson, setPersonTags, setPersonFollowed } from "../lib/api";

type PersonWithTags = Person & { tags: Tag[] };

// ── Person type badge ────────────────────────────────────────────────────────
function PersonTypeBadge({ type }: { type: PersonType }) {
  const config = {
    dj:        { label: "🎧 DJ",       color: "text-violet-400 border-violet-400/30 bg-violet-400/10" },
    musician:  { label: "🎹 Musician", color: "text-blue-400   border-blue-400/30   bg-blue-400/10"  },
    promoter:  { label: "📣 Promoter", color: "text-amber-400  border-amber-400/30  bg-amber-400/10" },
    raver:     { label: "🕺 Raver",    color: "text-green-400  border-green-400/30  bg-green-400/10" },
    other:     { label: "👤 Other",    color: "text-slate-400  border-slate-400/30  bg-slate-400/10" },
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
    <div className="flex flex-wrap gap-1.5">
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

// ── Inline-editable person row ────────────────────────────────────────────────
function PersonRow({
  person,
  allTags,
  onUpdated,
  onDeleted,
}: {
  person: PersonWithTags;
  allTags: Tag[];
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(person.name);
  const [type, setType] = useState(person.type);
  const [city, setCity] = useState(person.city ?? "");
  const [instagram, setInstagram] = useState(person.instagram ?? "");
  const [ra_url, setRaUrl] = useState(person.ra_url ?? "");
  const [bio, setBio] = useState(person.bio ?? "");
  const [tagIds, setTagIds] = useState<Set<number>>(new Set(person.tags.map((t) => t.id)));
  const [followed, setFollowed] = useState((person as Person & { followed?: number }).followed === 1);
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
    await updatePerson(person.id, {
      name: name.trim(),
      type,
      city: city.trim() || null,
      instagram: instagram.trim() || null,
      ra_url: ra_url.trim() || null,
      bio: bio.trim() || null,
    });
    await setPersonTags(person.id, Array.from(tagIds));
    setEditing(false);
    onUpdated();
  };

  const cancel = () => {
    setName(person.name);
    setType(person.type);
    setCity(person.city ?? "");
    setInstagram(person.instagram ?? "");
    setRaUrl(person.ra_url ?? "");
    setBio(person.bio ?? "");
    setTagIds(new Set(person.tags.map((t) => t.id)));
    setEditing(false);
  };

  const remove = async () => {
    if (!confirm(`Delete "${person.name}"?`)) return;
    await deletePerson(person.id);
    onDeleted();
  };

  const toggleFollow = async () => {
    const next = !followed;
    setFollowed(next);
    await setPersonFollowed(person.id, next);
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
                placeholder="Person name"
                className="w-full bg-transparent text-soft outline-none border-b border-sand/50 pb-px placeholder:text-faint"
              />
              <select
                value={type}
                onChange={(e) => setType(e.target.value as PersonType)}
                className="w-full bg-surface border border-rim rounded px-1.5 py-0.5 text-xs text-soft focus:outline-none focus:border-muted"
              >
                <option value="dj">DJ</option>
                <option value="musician">Musician</option>
                <option value="promoter">Promoter</option>
                <option value="raver">Raver</option>
                <option value="other">Other</option>
              </select>
            </div>
          ) : (
            <div className="space-y-1">
              <span className="text-soft font-medium truncate block">{person.name}</span>
              <PersonTypeBadge type={person.type} />
            </div>
          )}
        </div>

        {/* City */}
        <div className="w-20 shrink-0">
          {editing ? (
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
              placeholder="City (optional)"
              className="w-full bg-transparent text-ghost outline-none border-b border-sand/30 pb-px placeholder:text-faint"
            />
          ) : person.city ? (
            <span className="text-ghost text-xs truncate block">{person.city}</span>
          ) : (
            <span className="text-faint text-xs italic">No city</span>
          )}
        </div>

        {/* Social Links */}
        <div className="w-16 shrink-0">
          {!editing && (
            <div className="flex items-center gap-2">
              {person.instagram && (
                <a
                  href={`https://instagram.com/${person.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-pink-400 hover:text-pink-300 transition-colors"
                  title={`@${person.instagram}`}
                >
                  <Instagram size={14} />
                </a>
              )}
              {person.ra_url && (
                <a
                  href={person.ra_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                  title="Resident Advisor"
                >
                  <ExternalLink size={14} />
                </a>
              )}
              {!person.instagram && !person.ra_url && <span className="text-faint text-xs">—</span>}
            </div>
          )}
        </div>

        {/* Styles (view) */}
        <div className="flex-1 min-w-0">
          {!editing && <TagPills tags={person.tags} />}
        </div>

        {/* Follow */}
        <div className="w-8 shrink-0 flex justify-center">
          {!editing && (
            <button
              onClick={toggleFollow}
              title={followed ? "Unfollow" : "Follow (fetch RA events)"}
              className={clsx(
                "p-1 transition-colors",
                followed ? "text-amber-400 hover:text-amber-300" : "text-faint hover:text-ghost opacity-0 group-hover:opacity-100"
              )}
            >
              <Star size={13} fill={followed ? "currentColor" : "none"} />
            </button>
          )}
        </div>

        {/* Actions */}
        <div
          className={clsx(
            "flex items-center gap-1 w-10 shrink-0 justify-end",
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
          {/* Social Links */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-ghost">Social</span>
            </div>
            <div className="space-y-1.5">
              <input
                type="text"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="Instagram handle (e.g., djname)"
                className="w-full px-2 py-1 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted placeholder:text-faint"
              />
              <input
                type="url"
                value={ra_url}
                onChange={(e) => setRaUrl(e.target.value)}
                placeholder="Resident Advisor profile URL"
                className="w-full px-2 py-1 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted placeholder:text-faint"
              />
            </div>
          </div>

          {/* Bio */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-ghost">Bio</span>
            </div>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Bio or notes (optional)"
              rows={2}
              className="w-full px-2 py-1 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted placeholder:text-faint resize-none"
            />
          </div>

          {/* Tags */}
          {allTags.length > 0 && (
            <div>
              <TagPicker allTags={allTags} selected={tagIds} onToggle={toggle} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add person form ───────────────────────────────────────────────────────────
function AddPersonForm({
  allTags,
  onCreated,
  onCancel,
}: {
  allTags: Tag[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<PersonType>("dj");
  const [city, setCity] = useState("");
  const [instagram, setInstagram] = useState("");
  const [ra_url, setRaUrl] = useState("");
  const [bio, setBio] = useState("");
  const [tagIds, setTagIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

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
      const person = await createPerson({
        name: name.trim(),
        type,
        city: city.trim() || null,
        instagram: instagram.trim() || null,
        ra_url: ra_url.trim() || null,
        bio: bio.trim() || null,
      });
      await setPersonTags(person.id, Array.from(tagIds));
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-b border-rim bg-elevated">
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3 text-sm">
        <div className="w-40 shrink-0 space-y-1.5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Person name"
            className="w-full bg-transparent text-soft outline-none border-b border-sand/50 pb-px placeholder:text-faint"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as PersonType)}
            className="w-full bg-surface border border-rim rounded px-1.5 py-0.5 text-xs text-soft focus:outline-none focus:border-muted"
          >
            <option value="dj">DJ</option>
            <option value="musician">Musician</option>
            <option value="promoter">Promoter</option>
            <option value="raver">Raver</option>
            <option value="other">Other</option>
          </select>
        </div>

        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="City (optional)"
          className="w-20 shrink-0 bg-transparent text-ghost outline-none border-b border-sand/30 pb-px placeholder:text-faint text-xs"
        />

        <div className="w-16 shrink-0" />

        <div className="flex-1 min-w-0" />

        <div className="flex gap-1 w-12 shrink-0 justify-end">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="p-1 text-live hover:text-live/80 disabled:opacity-40 transition-colors"
          >
            <Check size={13} />
          </button>
          <button type="button" onClick={onCancel} className="p-1 text-ghost hover:text-soft transition-colors">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Expanded section */}
      <div className="px-4 pb-3 space-y-3">
        {/* Social Links */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-ghost">Social</span>
          </div>
          <div className="space-y-1.5">
            <input
              type="text"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="Instagram handle"
              className="w-full px-2 py-1 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted placeholder:text-faint"
            />
            <input
              type="url"
              value={ra_url}
              onChange={(e) => setRaUrl(e.target.value)}
              placeholder="Resident Advisor profile URL"
              className="w-full px-2 py-1 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted placeholder:text-faint"
            />
          </div>
        </div>

        {/* Bio */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-ghost">Bio</span>
          </div>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Bio or notes (optional)"
            rows={2}
            className="w-full px-2 py-1 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted placeholder:text-faint resize-none"
          />
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
export default function People() {
  const [people, setPeople] = useState<PersonWithTags[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, t] = await Promise.all([getPeople(), getTags()]);
      setPeople(p);
      setAllTags(t);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-soft tracking-tight mb-1">People</h1>
          <p className="text-ghost text-sm">DJs, musicians, promoters, and ravers in your network.</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-rim text-ghost text-xs hover:text-soft hover:border-muted transition-colors"
        >
          <Plus size={13} />
          Add person
        </button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-rim overflow-hidden">
        <div className="overflow-x-auto">
        <div className="min-w-[640px]">
        {/* Column headers */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-surface border-b border-rim text-xs text-faint uppercase tracking-wider">
          <span className="w-40 shrink-0">Name & Type</span>
          <span className="w-20 shrink-0">City</span>
          <span className="w-16 shrink-0">Social</span>
          <span className="flex-1">Styles</span>
          <span className="w-8 shrink-0 text-center">RA</span>
          <span className="w-10 shrink-0" />
        </div>

        {/* Add form */}
        {adding && (
          <AddPersonForm
            allTags={allTags}
            onCreated={() => { setAdding(false); load(); }}
            onCancel={() => setAdding(false)}
          />
        )}

        {/* Rows */}
        {loading ? (
          <div className="px-4 py-10 text-center text-ghost text-sm">Loading…</div>
        ) : people.length === 0 && !adding ? (
          <div className="px-4 py-12 text-center">
            <Users size={28} className="text-faint mx-auto mb-3" strokeWidth={1} />
            <p className="text-ghost text-sm mb-1">No people yet.</p>
            <p className="text-faint text-xs mb-4">Add a DJ, musician, promoter, or raver to your network.</p>
            <button
              onClick={() => setAdding(true)}
              className="px-3 py-1.5 rounded border border-rim text-ghost text-xs hover:text-soft hover:border-muted transition-colors"
            >
              <Plus size={12} className="inline mr-1" />
              Add person
            </button>
          </div>
        ) : (
          people.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              allTags={allTags}
              onUpdated={load}
              onDeleted={load}
            />
          ))
        )}
        </div>
        </div>
      </div>

      {people.length > 0 && (
        <p className="mt-4 text-xs text-faint">
          {people.length} person{people.length !== 1 ? "s" : ""} total
        </p>
      )}
    </div>
  );
}

// Made with Bob
