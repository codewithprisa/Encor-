"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap" });

/* ───────────── Koneksi API ───────────── */
const API = "http://localhost:3001";

// Sesuaikan key ini dengan tempat kamu menyimpan token saat login
const TOKEN_KEY = "token";

async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;

  let res: Response;
  try {
    res = await fetch(`${API}/api${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    // fetch gagal total: server mati, URL salah, atau diblok browser
    throw new Error(`Tidak bisa terhubung ke server (${API}). Pastikan backend sudah berjalan.`);
  }

  const json = await res.json().catch(() => null);

  if (!res.ok || json?.success === false) {
    throw new Error(json?.message ?? "Terjadi kesalahan pada server.");
  }
  return json as T;
}

/* ───────────── Tipe & konstanta ───────────── */
type Genre = {
  id: string;
  name: string;
  color: string; // warna badge (hex)
  artists: number; // jumlah artis (dihitung di backend)
  events: number; // jumlah event (dihitung di backend)
  createdAt: string;
};

const PALETTE = ["#3B82C4", "#0EA5A4", "#16A34A", "#C08A2B", "#E0728F", "#8B5CF6", "#6B7280"];
const PAGE_SIZE = 8;

type SortKey = "name" | "artists" | "newest";

// Mapper: ubah response backend -> tipe Genre.
// Kalau nama field di backend beda, tambahkan/ubah di sini saja.
function toGenre(g: any): Genre {
  return {
    id: String(g.id ?? g._id),
    name: g.nama ?? g.name ?? "",
    color: g.warna ?? g.colorSwatch ?? g.color ?? "#6B7280",
    artists: Number(g.jumlahArtis ?? g.artists ?? 0),
    events: Number(g.jumlahEvent ?? g.events ?? 0),
    createdAt: g.createdAt ?? g.created_at ?? "", // backend belum mengirim; "Terbaru" diurutkan pakai id
  };
}

/* ───────────── Helpers ───────────── */
const nf = new Intl.NumberFormat("id-ID");

/* ───────────── Ikon ───────────── */
function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}
const IPlus = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
const ITag = () => <Icon><path d="M3 12V4h8l9 9-8 8-9-9Z" /><circle cx="7.5" cy="8.5" r="1" /></Icon>;
const IStar = () => <Icon><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z" /></Icon>;
const ICalendar = () => <Icon><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></Icon>;
const IEdit = () => <Icon size={16}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4" /></Icon>;
const ITrash = () => <Icon size={16}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Icon>;
const IClose = () => <Icon><path d="M6 6l12 12M18 6 6 18" /></Icon>;
const ISearch = () => <Icon size={16}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></Icon>;
const IPrev = () => <Icon size={14}><path d="m15 5-7 7 7 7" /></Icon>;
const INext = () => <Icon size={14}><path d="m9 5 7 7-7 7" /></Icon>;
const ICheck = () => <Icon size={16}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>;
const IWarn = () => <Icon size={22}><path d="M12 4 2.5 20h19L12 4ZM12 10v4.5M12 17.5h.01" /></Icon>;
const IPen = () => <Icon size={15}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" /></Icon>;
const IEmpty = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12V4h8l9 9-8 8-9-9Z" /><circle cx="7.5" cy="8.5" r="1.2" />
  </svg>
);

/* ───────────── Komponen kecil ───────────── */
function Chip({ name, color, size = 34 }: { name: string; color: string; size?: number }) {
  return (
    <span className="chip" style={{ "--c": color, width: size, height: size, fontSize: size * 0.42 } as CSSProperties}>
      {name.trim()[0]?.toUpperCase() || "?"}
    </span>
  );
}

function Badge({ name, color, large }: { name: string; color: string; large?: boolean }) {
  return (
    <span className={`badge ${large ? "lg" : ""}`} style={{ "--c": color } as CSSProperties}>
      {name || "Nama Genre"}
    </span>
  );
}

function StatCard({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint: string }) {
  return (
    <article className="card stat">
      <span className="stat-icon">{icon}</span>
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value}</p>
        <p className="stat-hint">{hint}</p>
      </div>
    </article>
  );
}

/* ───────────── Modal tambah / ubah ───────────── */
function GenreModal({
  initial,
  existingNames,
  onClose,
  onSave,
}: {
  initial: Genre | null;
  existingNames: string[];
  onClose: () => void;
  onSave: (data: { name: string; color: string }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? PALETTE[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const customRef = useRef<HTMLInputElement>(null);
  const isCustom = !PALETTE.includes(color);

  // simpan onClose terbaru di ref supaya efek di bawah tidak jalan ulang
  // (dan tidak merebut fokus input) setiap parent re-render
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;

    const trimmed = name.trim();
    if (trimmed.length < 2) return setError("Nama genre minimal 2 karakter.");
    if (trimmed.length > 30) return setError("Nama genre maksimal 30 karakter.");
    if (existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase()))
      return setError("Nama genre sudah ada.");

    try {
      setSaving(true);
      await onSave({ name: trimmed, color });
    } catch (err) {
      // error dari server (mis. duplikat, belum login, bukan admin) tampil di form
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onSubmit={submit} noValidate>
        <header className="modal-head">
          <div>
            <h2 id="modal-title">{initial ? "Ubah Genre" : "Tambah Genre Baru"}</h2>
            <p className="sub">Beri nama dan pilih warna badge untuk genre ini.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            <IClose />
          </button>
        </header>

        <div className="modal-body">
          <div className="field">
            <label className="label" htmlFor="g-name">Nama Genre</label>
            <input
              id="g-name"
              ref={nameRef}
              value={name}
              onChange={(e) => (setName(e.target.value), setError(null))}
              placeholder="Contoh: Indie, Jazz, Dangdut"
              aria-invalid={!!error}
              maxLength={40}
            />
            {error && <p className="err">{error}</p>}
          </div>

          <div className="field">
            <span className="label" id="color-label">Pilih Warna Badge</span>
            <div className="swatches" role="radiogroup" aria-labelledby="color-label">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={`Warna ${c}`}
                  className={`swatch ${color === c ? "on" : ""}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                >
                  {color === c && <ICheck />}
                </button>
              ))}
              <button
                type="button"
                className={`swatch custom ${isCustom ? "on" : ""}`}
                style={isCustom ? { background: color } : undefined}
                onClick={() => customRef.current?.click()}
                aria-label="Pilih warna kustom"
                title="Warna kustom"
              >
                {isCustom ? <ICheck /> : <IPen />}
              </button>
              <input
                ref={customRef}
                type="color"
                className="color-input"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                aria-hidden="true"
                tabIndex={-1}
              />
            </div>
          </div>

          <div className="preview">
            <span className="hint">Preview badge</span>
            <Badge name={name.trim()} color={color} large />
          </div>
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Menyimpan..." : initial ? "Simpan Perubahan" : "Simpan Genre"}
          </button>
        </footer>
      </form>
    </div>
  );
}

