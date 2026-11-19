"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

/* ═══════════════════════ KONEKSI API ═══════════════════════ */
const API = "http://localhost:3001";

// Sesuaikan dengan key tempat kamu menyimpan token saat login
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
    throw new Error(`Tidak bisa terhubung ke server (${API}). Pastikan backend sudah berjalan.`);
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success === false) {
    throw new Error(json?.message ?? "Terjadi kesalahan pada server.");
  }
  return json as T;
}

/* ═══════════════════════ TIPE ═══════════════════════ */
type Tab = "event" | "kategori";
type View = "list" | "form" | "denah" | "detail";
type EventStatus = "Published" | "Draft" | "Closed";
type SeatStatus = "tersedia" | "reservasi" | "terjual" | "rusak" | "kosong";

type EventItem = {
  id: number;
  poster: string | null;
  judul: string;
  artis: string;
  genre: string;
  lokasi: string;
  tanggal: string;
  status: EventStatus;
  terjual: number;
  kapasitas: number;
};

type EventDetail = {
  id: number;
  poster: string | null;
  judul: string;
  deskripsi: string;
  lokasi: string;
  genreId: number | null;
  genreNama: string;
  artis: ArtisOpt[];
  tanggal: string; // YYYY-MM-DD
  waktu: string; // HH:mm
  jualMulai: string;
  jualSelesai: string;
  syarat: string;
  refundOtomatis: boolean;
  status: EventStatus;
  terjual: number;
  kapasitas: number;
};

type Kategori = {
  id: number;
  nama: string;
  keterangan: string;
  tipe: "Seated" | "Festival";
  harga: number;
  kuota: number;
  terjual: number;
  status: "Aktif" | "Nonaktif";
  warna: string | null; // warna dari kolom ticket_types (hex)
};

type KategoriForm = {
  nama: string;
  tipe: "Seated" | "Festival";
  harga: string;
  kuota: string;
  status: "Aktif" | "Nonaktif";
  warna: string; // hex, contoh "#60A5FA"
};

type DenahData = {
  nama: string;
  baris: string;
  kursi: string;
  seats: Record<string, SeatStatus>;
  kategori: Record<string, number>; // "r-c" -> id ticket_types
};

type GenreOpt = { id: number; nama: string; bg: string; text: string };
type ArtisOpt = { id: number; nama: string };

/* ═══════════════════════ ADAPTER ═══════════════════════
 * Semua tebakan soal bentuk data backend ada di bagian ini.
 * Kalau nama field di controller kamu beda, ubah di sini saja.
 */

// --- Genre: sudah cocok dengan genreController (nama, colorBg, colorText) ---
function toGenreOpt(g: any): GenreOpt {
  return {
    id: Number(g.id),
    nama: g.nama ?? g.name ?? "",
    bg: g.colorBg ?? g.warna ?? "#E5E5E5",
    text: g.colorText ?? "#1A1A1A",
  };
}

// --- Artis ---
function toArtisOpt(a: any): ArtisOpt {
  return { id: Number(a.id), nama: a.nama ?? a.name ?? a.nama_artis ?? "" };
}

// --- Event (response GET /api/events) ---
function normStatusEvent(s: any): EventStatus {
  const v = String(s ?? "").toLowerCase();
  if (v === "published" || v === "publish" || v === "aktif") return "Published";
  if (v === "closed" || v === "close" || v === "selesai") return "Closed";
  return "Draft";
}

function fullUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return /^(https?:|data:)/.test(raw) ? raw : `${API}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

function toEvent(e: any): EventItem {
  const posterRaw: string | null = e.poster ?? e.posterUrl ?? e.gambar ?? null;
  const artisRaw = e.artis ?? e.artisNama ?? e.artists;
  const artis = Array.isArray(artisRaw)
    ? artisRaw.map((a: any) => (typeof a === "string" ? a : a.nama ?? a.name)).join(", ")
    : artisRaw ?? "-";

  return {
    id: Number(e.id),
    poster: fullUrl(posterRaw),
    judul: e.judul ?? e.nama ?? "",
    artis: artis || "-",
    genre: e.genre?.nama ?? e.genreNama ?? (typeof e.genre === "string" ? e.genre : "-"),
    lokasi: e.lokasi ?? ([e.kota, e.venue].filter(Boolean).join(" • ") || "-"),
    tanggal: e.tanggal
      ? new Date(e.tanggal).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
      : "-",
    status: normStatusEvent(e.status),
    terjual: Number(e.terjual ?? e.tiketTerjual ?? 0),
    kapasitas: Number(e.kapasitas ?? e.kuota ?? 0),
  };
}

// --- Detail event (response GET /api/events/:id) ---
function toDateInput(v: any): string {
  if (!v) return "";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function toEventDetail(e: any, genres: GenreOpt[], artisOpsi: ArtisOpt[]): EventDetail {
  // genre
  const genreNama: string = e.genre?.nama ?? e.genreNama ?? (typeof e.genre === "string" ? e.genre : "");
  const genreId =
    e.genreId ?? e.genre_id ?? e.genre?.id ?? genres.find((g) => g.nama === genreNama)?.id ?? null;

  // artis: bisa array id, array objek, atau array nama
  const raw: any[] = Array.isArray(e.artisIds)
    ? e.artisIds
    : Array.isArray(e.artis)
      ? e.artis
      : Array.isArray(e.artists)
        ? e.artists
        : [];
  const artis: ArtisOpt[] = raw
    .map((a): ArtisOpt | null => {
      if (a && typeof a === "object") return toArtisOpt(a);
      const byId = artisOpsi.find((x) => String(x.id) === String(a));
      if (byId) return byId;
      const byName = artisOpsi.find((x) => x.nama === a);
      return byName ?? null;
    })
    .filter((x): x is ArtisOpt => x !== null);

  const base = toEvent(e);
  return {
    id: base.id,
    poster: base.poster,
    judul: base.judul,
    deskripsi: e.deskripsi ?? e.description ?? "",
    lokasi: e.lokasi ?? e.venue ?? "",
    genreId: genreId ? Number(genreId) : null,
    genreNama:
      genreNama || (genreId ? genres.find((g) => g.id === Number(genreId))?.nama ?? "" : ""),
    artis,
    tanggal: toDateInput(e.tanggal),
    waktu: String(e.waktu ?? e.jam ?? "").slice(0, 5),
    jualMulai: toDateInput(e.jualMulai ?? e.jual_mulai),
    jualSelesai: toDateInput(e.jualSelesai ?? e.jual_selesai),
    syarat: e.syarat ?? e.terms ?? "",
    refundOtomatis: e.refundOtomatis === true || e.refundOtomatis === 1 || e.refund_otomatis === 1,
    status: base.status,
    terjual: base.terjual,
    kapasitas: base.kapasitas,
  };
}

// --- Kategori tiket (response GET /api/events/:id/kategori) ---
function toKategori(k: any): Kategori {
  const st = String(k.status ?? (k.aktif === false || k.isActive === false ? "nonaktif" : "aktif")).toLowerCase();
  return {
    id: Number(k.id),
    nama: k.nama ?? k.name ?? "",
    keterangan: k.keterangan ?? k.deskripsi ?? "",
    tipe: String(k.tipe ?? "").toLowerCase().includes("fest") ? "Festival" : "Seated",
    harga: Number(k.harga ?? 0),
    kuota: Number(k.kuota ?? 0),
    terjual: Number(k.terjual ?? 0),
    status: ["aktif", "active", "1", "true"].includes(st) ? "Aktif" : "Nonaktif",
    warna: k.warna ?? k.color ?? null,
  };
}

// --- Denah kursi ---
const SEAT_IN: Record<string, SeatStatus> = {
  tersedia: "tersedia",
  available: "tersedia",
  reservasi: "reservasi",
  reserved: "reservasi",
  terjual: "terjual",
  sold: "terjual",
  rusak: "rusak",
  broken: "rusak",
  blokir: "rusak",
  blocked: "rusak",
  kosong: "kosong",
  empty: "kosong",
};

// Response GET /api/events/:id/denah -> DenahData (null kalau belum ada denah)
function parseDenah(raw: any): DenahData | null {
  if (!raw || typeof raw.seats !== "object" || Array.isArray(raw.seats)) return null;
  const entries = Object.entries(raw.seats as Record<string, unknown>);
  if (entries.length === 0) return null;

  const seats: Record<string, SeatStatus> = {};
  for (const [k, v] of entries) {
    seats[k] = SEAT_IN[String(v).toLowerCase()] ?? "tersedia";
  }

  const kategori: Record<string, number> = {};
  for (const [k, v] of Object.entries((raw.kategori ?? {}) as Record<string, unknown>)) {
    const n = Number(v);
    if (n) kategori[k] = n;
  }

  return {
    nama: raw.nama ?? "Section A1",
    baris: String(raw.baris ?? 4),
    kursi: String(raw.kursi ?? 10),
    seats,
    kategori,
  };
}

/* ═══════════════════════ KONSTANTA ═══════════════════════ */
// Legenda status (warna kursi "tersedia" mengikuti kategori)
const STATUS_LEGEND: { cls: string; label: string }[] = [
  { cls: "terpilih", label: "Terpilih" },
  { cls: "reservasi", label: "Reservasi" },
  { cls: "terjual", label: "Terjual" },
  { cls: "rusak", label: "Rusak" },
  { cls: "kosong", label: "Kosong" },
];

// dipakai kalau nama kategori tidak dikenali dan kolom warna di ticket_types kosong
const KAT_FALLBACK = ["#D1D5DB", "#60A5FA", "#C084FC", "#FBBF24", "#34D399", "#F87171"];

// Warna baku kategori tiket: VVIP putih, VIP kuning, Reguler hijau, Festival biru
const WARNA_VVIP = "#FFFFFF";
const WARNA_VIP = "#FBBF24";
const WARNA_REGULER = "#34D399";
const WARNA_FESTIVAL = "#60A5FA";

// pilihan warna kategori tiket
const WARNA_OPSI: { nama: string; hex: string }[] = [
  { nama: "Putih (VVIP)", hex: WARNA_VVIP },
  { nama: "Kuning (VIP)", hex: WARNA_VIP },
  { nama: "Hijau (Reguler)", hex: WARNA_REGULER },
  { nama: "Biru (Festival)", hex: WARNA_FESTIVAL },
  { nama: "Ungu", hex: "#C084FC" },
  { nama: "Oranye", hex: "#FB923C" },
  { nama: "Pink", hex: "#F472B6" },
  { nama: "Abu-abu", hex: "#9CA3AF" },
];

const EMPTY_KATEGORI_FORM: KategoriForm = {
  nama: "",
  tipe: "Seated",
  harga: "",
  kuota: "",
  status: "Aktif",
  warna: WARNA_FESTIVAL,
};

const MAX_POSTER = 5 * 1024 * 1024; // 5MB

// Rasio poster = rasio bingkai poster di aplikasi (4:5, potret)
const POSTER_OUT_W = 1200;
const POSTER_OUT_H = 1500;
const CROP_W = 320; // lebar area potong di layar (px)
const CROP_H = (CROP_W * POSTER_OUT_H) / POSTER_OUT_W; // 400

/* ═══════════════════════ HELPERS ═══════════════════════ */
function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}

function rupiahRingkas(n: number) {
  if (n >= 1_000_000_000) return "Rp " + (n / 1_000_000_000).toFixed(1) + "M";
  if (n >= 1_000_000) return "Rp " + (n / 1_000_000).toFixed(1) + "jt";
  return rupiah(n);
}

function statusClass(s: EventStatus) {
  if (s === "Published") return "badge badge-green";
  if (s === "Draft") return "badge badge-gray";
  return "badge badge-red";
}

function seatKey(r: number, c: number) {
  return `${r}-${c}`;
}

function rowLabel(r: number) {
  return String.fromCharCode(65 + r);
}

function clampNum(v: string, min: number, max: number) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

// warna teks yang terbaca di atas background hex tertentu
function teksDiAtas(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#1A1A1A";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1A1A1A" : "#FFFFFF";
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

// Warna bawaan dari nama: VVIP putih, VIP kuning, Reguler hijau, Festival biru (null kalau nama lain)
function warnaBawaan(nama: string): string | null {
  const n = nama.toLowerCase();
  if (n.includes("vvip")) return WARNA_VVIP;
  if (n.includes("vip")) return WARNA_VIP;
  if (n.includes("regul")) return WARNA_REGULER;
  if (n.includes("festival")) return WARNA_FESTIVAL;
  return null;
}

// Warna yang dipakai di tampilan: warna yang disimpan admin dulu,
// kalau kosong pakai warna bawaan dari nama, terakhir warna cadangan.
function warnaKategori(nama: string, warnaDb: string | null, idx = 0): string {
  if (warnaDb && HEX_RE.test(warnaDb.trim())) return warnaDb.trim();
  return warnaBawaan(nama) ?? KAT_FALLBACK[idx % KAT_FALLBACK.length];
}

// Jenis kursi = kategori tiket yang dimiliki event (key memakai id kategori).
// Warna ditentukan dari nama kategori lewat warnaKategori().
function jenisKategori(k: Kategori): string {
  return `k${k.id}`;
}

function bacaFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Gagal membaca file."));
    r.readAsDataURL(file);
  });
}

function tglPanjang(s: string) {
  if (!s) return "-";
  const d = new Date(`${s}T00:00:00`);
  return isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

// Peta lokasi: ikut berubah saat admin mengetik nama venue / alamat (jeda 0,7 detik).
// Memakai embed Google Maps, tidak perlu API key.
function LokasiMap({ query, tinggi = 280 }: { query: string; tinggi?: number }) {
  const [q, setQ] = useState(query.trim());

  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 700);
    return () => clearTimeout(t);
  }, [query]);

  const ada = q.length >= 3;
  const menunggu = query.trim() !== q;
  const enc = encodeURIComponent(q);

  return (
    <div className="map-box">
      {ada ? (
        <>
          <iframe
            key={q}
            title={`Peta lokasi ${q}`}
            src={`https://maps.google.com/maps?q=${enc}&z=15&hl=id&output=embed`}
            style={{ height: tinggi }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="map-foot">
            <span>{menunggu ? "Memperbarui peta..." : q}</span>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${enc}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Buka di Google Maps
            </a>
          </div>
        </>
      ) : (
        <div className="map-empty" style={{ height: tinggi }}>
          Ketik nama venue atau alamat (minimal 3 huruf) untuk menampilkan peta.
        </div>
      )}
    </div>
  );
}

