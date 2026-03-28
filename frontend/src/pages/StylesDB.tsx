import { useState, useEffect, useRef } from "react";
import { Plus, ChevronRight, Pencil, Trash2, Check, X } from "lucide-react";
import clsx from "clsx";
import { Tag, getTagTree, createTag, updateTag, deleteTag } from "../lib/api";

// ── Colour dot ────────────────────────────────────────────────────────────────
function Dot({ color }: { color: string | null }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ background: color ?? "#8a8a8a" }}
    />
  );
}

// ── Inline editable row ───────────────────────────────────────────────────────
interface RowProps {
  tag: Tag;
  depth: number;
  onUpdated: () => void;
  onDeleted: () => void;
}

function TagRow({ tag, depth, onUpdated, onDeleted }: RowProps) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color ?? "#8a8a8a");
  const [bpmMin, setBpmMin] = useState<string>(tag.bpm_min?.toString() ?? "");
  const [bpmMax, setBpmMax] = useState<string>(tag.bpm_max?.toString() ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = async () => {
    await updateTag(tag.id, {
      name,
      color,
      bpm_min: bpmMin ? parseInt(bpmMin) : undefined,
      bpm_max: bpmMax ? parseInt(bpmMax) : undefined,
    });
    setEditing(false);
    onUpdated();
  };

  const cancel = () => {
    setName(tag.name);
    setColor(tag.color ?? "#8a8a8a");
    setBpmMin(tag.bpm_min?.toString() ?? "");
    setBpmMax(tag.bpm_max?.toString() ?? "");
    setEditing(false);
  };

  const remove = async () => {
    if (!confirm(`Delete "${tag.name}"${tag.children.length ? " and all its sub-styles" : ""}?`)) return;
    await deleteTag(tag.id);
    onDeleted();
  };

  const indent = depth * 16;

  return (
    <>
      <div
        className={clsx(
          "group flex items-center gap-2 px-4 py-2 text-sm border-b border-rim/60 hover:bg-elevated/40 transition-colors",
          editing && "bg-elevated"
        )}
        style={{ paddingLeft: `${indent + 16}px` }}
      >
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className={clsx(
            "shrink-0 transition-transform",
            tag.children.length === 0 && "invisible",
            expanded && "rotate-90"
          )}
        >
          <ChevronRight size={12} className="text-faint" />
        </button>

        {/* Colour swatch (click to edit) */}
        {editing ? (
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 p-0 shrink-0"
          />
        ) : (
          <Dot color={color} />
        )}

        {/* Name */}
        {editing ? (
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
            className="flex-1 bg-transparent text-soft outline-none border-b border-sand/50 pb-px"
          />
        ) : (
          <span className="flex-1 text-soft">{tag.name}</span>
        )}

        {/* BPM range */}
        {editing ? (
          <div className="flex items-center gap-1 text-xs text-ghost">
            <input
              value={bpmMin}
              onChange={(e) => setBpmMin(e.target.value)}
              placeholder="min"
              className="w-10 bg-muted/40 rounded px-1.5 py-0.5 text-center outline-none text-ghost"
            />
            <span className="text-faint">–</span>
            <input
              value={bpmMax}
              onChange={(e) => setBpmMax(e.target.value)}
              placeholder="max"
              className="w-10 bg-muted/40 rounded px-1.5 py-0.5 text-center outline-none text-ghost"
            />
            <span className="text-faint ml-0.5">bpm</span>
          </div>
        ) : tag.bpm_min || tag.bpm_max ? (
          <span className="text-xs text-faint font-mono">
            {tag.bpm_min ?? "?"} – {tag.bpm_max ?? "?"} bpm
          </span>
        ) : null}

        {/* Actions */}
        <div className={clsx("flex items-center gap-1 ml-2", editing ? "visible" : "invisible group-hover:visible")}>
          {editing ? (
            <>
              <button onClick={save} className="p-1 text-live hover:text-live/80"><Check size={13} /></button>
              <button onClick={cancel} className="p-1 text-ghost hover:text-soft"><X size={13} /></button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="p-1 text-ghost hover:text-soft"><Pencil size={13} /></button>
              <button onClick={remove} className="p-1 text-ghost hover:text-red-400"><Trash2 size={13} /></button>
            </>
          )}
        </div>
      </div>

      {/* Children */}
      {expanded &&
        tag.children.map((child) => (
          <TagRow
            key={child.id}
            tag={child}
            depth={depth + 1}
            onUpdated={onUpdated}
            onDeleted={onDeleted}
          />
        ))}
    </>
  );
}

