import { useState, useEffect, useRef } from "react";
import { Plus, Pencil, Trash2, Check, X, Tag as TagIcon, Instagram, ExternalLink, Star } from "lucide-react";
import clsx from "clsx";
import { Tag, Label, LabelType, getTags, getLabels, createLabel, updateLabel, deleteLabel, setLabelTags, setLabelFollowed } from "../lib/api";

type LabelWithTags = Label & { tags: Tag[] };

// ── Label type badge ──────────────────────────────────────────────────────────
function LabelTypeBadge({ type }: { type: LabelType }) {
  const config: Record<LabelType, { label: string; color: string }> = {
    promoter:     { label: "📣 Promoter",     color: "text-amber-400  border-amber-400/30  bg-amber-400/10"  },
    record_label: { label: "💿 Record Label", color: "text-violet-400 border-violet-400/30 bg-violet-400/10" },
  };
  const { label, color } = config[type];
  return (
    <span className={clsx("px-1.5 py-0.5 rounded text-[10px] border", color)}>
      {label}
    </span>
  );
}

// ── Tag pills (view mode) ─────────────────────────────────────────────────────
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

// ── Tag picker (edit mode) ────────────────────────────────────────────────────
function TagPicker({
  allTags, selected, onToggle,
}: { allTags: Tag[]; selected: Set<number>; onToggle: (id: number) => void }) {
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
            style={active ? {
              borderColor: (t.color ?? "#8a8a8a") + "88",
              color: t.color ?? undefined,
              background: (t.color ?? "#8a8a8a") + "18",
            } : {}}
          >
            {t.name}
          </button>
        );
      })}
    </div>
  );
}

