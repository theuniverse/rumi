import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Check, X, Star } from "lucide-react";
import clsx from "clsx";
import {
  scraperApi,
  RefVenue,
  RefArtist,
  RefLabel,
} from "../../lib/scraper-api";

type Tab = "venues" | "artists" | "labels";

// ── Aliases chip input ──────────────────────────────────────────────────────

function AliasInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [raw, setRaw] = useState("");

  function add() {
    const trimmed = raw.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setRaw("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {value.map((a) => (
        <span key={a} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-rim text-ghost text-[10px]">
          {a}
          <button onClick={() => onChange(value.filter((x) => x !== a))} className="hover:text-red-400">
            <X size={8} />
          </button>
        </span>
      ))}
      <input
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder="+ alias"
        className="bg-transparent text-ghost text-[10px] w-16 outline-none placeholder:text-faint"
      />
    </div>
  );
}

// ── Venue CRUD ──────────────────────────────────────────────────────────────

function VenueTab() {
  const [items, setItems] = useState<RefVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const emptyForm = { name: "", aliases: [] as string[], type: "club", address: "", city: "", ra_id: "", followed: false };
  const [form, setForm] = useState(emptyForm);

  async function load() {
    setLoading(true);
    try { setItems((await scraperApi.getRefVenues()).items); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function startEdit(v: RefVenue) {
    setEditId(v.id);
    setForm({ name: v.name, aliases: v.aliases, type: v.type, address: v.address || "", city: v.city, ra_id: v.ra_id || "", followed: v.followed });
  }

  async function save() {
    if (editId) {
      await scraperApi.updateRefVenue(editId, form);
    } else {
      await scraperApi.createRefVenue(form as any);
    }
    setEditId(null); setAdding(false); setForm(emptyForm); load();
  }

  async function toggleFollow(v: RefVenue) {
    await scraperApi.updateRefVenue(v.id, { followed: !v.followed });
    load();
  }

  async function remove(id: number) {
    if (!confirm("Delete this venue?")) return;
    await scraperApi.deleteRefVenue(id);
    load();
  }

  function cancel() { setEditId(null); setAdding(false); setForm(emptyForm); }

  const isEditing = (id: number) => editId === id;

  return (
    <>
      <div className="flex justify-end mb-2">
        {!adding && <button onClick={() => { setAdding(true); setForm(emptyForm); }} className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-rim text-ghost hover:text-soft text-xs"><Plus size={12} /> Add venue</button>}
      </div>
      <div className="rounded-lg border border-rim overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-elevated border-b border-rim">
            <tr>
              <th className="text-left px-3 py-2 text-ghost font-normal w-6" />
              <th className="text-left px-3 py-2 text-ghost font-normal">Name</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">Aliases</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">Type</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">City</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {adding && <FormRow form={form} setForm={setForm} onSave={save} onCancel={cancel} typeOptions={["venue", "club", "other"]} />}
            {loading && <tr><td colSpan={6} className="text-center text-ghost py-6">Loading...</td></tr>}
            {!loading && items.length === 0 && !adding && <tr><td colSpan={6} className="text-center text-faint py-6">No venues yet.</td></tr>}
            {items.map((v) =>
              isEditing(v.id) ? (
                <FormRow key={v.id} form={form} setForm={setForm} onSave={save} onCancel={cancel} typeOptions={["venue", "club", "other"]} />
              ) : (
                <tr key={v.id} className="border-t border-rim hover:bg-elevated/30 transition-colors">
                  <td className="px-3 py-2">
                    <button onClick={() => toggleFollow(v)} className={clsx("transition-colors", v.followed ? "text-amber-400" : "text-faint hover:text-ghost")}>
                      <Star size={12} fill={v.followed ? "currentColor" : "none"} />
                    </button>
                  </td>
                  <td className="px-3 py-2 text-soft">{v.name}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {v.aliases.length === 0 ? <span className="text-faint">--</span> : v.aliases.map((a) => <span key={a} className="px-1.5 py-0.5 rounded border border-rim text-ghost text-[10px]">{a}</span>)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-ghost">{v.type}</td>
                  <td className="px-3 py-2 text-ghost">{v.city || "--"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(v)} className="p-1 rounded hover:bg-elevated text-ghost hover:text-soft"><Pencil size={12} /></button>
                      <button onClick={() => remove(v.id)} className="p-1 rounded hover:bg-red-400/10 text-ghost hover:text-red-400"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Artist CRUD ─────────────────────────────────────────────────────────────

function ArtistTab() {
  const [items, setItems] = useState<RefArtist[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const emptyForm = { name: "", aliases: [] as string[], type: "dj", city: "", ra_url: "", followed: false };
  const [form, setForm] = useState(emptyForm);

  async function load() {
    setLoading(true);
    try { setItems((await scraperApi.getRefArtists()).items); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function startEdit(a: RefArtist) {
    setEditId(a.id);
    setForm({ name: a.name, aliases: a.aliases, type: a.type, city: a.city || "", ra_url: a.ra_url || "", followed: a.followed });
  }

  async function save() {
    if (editId) {
      await scraperApi.updateRefArtist(editId, form);
    } else {
      await scraperApi.createRefArtist(form as any);
    }
    setEditId(null); setAdding(false); setForm(emptyForm); load();
  }

  async function toggleFollow(a: RefArtist) {
    await scraperApi.updateRefArtist(a.id, { followed: !a.followed });
    load();
  }

  async function remove(id: number) {
    if (!confirm("Delete this artist?")) return;
    await scraperApi.deleteRefArtist(id);
    load();
  }

  function cancel() { setEditId(null); setAdding(false); setForm(emptyForm); }

  return (
    <>
      <div className="flex justify-end mb-2">
        {!adding && <button onClick={() => { setAdding(true); setForm(emptyForm); }} className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-rim text-ghost hover:text-soft text-xs"><Plus size={12} /> Add artist</button>}
      </div>
      <div className="rounded-lg border border-rim overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-elevated border-b border-rim">
            <tr>
              <th className="text-left px-3 py-2 text-ghost font-normal w-6" />
              <th className="text-left px-3 py-2 text-ghost font-normal">Name</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">Aliases</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">Type</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">City</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {adding && <FormRow form={form} setForm={setForm} onSave={save} onCancel={cancel} typeOptions={["dj", "musician", "promoter", "other"]} />}
            {loading && <tr><td colSpan={6} className="text-center text-ghost py-6">Loading...</td></tr>}
            {!loading && items.length === 0 && !adding && <tr><td colSpan={6} className="text-center text-faint py-6">No artists yet.</td></tr>}
            {items.map((a) =>
              editId === a.id ? (
                <FormRow key={a.id} form={form} setForm={setForm} onSave={save} onCancel={cancel} typeOptions={["dj", "musician", "promoter", "other"]} />
              ) : (
                <tr key={a.id} className="border-t border-rim hover:bg-elevated/30 transition-colors">
                  <td className="px-3 py-2">
                    <button onClick={() => toggleFollow(a)} className={clsx("transition-colors", a.followed ? "text-amber-400" : "text-faint hover:text-ghost")}>
                      <Star size={12} fill={a.followed ? "currentColor" : "none"} />
                    </button>
                  </td>
                  <td className="px-3 py-2 text-soft">{a.name}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {a.aliases.length === 0 ? <span className="text-faint">--</span> : a.aliases.map((al) => <span key={al} className="px-1.5 py-0.5 rounded border border-rim text-ghost text-[10px]">{al}</span>)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-ghost">{a.type}</td>
                  <td className="px-3 py-2 text-ghost">{a.city || "--"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(a)} className="p-1 rounded hover:bg-elevated text-ghost hover:text-soft"><Pencil size={12} /></button>
                      <button onClick={() => remove(a.id)} className="p-1 rounded hover:bg-red-400/10 text-ghost hover:text-red-400"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Label CRUD ──────────────────────────────────────────────────────────────

function LabelTab() {
  const [items, setItems] = useState<RefLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const emptyForm = { name: "", aliases: [] as string[], type: "promoter", city: "", ra_id: "", followed: false };
  const [form, setForm] = useState(emptyForm);

  async function load() {
    setLoading(true);
    try { setItems((await scraperApi.getRefLabels()).items); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function startEdit(l: RefLabel) {
    setEditId(l.id);
    setForm({ name: l.name, aliases: l.aliases, type: l.type, city: l.city || "", ra_id: l.ra_id || "", followed: l.followed });
  }

  async function save() {
    if (editId) {
      await scraperApi.updateRefLabel(editId, form);
    } else {
      await scraperApi.createRefLabel(form as any);
    }
    setEditId(null); setAdding(false); setForm(emptyForm); load();
  }

  async function toggleFollow(l: RefLabel) {
    await scraperApi.updateRefLabel(l.id, { followed: !l.followed });
    load();
  }

  async function remove(id: number) {
    if (!confirm("Delete this label?")) return;
    await scraperApi.deleteRefLabel(id);
    load();
  }

  function cancel() { setEditId(null); setAdding(false); setForm(emptyForm); }

  return (
    <>
      <div className="flex justify-end mb-2">
        {!adding && <button onClick={() => { setAdding(true); setForm(emptyForm); }} className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-rim text-ghost hover:text-soft text-xs"><Plus size={12} /> Add label</button>}
      </div>
      <div className="rounded-lg border border-rim overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-elevated border-b border-rim">
            <tr>
              <th className="text-left px-3 py-2 text-ghost font-normal w-6" />
              <th className="text-left px-3 py-2 text-ghost font-normal">Name</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">Aliases</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">Type</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">City</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {adding && <FormRow form={form} setForm={setForm} onSave={save} onCancel={cancel} typeOptions={["promoter", "record_label"]} />}
            {loading && <tr><td colSpan={6} className="text-center text-ghost py-6">Loading...</td></tr>}
            {!loading && items.length === 0 && !adding && <tr><td colSpan={6} className="text-center text-faint py-6">No labels yet.</td></tr>}
            {items.map((l) =>
              editId === l.id ? (
                <FormRow key={l.id} form={form} setForm={setForm} onSave={save} onCancel={cancel} typeOptions={["promoter", "record_label"]} />
              ) : (
                <tr key={l.id} className="border-t border-rim hover:bg-elevated/30 transition-colors">
                  <td className="px-3 py-2">
                    <button onClick={() => toggleFollow(l)} className={clsx("transition-colors", l.followed ? "text-amber-400" : "text-faint hover:text-ghost")}>
                      <Star size={12} fill={l.followed ? "currentColor" : "none"} />
                    </button>
                  </td>
                  <td className="px-3 py-2 text-soft">{l.name}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {l.aliases.length === 0 ? <span className="text-faint">--</span> : l.aliases.map((a) => <span key={a} className="px-1.5 py-0.5 rounded border border-rim text-ghost text-[10px]">{a}</span>)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-ghost">{l.type}</td>
                  <td className="px-3 py-2 text-ghost">{l.city || "--"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(l)} className="p-1 rounded hover:bg-elevated text-ghost hover:text-soft"><Pencil size={12} /></button>
                      <button onClick={() => remove(l.id)} className="p-1 rounded hover:bg-red-400/10 text-ghost hover:text-red-400"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Shared inline form row ──────────────────────────────────────────────────

function FormRow({
  form,
  setForm,
  onSave,
  onCancel,
  typeOptions,
}: {
  form: { name: string; aliases: string[]; type: string; city: string; followed: boolean };
  setForm: (fn: (f: any) => any) => void;
  onSave: () => void;
  onCancel: () => void;
  typeOptions: string[];
}) {
  return (
    <tr className="border-t border-rim bg-elevated/50">
      <td className="px-3 py-2">
        <button
          onClick={() => setForm((f: any) => ({ ...f, followed: !f.followed }))}
          className={clsx("transition-colors", form.followed ? "text-amber-400" : "text-faint")}
        >
          <Star size={12} fill={form.followed ? "currentColor" : "none"} />
        </button>
      </td>
      <td className="px-3 py-2">
        <input
          value={form.name}
          onChange={(e) => setForm((f: any) => ({ ...f, name: e.target.value }))}
          placeholder="Name"
          className="w-full bg-surface border border-rim rounded px-2 py-1 text-soft text-xs focus:outline-none focus:border-ghost"
        />
      </td>
      <td className="px-3 py-2">
        <AliasInput value={form.aliases} onChange={(v) => setForm((f: any) => ({ ...f, aliases: v }))} />
      </td>
      <td className="px-3 py-2">
        <select
          value={form.type}
          onChange={(e) => setForm((f: any) => ({ ...f, type: e.target.value }))}
          className="bg-surface border border-rim rounded px-2 py-1 text-ghost text-xs focus:outline-none"
        >
          {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          value={form.city}
          onChange={(e) => setForm((f: any) => ({ ...f, city: e.target.value }))}
          placeholder="City"
          className="w-full bg-surface border border-rim rounded px-2 py-1 text-soft text-xs focus:outline-none focus:border-ghost"
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <button onClick={onSave} disabled={!form.name} className="p-1 rounded hover:bg-emerald-400/10 text-ghost hover:text-emerald-400 disabled:opacity-30"><Check size={13} /></button>
          <button onClick={onCancel} className="p-1 rounded hover:bg-elevated text-ghost hover:text-soft"><X size={13} /></button>
        </div>
      </td>
    </tr>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function ScraperRefData() {
  const [tab, setTab] = useState<Tab>("venues");

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-soft text-lg font-semibold">Reference Data</h1>
        <p className="text-ghost text-sm">场地、艺人、厂牌参考数据，供 LLM 提取上下文和事件匹配使用</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-rim">
        {(["venues", "artists", "labels"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "px-4 py-2 text-xs transition-colors border-b-2 -mb-px",
              tab === t ? "text-soft border-soft" : "text-ghost border-transparent hover:text-soft",
            )}
          >
            {t === "venues" ? "Venues" : t === "artists" ? "Artists" : "Labels"}
          </button>
        ))}
      </div>

      {tab === "venues" && <VenueTab />}
      {tab === "artists" && <ArtistTab />}
      {tab === "labels" && <LabelTab />}
    </div>
  );
}