/* ───────────── Dialog hapus ───────────── */
function ConfirmDelete({
  genre,
  busy,
  onCancel,
  onConfirm,
}: {
  genre: Genre;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancelRef.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className="modal small" role="alertdialog" aria-modal="true" aria-labelledby="del-title">
        <div className="modal-body confirm">
          <span className="warn-icon"><IWarn /></span>
          <h2 id="del-title">Hapus genre ini?</h2>
          <p className="sub">
            Genre <strong>{genre.name}</strong> akan dihapus. Tindakan ini tidak dapat dibatalkan.
          </p>
          {genre.artists > 0 && (
            <p className="alert">
              Genre ini masih dipakai oleh {nf.format(genre.artists)} artis, jadi belum bisa dihapus. Pindahkan artis tersebut ke genre lain dulu.
            </p>
          )}
          {genre.artists === 0 && genre.events > 0 && (
            <p className="alert">
              Genre ini dipakai {nf.format(genre.events)} event. Event tetap ada, tapi akan kehilangan genre.
            </p>
          )}
        </div>
        <footer className="modal-foot">
          <button className="btn-ghost" onClick={onCancel} disabled={busy} autoFocus>Batal</button>
          <button className="btn-danger" onClick={onConfirm} disabled={busy || genre.artists > 0}>
            {busy ? "Menghapus..." : "Ya, Hapus"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ───────────── Halaman ───────────── */
export default function GenrePage() {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; genre: Genre } | null>(null);
  const [toDelete, setToDelete] = useState<Genre | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2600);
  }

  /* ── Ambil data dari backend: GET /api/genre ── */
  async function loadGenres() {
    try {
      setLoadError(null);
      const res = await request<any>("/genre");
      const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
      setGenres(list.map(toGenre));
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGenres();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const stats = useMemo(() => {
    const top = genres.reduce<Genre | null>((best, g) => (!best || g.artists > best.artists ? g : best), null);
    return {
      total: genres.length,
      top: top && top.artists > 0 ? top : null,
      events: genres.reduce((s, g) => s + g.events, 0),
    };
  }, [genres]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = genres.filter((g) => !q || g.name.toLowerCase().includes(q));
    return list.sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "id")
        : sort === "artists"
          ? b.artists - a.artists
          : Number(b.id) - Number(a.id),
    );
  }, [genres, query, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);

  /* ── Simpan: POST /api/genre atau PUT /api/genre/:id ── */
  // Error sengaja tidak di-catch di sini; modal yang menampilkannya di form.
  async function handleSave(data: { name: string; color: string }) {
    // backend menerima `nama` dan `warna` (hex 6 digit, mis. #A855F7)
    const body = JSON.stringify({ nama: data.name, warna: data.color });

    if (modal?.mode === "edit") {
      await request(`/genre/${modal.genre.id}`, { method: "PUT", body });
      showToast("Genre berhasil diperbarui.");
    } else {
      await request("/genre", { method: "POST", body });
      setQuery("");
      setPage(1);
      showToast("Genre baru berhasil ditambahkan.");
    }
    setModal(null);
    await loadGenres();
  }

  /* ── Hapus: DELETE /api/genre/:id ── */
  async function handleDelete() {
    if (!toDelete) return;
    try {
      setDeleting(true);
      // admin sudah konfirmasi lewat dialog, jadi kirim ?paksa=1 kalau genre masih dipakai event
      const paksa = toDelete.events > 0 ? "?paksa=1" : "";
      await request(`/genre/${toDelete.id}${paksa}`, { method: "DELETE" });
      showToast("Genre berhasil dihapus.");
      setToDelete(null);
      await loadGenres();
    } catch (e) {
      showToast((e as Error).message);
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className={`page ${inter.className}`}>
      <style>{css}</style>

      <div className="wrap">
        {/* Header */}
        <header className="head">
          <div>
            <nav className="crumb" aria-label="Breadcrumb">
              <span>Dashboard</span><span aria-hidden="true">/</span><strong>Genre</strong>
            </nav>
            <h1>Kelola Genre</h1>
            <p className="sub">Atur klasifikasi musik untuk memudahkan pemetaan artis dan segmentasi event konser Anda.</p>
          </div>
          <button className="btn-primary lg" onClick={() => setModal({ mode: "create" })}>
            <IPlus /> Tambah Genre
          </button>
        </header>

        {/* Statistik */}
        <section className="stats" aria-label="Ringkasan">
          <StatCard
            icon={<ITag />}
            label="Total Genre"
            value={loading ? "…" : nf.format(stats.total)}
            hint={loading ? "Memuat data" : stats.total ? "Genre aktif" : "Belum ada data"}
          />
          <StatCard
            icon={<IStar />}
            label="Genre Terlaris"
            value={stats.top ? stats.top.name : "—"}
            hint={stats.top ? `${nf.format(stats.top.artists)} Artis` : "Belum ada data"}
          />
          <StatCard
            icon={<ICalendar />}
            label="Total Event"
            value={loading ? "…" : nf.format(stats.events)}
            hint={loading ? "Memuat data" : stats.total ? "Dari seluruh genre" : "Belum ada data"}
          />
        </section>

        {/* Daftar genre */}
        <section className="card list">
          <div className="toolbar">
            <label className="search">
              <ISearch />
              <input
                type="search"
                placeholder="Cari nama genre..."
                value={query}
                onChange={(e) => (setQuery(e.target.value), setPage(1))}
                aria-label="Cari genre"
              />
            </label>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Urutkan">
              <option value="name">Urutkan: Nama A–Z</option>
              <option value="artists">Urutkan: Artis terbanyak</option>
              <option value="newest">Urutkan: Terbaru</option>
            </select>
          </div>

          {loading ? (
            <div className="empty" role="status">
              <span className="spinner" aria-hidden="true" />
              <p>Memuat daftar genre...</p>
            </div>
          ) : loadError ? (
            <div className="empty">
              <span className="empty-icon error"><IWarn /></span>
              <h3>Gagal memuat genre</h3>
              <p>{loadError}</p>
              <button
                className="btn-ghost"
                onClick={() => {
                  setLoading(true);
                  loadGenres();
                }}
              >
                Coba lagi
              </button>
            </div>
          ) : rows.length > 0 ? (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nama Genre</th>
                      <th>Jumlah Artis</th>
                      <th>Jumlah Event</th>
                      <th className="right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((g) => (
                      <tr key={g.id}>
                        <td>
                          <div className="who">
                            <Chip name={g.name} color={g.color} />
                            <span className="name">{g.name}</span>
                          </div>
                        </td>
                        <td className="num">{nf.format(g.artists)} Artis</td>
                        <td>
                          <span className="count" style={{ "--c": g.color } as CSSProperties}>
                            {nf.format(g.events)} Event
                          </span>
                        </td>
                        <td className="right">
                          <div className="row-actions">
                            <button className="icon-btn" onClick={() => setModal({ mode: "edit", genre: g })} aria-label={`Ubah ${g.name}`} title="Ubah">
                              <IEdit />
                            </button>
                            <button className="icon-btn danger" onClick={() => setToDelete(g)} aria-label={`Hapus ${g.name}`} title="Hapus">
                              <ITrash />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <footer className="foot">
                <span>Menampilkan {rows.length} dari {nf.format(filtered.length)} genre tersedia</span>
                <nav className="pager" aria-label="Paginasi">
                  <button className="pg" disabled={safePage === 1} onClick={() => setPage(safePage - 1)} aria-label="Sebelumnya"><IPrev /></button>
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                    <button key={p} className={`pg ${p === safePage ? "active" : ""}`} onClick={() => setPage(p)} aria-current={p === safePage ? "page" : undefined}>
                      {p}
                    </button>
                  ))}
                  <button className="pg" disabled={safePage === pageCount} onClick={() => setPage(safePage + 1)} aria-label="Berikutnya"><INext /></button>
                </nav>
              </footer>
            </>
          ) : (
            <div className="empty">
              <span className="empty-icon"><IEmpty /></span>
              {query.trim() ? (
                <>
                  <h3>Tidak ada hasil</h3>
                  <p>Tidak ada genre yang cocok dengan “{query.trim()}”.</p>
                  <button className="btn-ghost" onClick={() => setQuery("")}>Reset pencarian</button>
                </>
              ) : (
                <>
                  <h3>Belum ada genre</h3>
                  <p>Tambahkan genre pertama untuk mulai mengelompokkan artis dan event konser.</p>
                  <button className="btn-primary" onClick={() => setModal({ mode: "create" })}><IPlus /> Tambah Genre</button>
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {modal && (
        <GenreModal
          initial={modal.mode === "edit" ? modal.genre : null}
          existingNames={genres.filter((g) => modal.mode !== "edit" || g.id !== modal.genre.id).map((g) => g.name)}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
      {toDelete && (
        <ConfirmDelete genre={toDelete} busy={deleting} onCancel={() => setToDelete(null)} onConfirm={handleDelete} />
      )}
      {toast && <div className="toast" role="status"><ICheck /> {toast}</div>}
    </main>
  );
}

/* ───────────── Styles ───────────── */
const css = `
:root {
  --bg: #F8F5F1; --card: #FFFFFF; --ink: #17202A; --muted: #6A7380; --line: #E7E1DA;
  --soft: #F3EEE8; --hover: #FBF9F6;
  --accent: #2F5D80; --accent-hover: #244A68; --accent-ink: #FFFFFF; --accent-soft: #E6EEF5;
  --danger: #C4372D; --danger-hover: #A82D24; --danger-soft: #FCEBE9;
  --field: #FFFFFF; --overlay: rgba(23,32,42,.5);
  --shadow: 0 1px 2px rgba(23,32,42,.04), 0 6px 20px rgba(23,32,42,.05);
}
:root[data-theme="dark"] {
  --bg: #121316; --card: #1B1C20; --ink: #F1EEEA; --muted: #9CA3AE; --line: #2E3037;
  --soft: #24262B; --hover: #212328;
  --accent: #8EC1EC; --accent-hover: #A8D1F2; --accent-ink: #10202D; --accent-soft: #1F3547;
  --danger: #EE7A70; --danger-hover: #F39A92; --danger-soft: #3A2220;
  --field: #14151A; --overlay: rgba(0,0,0,.65);
  --shadow: 0 1px 2px rgba(0,0,0,.3), 0 6px 20px rgba(0,0,0,.3);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--bg); color: var(--ink); -webkit-font-smoothing: antialiased; }
button { font: inherit; color: inherit; }

.page { min-height: 100vh; }
.wrap { max-width: 1200px; margin: 0 auto; padding: 32px 24px 64px; display: flex; flex-direction: column; gap: 24px; }

.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); }
.icon { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }

/* header */
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.head > div { max-width: 560px; }
.crumb { display: flex; gap: 8px; font-size: 12px; color: var(--muted); margin-bottom: 10px; }
.crumb strong { color: var(--ink); font-weight: 600; }
h1 { font-size: 30px; font-weight: 700; letter-spacing: -0.025em; line-height: 1.15; }
h2 { font-size: 17px; font-weight: 650; letter-spacing: -0.01em; }
h3 { font-size: 16px; font-weight: 650; }
.sub { font-size: 13.5px; color: var(--muted); margin-top: 6px; line-height: 1.5; }

/* buttons */
.btn-primary, .btn-ghost, .btn-danger { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 18px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer; border: 1px solid transparent; transition: background .15s, border-color .15s; white-space: nowrap; }
.btn-primary.lg { height: 44px; padding: 0 22px; }
.btn-primary { background: var(--accent); color: var(--accent-ink); box-shadow: 0 1px 2px rgba(47,93,128,.3); }
.btn-primary:hover { background: var(--accent-hover); }
.btn-ghost { background: var(--card); border-color: var(--line); }
.btn-ghost:hover { background: var(--hover); border-color: var(--muted); }
.btn-danger { background: var(--danger); color: #fff; }
.btn-danger:hover { background: var(--danger-hover); }
button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { opacity: .4; cursor: not-allowed; }

/* stats */
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.stat { padding: 20px; display: flex; gap: 14px; align-items: flex-start; }
.stat-icon { width: 40px; height: 40px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; flex-shrink: 0; }
.stat-label { font-size: 12.5px; font-weight: 500; color: var(--muted); }
.stat-value { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin-top: 4px; line-height: 1.2; }
.stat-hint { font-size: 12px; color: var(--muted); margin-top: 4px; }

/* toolbar */
.list { overflow: hidden; }
.toolbar { display: flex; gap: 10px; padding: 16px 20px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.search { flex: 1; min-width: 220px; max-width: 360px; display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border: 1px solid var(--line); background: var(--field); border-radius: 10px; color: var(--muted); transition: border-color .15s, box-shadow .15s; }
.search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.search input { flex: 1; border: 0; outline: 0 !important; background: transparent; font: inherit; font-size: 13.5px; color: var(--ink); min-width: 0; }
select { height: 40px; padding: 0 34px 0 12px; font: inherit; font-size: 13.5px; color: var(--ink); border: 1px solid var(--line); background-color: var(--field); border-radius: 10px; cursor: pointer; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236A7380' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; }

/* table */
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; min-width: 560px; font-size: 13.5px; }
th { text-align: left; font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); padding: 12px 20px; background: var(--soft); white-space: nowrap; }
td { padding: 14px 20px; border-bottom: 1px solid var(--line); vertical-align: middle; }
tbody tr { transition: background .12s; }
tbody tr:hover { background: var(--hover); }
tbody tr:last-child td { border-bottom: 0; }
.right { text-align: right; }
.num { font-variant-numeric: tabular-nums; }
.who { display: flex; align-items: center; gap: 12px; }
.name { font-weight: 600; font-size: 14px; }

.chip { display: grid; place-items: center; border-radius: 9px; font-weight: 700; background: color-mix(in srgb, var(--c) 22%, transparent); color: color-mix(in srgb, var(--c) 60%, var(--ink)); flex-shrink: 0; }
.badge { display: inline-block; font-size: 12.5px; font-weight: 600; padding: 5px 14px; border-radius: 999px; background: color-mix(in srgb, var(--c) 22%, transparent); color: color-mix(in srgb, var(--c) 60%, var(--ink)); }
.badge.lg { font-size: 14px; padding: 7px 20px; }
.count { display: inline-block; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 999px; background: color-mix(in srgb, var(--c) 14%, transparent); color: color-mix(in srgb, var(--c) 65%, var(--ink)); font-variant-numeric: tabular-nums; }

.row-actions { display: inline-flex; gap: 4px; }
.icon-btn { width: 34px; height: 34px; display: grid; place-items: center; background: transparent; border: 0; border-radius: 8px; color: var(--muted); cursor: pointer; transition: background .15s, color .15s; }
.icon-btn:hover { background: var(--soft); color: var(--ink); }
.icon-btn.danger:hover { background: var(--danger-soft); color: var(--danger); }

.foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 14px 20px; border-top: 1px solid var(--line); font-size: 13px; color: var(--muted); }
.pager { display: flex; gap: 4px; }
.pg { min-width: 34px; height: 34px; padding: 0 8px; display: grid; place-items: center; font-size: 13px; font-weight: 600; background: transparent; border: 1px solid transparent; border-radius: 8px; cursor: pointer; color: var(--muted); }
.pg:hover:not(:disabled) { background: var(--soft); color: var(--ink); }
.pg.active { background: var(--accent-soft); color: var(--accent); }

/* empty / loading / error */
.empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 72px 24px 80px; gap: 8px; }
.empty-icon { width: 80px; height: 80px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); margin-bottom: 12px; box-shadow: 0 0 0 10px color-mix(in srgb, var(--accent-soft) 45%, transparent); }
.empty-icon.error { background: var(--danger-soft); color: var(--danger); box-shadow: 0 0 0 10px color-mix(in srgb, var(--danger-soft) 45%, transparent); }
.empty p { max-width: 380px; font-size: 13.5px; color: var(--muted); line-height: 1.6; margin-bottom: 14px; }
.spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--line); border-top-color: var(--accent); animation: spin .7s linear infinite; margin-bottom: 8px; }

/* modal */
.overlay { position: fixed; inset: 0; z-index: 50; background: var(--overlay); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 16px; animation: fade .15s ease; }
.modal { width: 100%; max-width: 480px; max-height: calc(100vh - 32px); display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 24px 64px rgba(0,0,0,.28); overflow: hidden; animation: pop .18s ease; }
.modal.small { max-width: 400px; }
.modal-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 22px 24px 18px; border-bottom: 1px solid var(--line); }
.modal-body { padding: 22px 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 20px; }
.modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px; border-top: 1px solid var(--line); background: var(--soft); }
.confirm { align-items: center; text-align: center; gap: 10px; padding-top: 28px; }
.confirm .sub { margin-top: 0; }
.warn-icon { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: var(--danger-soft); color: var(--danger); }
.alert { font-size: 12.5px; line-height: 1.5; padding: 10px 12px; border-radius: 10px; background: var(--danger-soft); color: var(--danger); text-align: left; }

.field { display: flex; flex-direction: column; gap: 8px; }
.label { font-size: 13px; font-weight: 600; }
.hint { font-size: 12px; color: var(--muted); }
input:not([type="search"]):not([type="color"]) { width: 100%; padding: 10px 12px; font: inherit; font-size: 13.5px; color: var(--ink); background: var(--field); border: 1px solid var(--line); border-radius: 10px; transition: border-color .15s, box-shadow .15s; }
input:not([type="search"]):not([type="color"]):focus { outline: 0; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
input::placeholder { color: var(--muted); opacity: .7; }
input[aria-invalid="true"] { border-color: var(--danger); }
.err { font-size: 12px; color: var(--danger); font-weight: 500; }

.swatches { position: relative; display: flex; flex-wrap: wrap; gap: 10px; }
.swatch { width: 34px; height: 34px; border-radius: 50%; border: 2px solid transparent; display: grid; place-items: center; color: #fff; cursor: pointer; box-shadow: inset 0 0 0 1px rgba(0,0,0,.08); transition: transform .12s, box-shadow .12s; }
.swatch:hover { transform: scale(1.08); }
.swatch.on { box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--ink); }
.swatch.custom { background: var(--card); border: 1.5px dashed var(--muted); color: var(--muted); }
.swatch.custom.on { border: 2px solid transparent; color: #fff; }
.color-input { position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; }

.preview { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 16px; border: 1.5px dashed var(--line); border-radius: 12px; background: var(--hover); }

.toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 60; display: flex; align-items: center; gap: 8px; background: var(--ink); color: var(--bg); font-size: 13.5px; font-weight: 500; padding: 11px 18px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.25); animation: fade .2s ease; }

@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }
@keyframes spin { to { transform: rotate(360deg) } }

@media (max-width: 820px) { .stats { grid-template-columns: 1fr; } }
@media (max-width: 560px) {
  .wrap { padding: 20px 16px 48px; }
  h1 { font-size: 24px; }
  .head .btn-primary { width: 100%; }
  .search { max-width: none; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;