// ── Label row ─────────────────────────────────────────────────────────────────
function LabelRow({
  label, allTags, onUpdated, onDeleted,
}: { label: LabelWithTags; allTags: Tag[]; onUpdated: () => void; onDeleted: () => void }) {
  const [editing, setEditing]     = useState(false);
  const [name, setName]           = useState(label.name);
  const [type, setType]           = useState(label.type);
  const [city, setCity]           = useState(label.city ?? "");
  const [instagram, setInstagram] = useState(label.instagram ?? "");
  const [ra_url, setRaUrl]        = useState(label.ra_url ?? "");
  const [ra_id, setRaId]          = useState(label.ra_id ?? "");
  const [bio, setBio]             = useState(label.bio ?? "");
  const [tagIds, setTagIds]       = useState<Set<number>>(new Set(label.tags.map((t) => t.id)));
  const [followed, setFollowed]   = useState(label.followed === 1);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) nameRef.current?.focus(); }, [editing]);

  const toggle = (id: number) =>
    setTagIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const save = async () => {
    if (!name.trim()) return;
    await updateLabel(label.id, {
      name: name.trim(), type,
      city: city.trim() || null,
      instagram: instagram.trim() || null,
      ra_url: ra_url.trim() || null,
      ra_id: ra_id.trim() || null,
      bio: bio.trim() || null,
    });
    await setLabelTags(label.id, Array.from(tagIds));
    setEditing(false);
    onUpdated();
  };

  const cancel = () => {
    setName(label.name); setType(label.type);
    setCity(label.city ?? ""); setInstagram(label.instagram ?? "");
    setRaUrl(label.ra_url ?? ""); setRaId(label.ra_id ?? "");
    setBio(label.bio ?? "");
    setTagIds(new Set(label.tags.map((t) => t.id)));
    setEditing(false);
  };

  const remove = async () => {
    if (!confirm(`Delete "${label.name}"?`)) return;
    await deleteLabel(label.id);
    onDeleted();
  };

  const toggleFollow = async () => {
    const next = !followed;
    setFollowed(next);
    await setLabelFollowed(label.id, next);
  };

  return (
    <div className={clsx("border-b border-rim/60 transition-colors", editing ? "bg-elevated" : "hover:bg-elevated/40 group")}>
      <div className="flex items-center gap-3 px-4 py-3 text-sm">
        {/* Name & Type */}
        <div className="w-44 shrink-0">
          {editing ? (
            <div className="space-y-1.5">
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
                placeholder="Label name"
                className="w-full bg-transparent text-soft outline-none border-b border-sand/50 pb-px placeholder:text-faint"
              />
              <select
                value={type}
                onChange={(e) => setType(e.target.value as LabelType)}
                className="w-full bg-surface border border-rim rounded px-1.5 py-0.5 text-xs text-soft focus:outline-none focus:border-muted"
              >
                <option value="promoter">Promoter</option>
                <option value="record_label">Record Label</option>
              </select>
            </div>
          ) : (
            <div className="space-y-1">
              <span className="text-soft font-medium truncate block">{label.name}</span>
              <LabelTypeBadge type={label.type} />
            </div>
          )}
        </div>

        {/* City */}
        <div className="w-28 shrink-0">
          {editing ? (
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
              placeholder="City"
              className="w-full bg-transparent text-ghost outline-none border-b border-sand/30 pb-px placeholder:text-faint text-xs"
            />
          ) : label.city ? (
            <span className="text-ghost text-xs truncate block">{label.city}</span>
          ) : (
            <span className="text-faint text-xs italic">—</span>
          )}
        </div>

        {/* Social */}
        <div className="flex-1 min-w-0">
          {!editing && (
            <div className="flex items-center gap-2">
              {label.instagram && (
                <a href={`https://instagram.com/${label.instagram}`} target="_blank" rel="noopener noreferrer"
                   className="text-pink-400 hover:text-pink-300 transition-colors" title={`@${label.instagram}`}>
                  <Instagram size={14} />
                </a>
              )}
              {label.ra_url && (
                <a href={label.ra_url} target="_blank" rel="noopener noreferrer"
                   className="text-blue-400 hover:text-blue-300 transition-colors" title="Resident Advisor">
                  <ExternalLink size={14} />
                </a>
              )}
              {!label.instagram && !label.ra_url && <span className="text-faint text-xs">—</span>}
            </div>
          )}
        </div>

        {/* Styles */}
        <div className="w-44 shrink-0">
          {!editing && <TagPills tags={label.tags} />}
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
        <div className={clsx("flex items-center gap-1 w-10 shrink-0 justify-end", editing ? "visible" : "invisible group-hover:visible")}>
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
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={instagram} onChange={(e) => setInstagram(e.target.value)}
              placeholder="Instagram handle" className="px-2 py-1 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted placeholder:text-faint" />
            <input type="url" value={ra_url} onChange={(e) => setRaUrl(e.target.value)}
              placeholder="RA URL (e.g. https://ra.co/promoters/svbkvlt)" className="px-2 py-1 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted placeholder:text-faint" />
          </div>
          <input type="text" value={ra_id} onChange={(e) => setRaId(e.target.value)}
            placeholder="RA ID / slug for event fetching (e.g. svbkvlt)"
            className="w-full px-2 py-1 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted placeholder:text-faint" />
          <textarea value={bio} onChange={(e) => setBio(e.target.value)}
            placeholder="Bio or notes (optional)" rows={2}
            className="w-full px-2 py-1 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted placeholder:text-faint resize-none" />
          {allTags.length > 0 && <TagPicker allTags={allTags} selected={tagIds} onToggle={toggle} />}
        </div>
      )}
    </div>
  );
}

