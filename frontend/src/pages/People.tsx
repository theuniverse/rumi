import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Check, X, Users, Instagram, ExternalLink } from "lucide-react";
import clsx from "clsx";
import { Tag, Person, PersonType, getTags, getPeople, createPerson, updatePerson, deletePerson, setPersonTags } from "../lib/api";

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

  const save = async () => {
    await updatePerson(person.id, {
      name: name.trim() || person.name,
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

  const remove = async () => {
    if (!confirm(`Delete "${person.name}"?`)) return;
    await deletePerson(person.id);
    onDeleted();
  };

  if (editing) {
    return (
      <div className="space-y-3 p-3 bg-elevated rounded border border-rim">
        {/* Main row: name + type | city | instagram + ra_url | actions */}
        <div className="grid grid-cols-4 gap-3 items-center">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="flex-1 bg-surface border border-rim rounded px-2 py-1 text-sm text-soft outline-none focus:border-muted"
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value as PersonType)}
              className="bg-surface border border-rim rounded px-2 py-1 text-xs text-soft outline-none focus:border-muted"
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
            placeholder="City"
            className="bg-surface border border-rim rounded px-2 py-1 text-sm text-soft outline-none focus:border-muted"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="Instagram handle"
              className="flex-1 bg-surface border border-rim rounded px-2 py-1 text-sm text-soft outline-none focus:border-muted text-xs"
            />
            <input
              type="url"
              value={ra_url}
              onChange={(e) => setRaUrl(e.target.value)}
              placeholder="RA URL"
              className="flex-1 bg-surface border border-rim rounded px-2 py-1 text-sm text-soft outline-none focus:border-muted text-xs"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={save}
              className="p-1.5 rounded hover:bg-green-400/20 text-green-400 transition-colors"
              title="Save"
            >
              <Check size={16} />
            </button>
            <button
              onClick={() => setEditing(false)}
              className="p-1.5 rounded hover:bg-red-400/20 text-red-400 transition-colors"
              title="Cancel"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Expanded section: bio + tags */}
        <div className="space-y-2 pl-3">
          <div>
            <label className="block text-xs text-ghost mb-1">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Bio or notes"
              rows={2}
              className="w-full bg-surface border border-rim rounded px-2 py-1 text-sm text-soft outline-none focus:border-muted resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-ghost mb-1">Styles</label>
            <TagPicker
              allTags={allTags}
              selected={tagIds}
              onToggle={(id) => {
                const newSet = new Set(tagIds);
                if (newSet.has(id)) newSet.delete(id);
                else newSet.add(id);
                setTagIds(newSet);
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // View mode: table row
  return (
    <div className="grid grid-cols-4 gap-3 items-center p-3 border-b border-rim hover:bg-elevated/30 group">
      {/* Col 1: Name & Type */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="font-medium text-soft text-sm truncate">{person.name}</div>
          <PersonTypeBadge type={person.type} />
        </div>
      </div>

      {/* Col 2: City */}
      <div className="text-sm text-ghost">
        {person.city ? <span>{person.city}</span> : <span className="text-faint">—</span>}
      </div>

      {/* Col 3: Social Links */}
      <div className="flex items-center gap-2">
        {person.instagram && (
          <a
            href={`https://instagram.com/${person.instagram}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-pink-400 hover:text-pink-300 transition-colors"
            title={`@${person.instagram}`}
          >
            <Instagram size={16} />
          </a>
        )}
        {person.ra_url && (
          <a
            href={person.ra_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-0.5"
            title="Resident Advisor"
          >
            <ExternalLink size={16} />
          </a>
        )}
        {!person.instagram && !person.ra_url && <span className="text-faint text-xs">—</span>}
      </div>

      {/* Col 4: Styles & Actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1">
          <TagPills tags={person.tags} />
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded hover:bg-blue-400/20 text-blue-400 transition-colors"
            title="Edit"
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={remove}
            className="p-1.5 rounded hover:bg-red-400/20 text-red-400 transition-colors"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add person form (inline) ──────────────────────────────────────────────────
function AddPersonForm({
  allTags,
  onCreated,
}: {
  allTags: Tag[];
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<PersonType>("dj");
  const [city, setCity] = useState("");
  const [instagram, setInstagram] = useState("");
  const [ra_url, setRaUrl] = useState("");
  const [bio, setBio] = useState("");
  const [tagIds, setTagIds] = useState<Set<number>>(new Set());

  const save = async () => {
    if (!name.trim()) return;
    const person = await createPerson({
      name: name.trim(),
      type,
      city: city.trim() || null,
      instagram: instagram.trim() || null,
      ra_url: ra_url.trim() || null,
      bio: bio.trim() || null,
    });
    await setPersonTags(person.id, Array.from(tagIds));
    // Reset form
    setName("");
    setType("dj");
    setCity("");
    setInstagram("");
    setRaUrl("");
    setBio("");
    setTagIds(new Set());
    onCreated();
  };

  return (
    <div className="space-y-3 p-3 bg-surface border border-rim rounded mb-3">
      <div className="grid grid-cols-4 gap-3 items-center">
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="flex-1 bg-elevated border border-rim rounded px-2 py-1 text-sm text-soft outline-none focus:border-muted"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as PersonType)}
            className="bg-elevated border border-rim rounded px-2 py-1 text-xs text-soft outline-none focus:border-muted"
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
          placeholder="City"
          className="bg-elevated border border-rim rounded px-2 py-1 text-sm text-soft outline-none focus:border-muted"
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            placeholder="Instagram handle"
            className="flex-1 bg-elevated border border-rim rounded px-2 py-1 text-sm text-soft outline-none focus:border-muted text-xs"
          />
          <input
            type="url"
            value={ra_url}
            onChange={(e) => setRaUrl(e.target.value)}
            placeholder="RA URL"
            className="flex-1 bg-elevated border border-rim rounded px-2 py-1 text-sm text-soft outline-none focus:border-muted text-xs"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={save}
            className="px-3 py-1 rounded text-xs bg-sand/20 text-sand hover:bg-sand/30 transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      <div className="space-y-2 pl-3">
        <div>
          <label className="block text-xs text-ghost mb-1">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Bio or notes (optional)"
            rows={2}
            className="w-full bg-elevated border border-rim rounded px-2 py-1 text-sm text-soft outline-none focus:border-muted resize-none"
          />
        </div>
        <div>
          <label className="block text-xs text-ghost mb-1">Styles</label>
          <TagPicker
            allTags={allTags}
            selected={tagIds}
            onToggle={(id) => {
              const newSet = new Set(tagIds);
              if (newSet.has(id)) newSet.delete(id);
              else newSet.add(id);
              setTagIds(newSet);
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main People page ──────────────────────────────────────────────────────────

export default function People() {
  const [people, setPeople] = useState<PersonWithTags[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [filterType, setFilterType] = useState<'all' | PersonType>('all');

  const load = async () => {
    try {
      const [p, t] = await Promise.all([getPeople(), getTags()]);
      setPeople(p);
      setAllTags(t);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = filterType === 'all'
    ? people
    : people.filter(p => p.type === filterType);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-soft">Loading people…</div>
      </div>
    );
  }

  const types: PersonType[] = ['dj', 'musician', 'promoter', 'raver', 'other'];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-4 border-b border-rim">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-sand" />
            <h1 className="text-lg font-semibold text-soft">People</h1>
          </div>
          <button
            onClick={() => setAdding(!adding)}
            className="p-2 rounded hover:bg-sand/20 text-sand transition-colors"
            title="Add person"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Type filter */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterType('all')}
            className={clsx(
              "px-3 py-1 rounded text-xs border transition-colors",
              filterType === 'all'
                ? "border-sand/50 bg-sand/10 text-sand"
                : "border-rim text-ghost hover:text-soft"
            )}
          >
            All
          </button>
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={clsx(
                "px-3 py-1 rounded text-xs border transition-colors",
                filterType === t
                  ? "border-sand/50 bg-sand/10 text-sand"
                  : "border-rim text-ghost hover:text-soft"
              )}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {adding && (
          <div className="p-4 border-b border-rim">
            <AddPersonForm
              allTags={allTags}
              onCreated={() => {
                setAdding(false);
                load();
              }}
            />
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Users size={48} className="text-faint mb-3" />
            <p className="text-soft mb-1">No people yet</p>
            <p className="text-ghost text-sm">Add a DJ, promoter, or raver to get started</p>
          </div>
        ) : (
          <div>
            {/* Column headers */}
            <div className="grid grid-cols-4 gap-3 p-3 bg-surface border-b border-rim sticky top-0 text-xs font-medium text-ghost">
              <div>Name & Type</div>
              <div>City</div>
              <div>Social</div>
              <div>Styles</div>
            </div>

            {/* Rows */}
            {filtered.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                allTags={allTags}
                onUpdated={load}
                onDeleted={load}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Made with Bob
