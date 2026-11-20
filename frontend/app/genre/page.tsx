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
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const TOKEN_KEY = "token";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  color: string;
  artists: number;
  events: number;
  artisList: string[];
  eventList: string[];
  createdAt: string;
};

const PALETTE = ["#3B82C4", "#0EA5A4", "#16A34A", "#C08A2B", "#E0728F", "#8B5CF6", "#6B7280"];
const PAGE_SIZE = 8;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toGenre(g: any): Genre {
  return {
    id: String(g.id ?? g._id),
    name: g.nama ?? g.name ?? "",
    color: g.warna ?? g.colorSwatch ?? g.color ?? "#6B7280",
    artists: Number(g.jumlahArtis ?? g.artists ?? 0),
    events: Number(g.jumlahEvent ?? g.events ?? 0),
    artisList: Array.isArray(g.artisList) ? g.artisList : [],
    eventList: Array.isArray(g.eventList) ? g.eventList : [],
    createdAt: g.createdAt ?? g.created_at ?? "",
  };
}

/* ───────────── Helpers ───────────── */
const nf = new Intl.NumberFormat("id-ID");

function useModal(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
}

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
const IEye = () => <Icon size={16}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></Icon>;
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
function BadgePill({ name, color }: { name: string; color: string }) {
  return (
    <span className="badge-pill" style={{ "--c": color } as CSSProperties}>
      <i />
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

/* ───────────── Modal detail artis & event ───────────── */
function DetailGenreModal({
  genre,
  onClose,
  onEdit,
}: {
  genre: Genre;
  onClose: () => void;
  onEdit: () => void;
}) {
  useModal(onClose);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="det-title">
        <header className="modal-head">
          <div>
            <h2 id="det-title">Detail Genre</h2>
            <div style={{ marginTop: 6 }}>
              <BadgePill name={genre.name} color={genre.color} />
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            <IClose />
          </button>
        </header>

        <div className="modal-body">
          {/* Section Artis */}
          <section className="detail-sec">
            <div className="sec-head">
              <h3>Daftar Artis ({genre.artists})</h3>
            </div>
            {genre.artisList.length > 0 ? (
              <div className="tag-wrap">
                {genre.artisList.map((artisName) => (
                  <span key={artisName} className="tag-pill">
                    <span className="tag-dot" style={{ background: genre.color }} />
                    {artisName}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted small">Belum ada artis terdaftar dalam genre ini. Artis dapat ditambahkan melalui menu <strong>Artis</strong>.</p>
            )}
          </section>

          {/* Section Event */}
          <section className="detail-sec" style={{ marginTop: 14 }}>
            <div className="sec-head">
              <h3>Konser & Event Terkait ({genre.events})</h3>
            </div>
            {genre.eventList.length > 0 ? (
              <div className="tag-wrap">
                {genre.eventList.map((evTitle) => (
                  <span key={evTitle} className="tag-pill event">
                    <ICalendar />
                    {evTitle}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted small">Belum ada event konser yang menggunakan genre ini.</p>
            )}
          </section>
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn-ghost" onClick={onClose}>Tutup</button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              onClose();
              onEdit();
            }}
          >
            <IEdit /> Ubah Genre
          </button>
        </footer>
      </div>
    </div>
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

  useModal(onClose);

  useEffect(() => {
    nameRef.current?.focus();
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
            <span className="hint">Pratinjau Badge:</span>
            <div style={{ marginTop: 8 }}>
              <BadgePill name={name.trim() || "Nama Genre"} color={color} />
            </div>
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
  useModal(onCancel);

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
              Genre ini masih dipakai oleh {nf.format(genre.artists)} artis, jadi belum bisa dihapus. Pindahkan artis tersebut ke genre lain terlebih dahulu di halaman Artis.
            </p>
          )}
          {genre.artists === 0 && genre.events > 0 && (
            <p className="alert">
              Genre ini dipakai {nf.format(genre.events)} event. Event tetap ada, tetapi tidak memiliki asosiasi genre.
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

/* ───────────── Halaman Utama ───────────── */
export default function GenrePage() {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; genre: Genre } | null>(null);
  const [detailGenre, setDetailGenre] = useState<Genre | null>(null);
  const [toDelete, setToDelete] = useState<Genre | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2800);
  }

  /* ── Ambil data dari backend: GET /api/genre ── */
  async function loadGenres() {
    try {
      setLoadError(null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await request<any>("/genre");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    return list.sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [genres, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);

  /* ── Simpan: POST /api/genre atau PUT /api/genre/:id ── */
  async function handleSave(data: { name: string; color: string }) {
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
            <p className="sub">Atur klasifikasi musik untuk pemetaan artis dan segmentasi event konser Anda.</p>
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
            label="Artis Terbanyak"
            value={stats.top ? stats.top.name : "—"}
            hint={stats.top ? `${nf.format(stats.top.artists)} Artis terdaftar` : "Belum ada data"}
          />
          <StatCard
            icon={<ICalendar />}
            label="Total Event Konser"
            value={loading ? "…" : nf.format(stats.events)}
            hint={loading ? "Memuat data" : stats.total ? "Dari seluruh genre" : "Belum ada data"}
          />
        </section>

        {/* Daftar genre */}
        <section className="card list">
          <div className="list-head">
            <h2>Katalog Genre Musik</h2>
          </div>

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
                          <button
                            type="button"
                            className="genre-name-btn"
                            onClick={() => setDetailGenre(g)}
                            title="Klik untuk melihat artis dan event terkait"
                          >
                            <BadgePill name={g.name} color={g.color} />
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="clickable-stat"
                            onClick={() => setDetailGenre(g)}
                            title="Lihat daftar artis"
                          >
                            <strong>{nf.format(g.artists)}</strong> Artis
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="clickable-stat"
                            onClick={() => setDetailGenre(g)}
                            title="Lihat daftar event"
                          >
                            <span className="count-pill">
                              {nf.format(g.events)} Event
                            </span>
                          </button>
                        </td>
                        <td className="right">
                          <div className="row-actions">
                            <button
                              className="icon-btn"
                              onClick={() => setDetailGenre(g)}
                              aria-label={`Lihat detail ${g.name}`}
                              title="Lihat detail artis & event"
                            >
                              <IEye />
                            </button>
                            <button
                              className="icon-btn"
                              onClick={() => setModal({ mode: "edit", genre: g })}
                              aria-label={`Ubah ${g.name}`}
                              title="Ubah"
                            >
                              <IEdit />
                            </button>
                            <button
                              className="icon-btn danger"
                              onClick={() => setToDelete(g)}
                              aria-label={`Hapus ${g.name}`}
                              title="Hapus"
                            >
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

      {/* Modal Detail Genre (Artis & Event terkait) */}
      {detailGenre && (
        <DetailGenreModal
          genre={detailGenre}
          onClose={() => setDetailGenre(null)}
          onEdit={() => setModal({ mode: "edit", genre: detailGenre })}
        />
      )}

      {/* Modal Tambah / Edit Genre */}
      {modal && (
        <GenreModal
          initial={modal.mode === "edit" ? modal.genre : null}
          existingNames={genres.filter((g) => modal.mode !== "edit" || g.id !== modal.genre.id).map((g) => g.name)}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {/* Dialog Konfirmasi Hapus */}
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
.wrap { max-width: 1240px; margin: 0 auto; padding: 32px 24px 64px; display: flex; flex-direction: column; gap: 24px; }

.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); }
.icon { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }

/* header */
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.head > div { max-width: 560px; }
.crumb { display: flex; gap: 8px; font-size: 12px; color: var(--muted); margin-bottom: 10px; }
.crumb strong { color: var(--ink); font-weight: 600; }
h1 { font-size: 30px; font-weight: 700; letter-spacing: -0.025em; line-height: 1.15; }
h2 { font-size: 17px; font-weight: 650; letter-spacing: -0.01em; }
h3 { font-size: 15px; font-weight: 650; }
.sub { font-size: 13.5px; color: var(--muted); margin-top: 6px; line-height: 1.5; }

/* buttons */
.btn-primary, .btn-ghost, .btn-danger { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 18px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer; border: 1px solid transparent; transition: background .15s, border-color .15s; white-space: nowrap; }
.btn-primary.lg { height: 44px; padding: 0 22px; }
.btn-primary { background: var(--accent); color: var(--accent-ink); box-shadow: 0 1px 2px rgba(47,93,128,.3); }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-ghost { background: var(--card); border-color: var(--line); }
.btn-ghost:hover:not(:disabled) { background: var(--hover); border-color: var(--muted); }
.btn-danger { background: var(--danger); color: #fff; }
.btn-danger:hover:not(:disabled) { background: var(--danger-hover); }
.btn-export { height: 36px; padding: 0 14px; font-size: 13px; font-weight: 600; border-radius: 8px; display: inline-flex; align-items: center; gap: 7px; }

/* badge pill */
.badge-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--c) 14%, transparent);
  color: color-mix(in srgb, var(--c) 78%, var(--ink));
  border: 1px solid color-mix(in srgb, var(--c) 25%, transparent);
}
.badge-pill i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--c);
}

.genre-name-btn {
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  text-align: left;
}
.genre-name-btn:hover .badge-pill {
  filter: brightness(0.95);
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.clickable-stat {
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.clickable-stat:hover {
  color: var(--accent);
  text-decoration: underline;
}

.count-pill {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--soft);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--muted);
}

/* stats */
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.stat { padding: 22px; display: flex; gap: 16px; align-items: flex-start; }
.stat-icon { width: 44px; height: 44px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; flex-shrink: 0; }
.stat-label { font-size: 13px; font-weight: 500; color: var(--muted); }
.stat-value { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin-top: 4px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stat-hint { font-size: 12px; color: var(--muted); margin-top: 4px; }

/* list */
.list { overflow: hidden; }
.list-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 18px 20px 12px; border-bottom: 1px solid var(--line); }
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 14px 20px 16px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.search { width: 100%; max-width: 320px; display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 12px; border: 1px solid var(--line); background: var(--field); border-radius: 10px; color: var(--muted); transition: border-color .15s, box-shadow .15s; }
.search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.search input { flex: 1; border: 0; outline: 0 !important; background: transparent; font: inherit; font-size: 13.5px; color: var(--ink); min-width: 0; }
.toolbar select { height: 38px; padding: 0 32px 0 12px; border: 1px solid var(--line); background: var(--field); border-radius: 10px; font: inherit; font-size: 13px; color: var(--ink); cursor: pointer; }
.toolbar select:focus { outline: 0; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

/* table */
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; min-width: 640px; font-size: 13.5px; }
th { text-align: left; font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); padding: 13px 18px; background: var(--soft); white-space: nowrap; }
th:first-child, td:first-child { padding-left: 20px; }
th:last-child, td:last-child { padding-right: 20px; }
td { padding: 14px 18px; border-bottom: 1px solid var(--line); vertical-align: middle; }
tbody tr { transition: background .12s; }
tbody tr:hover { background: var(--hover); }
tbody tr:last-child td { border-bottom: 0; }
.right { text-align: right; }
.num { font-variant-numeric: tabular-nums; }
.row-actions { display: inline-flex; align-items: center; justify-content: flex-end; gap: 6px; }
.icon-btn { width: 34px; height: 34px; display: grid; place-items: center; background: transparent; border: 0; border-radius: 8px; color: var(--muted); cursor: pointer; transition: background .15s, color .15s; }
.icon-btn:hover { background: var(--accent-soft); color: var(--accent); }
.icon-btn.danger:hover { background: var(--danger-soft); color: var(--danger); }

/* foot */
.foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 14px 20px; border-top: 1px solid var(--line); font-size: 13px; color: var(--muted); }
.pager { display: flex; gap: 4px; }
.pg { min-width: 34px; height: 34px; padding: 0 8px; display: grid; place-items: center; font-size: 13px; font-weight: 600; background: transparent; border: 1px solid transparent; border-radius: 8px; cursor: pointer; color: var(--muted); }
.pg:hover:not(:disabled) { background: var(--soft); color: var(--ink); }
.pg.active { background: var(--accent); color: var(--accent-ink); }

/* empty */
.empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 72px 24px 80px; gap: 8px; }
.empty-icon { width: 80px; height: 80px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); margin-bottom: 12px; }
.empty-icon.error { background: var(--danger-soft); color: var(--danger); }
.empty p { max-width: 380px; font-size: 13.5px; color: var(--muted); line-height: 1.6; margin-bottom: 14px; }
.spinner { width: 32px; height: 32px; border: 3px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* modal */
.overlay { position: fixed; inset: 0; z-index: 50; background: var(--overlay); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 16px; animation: fade .15s ease; }
.modal { width: 100%; max-width: 480px; max-height: calc(100vh - 32px); display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 24px 64px rgba(0,0,0,.28); overflow: hidden; animation: pop .18s ease; }
.modal.small { max-width: 420px; }
.modal-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 20px 24px 16px; border-bottom: 1px solid var(--line); }
.modal-body { padding: 20px 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
.modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px; border-top: 1px solid var(--line); background: var(--soft); flex-wrap: wrap; }
.confirm { align-items: center; text-align: center; gap: 10px; padding-top: 28px; }
.warn-icon { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: var(--danger-soft); color: var(--danger); }
.alert { font-size: 12.5px; line-height: 1.5; padding: 10px 12px; border-radius: 10px; background: var(--danger-soft); color: var(--danger); text-align: left; width: 100%; }

/* detail sections */
.detail-sec { background: var(--soft); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
.sec-head { margin-bottom: 10px; }
.sec-head h3 { font-size: 13px; font-weight: 700; color: var(--ink); text-transform: uppercase; letter-spacing: 0.04em; }
.tag-wrap { display: flex; flex-wrap: wrap; gap: 8px; }
.tag-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: var(--card); border: 1px solid var(--line); border-radius: 8px; font-size: 12.5px; font-weight: 600; color: var(--ink); }
.tag-dot { width: 7px; height: 7px; border-radius: 50%; }
.tag-pill.event { color: var(--accent); }

/* form fields */
.field { display: flex; flex-direction: column; gap: 8px; }
.label { font-size: 13px; font-weight: 600; }
input { height: 40px; padding: 0 12px; font: inherit; font-size: 13.5px; color: var(--ink); background: var(--field); border: 1px solid var(--line); border-radius: 10px; }
input:focus { outline: 0; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.err { font-size: 12px; color: var(--danger); font-weight: 500; }

.swatches { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.swatch { width: 34px; height: 34px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; display: grid; place-items: center; color: #fff; transition: transform .12s, border-color .12s; }
.swatch:hover { transform: scale(1.1); }
.swatch.on { border-color: var(--ink); }
.swatch.custom { border: 2px dashed var(--muted); background: transparent; color: var(--muted); }
.swatch.custom.on { border-style: solid; color: #fff; }
.color-input { position: absolute; opacity: 0; pointer-events: none; width: 0; height: 0; }
.preview { padding: 14px; background: var(--soft); border: 1px solid var(--line); border-radius: 12px; }
.hint { font-size: 12px; color: var(--muted); }

.toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 80; display: flex; align-items: center; gap: 8px; background: var(--ink); color: var(--bg); font-size: 13.5px; font-weight: 500; padding: 11px 18px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.25); animation: fade .2s ease; max-width: calc(100vw - 32px); }

@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }

@media (max-width: 860px) {
  .stats { grid-template-columns: 1fr; }
  .toolbar { flex-direction: column; align-items: stretch; }
  .search { max-width: none; }
}
@media (max-width: 560px) {
  .wrap { padding: 20px 16px 48px; }
  h1 { font-size: 24px; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;
