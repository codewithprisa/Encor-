"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent, type FormEvent, type ReactNode, } from "react";
import { Inter } from "next/font/google";




const inter = Inter({ subsets: ["latin"], display: "swap" });

// Konfigurasi untuk API  
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const API_ARTIS = `${API_BASE}/api/artis`;
const API_GENRES = `${API_BASE}/api/genre`;
const TOKEN_KEY = "token";

/* ───────────── Tipe & konstanta ───────────── */
type Artist = {
  id: number;
  name: string;
  genreId: number;
  genre: string;
  swatch: string | null;
  events: number;
  bio: string;
  photo: string | null;
  eventList: string[];
};

type Genre = { id: number; name: string; swatch: string | null };

// bentuk response dari backend (artisController.mapArtis)
type ApiArtist = {
  id: number;
  nama: string;
  foto: string | null;
  deskripsi: string;
  genreId: number;
  genre: string;
  genreWarna?: { bg?: string; text?: string; swatch?: string };
  jumlahEvent: number;
  eventList?: string[];
};

// bentuk response dari backend (genreController.getGenres)
type ApiGenre = { id: number; nama: string; warna?: { swatch?: string } };

type SavePayload = {
  name: string;
  genreId: number;
  bio: string;
  photo: string | null;
};

const FALLBACK_COLOR = "#6B7280";
const AVATAR_COLORS = ["#2F5D80", "#B4573A", "#5B7F4A", "#7A5C9E", "#A8742A", "#3F7F88"];
const PAGE_SIZE = 8;
const MAX_FILE = 2 * 1024 * 1024;

/* ───────────── Helpers ───────────── */
const nf = new Intl.NumberFormat("id-ID");
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
const colorFor = (name: string) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

const fromApiArtist = (r: ApiArtist): Artist => ({
  id: r.id,
  name: r.nama,
  genreId: r.genreId,
  genre: r.genre,
  swatch: r.genreWarna?.swatch ?? null,
  events: r.jumlahEvent,
  bio: r.deskripsi ?? "",
  photo: r.foto,
  eventList: Array.isArray(r.eventList) ? r.eventList : [],
});

const fromApiGenre = (g: ApiGenre): Genre => ({
  id: g.id,
  name: g.nama,
  swatch: g.warna?.swatch ?? null,
});

async function readMessage(res: Response, fallback: string) {
  try {
    const body = await res.json();
    return typeof body?.message === "string" ? body.message : fallback;
  } catch {
    return fallback;
  }
}

// Header autentikasi: menambahkan "Authorization: Bearer <token>" kalau token ada
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

// Pesan standar kalau sesi habis / belum login
const SESSION_EXPIRED = "Sesi login berakhir. Silakan login ulang.";

/* ───────────── Ikon ───────────── */
function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}
const IPlus = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
const IUsers = () => <Icon><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2.2.6 3.5 2.4 3.5 5.2" /></Icon>;
const ITag = () => <Icon><path d="M3 12V4h8l9 9-8 8-9-9Z" /><circle cx="7.5" cy="8.5" r="1" /></Icon>;
const ICalendar = () => <Icon><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></Icon>;
const ISpark = () => <Icon><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></Icon>;
const IEdit = () => <Icon size={16}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4" /></Icon>;
const ITrash = () => <Icon size={16}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Icon>;
const IEye = () => <Icon size={16}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></Icon>;
const IClose = () => <Icon><path d="M6 6l12 12M18 6 6 18" /></Icon>;
const ISearch = () => <Icon size={16}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></Icon>;
const IPrev = () => <Icon size={14}><path d="m15 5-7 7 7 7" /></Icon>;
const INext = () => <Icon size={14}><path d="m9 5 7 7-7 7" /></Icon>;
const IUpload = () => <Icon size={16}><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></Icon>;
const ICheck = () => <Icon size={16}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>;
const IWarn = () => <Icon size={22}><path d="M12 4 2.5 20h19L12 4ZM12 10v4.5M12 17.5h.01" /></Icon>;
const IMic = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
  </svg>
);

/* ───────────── Komponen kecil ───────────── */
function Avatar({ name, photo, size = 40 }: { name: string; photo: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);

  // reset kalau URL foto berubah (mis. setelah edit)
  useEffect(() => setBroken(false), [photo]);

  if (photo && !broken)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="avatar"
        src={photo}
        alt={name}
        style={{ width: size, height: size }}
        onError={() => setBroken(true)}
      />
    );
  return (
    <span className="avatar ph" style={{ width: size, height: size, fontSize: size * 0.38, background: colorFor(name || "?") }} aria-label={name}>
      {initials(name) || "?"}
    </span>
  );
}