// ── Add tag form ──────────────────────────────────────────────────────────────
interface AddFormProps {
  tags: Tag[];
  onCreated: () => void;
  onCancel: () => void;
}

function AddTagForm({ tags, onCreated, onCancel }: AddFormProps) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [color, setColor] = useState("#8a8a8a");
  const [saving, setSaving] = useState(false);

  const flatTags = (list: Tag[], depth = 0): { tag: Tag; depth: number }[] =>
    list.flatMap((t) => [{ tag: t, depth }, ...flatTags(t.children, depth + 1)]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createTag({
        name: name.trim(),
        parent_id: parentId ? parseInt(parentId) : undefined,
        color,
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-3 px-4 py-3 bg-elevated border-b border-rim text-sm"
    >
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0 shrink-0"
      />
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Style name"
        className="flex-1 bg-transparent text-soft outline-none border-b border-sand/40 pb-px placeholder:text-faint"
      />
      <select
        value={parentId}
        onChange={(e) => setParentId(e.target.value)}
        className="bg-surface border border-rim text-ghost rounded px-2 py-1 text-xs outline-none"
      >
        <option value="">No parent</option>
        {flatTags(tags).map(({ tag, depth }) => (
          <option key={tag.id} value={tag.id}>
            {"  ".repeat(depth)}{tag.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="px-3 py-1 rounded bg-sand/15 text-sand text-xs hover:bg-sand/25 disabled:opacity-40 transition-colors"
      >
        Add
      </button>
      <button type="button" onClick={onCancel} className="p-1 text-ghost hover:text-soft">
        <X size={14} />
      </button>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function StylesDB() {
  const [tree, setTree] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getTagTree();
      setTree(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-2xl mx-auto px-8 py-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-soft tracking-tight mb-1">Styles</h1>
          <p className="text-ghost text-sm">Music style database — click any row to edit.</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-rim text-ghost text-xs hover:text-soft hover:border-muted transition-colors"
        >
          <Plus size={13} />
          New style
        </button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-rim overflow-hidden">
        {/* Column headers */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-surface border-b border-rim text-xs text-faint uppercase tracking-wider">
          <span className="w-4 shrink-0" />
          <span className="w-2.5 shrink-0" />
          <span className="flex-1">Name</span>
          <span className="w-28 text-right">BPM Range</span>
          <span className="w-12" />
        </div>

        {/* Add form */}
        {adding && (
          <AddTagForm
            tags={tree}
            onCreated={() => { setAdding(false); load(); }}
            onCancel={() => setAdding(false)}
          />
        )}

        {/* Rows */}
        {loading ? (
          <div className="px-4 py-10 text-center text-ghost text-sm">Loading…</div>
        ) : tree.length === 0 ? (
          <div className="px-4 py-10 text-center text-ghost text-sm">
            No styles yet.{" "}
            <button onClick={() => setAdding(true)} className="text-sand underline-offset-2 hover:underline">
              Add one
            </button>{" "}
            or{" "}
            <a href={`${import.meta.env.BASE_URL}api/seed`} className="text-sand underline-offset-2 hover:underline">
              run the seed script
            </a>.
          </div>
        ) : (
          tree.map((tag) => (
            <TagRow
              key={tag.id}
              tag={tag}
              depth={0}
              onUpdated={load}
              onDeleted={load}
            />
          ))
        )}
      </div>

      <p className="mt-4 text-xs text-faint">
        {tree.reduce((n, t) => n + 1 + t.children.length, 0)} styles total
      </p>
    </div>
  );
}