// Editor potong poster: geser + zoom, hasil 1200x1500 JPEG
function PosterCropper({
  src,
  onCancel,
  onDone,
}: {
  src: string;
  onCancel: () => void;
  onDone: (dataUrl: string) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  // skala dasar: gambar selalu menutupi seluruh area potong
  const base = nat ? Math.max(CROP_W / nat.w, CROP_H / nat.h) : 1;
  const dw = nat ? nat.w * base * zoom : 0;
  const dh = nat ? nat.h * base * zoom : 0;

  function clamp(p: { x: number; y: number }, z = zoom) {
    if (!nat) return p;
    const mx = Math.max(0, (nat.w * base * z - CROP_W) / 2);
    const my = Math.max(0, (nat.h * base * z - CROP_H) / 2);
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
  }

  const cp = clamp(pos);
  const left = CROP_W / 2 - dw / 2 + cp.x;
  const top = CROP_H / 2 - dh / 2 + cp.y;

  function onDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, px: cp.x, py: cp.y };
  }
  function onMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    setPos(clamp({ x: d.px + e.clientX - d.sx, y: d.py + e.clientY - d.sy }));
  }
  function onUp() {
    drag.current = null;
  }
  function ubahZoom(z: number) {
    setZoom(z);
    setPos((p) => clamp(p, z));
  }

  function selesai() {
    const img = imgRef.current;
    if (!img || !nat) return;
    const k = POSTER_OUT_W / CROP_W;
    const canvas = document.createElement("canvas");
    canvas.width = POSTER_OUT_W;
    canvas.height = POSTER_OUT_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, POSTER_OUT_W, POSTER_OUT_H);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, left * k, top * k, dw * k, dh * k);
    onDone(canvas.toDataURL("image/jpeg", 0.9));
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Potong poster">
      <div className="modal crop-modal">
        <div className="modal-head">
          <h2>Atur Poster</h2>
          <button type="button" aria-label="Tutup" onClick={onCancel}>×</button>
        </div>
        <p className="modal-event">
          Geser gambar dan atur zoom. Area ini sama dengan tampilan poster di aplikasi (rasio 4:5).
        </p>

        <div
          className="crop-box"
          style={{ width: CROP_W, height: CROP_H }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt="Poster yang dipotong"
            draggable={false}
            onLoad={(e) =>
              setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
            }
            style={{ left, top, width: dw || undefined, height: dh || undefined }}
          />
        </div>

        <div className="crop-zoom">
          <span>Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => ubahZoom(Number(e.target.value))}
            aria-label="Zoom"
          />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-outline" onClick={onCancel}>Batal</button>
          <button type="button" className="btn-primary" onClick={selesai} disabled={!nat}>
            Gunakan Poster
          </button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="info">
      <dt>{label}</dt>
      <dd>{children || "-"}</dd>
    </div>
  );
}