// ── Add label form ────────────────────────────────────────────────────────────
function AddLabelForm({ allTags, onCreated, onCancel }: { allTags: Tag[]; onCreated: () => void; onCancel: () => void }) {
  const [name, setName]           = useState("");
  const [type, setType]           = useState<LabelType>("promoter");
  const [city, setCity]           = useState("");
  const [instagram, setInstagram] = useState("");
  const [ra_url, setRaUrl]        = useState("");
  const [ra_id, setRaId]          = useState("");
  const [bio, setBio]             = useState("");
  const [tagIds, setTagIds]       = useState<Set<number>>(new Set());
  const [saving, setSaving]       = useState(false);

  const toggle = (id: number) =>
    setTagIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const label = await createLabel({
        name: name.trim(), type,
        city: city.trim() || null,
        instagram: instagram.trim() || null,
        ra_url: ra_url.trim() || null,
        ra_id: ra_id.trim() || null,
        bio: bio.trim() || null,
      });
      await setLabelTags(label.id, Array.from(tagIds));
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-b border-rim bg-elevated">
      <div className="flex items-center gap-3 px-4 py-3 text-sm">
        <div className="w-44 shrink-0 space-y-1.5">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Label name"
            className="w-full bg-transparent text-soft outline-none border-b border-sand/50 pb-px placeholder:text-faint" />
          <select value={type} onChange={(e) => setType(e.target.value as LabelType)}
            className="w-full bg-surface border border-rim rounded px-1.5 py-0.5 text-xs text-soft focus:outline-none focus:border-muted">
            <option value="promoter">Promoter</option>
            <option value="record_label">Record Label</option>
          </select>
        </div>
        <input type="text" value={city} onChange={(e) => setCity(e.target.value)}
          placeholder="City (optional)"
          className="w-28 shrink-0 bg-transparent text-ghost outline-none border-b border-sand/30 pb-px placeholder:text-faint text-xs" />
        <div className="flex-1 min-w-0" />
        <div className="w-44 shrink-0" />
        <div className="w-8 shrink-0" />
        <div className="flex gap-1 w-10 shrink-0 justify-end">
          <button type="submit" disabled={saving || !name.trim()}
            className="p-1 text-live hover:text-live/80 disabled:opacity-40 transition-colors">
            <Check size={13} />
          </button>
          <button type="button" onClick={onCancel} className="p-1 text-ghost hover:text-soft transition-colors">
            <X size={13} />
          </button>
        </div>
      </div>
      <div className="px-4 pb-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <input type="text" value={instagram} onChange={(e) => setInstagram(e.target.value)}
            placeholder="Instagram handle" className="px-2 py-1 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted placeholder:text-faint" />
          <input type="url" value={ra_url} onChange={(e) => setRaUrl(e.target.value)}
            placeholder="RA URL (e.g. https://ra.co/promoters/svbkvlt)" className="px-2 py-1 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted placeholder:text-faint" />
        </div>
        <input type="text" value={ra_id} onChange={(e) => setRaId(e.target.value)}
          placeholder="RA ID / slug for event fetching (e.g. svbkvlt)"
          className="w-full px-2 py-1 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted placeholder:text-faint" />
        <textarea value={bio} onChange={(e) => setBio(e.target.value)}
          placeholder="Bio or notes (optional)" rows={2}
          className="w-full px-2 py-1 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted placeholder:text-faint resize-none" />
        {allTags.length > 0 && <TagPicker allTags={allTags} selected={tagIds} onToggle={toggle} />}
      </div>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Labels() {
  const [labels, setLabels]   = useState<LabelWithTags[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding]   = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [l, t] = await Promise.all([getLabels(), getTags()]);
      setLabels(l);
      setAllTags(t);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-3xl mx-auto px-8 py-16">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-soft tracking-tight mb-1">Labels</h1>
          <p className="text-ghost text-sm">Promoters and record labels in your network.</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-rim text-ghost text-xs hover:text-soft hover:border-muted transition-colors"
        >
          <Plus size={13} />
          Add label
        </button>
      </div>

      <div className="rounded-lg border border-rim overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2.5 bg-surface border-b border-rim text-xs text-faint uppercase tracking-wider">
          <span className="w-44 shrink-0">Name & Type</span>
          <span className="w-28 shrink-0">City</span>
          <span className="flex-1">Social</span>
          <span className="w-44 shrink-0">Styles</span>
          <span className="w-8 shrink-0 text-center">RA</span>
          <span className="w-10 shrink-0" />
        </div>

        {adding && (
          <AddLabelForm
            allTags={allTags}
            onCreated={() => { setAdding(false); load(); }}
            onCancel={() => setAdding(false)}
          />
        )}

        {loading ? (
          <div className="px-4 py-10 text-center text-ghost text-sm">Loading…</div>
        ) : labels.length === 0 && !adding ? (
          <div className="px-4 py-12 text-center">
            <TagIcon size={28} className="text-faint mx-auto mb-3" strokeWidth={1} />
            <p className="text-ghost text-sm mb-1">No labels yet.</p>
            <p className="text-faint text-xs mb-4">Add promoters or record labels to track their RA events.</p>
            <button
              onClick={() => setAdding(true)}
              className="px-3 py-1.5 rounded border border-rim text-ghost text-xs hover:text-soft hover:border-muted transition-colors"
            >
              <Plus size={12} className="inline mr-1" />
              Add label
            </button>
          </div>
        ) : (
          labels.map((l) => (
            <LabelRow key={l.id} label={l} allTags={allTags} onUpdated={load} onDeleted={load} />
          ))
        )}
      </div>

      {labels.length > 0 && (
        <p className="mt-4 text-xs text-faint">
          {labels.length} label{labels.length !== 1 ? "s" : ""} total
        </p>
      )}
    </div>
  );
}