function GenrePill({ genre, color }: { genre: string; color: string | null }) {
  return (
    <span className="pill" style={{ "--c": color || FALLBACK_COLOR } as CSSProperties}>
      <i />
      {genre}
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
type FormErrors = { name?: string; genre?: string; bio?: string; photo?: string; server?: string };

function ArtistModal({
  initial,
  genres,
  onClose,
  onSave,
}: {
  initial: Artist | null;
  genres: Genre[];
  onClose: () => void;
  // return null kalau sukses, atau pesan error dari server
  onSave: (data: SavePayload) => Promise<string | null>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [genreId, setGenreId] = useState<string>(
    String(initial?.genreId ?? genres[0]?.id ?? ""),
  );
  const [bio, setBio] = useState(initial?.bio ?? "");
  const [photo, setPhoto] = useState<string | null>(initial?.photo ?? null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // simpan onClose terbaru di ref supaya efek tidak jalan ulang tiap render
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  function handleFile(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      return setErrors((e) => ({ ...e, photo: "Format harus JPG, PNG, atau WEBP." }));
    if (file.size > MAX_FILE)
      return setErrors((e) => ({ ...e, photo: "Ukuran foto maksimal 2MB." }));
    const reader = new FileReader();
    reader.onload = () => {
      setPhoto(String(reader.result));
      setErrors((e) => ({ ...e, photo: undefined }));
    };
    reader.readAsDataURL(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;

    const errs: FormErrors = {};
    const trimmed = name.trim();
    if (trimmed.length < 2) errs.name = "Nama artis minimal 2 karakter.";
    else if (trimmed.length > 60) errs.name = "Nama artis maksimal 60 karakter.";
    if (!genreId) errs.genre = "Pilih genre utama.";
    if (bio.length > 300) errs.bio = "Deskripsi maksimal 300 karakter.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    const serverMsg = await onSave({
      name: trimmed,
      genreId: Number(genreId),
      bio: bio.trim(),
      photo,
    });
    setSaving(false);

    // kalau sukses, parent menutup modal; kalau gagal tampilkan pesannya
    if (serverMsg) {
      setErrors(
        serverMsg.toLowerCase().includes("nama")
          ? { name: serverMsg }
          : { server: serverMsg },
      );
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onSubmit={submit} noValidate>
        <header className="modal-head">
          <div>
            <h2 id="modal-title">{initial ? "Ubah Data Artis" : "Tambah Artis Baru"}</h2>
            <p className="sub">
              {initial ? "Perbarui profil artis di bawah ini." : "Lengkapi profil untuk menambahkan artis ke daftar."}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            <IClose />
          </button>
        </header>

        <div className="modal-body">
          {/* Upload foto */}
          <div className="field">
            <span className="label">Foto Artis</span>
            <div
              className={`upload ${dragging ? "drag" : ""}`}
              onDragOver={(e) => (e.preventDefault(), setDragging(true))}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <Avatar name={name} photo={photo} size={72} />
              <div className="upload-info">
                <div className="upload-btns">
                  <button type="button" className="btn-ghost sm" onClick={() => fileRef.current?.click()}>
                    <IUpload /> {photo ? "Ganti foto" : "Unggah foto"}
                  </button>
                  {photo && (
                    <button type="button" className="btn-text" onClick={() => setPhoto(null)}>
                      Hapus
                    </button>
                  )}
                </div>
                <p className="hint">Klik atau seret foto ke sini. JPG, PNG, atau WEBP, maks. 2MB.</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
            {errors.photo && <p className="err">{errors.photo}</p>}
          </div>

          <div className="field">
            <label className="label" htmlFor="f-name">Nama Artis</label>
            <input
              id="f-name"
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Pamungkas, Hindia"
              aria-invalid={!!errors.name}
              maxLength={80}
            />
            {errors.name && <p className="err">{errors.name}</p>}
          </div>

          <div className="grid-2">
            <div className="field">
              <label className="label" htmlFor="f-genre">Genre Utama</label>
              <select id="f-genre" value={genreId} onChange={(e) => setGenreId(e.target.value)} disabled={genres.length === 0}>
                {genres.length === 0 && <option value="">Genre belum tersedia</option>}
                {genres.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              {errors.genre && <p className="err">{errors.genre}</p>}
            </div>
          </div>

          <div className="field">
            <div className="label-row">
              <label className="label" htmlFor="f-bio">Deskripsi Singkat</label>
              <span className="hint">Opsional · {bio.length}/300</span>
            </div>
            <textarea
              id="f-bio"
              rows={4}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tuliskan biografi singkat atau detail menarik tentang artis ini..."
            />
            {errors.bio && <p className="err">{errors.bio}</p>}
          </div>

          {errors.server && <p className="err banner" role="alert">{errors.server}</p>}
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Menyimpan..." : initial ? "Simpan Perubahan" : "Simpan Artis"}
          </button>
        </footer>
      </form>
    </div>
  );
}

/* ───────────── Dialog hapus ───────────── */
function ConfirmDelete({
  artist,
  onCancel,
  onConfirm,
}: {
  artist: Artist;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancelRef.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function confirm() {
    setBusy(true);
    await onConfirm();
    setBusy(false);
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div className="modal small" role="alertdialog" aria-modal="true" aria-labelledby="del-title">
        <div className="modal-body confirm">
          <span className="warn-icon"><IWarn /></span>
          <h2 id="del-title">Hapus artis ini?</h2>
          <p className="sub"><strong>{artist.name}</strong> akan dihapus dari daftar. Tindakan ini tidak dapat dibatalkan.</p>
        </div>
        <footer className="modal-foot">
          <button className="btn-ghost" onClick={onCancel} disabled={busy} autoFocus>Batal</button>
          <button className="btn-danger" onClick={confirm} disabled={busy}>
            {busy ? "Menghapus..." : "Ya, Hapus"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ───────────── Modal detail profil artis ───────────── */
function DetailArtistModal({
  artist,
  onClose,
  onEdit,
}: {
  artist: Artist;
  onClose: () => void;
  onEdit: () => void;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <header className="modal-head">
          <div>
            <h2 id="detail-title">Profil Lengkap Artis</h2>
            <p className="sub">Detail informasi artis dan partisipasi event konser.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            <IClose />
          </button>
        </header>

        <div className="modal-body">
          <div className="artist-profile-header">
            <Avatar name={artist.name} photo={artist.photo} size={84} />
            <div className="artist-profile-info">
              <h3 className="artist-profile-name">{artist.name}</h3>
              <div style={{ marginTop: 8 }}>
                <GenrePill genre={artist.genre} color={artist.swatch} />
              </div>
            </div>
          </div>

          <div className="artist-detail-sec">
            <div className="sec-title-row">
              <label className="label">Biografi / Deskripsi</label>
            </div>
            <div className="artist-bio-text">
              {artist.bio ? artist.bio : <span className="muted">Belum ada deskripsi biografi untuk artis ini.</span>}
            </div>
          </div>

          <div className="artist-detail-sec">
            <div className="sec-title-row">
              <label className="label">Event Konser Terkait</label>
              <span className="count-badge">{artist.events} Event</span>
            </div>

            {artist.eventList && artist.eventList.length > 0 ? (
              <div className="artist-event-tags">
                {artist.eventList.map((ev, idx) => (
                  <span key={idx} className="artist-event-tag">
                    <ICalendar /> {ev}
                  </span>
                ))}
              </div>
            ) : (
              <p className="hint">Belum ada event konser yang melibatkan artis ini.</p>
            )}
          </div>
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Tutup
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              onClose();
              onEdit();
            }}
          >
            <IEdit /> Ubah Profil
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ───────────── Halaman ───────────── */
export default function ArtistPage() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [genreFilter, setGenreFilter] = useState("Semua"); // "Semua" atau id genre (string)
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; artist: Artist } | null>(null);
  const [detailArtist, setDetailArtist] = useState<Artist | null>(null);
  const [toDelete, setToDelete] = useState<Artist | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /* ── Ambil data dari backend ── */
  const loadArtists = useCallback(async () => {
    const res = await fetch(API_ARTIS, { headers: authHeaders() });
    if (!res.ok) throw new Error(await readMessage(res, "Gagal memuat data artis."));
    const data: ApiArtist[] = await res.json();
    setArtists(data.map(fromApiArtist));
  }, []);

  const loadGenres = useCallback(async () => {
    const res = await fetch(API_GENRES, { headers: authHeaders() });
    if (!res.ok) throw new Error(await readMessage(res, "Gagal memuat genre."));
    const data: ApiGenre[] = await res.json();
    setGenres(data.map(fromApiGenre));
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const [a, g] = await Promise.allSettled([loadArtists(), loadGenres()]);

    if (a.status === "rejected") {
      const err = a.reason;
      setLoadError(
        err instanceof TypeError
          ? "Tidak bisa terhubung ke server. Pastikan backend berjalan di " + API_BASE + "."
          : err instanceof Error
            ? err.message
            : "Gagal memuat data.",
      );
    }
    if (g.status === "rejected") showToast("Daftar genre gagal dimuat.");

    setLoading(false);
  }, [loadArtists, loadGenres, showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  /* ── Statistik ── */
  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    artists.forEach((a) => (counts[a.genre] = (counts[a.genre] ?? 0) + 1));
    const top = Math.max(0, ...Object.values(counts));
    const topGenres = Object.entries(counts).filter(([, c]) => c === top).map(([g]) => g).slice(0, 2).join(" & ");
    return {
      total: artists.length,
      topGenre: topGenres || "—",
      events: artists.reduce((s, a) => s + a.events, 0),
      active: artists.filter((a) => a.events > 0).length,
    };
  }, [artists]);

  /* ── Filter & paginasi ── */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return artists.filter(
      (a) =>
        (genreFilter === "Semua" || String(a.genreId) === genreFilter) &&
        (!q || [a.name, a.genre, a.bio].some((v) => v.toLowerCase().includes(q))),
    );
  }, [artists, query, genreFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);
  const filtering = query.trim() !== "" || genreFilter !== "Semua";

  /* ── Simpan (tambah / ubah) ── */
  async function handleSave(data: SavePayload): Promise<string | null> {
    const editing = modal?.mode === "edit" ? modal.artist : null;

    const body: Record<string, unknown> = {
      nama: data.name,
      genreId: data.genreId,
      deskripsi: data.bio,
    };
    // foto baru = data URL; foto lama (URL http) tidak dikirim ulang → backend mempertahankannya
    if (data.photo?.startsWith("data:")) body.foto = data.photo;
    if (editing && data.photo === null && editing.photo) body.hapusFoto = true;

    // belum login sama sekali → jangan kirim request
    if (!localStorage.getItem(TOKEN_KEY)) return SESSION_EXPIRED;

    try {
      const res = await fetch(editing ? `${API_ARTIS}/${editing.id}` : API_ARTIS, {
        method: editing ? "PUT" : "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (res.status === 401) return SESSION_EXPIRED;
      if (!res.ok) return await readMessage(res, "Gagal menyimpan data artis.");

      await loadArtists();
      if (!editing) {
        setQuery("");
        setGenreFilter("Semua");
        setPage(1);
      }
      setModal(null);
      showToast(editing ? "Data artis berhasil diperbarui." : "Artis baru berhasil ditambahkan.");
      return null;
    } catch {
      return "Tidak bisa terhubung ke server. Coba lagi.";
    }
  }

  /* ── Hapus ── */
  async function handleDelete() {
    if (!toDelete) return;

    if (!localStorage.getItem(TOKEN_KEY)) {
      showToast(SESSION_EXPIRED);
      setToDelete(null);
      return;
    }

    try {
      const res = await fetch(`${API_ARTIS}/${toDelete.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.status === 401) {
        showToast(SESSION_EXPIRED);
      } else if (!res.ok) {
        showToast(await readMessage(res, "Gagal menghapus artis."));
      } else {
        await loadArtists();
        showToast("Artis berhasil dihapus.");
      }
    } catch {
      showToast("Tidak bisa terhubung ke server. Coba lagi.");
    }
    setToDelete(null);
  }

  return (
    <main className={`page ${inter.className}`}>
      <style>{css}</style>

      <div className="wrap">
        {/* Header */}
        <header className="head">
          <div>
            <nav className="crumb" aria-label="Breadcrumb">
              <span>Dashboard</span><span aria-hidden="true">/</span><strong>Artis</strong>
            </nav>
            <h1>Kelola Data Artis</h1>
            <p className="sub">Manajemen profil, genre, dan statistik performa artis.</p>
          </div>
          <button className="btn-primary lg" onClick={() => setModal({ mode: "create" })} disabled={loading || !!loadError}>
            <IPlus /> Tambah Artis
          </button>
        </header>

        {/* Statistik */}
        <section className="stats" aria-label="Ringkasan">
          <StatCard icon={<IUsers />} label="Total Artis" value={nf.format(stats.total)} hint={stats.total ? "Terdaftar di sistem" : "Belum ada data"} />
          <StatCard icon={<ITag />} label="Genre Terpopuler" value={stats.topGenre} hint={stats.total ? "Berdasarkan jumlah artis" : "Belum ada data"} />
          <StatCard icon={<ICalendar />} label="Total Event" value={nf.format(stats.events)} hint={stats.total ? "Akumulasi seluruh artis" : "Belum ada data"} />
          <StatCard icon={<ISpark />} label="Artis Aktif" value={nf.format(stats.active)} hint="Punya minimal 1 event" />
        </section>

        {/* Daftar artis */}
        <section className="card list">
          <div className="toolbar">
            <label className="search">
              <ISearch />
              <input
                type="search"
                placeholder="Cari nama artis..."
                value={query}
                onChange={(e) => (setQuery(e.target.value), setPage(1))}
                aria-label="Cari artis"
              />
            </label>
            <select
              className="filter"
              value={genreFilter}
              onChange={(e) => (setGenreFilter(e.target.value), setPage(1))}
              aria-label="Filter genre"
            >
              <option value="Semua">Semua Genre</option>
              {genres.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="state" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              <p>Memuat data artis...</p>
            </div>
          ) : loadError ? (
            <div className="empty">
              <span className="empty-icon danger"><IWarn /></span>
              <h3>Data tidak bisa dimuat</h3>
              <p>{loadError}</p>
              <button className="btn-primary" onClick={loadAll}>Coba lagi</button>
            </div>
          ) : rows.length > 0 ? (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Artis</th>
                      <th>Genre</th>
                      <th>Event</th>
                      <th className="right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <button
                            type="button"
                            className="who artist-name-btn"
                            onClick={() => setDetailArtist(a)}
                            title="Klik untuk melihat profil"
                          >
                            <Avatar name={a.name} photo={a.photo} />
                            <div>
                              <p className="name">{a.name}</p>
                              {a.bio && <p className="bio">{a.bio}</p>}
                            </div>
                          </button>
                        </td>
                        <td><GenrePill genre={a.genre} color={a.swatch} /></td>
                        <td className="num">
                          <button
                            type="button"
                            className="event-count-btn"
                            onClick={() => setDetailArtist(a)}
                            title="Lihat event artis ini"
                          >
                            {nf.format(a.events)} event
                          </button>
                        </td>
                        <td className="right">
                          <div className="row-actions">
                            <button
                              className="icon-btn"
                              onClick={() => setDetailArtist(a)}
                              aria-label={`Lihat profil ${a.name}`}
                              title="Lihat profil"
                            >
                              <IEye />
                            </button>
                            <button className="icon-btn" onClick={() => setModal({ mode: "edit", artist: a })} aria-label={`Ubah ${a.name}`} title="Ubah">
                              <IEdit />
                            </button>
                            <button className="icon-btn danger" onClick={() => setToDelete(a)} aria-label={`Hapus ${a.name}`} title="Hapus">
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
                <span>
                  Menampilkan {start + 1}–{start + rows.length} dari {nf.format(filtered.length)} artis
                </span>
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
              <span className="empty-icon"><IMic /></span>
              {filtering ? (
                <>
                  <h3>Tidak ada hasil</h3>
                  <p>Tidak ada artis yang cocok dengan pencarian atau filter kamu.</p>
                  <button className="btn-ghost" onClick={() => (setQuery(""), setGenreFilter("Semua"))}>Reset filter</button>
                </>
              ) : (
                <>
                  <h3>Belum ada artis</h3>
                  <p>Mulai dengan menambahkan artis pertama. Profil mereka akan muncul di sini dan bisa dihubungkan ke event.</p>
                  <button className="btn-primary" onClick={() => setModal({ mode: "create" })}><IPlus /> Tambah Artis</button>
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {modal && (
        <ArtistModal
          initial={modal.mode === "edit" ? modal.artist : null}
          genres={genres}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
      {detailArtist && (
        <DetailArtistModal
          artist={detailArtist}
          onClose={() => setDetailArtist(null)}
          onEdit={() => setModal({ mode: "edit", artist: detailArtist })}
        />
      )}
      {toDelete && <ConfirmDelete artist={toDelete} onCancel={() => setToDelete(null)} onConfirm={handleDelete} />}
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
.crumb { display: flex; gap: 8px; font-size: 12px; color: var(--muted); margin-bottom: 10px; }
.crumb strong { color: var(--ink); font-weight: 600; }
h1 { font-size: 30px; font-weight: 700; letter-spacing: -0.025em; line-height: 1.15; }
h2 { font-size: 17px; font-weight: 650; letter-spacing: -0.01em; }
h3 { font-size: 16px; font-weight: 650; }
.sub { font-size: 13.5px; color: var(--muted); margin-top: 6px; line-height: 1.5; }

/* buttons */
.btn-primary, .btn-ghost, .btn-danger { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 18px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer; border: 1px solid transparent; transition: background .15s, border-color .15s, box-shadow .15s; white-space: nowrap; }
.btn-primary.lg { height: 44px; padding: 0 22px; }
.btn-primary { background: var(--accent); color: var(--accent-ink); box-shadow: 0 1px 2px rgba(47,93,128,.3); }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-ghost { background: var(--card); border-color: var(--line); }
.btn-ghost:hover:not(:disabled) { background: var(--hover); border-color: var(--muted); }
.btn-ghost.sm { height: 34px; padding: 0 12px; font-size: 12.5px; }
.btn-danger { background: var(--danger); color: #fff; }
.btn-danger:hover:not(:disabled) { background: var(--danger-hover); }
.btn-text { background: none; border: 0; color: var(--muted); font-size: 12.5px; font-weight: 600; cursor: pointer; padding: 6px 4px; }
.btn-text:hover { color: var(--danger); }
button:focus-visible, select:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { opacity: .4; cursor: not-allowed; }

/* stats */
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
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
table { width: 100%; border-collapse: collapse; min-width: 640px; font-size: 13.5px; }
th { text-align: left; font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); padding: 12px 20px; background: var(--soft); white-space: nowrap; }
td { padding: 14px 20px; border-bottom: 1px solid var(--line); vertical-align: middle; }
tbody tr { transition: background .12s; }
tbody tr:hover { background: var(--hover); }
tbody tr:last-child td { border-bottom: 0; }
.right { text-align: right; }
.muted { color: var(--muted); }
.num { font-variant-numeric: tabular-nums; }

.who { display: flex; align-items: center; gap: 12px; min-width: 0; }
.name { font-weight: 600; }
.bio { font-size: 12.5px; color: var(--muted); margin-top: 2px; max-width: 340px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.avatar { border-radius: 50%; object-fit: cover; flex-shrink: 0; display: block; }
.avatar.ph { display: grid; place-items: center; color: #fff; font-weight: 600; }

.artist-name-btn { background: none; border: 0; padding: 0; text-align: left; cursor: pointer; color: inherit; width: 100%; }
.artist-name-btn:hover .name { color: var(--accent); text-decoration: underline; }
.event-count-btn { background: none; border: 0; padding: 2px 6px; border-radius: 6px; cursor: pointer; color: inherit; font-size: inherit; font-variant-numeric: tabular-nums; transition: background .12s; }
.event-count-btn:hover { background: var(--soft); color: var(--accent); text-decoration: underline; }

.pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; white-space: nowrap; background: color-mix(in srgb, var(--c) 13%, transparent); color: color-mix(in srgb, var(--c) 78%, var(--ink)); }
.pill i { width: 6px; height: 6px; border-radius: 50%; background: var(--c); }

.row-actions { display: inline-flex; gap: 4px; }
.icon-btn { width: 34px; height: 34px; display: grid; place-items: center; background: transparent; border: 0; border-radius: 8px; color: var(--muted); cursor: pointer; transition: background .15s, color .15s; }
.icon-btn:hover { background: var(--soft); color: var(--ink); }
.icon-btn.danger:hover { background: var(--danger-soft); color: var(--danger); }

.foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 14px 20px; border-top: 1px solid var(--line); font-size: 13px; color: var(--muted); }
.pager { display: flex; gap: 4px; flex-wrap: wrap; }
.pg { min-width: 34px; height: 34px; padding: 0 8px; display: grid; place-items: center; font-size: 13px; font-weight: 600; background: transparent; border: 1px solid transparent; border-radius: 8px; cursor: pointer; color: var(--muted); }
.pg:hover:not(:disabled) { background: var(--soft); color: var(--ink); }
.pg.active { background: var(--accent-soft); color: var(--accent); }

/* loading + empty state */
.state { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 72px 24px; color: var(--muted); font-size: 13.5px; }
.spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--line); border-top-color: var(--accent); animation: spin .8s linear infinite; }
.empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 72px 24px 80px; gap: 8px; }
.empty-icon { width: 80px; height: 80px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); margin-bottom: 12px; box-shadow: 0 0 0 10px color-mix(in srgb, var(--accent-soft) 45%, transparent); }
.empty-icon.danger { background: var(--danger-soft); color: var(--danger); box-shadow: 0 0 0 10px color-mix(in srgb, var(--danger-soft) 45%, transparent); }
.empty p { max-width: 380px; font-size: 13.5px; color: var(--muted); line-height: 1.6; margin-bottom: 14px; }

/* modal */
.overlay { position: fixed; inset: 0; z-index: 50; background: var(--overlay); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 16px; animation: fade .15s ease; }
.modal { width: 100%; max-width: 540px; max-height: calc(100vh - 32px); display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 24px 64px rgba(0,0,0,.28); overflow: hidden; animation: pop .18s ease; }
.modal.small { max-width: 400px; }
.modal-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 22px 24px 18px; border-bottom: 1px solid var(--line); }
.modal-body { padding: 22px 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 18px; }
.modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px; border-top: 1px solid var(--line); background: var(--soft); }
.confirm { align-items: center; text-align: center; gap: 10px; padding-top: 28px; }
.warn-icon { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: var(--danger-soft); color: var(--danger); }

/* detail modal elements */
.artist-profile-header { display: flex; align-items: center; gap: 18px; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
.artist-profile-info { display: flex; flex-direction: column; min-width: 0; }
.artist-profile-name { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
.artist-detail-sec { display: flex; flex-direction: column; gap: 8px; }
.artist-bio-text { font-size: 13.5px; line-height: 1.6; color: var(--ink); white-space: pre-wrap; background: var(--soft); padding: 12px 14px; border-radius: 10px; }
.sec-title-row { display: flex; justify-content: space-between; align-items: center; }
.count-badge { font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); }
.artist-event-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.artist-event-tag { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: var(--hover); border: 1px solid var(--line); border-radius: 8px; font-size: 12.5px; font-weight: 500; color: var(--ink); }

.field { display: flex; flex-direction: column; gap: 7px; }
.label { font-size: 13px; font-weight: 600; }
.label-row { display: flex; justify-content: space-between; align-items: baseline; }
.hint { font-size: 12px; color: var(--muted); }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
input:not([type="file"]):not([type="search"]), textarea { width: 100%; padding: 10px 12px; font: inherit; font-size: 13.5px; color: var(--ink); background: var(--field); border: 1px solid var(--line); border-radius: 10px; transition: border-color .15s, box-shadow .15s; }
input:not([type="file"]):not([type="search"]):focus, textarea:focus, .field select:focus { outline: 0; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
input::placeholder, textarea::placeholder { color: var(--muted); opacity: .7; }
input[aria-invalid="true"] { border-color: var(--danger); }
.field select { width: 100%; }
textarea { resize: vertical; min-height: 92px; line-height: 1.5; }
.err { font-size: 12px; color: var(--danger); font-weight: 500; }
.err.banner { background: var(--danger-soft); padding: 10px 12px; border-radius: 10px; font-size: 12.5px; }

.upload { display: flex; align-items: center; gap: 16px; padding: 14px; border: 1.5px dashed var(--line); border-radius: 12px; background: var(--hover); transition: border-color .15s, background .15s; }
.upload.drag { border-color: var(--accent); background: var(--accent-soft); }
.upload-btns { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }

.toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 60; display: flex; align-items: center; gap: 8px; background: var(--ink); color: var(--bg); font-size: 13.5px; font-weight: 500; padding: 11px 18px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.25); animation: fade .2s ease; max-width: calc(100vw - 32px); }

@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }
@keyframes spin { to { transform: rotate(360deg) } }

@media (max-width: 960px) { .stats { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px) {
  .wrap { padding: 20px 16px 48px; }
  h1 { font-size: 24px; }
  .stats { grid-template-columns: 1fr; }
  .grid-2 { grid-template-columns: 1fr; }
  .head .btn-primary { width: 100%; }
  .search { max-width: none; }
  .upload { flex-direction: column; text-align: center; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } .spinner { animation: spin 1.6s linear infinite !important; } }
`;