/* ═══════════════════════ CSS ═══════════════════════ */
const css = `
.page {
  --blue: #2563eb;
  --blue-soft: #dbeafe;
  --blue-dark: #1d4ed8;

  --ink: var(--foreground);
  --ink-2: var(--text-secondary);
  --ink-3: var(--text-muted);
  --line: var(--border);
  --bg: var(--background);
  --card: var(--surface);

  --red: #dc2626;
  --red-soft: #fee2e2;
  --green: #15803d;
  --green-soft: #dcfce7;
  --brown: #b45309;

  /* palet editor denah */
  --peach: #fff4ee;
  --peach-line: #efd9cb;
  --stage: #3b2f2a;

  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
  font-size: 14px;
  line-height: 1.5;
}
.page *, .page *::before, .page *::after { box-sizing: border-box; }
.page button { font-family: inherit; font-size: inherit; cursor: pointer; }
.page button:disabled { cursor: not-allowed; opacity: 0.55; }
.page input, .page select, .page textarea { font-family: inherit; }
.page svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.page :focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }

.content { max-width: 1280px; margin: 0 auto; padding: 24px 24px 64px; }

/* ---------- Tabs ---------- */
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 24px; }
.tab {
  background: none; border: 0; padding: 10px 16px; color: var(--ink-2);
  font-weight: 600; border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.tab:hover { color: var(--ink); }
.tab-active { color: var(--blue); border-bottom-color: var(--blue); }

/* ---------- Heading ---------- */
.head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.head-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.title { margin: 0; font-size: 26px; line-height: 1.2; font-weight: 700; letter-spacing: -0.01em; }
.title-sm { font-size: 22px; }
.desc { margin: 6px 0 0; color: var(--ink-2); max-width: 680px; }
.rule { height: 1px; background: var(--line); margin: 16px 0 20px; }
.crumb-top { margin: 0 0 8px; font-size: 12px; color: var(--ink-3); letter-spacing: 0.04em; }
.crumb-top strong { color: var(--blue); font-weight: 600; }

/* ---------- Buttons ---------- */
.btn-primary, .btn-outline {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border-radius: 8px; padding: 9px 16px; font-weight: 600; border: 1px solid transparent;
  transition: background 0.15s, border-color 0.15s;
}
.btn-primary { background: var(--blue); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--blue-dark); }
.btn-outline { background: var(--card); color: var(--ink); border-color: var(--line); }
.btn-outline:hover:not(:disabled) { border-color: var(--ink-3); }
.btn-danger { color: var(--red); }
.btn-danger:hover:not(:disabled) { border-color: var(--red); background: var(--red-soft); }
.btn-sm { padding: 6px 12px; font-size: 13px; }
.btn-block { width: 100%; }
.link-danger {
  background: none; border: 0; color: var(--red); font-weight: 600; padding: 6px 0; align-self: center;
}
.link-danger:hover:not(:disabled) { text-decoration: underline; }

/* ---------- Form controls ---------- */
.label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600; color: var(--ink-2); }
.page input[type="text"], .page input[type="number"], .page input[type="date"],
.page input[type="time"], .page select, .page textarea {
  width: 100%; padding: 9px 12px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--card); color: var(--ink); font-size: 14px;
}
.page textarea { resize: vertical; }
.page input:focus, .page select:focus, .page textarea:focus {
  outline: none; border-color: var(--blue); box-shadow: 0 0 0 3px var(--blue-soft);
}
.input-error { border-color: var(--red) !important; }
.err { margin: 6px 0 0; color: var(--red); font-size: 13px; }
.err-block { margin: 0; }
.field { margin-bottom: 16px; }
.field:last-child { margin-bottom: 0; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.two-col-tight { gap: 8px; }
.range { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; color: var(--ink-3); }

/* ---------- Filters ---------- */
.filters { display: grid; grid-template-columns: 1fr 200px 200px; gap: 16px; margin-bottom: 16px; }
.input-wrap { position: relative; }
.input-wrap svg { position: absolute; left: 10px; top: 50%; width: 18px; height: 18px; transform: translateY(-50%); color: var(--ink-3); }
.input-wrap input { padding-left: 36px !important; }

/* ---------- Table ---------- */
.table-card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.table-scroll { overflow-x: auto; }
.page table { width: 100%; border-collapse: collapse; }
.page th {
  text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 600; color: var(--ink-3);
  background: #fafafa; border-bottom: 1px solid var(--line); white-space: nowrap;
}
.page td { padding: 14px 16px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.page tbody tr:last-child td { border-bottom: 0; }
.page tbody tr:hover { background: #fafbff; }
.empty { text-align: center; color: var(--ink-2); padding: 40px 16px !important; }
.empty .err { margin-bottom: 12px; }
.row-off td { opacity: 0.6; }
.td-title { font-weight: 600; }
.td-loc { color: var(--ink-2); min-width: 140px; }
.td-date { color: var(--ink-2); white-space: nowrap; }
.td-price { font-weight: 600; white-space: nowrap; }
.td-blue { color: var(--blue); font-weight: 600; }
.td-red { color: var(--red); font-weight: 600; }
.td-name { display: flex; align-items: center; gap: 10px; }
.td-occ { min-width: 150px; }

.poster-btn { background: none; border: 0; padding: 0; display: block; }
.poster { width: 48px; height: 64px; object-fit: cover; border-radius: 6px; display: block; background: #eef0f3; }
.poster-empty { display: flex; align-items: center; justify-content: center; color: var(--ink-3); font-size: 20px; }
.link-title { background: none; border: 0; padding: 0; font-weight: 600; color: var(--ink); text-align: left; }
.link-title:hover { color: var(--blue); }

.genre { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.badge { display: inline-block; padding: 3px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; }
.badge-green { background: var(--green-soft); color: var(--green); }
.badge-gray { background: #f3f4f6; color: var(--ink-2); }
.badge-red { background: var(--red-soft); color: var(--red); }

.occ-text { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--ink-2); margin-bottom: 6px; }
.bar { height: 6px; background: #eef0f3; border-radius: 999px; overflow: hidden; }
.bar-fill { height: 100%; background: var(--blue); border-radius: 999px; }
.bar-red { background: var(--red); }

.actions { display: flex; gap: 4px; }
.icon-btn {
  width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center;
  background: none; border: 0; border-radius: 6px; color: var(--ink-2);
}
.icon-btn:hover:not(:disabled) { background: #f3f4f6; color: var(--ink); }
.icon-btn svg { width: 18px; height: 18px; }
.icon-danger:hover:not(:disabled) { background: var(--red-soft); color: var(--red); }

.table-foot {
  display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 12px 16px; border-top: 1px solid var(--line); font-size: 12px; color: var(--ink-2);
}
.pager { display: flex; gap: 4px; }
.pager button {
  min-width: 30px; height: 30px; padding: 0 8px; border: 1px solid var(--line);
  background: var(--card); border-radius: 6px; color: var(--ink-2);
}
.pager button:hover:not(:disabled) { border-color: var(--ink-3); }
.pager-active { background: var(--blue) !important; border-color: var(--blue) !important; color: #fff !important; }

/* ---------- Layout form / detail ---------- */
.form-grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 24px; margin-top: 20px; align-items: start; }
.col-main, .col-side { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.panel { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 20px; }
.panel-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.panel-head .panel-title { margin: 0; }
.panel-title { margin: 0 0 14px; font-size: 15px; font-weight: 700; }
.panel-title-blue { color: var(--blue); font-size: 12px; letter-spacing: 0.06em; }
.panel-note { display: flex; flex-direction: column; gap: 10px; }
.note { margin: 0; font-size: 13px; color: var(--ink-2); }
.gear { width: 20px; height: 20px; color: var(--ink-3); }

.info-list { margin: 0; display: flex; flex-direction: column; gap: 14px; }
.info dt { font-size: 12px; font-weight: 600; color: var(--ink-3); margin-bottom: 2px; }
.info dd { margin: 0; color: var(--ink); }
.pre { white-space: pre-wrap; }
.kat-empty { margin: 0; color: var(--ink-2); font-size: 13px; }

/* ---------- Status segmented ---------- */
.seg { display: inline-flex; background: #eceef2; border-radius: 8px; padding: 3px; }
.seg button { border: 0; background: none; padding: 7px 14px; border-radius: 6px; font-size: 12px; font-weight: 700; color: var(--ink-2); }
.seg-active { background: var(--card) !important; color: var(--blue) !important; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }

/* ---------- Artis ---------- */
.artist-box { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.chip {
  display: inline-flex; align-items: center; gap: 8px; padding: 4px 10px 4px 4px;
  border: 1px solid var(--line); border-radius: 999px; background: #fafafa; font-weight: 500;
}
.chip button { background: none; border: 0; padding: 0 2px; color: var(--ink-3); font-size: 16px; line-height: 1; }
.chip button:hover { color: var(--red); }
.chip-avatar {
  width: 24px; height: 24px; border-radius: 50%; background: var(--blue-soft); color: var(--blue-dark);
  display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;
}
.chip-add { padding: 6px 14px; border-style: dashed; color: var(--blue); background: none; font-weight: 600; }
.chip-add:hover { background: var(--blue-soft); }
.chip-input { display: inline-flex; align-items: center; gap: 8px; }
.chip-input select { width: auto !important; min-width: 180px; }
.chip-input button { background: none; border: 0; color: var(--ink-2); font-weight: 600; }

/* ---------- Poster ---------- */
.drop {
  display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center;
  padding: 20px; border: 2px dashed var(--line); border-radius: 12px; background: #fafafa;
}
.drop p { margin: 0; font-size: 12px; color: var(--ink-2); }
.drop-active { border-color: var(--blue); background: var(--blue-soft); }
.drop-icon { width: 36px; height: 36px; color: var(--ink-3); }
.drop-preview { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; border-radius: 16px; display: block; background: #eef0f3; }
.drop-file { word-break: break-all; }

/* ---------- Refund switch ---------- */
.refund {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 14px 16px; border: 1px solid var(--line); border-radius: 10px; background: #fafafa;
}
.refund strong { font-size: 12px; letter-spacing: 0.04em; }
.refund p { margin: 2px 0 0; font-size: 13px; color: var(--ink-2); }
.switch {
  position: relative; flex: none; width: 44px; height: 24px; border: 0; border-radius: 999px;
  background: #d1d5db; transition: background 0.15s;
}
.switch span {
  position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%;
  background: #fff; transition: transform 0.15s; box-shadow: 0 1px 2px rgba(0,0,0,0.2);
}
.switch-on { background: var(--blue); }
.switch-on span { transform: translateX(20px); }

/* ---------- Checklist ---------- */
.check { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.check li { display: flex; gap: 8px; align-items: center; color: var(--ink-3); font-size: 13px; }
.check-ok { color: var(--green) !important; }

/* ═════════ Editor denah kursi ═════════ */
.denah-wrap {
  background: var(--peach); border: 1px solid var(--peach-line); border-radius: 16px; padding: 20px;
}
.denah-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; align-items: start; }
.denah-main { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.denah-side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }

.denah-head { margin-bottom: 14px; }
.denah-crumb { margin: 0 0 6px; font-size: 13px; color: var(--ink-2); }
.denah-crumb strong { color: #1e4f86; font-weight: 700; }
.denah-title { margin: 0; font-size: 15px; font-weight: 600; }
.denah-kat { margin: 2px 0 0; font-size: 13px; color: var(--ink-2); }
.denah-kat span { color: #1e4f86; font-weight: 600; }

.denah-card {
  position: relative; background: #fff; border: 1px solid var(--peach-line); border-radius: 14px;
  padding: 22px 22px 18px;
}
.stage {
  width: min(62%, 460px); margin: 0 auto 24px; padding: 14px 0 12px; text-align: center;
  background: var(--stage); color: #fff; border-radius: 12px 12px 0 0;
  font-size: 12px; font-weight: 500; letter-spacing: 0.12em;
}

/* legenda melayang di kanan atas, seperti desain */
.legend {
  position: absolute; top: 56px; right: 18px; z-index: 5; width: 176px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px 10px;
  box-shadow: 0 8px 24px rgba(59, 47, 42, 0.18);
}
.legend-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.legend-title { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; color: #374151; }
.legend-toggle {
  width: 22px; height: 22px; padding: 0; border: 0; border-radius: 4px; background: #f3f4f6;
  color: var(--ink-2); font-size: 14px; line-height: 1;
}
.legend-toggle:hover { background: #e5e7eb; }
.legend hr { border: 0; border-top: 1px solid #e5e7eb; margin: 0 0 8px; }
.legend ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; font-size: 11px; }
.legend ul + ul { margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e5e7eb; }
.legend li { display: flex; align-items: center; gap: 10px; }
.legend-none { color: var(--ink-3); }
.swatch { width: 11px; height: 11px; border-radius: 2px; border: 1px solid rgba(0,0,0,0.18); flex: none; }
.swatch.seat-terpilih { background: #111; border-color: #111; }
.swatch.seat-reservasi { background: #fed7aa; border-color: #fb923c; }
.swatch.seat-terjual { background: #9ca3af; border-color: #6b7280; }
.swatch.seat-rusak { background: #ef4444; border-color: #b91c1c; }
.swatch.seat-kosong { background: #eadbcb; border-color: #eadbcb; }

.seat-scroll { overflow-x: auto; padding: 6px 0 10px; }
.seat-board { display: flex; flex-direction: column; gap: 10px; min-width: max-content; }
.seat-row { display: flex; align-items: center; gap: 16px; }
.seat-row-label {
  width: 28px; height: 28px; flex: none; border: 0; border-radius: 6px; background: transparent;
  color: #1e4f86; font-weight: 700; font-size: 13px;
}
.seat-row-label:hover { background: #eef2f7; }
.seat-cols { display: grid; gap: 10px; flex: 1; }
.seat {
  height: 32px; min-width: 32px; padding: 0; border: 1px solid rgba(0,0,0,0.12); border-radius: 4px;
  font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center;
  background: #e5e7eb; color: #1a1a1a; transition: transform 0.1s, background 0.1s;
}
.seat:hover:not(:disabled) { transform: translateY(-1px); }
.seat svg { width: 14px; height: 14px; }
.seat-tersedia { background: #e5e7eb; }
.seat-reservasi { background: #fed7aa; color: #9a3412; border-color: #fb923c; cursor: not-allowed; }
.seat-terjual { background: #9ca3af; color: #fff; border-color: #6b7280; cursor: not-allowed; }
.seat-rusak { background: #ef4444; color: #fff; border-color: #b91c1c; }
.seat-kosong { background: #eadbcb; border-color: #eadbcb; color: transparent; }
/* kursi yang diklik jadi hitam */
.seat.seat-sel { background: #111 !important; color: #fff !important; border-color: #111 !important; }
.seat-hint { margin: 10px 0 0; font-size: 12px; color: var(--ink-2); }

.dstats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.dstat {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;
  background: var(--peach); border: 1px solid var(--peach-line); border-radius: 10px; padding: 14px 16px;
}
.dstat svg { width: 26px; height: 26px; color: #b9a99c; flex: none; }
.dstat-label { display: block; font-size: 12px; font-weight: 500; letter-spacing: 0.04em; color: #3b2f2a; line-height: 1.3; }
.dstat-val { font-size: 15px; font-weight: 600; }
.dstat-blue { color: #1e4f86; }
.dstat-red { color: var(--red); }

.denah-panel {
  background: var(--peach); border: 1px solid var(--peach-line); border-radius: 10px; padding: 0;
  overflow: hidden;
}
.denah-panel-head {
  display: flex; justify-content: space-between; align-items: center; padding: 12px 16px;
  background: #fbe9dd; border-bottom: 1px solid var(--peach-line);
}
.denah-panel-head h3 { margin: 0; font-size: 14px; font-weight: 700; }
.denah-panel-body { padding: 16px; }
.denah-panel .label {
  margin-bottom: 6px; font-size: 12px; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase;
  color: #3b2f2a;
}
.denah-panel input[type="text"], .denah-panel input[type="number"] {
  background: #fde8d9; border-color: #e7c9b4;
}
.denah-panel input[readonly] { color: var(--ink-2); }
.rp-wrap { display: flex; align-items: center; gap: 10px; }
.rp-wrap > span { font-size: 13px; font-weight: 700; color: #1e4f86; }
.denah-divider { height: 1px; background: var(--peach-line); margin: 16px 0 14px; }

.d-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.d-actions button {
  display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 6px 4px;
  border: 0; border-radius: 8px; background: transparent; color: #3b2f2a;
  font-size: 11px; font-weight: 500;
}
.d-actions button:hover:not(:disabled) { background: #fbe9dd; color: #1e4f86; }
.d-actions svg { width: 20px; height: 20px; }
.d-selected { margin: 12px 0 0; font-size: 13px; font-weight: 600; color: #1e4f86; text-align: center; }

.kat-hint { margin: 0 0 12px; font-size: 13px; color: var(--ink-2); }
.kat-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.kat-btn {
  width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; text-align: left;
  border: 1px solid var(--peach-line); border-radius: 10px; background: #fff;
}
.kat-btn:hover:not(:disabled) { border-color: #1e4f86; background: #f5f9ff; }
.kat-sw { width: 16px; height: 16px; border-radius: 5px; flex: none; border: 1px solid rgba(0,0,0,0.18); }
.kat-info { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.kat-info small { color: var(--ink-2); font-size: 12px; }
.kat-sw-rusak { background: #ef4444; border-color: #b91c1c; }
.kat-count { font-size: 12px; color: var(--ink-2); white-space: nowrap; }

/* ---------- Kategori tiket ---------- */
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 20px 0; }
.stat {
  display: flex; flex-direction: column; gap: 4px; background: var(--card);
  border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px;
}
.stat-label { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; color: var(--ink-3); }
.stat-val { font-size: 26px; font-weight: 700; line-height: 1.2; }
.stat-blue { color: var(--blue); }
.stat-brown { color: var(--brown); }
.stat-sub { font-size: 12px; color: var(--ink-2); }
.stat-sub-blue { color: var(--blue); font-weight: 600; }

.cat-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--line); }
.cat-head-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.pill { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #f3f4f6; color: var(--ink-2); font-size: 12px; font-weight: 600; }
.pill-blue { background: var(--blue-soft); color: var(--blue-dark); }

/* ---------- Modal ---------- */
.overlay {
  position: fixed; inset: 0; z-index: 50; background: rgba(17, 24, 39, 0.5);
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.modal {
  width: 100%; max-width: 520px; max-height: calc(100vh - 32px); overflow-y: auto;
  background: var(--card); border-radius: 14px; padding: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.25);
}
.modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.modal-head h2 { margin: 0; font-size: 18px; font-weight: 700; }
.modal-head button { background: none; border: 0; font-size: 24px; line-height: 1; color: var(--ink-3); }
.modal-head button:hover:not(:disabled) { color: var(--ink); }
.modal-event { margin: 0 0 16px; color: var(--ink-2); font-size: 13px; }
.warna-opsi { display: flex; flex-wrap: wrap; gap: 8px; }
.warna-btn {
  display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px;
  border: 1px solid var(--line); border-radius: 8px; background: var(--card); font-weight: 500;
}
.warna-btn[aria-pressed="true"] { border-color: var(--blue); background: var(--blue-soft); }
.warna-dot { width: 14px; height: 14px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.18); }
.warna-custom { display: flex; align-items: center; gap: 10px; margin-top: 12px; font-size: 13px; color: var(--ink-2); }
.warna-custom label { font-weight: 600; }
.warna-custom input[type="color"] { width: 40px; height: 32px; padding: 2px; border: 1px solid var(--line); border-radius: 6px; background: var(--card); cursor: pointer; }
.warna-custom code { font-size: 12px; color: var(--ink); }
.warna-preview { width: 28px; height: 28px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.18); margin-left: auto; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }

/* ---------- Peta lokasi ---------- */
.map-box { margin-top: 12px; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: #fafafa; }
.map-box iframe { display: block; width: 100%; border: 0; }
.map-empty { display: flex; align-items: center; justify-content: center; padding: 16px; text-align: center; color: var(--ink-2); font-size: 13px; }
.map-foot {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: 8px 12px; border-top: 1px solid var(--line); background: var(--card); font-size: 12px; color: var(--ink-2);
}
.map-foot span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.map-foot a { flex: none; color: var(--blue); font-weight: 600; text-decoration: none; }
.map-foot a:hover { text-decoration: underline; }

/* ---------- Potong poster ---------- */
.crop-modal { max-width: 400px; }
.crop-box {
  position: relative; margin: 0 auto; overflow: hidden; border-radius: 24px;
  background: #111; cursor: grab; touch-action: none; user-select: none;
}
.crop-box:active { cursor: grabbing; }
.crop-box img { position: absolute; max-width: none; pointer-events: none; }
.crop-zoom { display: flex; align-items: center; gap: 12px; margin-top: 16px; font-size: 13px; color: var(--ink-2); }
.crop-zoom input { flex: 1; width: auto !important; padding: 0; }

/* ---------- Toast ---------- */
.toast {
  position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 60;
  background: #1f2937; color: #fff; padding: 10px 18px; border-radius: 10px;
  font-size: 13px; font-weight: 500; box-shadow: 0 8px 24px rgba(0,0,0,0.25); max-width: calc(100vw - 32px);
}

/* ---------- Responsive ---------- */
@media (max-width: 1024px) {
  .form-grid, .denah-layout { grid-template-columns: 1fr; }
  .stats, .dstats { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 720px) {
  .content { padding: 16px 16px 48px; }
  .filters { grid-template-columns: 1fr; }
  .two-col { grid-template-columns: 1fr; }
  .title { font-size: 22px; }
  .denah-wrap { padding: 12px; }
  .stage { width: 100%; }
  .legend { position: static; width: 100%; margin-bottom: 16px; box-shadow: none; }
}
@media (prefers-reduced-motion: reduce) {
  .page * { transition: none !important; }
}
`;

/* ═══════════════════════ HALAMAN ═══════════════════════ */
export default function EventPage() {
  const [tab, setTab] = useState<Tab>("event");
  const [view, setView] = useState<View>("list");

  /* ====== Data master dari backend ====== */
  const [genreList, setGenreList] = useState<GenreOpt[]>([]);
  const [artisOpsi, setArtisOpsi] = useState<ArtisOpt[]>([]);

  /* ====== Toast ====== */
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  /* ====== Event list ====== */
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [filterStatus, setFilterStatus] = useState("Semua Status");
  const [filterGenre, setFilterGenre] = useState("Semua Genre");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;

  /* ====== Detail & edit event ====== */
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [editEventId, setEditEventId] = useState<number | null>(null); // null = mode tambah
  const [formLoading, setFormLoading] = useState(false);
  const [posterBaru, setPosterBaru] = useState(false); // true kalau user memilih file baru
  const [deletingId, setDeletingId] = useState<number | null>(null); // id event yang sedang dihapus

  /* ====== Form event ====== */
  const [judul, setJudul] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [venue, setVenue] = useState("");
  const [genre, setGenre] = useState(""); // id genre (string dari <select>)
  const [artisList, setArtisList] = useState<ArtisOpt[]>([]);
  const [tambahArtis, setTambahArtis] = useState(false);
  const [tanggal, setTanggal] = useState("");
  const [waktu, setWaktu] = useState("");
  const [jualMulai, setJualMulai] = useState("");
  const [jualSelesai, setJualSelesai] = useState("");
  const [syarat, setSyarat] = useState("");
  const [refundOtomatis, setRefundOtomatis] = useState(false);
  const [statusForm, setStatusForm] = useState<EventStatus>("Draft");
  const [poster, setPoster] = useState<string | null>(null); // data URL (base64) atau URL poster lama
  const [posterName, setPosterName] = useState("");
  const [posterError, setPosterError] = useState("");
  const [errorJudul, setErrorJudul] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null); // gambar yang sedang dipotong
  const [cropNama, setCropNama] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  /* ====== Kategori tiket ====== */
  const [kategoriMap, setKategoriMap] = useState<Record<number, Kategori[]>>({});
  const [kategoriLoading, setKategoriLoading] = useState(false);
  const [eventDipilih, setEventDipilih] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [kForm, setKForm] = useState<KategoriForm>(EMPTY_KATEGORI_FORM);
  const [kError, setKError] = useState("");
  const [kSaving, setKSaving] = useState(false);
  const [kWarnaManual, setKWarnaManual] = useState(false); // true kalau admin memilih warna sendiri

  /* ====== Denah kursi ====== */
  const [denahLoading, setDenahLoading] = useState(false);
  const [denahSaving, setDenahSaving] = useState(false);
  const [denahNama, setDenahNama] = useState("Section A1");
  const [denahBaris, setDenahBaris] = useState("4");
  const [denahKursi, setDenahKursi] = useState("10");
  const [seats, setSeats] = useState<Record<string, SeatStatus>>({});
  const [seatJenis, setSeatJenis] = useState<Record<string, string>>({}); // "r-c" -> jenis kursi
  const [denahKategori, setDenahKategori] = useState<Kategori[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [legendOpen, setLegendOpen] = useState(true);

  /* ====== Muat data ====== */
  async function loadEvents() {
    try {
      setLoadError(null);
      const res = await request<any>("/events");
      const list: any[] = Array.isArray(res) ? res : res.data ?? [];
      setEvents(list.map(toEvent));
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadMaster() {
    // genre & artis hanya pelengkap form; kalau gagal, halaman tetap jalan
    const [g, a] = await Promise.allSettled([request<any>("/genre"), request<any>("/artis")]);
    if (g.status === "fulfilled") {
      const list: any[] = Array.isArray(g.value) ? g.value : g.value.data ?? [];
      setGenreList(list.map(toGenreOpt));
    }
    if (a.status === "fulfilled") {
      const list: any[] = Array.isArray(a.value) ? a.value : a.value.data ?? [];
      setArtisOpsi(list.map(toArtisOpt));
    }
  }

  async function loadKategori(eventId: number) {
    try {
      setKategoriLoading(true);
      const res = await request<any>(`/events/${eventId}/kategori`);
      const list: any[] = Array.isArray(res) ? res : res.data ?? [];
      setKategoriMap((prev) => ({ ...prev, [eventId]: list.map(toKategori) }));
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setKategoriLoading(false);
    }
  }

  useEffect(() => {
    loadEvents();
    loadMaster();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  /* ====== Event: turunan ====== */
  const hasil = events.filter((ev) => {
    const q = cari.trim().toLowerCase();
    const cocokCari =
      q === "" ||
      ev.judul.toLowerCase().includes(q) ||
      ev.artis.toLowerCase().includes(q) ||
      ev.lokasi.toLowerCase().includes(q);
    const cocokStatus = filterStatus === "Semua Status" || ev.status === filterStatus;
    const cocokGenre = filterGenre === "Semua Genre" || ev.genre === filterGenre;
    return cocokCari && cocokStatus && cocokGenre;
  });
  const totalPage = Math.max(1, Math.ceil(hasil.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPage);
  const mulai = (currentPage - 1) * PAGE_SIZE;
  const tampil = hasil.slice(mulai, mulai + PAGE_SIZE);

  const warnaGenre = (nama: string) => {
    const g = genreList.find((x) => x.nama === nama);
    return { bg: g?.bg ?? "#E5E5E5", text: g?.text ?? "#1A1A1A" };
  };

  /* ====== Kategori: turunan ====== */
  const eventAktif = events.find((e) => e.id === eventDipilih) ?? events[0];
  const aktifId = eventAktif?.id;
  const kategoriList = kategoriMap[aktifId ?? 0] ?? [];
  const totalKuota = kategoriList.reduce((a, k) => a + k.kuota, 0);
  const totalTerjual = kategoriList.reduce((a, k) => a + k.terjual, 0);
  const sisaSlot = totalKuota - totalTerjual;
  const persenTerisi = totalKuota > 0 ? (totalTerjual / totalKuota) * 100 : 0;
  const estimasiRevenue = kategoriList
    .filter((k) => k.status === "Aktif")
    .reduce((a, k) => a + k.terjual * k.harga, 0);
  const jumlahAktif = kategoriList.filter((k) => k.status === "Aktif").length;
  const jumlahNonaktif = kategoriList.length - jumlahAktif;

  // muat kategori setiap kali tab kategori dibuka / event yang dipilih berganti
  useEffect(() => {
    if (tab === "kategori" && aktifId) loadKategori(aktifId);
  }, [tab, aktifId]);

  /* ====== Denah: turunan ====== */
  const dBaris = clampNum(denahBaris, 1, 26);
  const dKursi = clampNum(denahKursi, 1, 30);

  // jenis kursi yang bisa dipilih = kategori tiket aktif milik event ini
  const katAktif = denahKategori.filter((k) => k.status === "Aktif");
  const daftarJenis: { key: string; label: string; warna: string; kat: Kategori }[] = katAktif.map((k, i) => ({
    key: jenisKategori(k),
    label: k.nama,
    warna: warnaKategori(k.nama, k.warna, i),
    kat: k,
  }));
  const infoJenis = (jenis: string | null) => daftarJenis.find((j) => j.key === jenis);

  // kursi yang belum diatur memakai kategori seated pertama
  const defaultJenis: string | null = daftarJenis.find((j) => j.kat.tipe !== "Festival")?.key ?? daftarJenis[0]?.key ?? null;
  const jenisOf = (key: string): string | null => {
    const j = seatJenis[key];
    return j && infoJenis(j) ? j : defaultJenis;
  };
  const hargaBase = infoJenis(defaultJenis)?.kat.harga ?? 0;

  let cTersedia = 0;
  let cTerjualRes = 0;
  let cRusak = 0;
  let cKosong = 0;
  let cTerpilih = 0;
  const selectableKeys: string[] = [];
  const jenisCount: Record<string, number> = {};
  for (let r = 0; r < dBaris; r++) {
    for (let c = 0; c < dKursi; c++) {
      const k = seatKey(r, c);
      const st = seats[k] ?? "tersedia";
      if (st === "tersedia") cTersedia++;
      else if (st === "reservasi" || st === "terjual") cTerjualRes++;
      else if (st === "rusak") cRusak++;
      else cKosong++;
      if (st === "tersedia" || st === "rusak") {
        selectableKeys.push(k);
        if (selected[k]) cTerpilih++;
      }
      if (st !== "kosong") {
        const jn = jenisOf(k);
        if (jn !== null) jenisCount[jn] = (jenisCount[jn] ?? 0) + 1;
      }
    }
  }
  const totalKapasitas = dBaris * dKursi - cKosong;

  /* ====== Checklist ====== */
  const checklist = [
    { label: "Informasi Dasar Tersisi", ok: judul.trim() !== "" && venue.trim() !== "" && genre !== "" },
    { label: "Pilih minimal 1 artis", ok: artisList.length > 0 },
    { label: "Upload Poster Event", ok: poster !== null },
    { label: "Tentukan Periode Tiket", ok: jualMulai !== "" && jualSelesai !== "" },
  ];

  /* ====== Handlers: navigasi ====== */
  function gantiTab(t: Tab) {
    setTab(t);
    setView("list");
  }

  function resetFormEvent() {
    setJudul("");
    setDeskripsi("");
    setVenue("");
    setGenre("");
    setArtisList([]);
    setTambahArtis(false);
    setTanggal("");
    setWaktu("");
    setJualMulai("");
    setJualSelesai("");
    setSyarat("");
    setRefundOtomatis(false);
    setStatusForm("Draft");
    setPoster(null);
    setPosterName("");
    setPosterError("");
    setErrorJudul(false);
    setFormError(null);
    setEditEventId(null);
    setPosterBaru(false);
    setCropSrc(null);
  }

  function bukaFormEvent() {
    resetFormEvent();
    setTab("event");
    setView("form");
  }

  function kembaliKeList() {
    setView("list");
  }

  // tombol "Batalkan & Kembali" di form
  function batalForm() {
    if (editEventId !== null) bukaDetail(editEventId);
    else setView("list");
  }

  /* ====== Handlers: poster ====== */
  // File tidak langsung dipakai: dibuka dulu di editor potong (rasio 4:5)
  async function ambilFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPosterError("File harus berupa gambar.");
      return;
    }
    if (file.size > MAX_POSTER) {
      setPosterError("Ukuran poster maksimal 5MB.");
      return;
    }
    try {
      setCropSrc(await bacaFile(file));
      setCropNama(file.name);
      setPosterError("");
    } catch (e) {
      setPosterError((e as Error).message);
    }
  }

  function selesaiPotong(dataUrl: string) {
    setPoster(dataUrl);
    setPosterBaru(true);
    setPosterName(cropNama);
    setCropSrc(null);
  }

  function onPilihFile(e: ChangeEvent<HTMLInputElement>) {
    ambilFile(e.target.files?.[0]);
    e.target.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDrag(false);
    ambilFile(e.dataTransfer.files?.[0]);
  }

  /* ====== Handlers: artis ====== */
  function pilihArtis(idStr: string) {
    const a = artisOpsi.find((x) => String(x.id) === idStr);
    if (a && !artisList.some((x) => x.id === a.id)) {
      setArtisList((list) => [...list, a]);
    }
    setTambahArtis(false);
  }

  const artisTersedia = artisOpsi.filter((a) => !artisList.some((x) => x.id === a.id));

  /* ====== Handlers: detail & edit event ====== */
  async function ambilDetail(id: number) {
    const res = await request<any>(`/events/${id}`);
    return toEventDetail(res?.data ?? res, genreList, artisOpsi);
  }

  async function bukaDetail(id: number) {
    setEventDipilih(id);
    setTab("event");
    setView("detail");
    setDetail(null);
    setDetailError(null);
    try {
      setDetailLoading(true);
      setDetail(await ambilDetail(id));
    } catch (e) {
      setDetailError((e as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }

  function isiForm(d: EventDetail) {
    setJudul(d.judul);
    setDeskripsi(d.deskripsi);
    setVenue(d.lokasi);
    setGenre(d.genreId ? String(d.genreId) : "");
    setArtisList(d.artis);
    setTanggal(d.tanggal);
    setWaktu(d.waktu);
    setJualMulai(d.jualMulai);
    setJualSelesai(d.jualSelesai);
    setSyarat(d.syarat);
    setRefundOtomatis(d.refundOtomatis);
    setStatusForm(d.status);
    setPoster(d.poster);
    setPosterName(d.poster ? "Poster saat ini" : "");
    setPosterBaru(false);
  }

  async function bukaEditEvent(id: number) {
    resetFormEvent();
    setEditEventId(id);
    setEventDipilih(id);
    setTab("event");
    setView("form");
    try {
      setFormLoading(true);
      isiForm(await ambilDetail(id));
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setFormLoading(false);
    }
  }

  /* ====== Handlers: simpan event (POST /api/events | PUT /api/events/:id) ====== */
  // Field disesuaikan dengan bacaBody() di eventController.js:
  // venue (nama), genre (nama), artis (array nama).
  function buildEventPayload() {
    return {
      judul: judul.trim(),
      deskripsi: deskripsi.trim(),
      venue: venue.trim(),
      genre: genreList.find((g) => String(g.id) === genre)?.nama ?? "",
      artis: artisList.map((a) => a.nama),
      tanggal, // "YYYY-MM-DD"
      waktu, // "HH:mm"
      jualMulai,
      jualSelesai,
      syarat: syarat.trim(),
      refundOtomatis,
      status: statusForm,
      // saat edit, poster hanya dikirim kalau diganti (undefined dibuang oleh JSON.stringify)
      poster: editEventId !== null && !posterBaru ? undefined : poster,
    };
  }

  async function simpanEvent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving || formLoading) return;
    if (judul.trim() === "") {
      setErrorJudul(true);
      return;
    }
    const edit = editEventId !== null;
    try {
      setSaving(true);
      setFormError(null);
      const res = await request<any>(edit ? `/events/${editEventId}` : "/events", {
        method: edit ? "PUT" : "POST",
        body: JSON.stringify(buildEventPayload()),
      });

      if (edit) {
        showToast("Perubahan event berhasil disimpan.");
        await loadEvents();
        await bukaDetail(editEventId!);
        return;
      }

      const newId = Number(res?.id ?? res?.data?.id ?? res?.insertId);
      showToast("Event berhasil disimpan.");
      setPage(1);
      await loadEvents();
      if (newId) await bukaDenah(newId);
      else setView("list");
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function hapusDraft() {
    resetFormEvent();
    setView("list");
  }

  // DELETE /api/events/:id
  async function hapusEvent(id: number, namaEvent: string) {
    if (deletingId !== null) return;
    if (!window.confirm(`Hapus event "${namaEvent}"?\nTindakan ini tidak bisa dibatalkan.`)) return;

    try {
      setDeletingId(id);
      await request(`/events/${id}`, { method: "DELETE" });
      showToast("Event berhasil dihapus.");
      setKategoriMap((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (eventDipilih === id) setEventDipilih(null);
      setDetail(null);
      await loadEvents();
      setView("list");
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  /* ====== Handlers: denah kursi ====== */
  async function bukaDenah(id: number) {
    setEventDipilih(id);
    setTab("event");
    setView("denah");
    setSelected({});
    // default dulu, lalu timpa kalau backend sudah punya denah
    setDenahNama("Section A1");
    setDenahBaris("4");
    setDenahKursi("10");
    setSeats({});
    setSeatJenis({});
    setDenahKategori([]);

    try {
      setDenahLoading(true);
      let kats: Kategori[] = [];
      const [kr, dr] = await Promise.allSettled([
        request<any>(`/events/${id}/kategori`),
        request<any>(`/events/${id}/denah`),
      ]);

      if (kr.status === "fulfilled") {
        const list: any[] = Array.isArray(kr.value) ? kr.value : kr.value.data ?? [];
        kats = list.map(toKategori);
        setDenahKategori(kats);
      } else {
        showToast("Kategori tiket gagal dimuat.");
      }

      if (dr.status === "fulfilled") {
        const d = parseDenah(dr.value?.data ?? dr.value);
        if (d) {
          setDenahNama(d.nama);
          setDenahBaris(d.baris);
          setDenahKursi(d.kursi);
          setSeats(d.seats);
          const j: Record<string, string> = {};
          for (const [key, id] of Object.entries(d.kategori)) {
            const kat = kats.find((x) => x.id === id);
            if (kat) j[key] = jenisKategori(kat);
          }
          setSeatJenis(j);
        }
      }
      // kalau denah gagal dimuat / belum ada: pakai default
    } finally {
      setDenahLoading(false);
    }
  }

  function klikKursi(k: string) {
    const st = seats[k] ?? "tersedia";
    if (st !== "tersedia" && st !== "rusak") return;
    setSelected((prev) => ({ ...prev, [k]: !prev[k] }));
  }

  function dobelKlikKursi(k: string) {
    const st = seats[k] ?? "tersedia";
    if (st !== "tersedia" && st !== "kosong") return;
    setSeats((prev) => ({ ...prev, [k]: st === "kosong" ? "tersedia" : "kosong" }));
    setSelected((prev) => ({ ...prev, [k]: false }));
  }

  // klik huruf baris = pilih / batal pilih seluruh kursi di baris itu
  function pilihBaris(r: number) {
    const keys = selectableKeys.filter((k) => k.startsWith(`${r}-`));
    if (keys.length === 0) return;
    const semua = keys.every((k) => selected[k]);
    setSelected((prev) => {
      const next = { ...prev };
      keys.forEach((k) => {
        if (semua) delete next[k];
        else next[k] = true;
      });
      return next;
    });
  }

  function pilihSemua() {
    const semuaTerpilih = selectableKeys.length > 0 && selectableKeys.every((k) => selected[k]);
    if (semuaTerpilih) {
      setSelected({});
    } else {
      const next: Record<string, boolean> = {};
      selectableKeys.forEach((k) => {
        next[k] = true;
      });
      setSelected(next);
    }
  }

  function blokirTerpilih() {
    const keys = selectableKeys.filter((k) => selected[k]);
    if (keys.length === 0) return;
    const semuaRusak = keys.every((k) => seats[k] === "rusak");
    setSeats((prev) => {
      const next = { ...prev };
      keys.forEach((k) => {
        next[k] = semuaRusak ? "tersedia" : "rusak";
      });
      return next;
    });
    setSelected({});
  }

  // terapkan jenis kursi (VVIP / VIP / Reguler / Festival / lainnya) ke semua kursi yang dipilih
  function terapkanJenis(jenis: string) {
    const keys = selectableKeys.filter((k) => selected[k]);
    if (keys.length === 0) return;
    setSeatJenis((prev) => {
      const next = { ...prev };
      keys.forEach((k) => {
        next[k] = jenis;
      });
      return next;
    });
    setSeats((prev) => {
      const next = { ...prev };
      keys.forEach((k) => {
        if (next[k] === "rusak") next[k] = "tersedia";
      });
      return next;
    });
    setSelected({});
    showToast(`${keys.length} kursi diatur ke ${infoJenis(jenis)?.label ?? "jenis baru"}.`);
  }

  function unduhManifest() {
    const rows: (string | number)[][] = [["Kode", "Baris", "Kursi", "Status", "Kategori", "Harga (Rp)"]];
    for (let r = 0; r < dBaris; r++) {
      for (let c = 0; c < dKursi; c++) {
        const key = seatKey(r, c);
        const st = seats[key] ?? "tersedia";
        if (st === "kosong") continue;
        const jn = jenisOf(key);
        rows.push([
          `${rowLabel(r)}${c + 1}`,
          rowLabel(r),
          c + 1,
          st,
          infoJenis(jn)?.label ?? "-",
          infoJenis(jn)?.kat.harga ?? 0,
        ]);
      }
    }
    const blob = new Blob([rows.map((row) => row.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `manifest-${denahNama.trim().replace(/\s+/g, "-").toLowerCase() || "denah"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // PUT /api/events/:id/denah
  async function simpanDenah() {
    if (!aktifId || denahSaving) return;
    if (katAktif.length === 0) {
      showToast("Event ini belum punya kategori tiket aktif. Buat dulu di tab Kategori Tiket.");
      return;
    }
    const seatsOut: Record<string, SeatStatus> = {};
    const kategoriOut: Record<string, number> = {};
    let anyId: number | null = null;
    for (let r = 0; r < dBaris; r++) {
      for (let c = 0; c < dKursi; c++) {
        const key = seatKey(r, c);
        const st = seats[key] ?? "tersedia";
        seatsOut[key] = st;
        if (st === "kosong" || st === "reservasi" || st === "terjual") continue;
        const kat = infoJenis(jenisOf(key))?.kat;
        if (!kat) continue;
        kategoriOut[key] = kat.id;
        if (anyId === null) anyId = kat.id;
      }
    }

    try {
      setDenahSaving(true);
      await request(`/events/${aktifId}/denah`, {
        method: "PUT",
        body: JSON.stringify({
          nama: denahNama.trim(),
          baris: dBaris,
          kursi: dKursi,
          seats: seatsOut,
          kategori: kategoriOut,
          kategoriDefaultId: anyId,
        }),
      });
      showToast("Denah kursi berhasil disimpan.");
      setSelected({});
      await loadEvents(); // kapasitas event ikut berubah

      // Jika denah dibuka dari halaman Edit Event, kembali ke form edit.
      // Jika denah dibuat setelah event baru disimpan, kembali ke daftar event.
      if (editEventId !== null) {
        setView("form");
      } else {
        setView("list");
      }
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setDenahSaving(false);
    }
  }

  /* ====== Handlers: kategori ====== */
  function bukaTambahKategori() {
    setEditId(null);
    setKForm(EMPTY_KATEGORI_FORM);
    setKWarnaManual(false);
    setKError("");
    setModalOpen(true);
  }

  function bukaEditKategori(k: Kategori) {
    setEditId(k.id);
    setKForm({
      nama: k.nama,
      tipe: k.tipe,
      harga: String(k.harga),
      kuota: String(k.kuota),
      status: k.status,
      warna: warnaKategori(k.nama, k.warna),
    });
    setKWarnaManual(true);
    setKError("");
    setModalOpen(true);
  }

  // POST /api/events/:id/kategori  |  PUT /api/kategori/:id
  async function simpanKategori(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!aktifId || kSaving) return;
    const harga = Number(kForm.harga);
    const kuota = Number(kForm.kuota);
    if (kForm.nama.trim() === "") {
      setKError("Nama kategori wajib diisi.");
      return;
    }
    if (!harga || harga < 0) {
      setKError("Harga harus diisi dengan angka yang valid.");
      return;
    }
    if (!kuota || kuota < 1) {
      setKError("Kuota minimal 1.");
      return;
    }

    const lama = editId !== null ? kategoriList.find((k) => k.id === editId) : undefined;
    const body = JSON.stringify({
      nama: kForm.nama.trim(),
      tipe: kForm.tipe,
      harga,
      kuota: Math.max(kuota, lama?.terjual ?? 0), // kuota tidak boleh di bawah tiket terjual
      status: kForm.status,
      warna: kForm.warna,
    });

    try {
      setKSaving(true);
      setKError("");
      if (editId !== null) {
        await request(`/kategori/${editId}`, { method: "PUT", body });
        showToast("Kategori berhasil diperbarui.");
      } else {
        await request(`/events/${aktifId}/kategori`, { method: "POST", body });
        showToast("Kategori berhasil ditambahkan.");
      }
      setModalOpen(false);
      await loadKategori(aktifId);
      loadEvents();
    } catch (err) {
      setKError((err as Error).message);
    } finally {
      setKSaving(false);
    }
  }

  // DELETE /api/kategori/:id
  async function hapusKategori(kid: number) {
    if (!aktifId) return;
    if (!window.confirm("Hapus kategori tiket ini?")) return;
    try {
      await request(`/kategori/${kid}`, { method: "DELETE" });
      showToast("Kategori berhasil dihapus.");
      await loadKategori(aktifId);
      loadEvents();
    } catch (err) {
      showToast((err as Error).message);
    }
  }

  /* ====================== RENDER ====================== */
  return (
    <main className={`page ${inter.className}`}>
      <style>{css}</style>

      <div className="content">
        {/* Tab buttons */}
        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "event"}
            className={`tab ${tab === "event" ? "tab-active" : ""}`}
            onClick={() => gantiTab("event")}
          >
            Kelola Event
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "kategori"}
            className={`tab ${tab === "kategori" ? "tab-active" : ""}`}
            onClick={() => gantiTab("kategori")}
          >
            Kategori Tiket
          </button>
        </div>

        {/* ================= TAB: KELOLA EVENT - LIST ================= */}
        {tab === "event" && view === "list" && (
          <section>
            <div className="head-row">
              <div>
                <h1 className="title">Daftar Event</h1>
              </div>
              <button type="button" className="btn-primary" onClick={bukaFormEvent}>
                <span aria-hidden="true">+</span> Tambah Event
              </button>
            </div>
            <div className="rule" />

            <div className="filters">
              <div className="f-search">
                <label className="label" htmlFor="cari">Pencarian Cepat</label>
                <div className="input-wrap">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="11" cy="11" r="6" />
                    <path d="m20 20-4-4" />
                  </svg>
                  <input
                    id="cari"
                    type="text"
                    placeholder="Ketik nama artis atau venue..."
                    value={cari}
                    onChange={(e) => {
                      setCari(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="fstatus">Status</label>
                <select
                  id="fstatus"
                  value={filterStatus}
                  onChange={(e) => {
                    setFilterStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  <option>Semua Status</option>
                  <option>Published</option>
                  <option>Draft</option>
                  <option>Closed</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="fgenre">Genre</label>
                <select
                  id="fgenre"
                  value={filterGenre}
                  onChange={(e) => {
                    setFilterGenre(e.target.value);
                    setPage(1);
                  }}
                >
                  <option>Semua Genre</option>
                  {genreList.map((g) => (
                    <option key={g.id}>{g.nama}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="table-card">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Poster</th>
                      <th>Detail Event</th>
                      <th>Genre</th>
                      <th>Lokasi</th>
                      <th>Tanggal</th>
                      <th>Status</th>
                      <th>Okupansi</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr>
                        <td colSpan={8} className="empty" role="status">
                          Memuat event...
                        </td>
                      </tr>
                    )}
                    {!loading && loadError && (
                      <tr>
                        <td colSpan={8} className="empty">
                          <p className="err">{loadError}</p>
                          <button
                            type="button"
                            className="btn-outline btn-sm retry"
                            onClick={() => {
                              setLoading(true);
                              loadEvents();
                            }}
                          >
                            Coba lagi
                          </button>
                        </td>
                      </tr>
                    )}
                    {!loading && !loadError && tampil.length === 0 && (
                      <tr>
                        <td colSpan={8} className="empty">
                          {events.length === 0 ? "Belum ada event. Klik \"Tambah Event\" untuk membuat." : "Tidak ada event yang cocok."}
                        </td>
                      </tr>
                    )}
                    {tampil.map((ev) => {
                      const persen =
                        ev.kapasitas > 0 ? Math.round((ev.terjual / ev.kapasitas) * 100) : 0;
                      const wg = warnaGenre(ev.genre);
                      return (
                        <tr key={ev.id}>
                          <td>
                            <button
                              type="button"
                              className="poster-btn"
                              onClick={() => bukaDetail(ev.id)}
                              aria-label={`Lihat detail ${ev.judul}`}
                            >
                              {ev.poster ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={ev.poster} alt={`Poster ${ev.judul}`} className="poster" />
                              ) : (
                                <div className="poster poster-empty" aria-hidden="true">♪</div>
                              )}
                            </button>
                          </td>
                          <td className="td-title">
                            <button type="button" className="link-title" onClick={() => bukaDetail(ev.id)}>
                              {ev.judul}
                            </button>
                          </td>
                          <td>
                            <span className="genre" style={{ background: wg.bg, color: wg.text }}>
                              {ev.genre}
                            </span>
                          </td>
                          <td className="td-loc">{ev.lokasi}</td>
                          <td className="td-date">{ev.tanggal}</td>
                          <td>
                            <span className={statusClass(ev.status)}>{ev.status}</span>
                          </td>
                          <td className="td-occ">
                            <div className="occ-text">
                              <span>
                                {ev.terjual.toLocaleString("id-ID")} /{" "}
                                {ev.kapasitas.toLocaleString("id-ID")}
                              </span>
                              <span>{persen}%</span>
                            </div>
                            <div className="bar">
                              <div
                                className={`bar-fill ${persen >= 100 ? "bar-red" : ""}`}
                                style={{ width: `${Math.min(persen, 100)}%` }}
                              />
                            </div>
                          </td>
                          <td>
                            <div className="actions">
                              <button
                                type="button"
                                className="icon-btn"
                                aria-label={`Detail ${ev.judul}`}
                                title="Lihat detail"
                                onClick={() => bukaDetail(ev.id)}
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="icon-btn"
                                aria-label={`Edit ${ev.judul}`}
                                title="Edit event"
                                onClick={() => bukaEditEvent(ev.id)}
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="icon-btn icon-danger"
                                aria-label={`Hapus ${ev.judul}`}
                                title="Hapus event"
                                disabled={deletingId === ev.id}
                                onClick={() => hapusEvent(ev.id, ev.judul)}
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="table-foot">
                <span>
                  Menampilkan {hasil.length === 0 ? 0 : mulai + 1}-
                  {Math.min(mulai + PAGE_SIZE, hasil.length)} dari {hasil.length} event
                </span>
                <div className="pager">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                    aria-label="Halaman sebelumnya"
                  >
                    ‹
                  </button>
                  {Array.from({ length: totalPage }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={n === currentPage ? "pager-active" : ""}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={currentPage === totalPage}
                    onClick={() => setPage(currentPage + 1)}
                    aria-label="Halaman berikutnya"
                  >
                    ›
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ================= TAB: KELOLA EVENT - DETAIL ================= */}
        {tab === "event" && view === "detail" && (
          <section>
            <p className="crumb-top">
              EVENT / <strong>DETAIL EVENT</strong>
            </p>

            {detailLoading && <p className="desc" role="status">Memuat detail event...</p>}

            {!detailLoading && detailError && (
              <div>
                <p className="err">{detailError}</p>
                <div className="head-actions" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    onClick={() => eventDipilih && bukaDetail(eventDipilih)}
                  >
                    Coba lagi
                  </button>
                  <button type="button" className="btn-outline btn-sm" onClick={kembaliKeList}>
                    Kembali
                  </button>
                </div>
              </div>
            )}

            {detail && (
              <>
                <div className="head-row">
                  <div>
                    <h1 className="title">{detail.judul}</h1>
                    <div style={{ marginTop: 8 }}>
                      <span className={statusClass(detail.status)}>{detail.status}</span>
                    </div>
                  </div>
                  <div className="head-actions">
                    <button type="button" className="btn-outline" onClick={kembaliKeList}>
                      Kembali
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => {
                        setEventDipilih(detail.id);
                        setTab("kategori");
                      }}
                    >
                      Kategori Tiket
                    </button>
                    <button type="button" className="btn-outline" onClick={() => bukaDenah(detail.id)}>
                      Denah Kursi
                    </button>
                    <button
                      type="button"
                      className="btn-outline btn-danger"
                      disabled={deletingId === detail.id}
                      onClick={() => hapusEvent(detail.id, detail.judul)}
                    >
                      {deletingId === detail.id ? "Menghapus..." : "Hapus Event"}
                    </button>
                    <button type="button" className="btn-primary" onClick={() => bukaEditEvent(detail.id)}>
                      Edit Event
                    </button>
                  </div>
                </div>
                <div className="rule" />

                <div className="form-grid">
                  <div className="col-main">
                    <div className="panel">
                      <h3 className="panel-title">Konten Utama</h3>
                      <dl className="info-list">
                        <Info label="Judul Konser">{detail.judul}</Info>
                        <Info label="Deskripsi">
                          {detail.deskripsi && <span className="pre">{detail.deskripsi}</span>}
                        </Info>
                        <Info label="Venue / Lokasi">
                          {detail.lokasi && (
                            <>
                              {detail.lokasi}
                              <LokasiMap query={detail.lokasi} tinggi={260} />
                            </>
                          )}
                        </Info>
                        <Info label="Genre">
                          {detail.genreNama && (
                            <span
                              className="genre"
                              style={{
                                background: warnaGenre(detail.genreNama).bg,
                                color: warnaGenre(detail.genreNama).text,
                              }}
                            >
                              {detail.genreNama}
                            </span>
                          )}
                        </Info>
                      </dl>
                    </div>

                    <div className="panel">
                      <h3 className="panel-title">Artis / Penampilan</h3>
                      {detail.artis.length === 0 ? (
                        <p className="kat-empty">Belum ada artis.</p>
                      ) : (
                        <div className="artist-box">
                          {detail.artis.map((a) => (
                            <span key={a.id} className="chip">
                              <span className="chip-avatar" aria-hidden="true">
                                {a.nama.charAt(0).toUpperCase()}
                              </span>
                              {a.nama}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="panel">
                      <h3 className="panel-title">Logistik &amp; Penjualan</h3>
                      <dl className="info-list">
                        <Info label="Tanggal Pelaksanaan">{tglPanjang(detail.tanggal)}</Info>
                        <Info label="Jam">{detail.waktu}</Info>
                        <Info label="Periode Penjualan">
                          {detail.jualMulai || detail.jualSelesai
                            ? `${tglPanjang(detail.jualMulai)} – ${tglPanjang(detail.jualSelesai)}`
                            : ""}
                        </Info>
                      </dl>
                    </div>

                    <div className="panel">
                      <h3 className="panel-title">Kebijakan &amp; S&amp;K</h3>
                      <dl className="info-list">
                        <Info label="Syarat & Ketentuan">
                          {detail.syarat && <span className="pre">{detail.syarat}</span>}
                        </Info>
                        <Info label="Refund Otomatis">
                          {detail.refundOtomatis ? "Diizinkan" : "Tidak diizinkan"}
                        </Info>
                      </dl>
                    </div>
                  </div>

                  <aside className="col-side">
                    <div className="panel">
                      <h3 className="panel-title panel-title-blue">POSTER UTAMA</h3>
                      {detail.poster ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={detail.poster} alt={`Poster ${detail.judul}`} className="drop-preview" />
                      ) : (
                        <p className="kat-empty">Belum ada poster.</p>
                      )}
                    </div>

                    <div className="panel panel-check">
                      <h3 className="panel-title">Okupansi</h3>
                      {(() => {
                        const persen =
                          detail.kapasitas > 0 ? Math.round((detail.terjual / detail.kapasitas) * 100) : 0;
                        return (
                          <>
                            <div className="occ-text">
                              <span>
                                {detail.terjual.toLocaleString("id-ID")} /{" "}
                                {detail.kapasitas.toLocaleString("id-ID")} tiket
                              </span>
                              <span>{persen}%</span>
                            </div>
                            <div className="bar">
                              <div
                                className={`bar-fill ${persen >= 100 ? "bar-red" : ""}`}
                                style={{ width: `${Math.min(persen, 100)}%` }}
                              />
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </aside>
                </div>
              </>
            )}
          </section>
        )}

        {/* ================= TAB: KELOLA EVENT - FORM (TAMBAH / EDIT) ================= */}
        {tab === "event" && view === "form" && (
          <form onSubmit={simpanEvent} noValidate>
            <div className="head-row">
              <h1 className="title title-sm">
                {editEventId !== null ? "Edit Event" : "Buat Event Baru"}
              </h1>

              <div className="head-actions">
                {editEventId !== null && (
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => bukaDenah(editEventId)}
                    disabled={formLoading || saving}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                      <rect x="4" y="4" width="6" height="6" rx="1" />
                      <rect x="14" y="4" width="6" height="6" rx="1" />
                      <rect x="4" y="14" width="6" height="6" rx="1" />
                      <rect x="14" y="14" width="6" height="6" rx="1" />
                    </svg>
                    Edit Denah
                  </button>
                )}

                <div className="seg" role="group" aria-label="Status event">
                  {(["Draft", "Published", "Closed"] as EventStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={statusForm === s ? "seg-active" : ""}
                      onClick={() => setStatusForm(s)}
                    >
                      {s.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {formLoading && <p className="desc" role="status">Memuat data event...</p>}

            <div className="form-grid">
              {/* Kolom kiri */}
              <div className="col-main">
                {/* Konten utama */}
                <div className="panel">
                  <h3 className="panel-title">Konten Utama</h3>

                  <div className="field">
                    <label className="label" htmlFor="judul">Judul Konser</label>
                    <input
                      id="judul"
                      type="text"
                      className={errorJudul ? "input-error" : ""}
                      placeholder="Contoh: Tulus Monokrom Tour : Pop"
                      value={judul}
                      onChange={(e) => {
                        setJudul(e.target.value);
                        if (errorJudul) setErrorJudul(false);
                      }}
                    />
                    {errorJudul && <p className="err">Judul konser wajib diisi.</p>}
                  </div>

                  <div className="field">
                    <label className="label" htmlFor="deskripsi">Deskripsi Event</label>
                    <textarea
                      id="deskripsi"
                      rows={7}
                      placeholder="Tuliskan detail menarik tentang konser ini..."
                      value={deskripsi}
                      onChange={(e) => setDeskripsi(e.target.value)}
                    />
                  </div>

                  <div className="two-col">
                    <div className="field">
                      <label className="label" htmlFor="venue">Venue / Lokasi</label>
                      <input
                        id="venue"
                        type="text"
                        placeholder="Contoh: Gelora Bung Karno, Senayan, Jakarta"
                        value={venue}
                        onChange={(e) => setVenue(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="genre">Genre Utama</label>
                      <select id="genre" value={genre} onChange={(e) => setGenre(e.target.value)}>
                        <option value="">Pilih Genre</option>
                        {genreList.map((g) => (
                          <option key={g.id} value={g.id}>{g.nama}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <LokasiMap query={venue} />
                </div>

                {/* Artis */}
                <div className="panel">
                  <div className="panel-head">
                    <h3 className="panel-title">Pilih Artis / Penampilan</h3>
                  </div>

                  <div className="artist-box">
                    {artisList.map((a) => (
                      <span key={a.id} className="chip">
                        <span className="chip-avatar" aria-hidden="true">
                          {a.nama.charAt(0).toUpperCase()}
                        </span>
                        {a.nama}
                        <button
                          type="button"
                          aria-label={`Hapus ${a.nama}`}
                          onClick={() => setArtisList((l) => l.filter((x) => x.id !== a.id))}
                        >
                          ×
                        </button>
                      </span>
                    ))}

                    {tambahArtis ? (
                      <span className="chip-input">
                        <select
                          autoFocus
                          value=""
                          aria-label="Pilih artis"
                          onChange={(e) => pilihArtis(e.target.value)}
                          onKeyDown={(e) => e.key === "Escape" && setTambahArtis(false)}
                        >
                          <option value="">
                            {artisTersedia.length ? "Pilih artis..." : "Tidak ada artis tersisa"}
                          </option>
                          {artisTersedia.map((a) => (
                            <option key={a.id} value={a.id}>{a.nama}</option>
                          ))}
                        </select>
                        <button type="button" onClick={() => setTambahArtis(false)}>Batal</button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="chip chip-add"
                        onClick={() => setTambahArtis(true)}
                      >
                        + Pilih Artis
                      </button>
                    )}
                  </div>
                </div>

                {/* Logistik */}
                <div className="panel">
                  <h3 className="panel-title">Logistik &amp; Penjualan</h3>
                  <div className="two-col">
                    <div className="field">
                      <label className="label">Waktu Pelaksanaan</label>
                      <div className="two-col two-col-tight">
                        <input
                          type="date"
                          aria-label="Tanggal pelaksanaan"
                          value={tanggal}
                          onChange={(e) => setTanggal(e.target.value)}
                        />
                        <input
                          type="time"
                          aria-label="Jam pelaksanaan"
                          value={waktu}
                          onChange={(e) => setWaktu(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label className="label">Periode Penjualan Tiket</label>
                      <div className="range">
                        <input
                          type="date"
                          aria-label="Mulai penjualan"
                          value={jualMulai}
                          onChange={(e) => setJualMulai(e.target.value)}
                        />
                        <span>ke</span>
                        <input
                          type="date"
                          aria-label="Selesai penjualan"
                          value={jualSelesai}
                          onChange={(e) => setJualSelesai(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Kebijakan */}
                <div className="panel">
                  <h3 className="panel-title">Kebijakan &amp; S&amp;K</h3>
                  <div className="field">
                    <label className="label" htmlFor="syarat">Syarat &amp; Ketentuan Umum</label>
                    <textarea
                      id="syarat"
                      rows={5}
                      placeholder="Masukkan syarat dan ketentuan bagi pengunjung..."
                      value={syarat}
                      onChange={(e) => setSyarat(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Kolom kanan */}
              <aside className="col-side">
                <div className="panel">
                  <h3 className="panel-title panel-title-blue">POSTER UTAMA</h3>
                  <div
                    className={`drop ${drag ? "drop-active" : ""}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDrag(true);
                    }}
                    onDragLeave={() => setDrag(false)}
                    onDrop={onDrop}
                  >
                    {poster ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={poster} alt="Pratinjau poster" className="drop-preview" />
                        <p className="drop-file">{posterName}</p>
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" className="drop-icon" aria-hidden="true">
                          <path d="M12 16V5m0 0-4 4m4-4 4 4M5 19h14" />
                        </svg>
                        <strong>Drag &amp; Drop Poster</strong>
                        <p>
                          Rasio 4:5 (hasil <strong>1200x1500px</strong>), maks 5MB. Bisa digeser dan
                          di-zoom setelah dipilih.
                        </p>
                      </>
                    )}
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      onClick={() => fileRef.current?.click()}
                    >
                      {poster ? "Ganti File" : "Pilih File"}
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={onPilihFile}
                    />
                  </div>
                  {posterError && <p className="err">{posterError}</p>}
                </div>

                <div className="panel panel-note">
                  <p className="note">
                    {editEventId === null
                      ? "Preview tampilan publik tersedia setelah draft disimpan."
                      : "Perubahan akan langsung berlaku setelah disimpan."}
                  </p>
                  {formError && <p className="err err-block">{formError}</p>}
                  <button type="submit" className="btn-primary btn-block" disabled={saving || formLoading}>
                    {saving ? "Menyimpan..." : "Simpan Perubahan"}
                  </button>
                  <button
                    type="button"
                    className="btn-outline btn-block"
                    onClick={batalForm}
                    disabled={saving}
                  >
                    Batalkan &amp; Kembali
                  </button>
                  {editEventId === null && (
                    <button type="button" className="link-danger" onClick={hapusDraft} disabled={saving}>
                      Hapus Draft Event
                    </button>
                  )}
                  {editEventId !== null && (
                    <button
                      type="button"
                      className="link-danger"
                      onClick={() => hapusEvent(editEventId, judul || "ini")}
                      disabled={saving || deletingId === editEventId}
                    >
                      {deletingId === editEventId ? "Menghapus..." : "Hapus Event"}
                    </button>
                  )}
                </div>

                <div className="panel panel-check">
                  <h3 className="panel-title">Checklist Kelengkapan</h3>
                  <ul className="check">
                    {checklist.map((c) => (
                      <li key={c.label} className={c.ok ? "check-ok" : ""}>
                        <span aria-hidden="true">{c.ok ? "●" : "○"}</span>
                        {c.label}
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            </div>
          </form>
        )}

        {/* ================= TAB: KELOLA EVENT - EDITOR DENAH KURSI ================= */}
        {tab === "event" && view === "denah" && (
          <section className="denah-wrap">
            <div className="denah-layout">
              <div className="denah-main">
                <div>
                  <div className="denah-head">
                    <p className="denah-crumb">
                      Event / <strong>Editor Denah Kursi</strong>
                    </p>
                    <h1 className="denah-title">{eventAktif?.judul}</h1>
                    <p className="denah-kat">
                      Section: <span>{denahNama.trim() || "-"}</span>
                    </p>
                  </div>

                  <div className="denah-card">
                    {denahLoading && <p className="seat-hint" role="status">Memuat denah...</p>}

                    <div className="stage" aria-label="Panggung utama">
                      PANGGUNG UTAMA (STAGE)
                    </div>

                    {/* Legenda melayang */}
                    <div className="legend" aria-label="Legenda">
                      <div className="legend-head">
                        <p className="legend-title">LEGENDA</p>
                        <button
                          type="button"
                          className="legend-toggle"
                          onClick={() => setLegendOpen((v) => !v)}
                          aria-expanded={legendOpen}
                          aria-label={legendOpen ? "Sembunyikan legenda" : "Tampilkan legenda"}
                        >
                          {legendOpen ? "–" : "+"}
                        </button>
                      </div>
                      {legendOpen && (
                        <>
                          <hr />
                          <ul>
                            {daftarJenis.length === 0 && <li className="legend-none">Belum ada kategori</li>}
                            {daftarJenis.map((j) => (
                              <li key={j.key}>
                                <span className="swatch" style={{ background: j.warna }} aria-hidden="true" />
                                {j.label}
                              </li>
                            ))}
                          </ul>
                          <ul>
                            {STATUS_LEGEND.map((l) => (
                              <li key={l.cls}>
                                <span className={`swatch seat-${l.cls}`} aria-hidden="true" />
                                {l.label}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>

                    <div className="seat-scroll">
                      <div className="seat-board">
                        {Array.from({ length: dBaris }, (_, r) => (
                          <div key={r} className="seat-row">
                            <button
                              type="button"
                              className="seat-row-label"
                              onClick={() => pilihBaris(r)}
                              aria-label={`Pilih seluruh baris ${rowLabel(r)}`}
                              title={`Pilih seluruh baris ${rowLabel(r)}`}
                            >
                              {rowLabel(r)}
                            </button>
                            <div
                              className="seat-cols"
                              style={{
                                gridTemplateColumns: `repeat(${dKursi}, minmax(32px, 1fr))`,
                              }}
                            >
                              {Array.from({ length: dKursi }, (_, c) => {
                                const k = seatKey(r, c);
                                const st = seats[k] ?? "tersedia";
                                const isSel = !!selected[k];
                                const jn = infoJenis(jenisOf(k));
                                // warna jenis hanya untuk kursi tersedia; kursi terpilih = hitam (lewat CSS)
                                const warna = st === "tersedia" && jn && !isSel ? jn.warna : undefined;
                                return (
                                  <button
                                    key={k}
                                    type="button"
                                    className={`seat seat-${st} ${isSel ? "seat-sel" : ""}`}
                                    style={warna ? { background: warna, color: teksDiAtas(warna) } : undefined}
                                    aria-label={`Kursi ${rowLabel(r)}${c + 1}, ${st}${jn && st !== "kosong" ? `, jenis ${jn.label}` : ""}`}
                                    title={jn && st !== "kosong" ? `${rowLabel(r)}${c + 1} · ${jn.label}` : undefined}
                                    aria-pressed={isSel}
                                    onClick={() => klikKursi(k)}
                                    onDoubleClick={() => dobelKlikKursi(k)}
                                  >
                                    {st === "rusak" && !isSel ? (
                                      <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <circle cx="12" cy="12" r="8" />
                                        <path d="m6.5 6.5 11 11" />
                                      </svg>
                                    ) : st === "kosong" ? null : (
                                      c + 1
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <p className="seat-hint">
                      Klik kursi untuk memilih (jadi hitam), atau klik huruf baris untuk memilih satu baris penuh.
                      Klik dua kali untuk mengosongkan atau mengembalikan kursi.
                    </p>
                  </div>
                </div>

                <div className="dstats">
                  <div className="dstat">
                    <div>
                      <span className="dstat-label">TOTAL KAPASITAS</span>
                      <strong className="dstat-val dstat-blue">{totalKapasitas}</strong>
                    </div>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 11V7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4M4 12a2 2 0 0 1 2 2v3h12v-3a2 2 0 1 1 2 2v3H4v-3a2 2 0 0 1 0-4Z" />
                      <path d="M7 20v1M17 20v1" />
                    </svg>
                  </div>
                  <div className="dstat">
                    <div>
                      <span className="dstat-label">TERSEDIA</span>
                      <strong className="dstat-val dstat-blue">{cTersedia}</strong>
                    </div>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" />
                      <path d="m8 12.5 3 3 5-6" />
                    </svg>
                  </div>
                  <div className="dstat">
                    <div>
                      <span className="dstat-label">TERJUAL / RESERVASI</span>
                      <strong className="dstat-val dstat-blue">{cTerjualRes}</strong>
                    </div>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="3" y="6" width="18" height="12" rx="2" />
                      <circle cx="12" cy="12" r="2.5" />
                    </svg>
                  </div>
                  <div className="dstat">
                    <div>
                      <span className="dstat-label">RUSAK</span>
                      <strong className="dstat-val dstat-red">{cRusak}</strong>
                    </div>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 4 3 20h18L12 4Z" />
                      <path d="M12 10v4M12 17v.5" />
                    </svg>
                  </div>
                </div>
              </div>

              <aside className="denah-side">
                <div className="denah-panel">
                  <div className="denah-panel-head">
                    <h3>Pengaturan</h3>
                    <svg className="gear" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
                    </svg>
                  </div>

                  <div className="denah-panel-body">
                    <div className="field">
                      <label className="label" htmlFor="d-nama">Nama</label>
                      <input
                        id="d-nama"
                        type="text"
                        placeholder="Contoh: Section A1"
                        value={denahNama}
                        onChange={(e) => setDenahNama(e.target.value)}
                      />
                    </div>

                    <div className="two-col two-col-tight field">
                      <div>
                        <label className="label" htmlFor="d-baris">Baris</label>
                        <input
                          id="d-baris"
                          type="number"
                          min={1}
                          max={26}
                          value={denahBaris}
                          onChange={(e) => setDenahBaris(e.target.value)}
                          onBlur={() => setDenahBaris(String(dBaris))}
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor="d-kursi">Kursi/Baris</label>
                        <input
                          id="d-kursi"
                          type="number"
                          min={1}
                          max={30}
                          value={denahKursi}
                          onChange={(e) => setDenahKursi(e.target.value)}
                          onBlur={() => setDenahKursi(String(dKursi))}
                        />
                      </div>
                    </div>

                    <div className="field">
                      <label className="label" htmlFor="d-harga">Harga Base</label>
                      <div className="rp-wrap">
                        <span>Rp</span>
                        <input
                          id="d-harga"
                          type="text"
                          readOnly
                          value={hargaBase.toLocaleString("id-ID")}
                          title="Harga mengikuti kategori tiket. Ubah di tab Kategori Tiket."
                        />
                      </div>
                    </div>

                    <div className="denah-divider" />

                    <div className="d-actions">
                      <button type="button" onClick={pilihSemua}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <rect x="5" y="5" width="14" height="14" rx="1" />
                          <rect x="9" y="9" width="6" height="6" />
                        </svg>
                        Pilih Semua
                      </button>
                      <button type="button" onClick={blokirTerpilih} disabled={cTerpilih === 0}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <circle cx="12" cy="12" r="8" />
                          <path d="m6.5 6.5 11 11" />
                        </svg>
                        Blokir
                      </button>
                      <button type="button" onClick={unduhManifest}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2" />
                          <rect x="7" y="14" width="10" height="6" />
                        </svg>
                        Manifest
                      </button>
                    </div>

                    <p className="d-selected">{cTerpilih} kursi terpilih</p>
                  </div>
                </div>

                {/* Atur jenis kursi */}
                <div className="denah-panel">
                  <div className="denah-panel-head">
                    <h3>Atur Kursi</h3>
                  </div>
                  <div className="denah-panel-body">
                    <p className="kat-hint">
                      {cTerpilih > 0
                        ? `${cTerpilih} kursi terpilih. Klik jenis tiket untuk menerapkan.`
                        : "Pilih kursi atau satu baris (klik huruf baris), lalu klik jenis tiketnya."}
                    </p>

                    {daftarJenis.length === 0 && (
                      <p className="kat-empty" style={{ marginBottom: 12 }}>
                        {denahLoading
                          ? "Memuat kategori..."
                          : "Event ini belum punya kategori tiket aktif. Jenis kursi diambil dari kategori tiket, jadi buat kategorinya dulu."}
                      </p>
                    )}

                    <ul className="kat-list">
                      {daftarJenis.map((j) => (
                        <li key={j.key}>
                          <button
                            type="button"
                            className="kat-btn"
                            disabled={cTerpilih === 0}
                            onClick={() => terapkanJenis(j.key)}
                          >
                            <span className="kat-sw" style={{ background: j.warna }} aria-hidden="true" />
                            <span className="kat-info">
                              <strong>{j.label}</strong>
                              <small>{rupiah(j.kat.harga)}</small>
                            </span>
                            <span className="kat-count">{jenisCount[j.key] ?? 0} kursi</span>
                          </button>
                        </li>
                      ))}

                      <li>
                        <button
                          type="button"
                          className="kat-btn"
                          disabled={cTerpilih === 0}
                          onClick={blokirTerpilih}
                        >
                          <span className="kat-sw kat-sw-rusak" aria-hidden="true" />
                          <span className="kat-info">
                            <strong>Rusak</strong>
                            <small>Tidak dijual. Klik lagi pada kursi rusak untuk memulihkan</small>
                          </span>
                          <span className="kat-count">{cRusak} kursi</span>
                        </button>
                      </li>
                    </ul>

                    {!denahLoading && daftarJenis.length === 0 && (
                      <button
                        type="button"
                        className="btn-outline btn-sm btn-block"
                        style={{ marginTop: 12 }}
                        onClick={() => setTab("kategori")}
                      >
                        Buka Kategori Tiket
                      </button>
                    )}
                  </div>
                </div>

                <div className="panel panel-note">
                  <button
                    type="button"
                    className="btn-primary btn-block"
                    onClick={simpanDenah}
                    disabled={denahSaving || denahLoading}
                  >
                    {denahSaving ? "Menyimpan..." : "Simpan Denah"}
                  </button>
                  <button
                    type="button"
                    className="btn-outline btn-block"
                    onClick={() => {
                      if (editEventId !== null) {
                        setView("form");
                      } else {
                        kembaliKeList();
                      }
                    }}
                    disabled={denahSaving}
                  >
                    {editEventId !== null ? "Kembali ke Edit Event" : "Kembali ke Daftar Event"}
                  </button>
                </div>
              </aside>
            </div>
          </section>
        )}

        {/* ================= TAB: KATEGORI TIKET ================= */}
        {tab === "kategori" && !eventAktif && (
          <section>
            <h1 className="title">Kelola Kategori Tiket</h1>
            <p className="desc">
              {loading ? "Memuat event..." : "Belum ada event. Buat event terlebih dahulu di tab Kelola Event."}
            </p>
          </section>
        )}

        {tab === "kategori" && eventAktif && (
          <section>
            <p className="crumb-top">
              EVENT / <span>{eventAktif.judul.toUpperCase()}</span> /{" "}
              <strong>KATEGORI TIKET</strong>
            </p>

            <div className="head-row">
              <div>
                <h1 className="title">Kelola Kategori Tiket</h1>
                <p className="desc">
                  Atur struktur harga, kuota, dan tipe kursi untuk {eventAktif.judul}. Perubahan
                  akan langsung berdampak pada ketersediaan di halaman pemesanan user.
                </p>
              </div>
              <div className="head-actions">
                <button type="button" className="btn-primary" onClick={bukaTambahKategori}>
                  <span aria-hidden="true">+</span> Tambah Kategori
                </button>
              </div>
            </div>

            {/* Pilih event */}
            <div className="field" style={{ maxWidth: 360, marginTop: 16 }}>
              <label className="label" htmlFor="pilih-event">Event</label>
              <select
                id="pilih-event"
                value={aktifId ?? ""}
                onChange={(e) => setEventDipilih(Number(e.target.value))}
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    #{ev.id} - {ev.judul}
                  </option>
                ))}
              </select>
            </div>

            <div className="stats">
              <div className="stat">
                <span className="stat-label">TOTAL KUOTA</span>
                <strong className="stat-val stat-blue">{totalKuota.toLocaleString("id-ID")}</strong>
                <span className="stat-sub">{kategoriList.length} kategori terdaftar</span>
              </div>
              <div className="stat">
                <span className="stat-label">TOTAL TERJUAL</span>
                <strong className="stat-val">{totalTerjual.toLocaleString("id-ID")}</strong>
                <span className="stat-sub stat-sub-blue">
                  {persenTerisi.toFixed(1)}% Terisi
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">SISA SLOT</span>
                <strong className="stat-val stat-brown">{sisaSlot.toLocaleString("id-ID")}</strong>
                <span className="stat-sub">Masih Tersedia</span>
              </div>
              <div className="stat">
                <span className="stat-label">ESTIMASI REVENUE</span>
                <strong className="stat-val">{rupiahRingkas(estimasiRevenue)}</strong>
                <span className="stat-sub">Berdasarkan kategori aktif</span>
              </div>
            </div>

            <div className="table-card">
              <div className="cat-head">
                <div className="cat-head-left">
                  <strong>Daftar Kategori</strong>
                  <span className="pill pill-blue">{jumlahAktif} Aktif</span>
                  <span className="pill">{jumlahNonaktif} Nonaktif</span>
                </div>
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Nama Kategori</th>
                      <th>Harga</th>
                      <th>Kuota</th>
                      <th>Terjual</th>
                      <th>Sisa</th>
                      <th>Status</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kategoriLoading && kategoriList.length === 0 && (
                      <tr>
                        <td colSpan={7} className="empty" role="status">
                          Memuat kategori...
                        </td>
                      </tr>
                    )}
                    {!kategoriLoading && kategoriList.length === 0 && (
                      <tr>
                        <td colSpan={7} className="empty">
                          Belum ada kategori tiket. Klik &quot;Tambah Kategori&quot; untuk membuat.
                        </td>
                      </tr>
                    )}
                    {kategoriList.map((k, i) => {
                      const sisa = k.kuota - k.terjual;
                      return (
                        <tr key={k.id} className={k.status === "Nonaktif" ? "row-off" : ""}>
                          <td>
                            <div className="td-name">
                              <span
                                className="kat-sw"
                                style={{ background: warnaKategori(k.nama, k.warna, i) }}
                                aria-hidden="true"
                              />
                              <div className="td-title">{k.nama}</div>
                            </div>
                          </td>
                          <td className="td-price">{rupiah(k.harga)}</td>
                          <td>{k.kuota.toLocaleString("id-ID")}</td>
                          <td className="td-blue">{k.terjual.toLocaleString("id-ID")}</td>
                          <td className={sisa < 50 ? "td-red" : ""}>
                            {sisa.toLocaleString("id-ID")}
                          </td>
                          <td>
                            <span
                              className={k.status === "Aktif" ? "badge badge-green" : "badge badge-gray"}
                            >
                              {k.status}
                            </span>
                          </td>
                          <td>
                            <div className="actions">
                              <button
                                type="button"
                                className="icon-btn"
                                aria-label={`Edit ${k.nama}`}
                                onClick={() => bukaEditKategori(k)}
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="icon-btn icon-danger"
                                aria-label={`Hapus ${k.nama}`}
                                onClick={() => hapusKategori(k.id)}
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="table-foot">
                <span>
                  MENAMPILKAN {kategoriList.length} DARI {kategoriList.length} KATEGORI
                </span>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* ================= MODAL TAMBAH / EDIT KATEGORI ================= */}
      {modalOpen && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={() => !kSaving && setModalOpen(false)}
        >
          <form className="modal" onSubmit={simpanKategori} noValidate onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 id="modal-title">{editId !== null ? "Edit Kategori Tiket" : "Tambah Kategori Tiket"}</h2>
              <button type="button" aria-label="Tutup" onClick={() => setModalOpen(false)} disabled={kSaving}>
                ×
              </button>
            </div>

            <p className="modal-event">
              Event: <strong>{eventAktif?.judul}</strong>
            </p>

            <div className="field">
              <label className="label" htmlFor="k-nama">Nama Kategori</label>
              <input
                id="k-nama"
                type="text"
                placeholder="Contoh: VIP Premium"
                value={kForm.nama}
                onChange={(e) => {
                  const nama = e.target.value;
                  setKForm({
                    ...kForm,
                    nama,
                    warna: kWarnaManual ? kForm.warna : warnaBawaan(nama) ?? kForm.warna,
                  });
                }}
              />
            </div>

            <div className="two-col">
              <div className="field">
                <label className="label" htmlFor="k-tipe">Tipe</label>
                <select
                  id="k-tipe"
                  value={kForm.tipe}
                  onChange={(e) =>
                    setKForm({ ...kForm, tipe: e.target.value as "Seated" | "Festival" })
                  }
                >
                  <option>Seated</option>
                  <option>Festival</option>
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="k-status">Status</label>
                <select
                  id="k-status"
                  value={kForm.status}
                  onChange={(e) =>
                    setKForm({ ...kForm, status: e.target.value as "Aktif" | "Nonaktif" })
                  }
                >
                  <option>Aktif</option>
                  <option>Nonaktif</option>
                </select>
              </div>
            </div>

            <div className="two-col">
              <div className="field">
                <label className="label" htmlFor="k-harga">Harga (Rp)</label>
                <input
                  id="k-harga"
                  type="number"
                  min={0}
                  placeholder="1250000"
                  value={kForm.harga}
                  onChange={(e) => setKForm({ ...kForm, harga: e.target.value })}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="k-kuota">Kuota</label>
                <input
                  id="k-kuota"
                  type="number"
                  min={1}
                  placeholder="500"
                  value={kForm.kuota}
                  onChange={(e) => setKForm({ ...kForm, kuota: e.target.value })}
                />
              </div>
            </div>

            <div className="field">
              <span className="label" id="k-warna-label">Warna Kategori</span>
              <div className="warna-opsi" role="group" aria-labelledby="k-warna-label">
                {WARNA_OPSI.map((w) => (
                  <button
                    key={w.hex}
                    type="button"
                    className="warna-btn"
                    aria-pressed={kForm.warna.toLowerCase() === w.hex.toLowerCase()}
                    onClick={() => {
                      setKForm({ ...kForm, warna: w.hex });
                      setKWarnaManual(true);
                    }}
                  >
                    <span className="warna-dot" style={{ background: w.hex }} aria-hidden="true" />
                    {w.nama}
                  </button>
                ))}
              </div>

              <div className="warna-custom">
                <label htmlFor="k-warna-custom">Warna lain</label>
                <input
                  id="k-warna-custom"
                  type="color"
                  value={HEX_RE.test(kForm.warna) ? kForm.warna : "#60a5fa"}
                  onChange={(e) => {
                    setKForm({ ...kForm, warna: e.target.value });
                    setKWarnaManual(true);
                  }}
                />
                <code>{kForm.warna.toUpperCase()}</code>
                <span className="warna-preview" style={{ background: kForm.warna }} aria-hidden="true" />
              </div>
            </div>

            {kError && <p className="err">{kError}</p>}

            <div className="modal-actions">
              <button type="button" className="btn-outline" onClick={() => setModalOpen(false)} disabled={kSaving}>
                Batal
              </button>
              <button type="submit" className="btn-primary" disabled={kSaving}>
                {kSaving ? "Menyimpan..." : editId !== null ? "Simpan Perubahan" : "Tambah Kategori"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ================= EDITOR POTONG POSTER ================= */}
      {cropSrc && (
        <PosterCropper
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onDone={selesaiPotong}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}