import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { getStorageItem } from "@/lib/tokenStorage";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactElement } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { captureRef } from "react-native-view-shot";

import { BASE_URL, TOKEN_KEY, api, imageUrl } from "@/lib/api";

/* =====================================================================
 * TEMA (sama dengan halaman login)
 * ===================================================================== */

const COLORS = {
  background: "#FFF7ED",
  brand: "#2B6389",
  accent: "#A1BFD1",
  white: "#FFFFFF",
  line: "#F1E2D0",
  ink: "#3D3028",
  muted: "#6B4C3B",
  placeholder: "#A89A8C",
  error: "#C4372D",
  peach: "#F8D9B4",
  sand: "#F2DDC1",
  sky: "#CFE0EA",
  ok: "#DCEFE0",
  okText: "#2E7D4F",
  bar: "#FDEFDD",
};

const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/** Jumlah event terbaru yang tampil di bagian atas sebelum "Lihat Semua" ditekan. */
const NEWEST_LIMIT = 5;
/** Sisa tiket (total semua kategori) di bawah/sama dengan angka ini dianggap "Hampir Habis". */
const LOW_STOCK = 30;
/** Event dengan status ini tidak ditampilkan di app user. */
const HIDDEN_STATUS = ["draft", "nonaktif", "dibatalkan"];

/* =====================================================================
 * TIPE & HELPER
 * ===================================================================== */

type Genre = string;
type IconName = ComponentProps<typeof Ionicons>["name"];

type Tier = {
  id: string;
  name: string;
  price: number;
  sale: string;
  left: number;
  perks: string;
  icon: IconName;
};

type Artist = {
  /** id artis di tabel artis (dipakai untuk mencocokkan dengan GET /api/artis). */
  id?: string;
  name: string;
  role: string;
  /** Opsional. Jika kosong, ditampilkan inisial nama. */
  photo?: string;
};

type EventItem = {
  id: string;
  title: string;
  subtitle: string;
  artist: string;
  genre: Genre;
  date: string;
  venue: string;
  city: string;
  address: string;
  image: string;
  badge?: "Trending" | "Populer" | "Hampir Habis";
  /** Waktu event dibuat (untuk mengurutkan "terbaru"). */
  createdAt?: string;
  /** Harga terendah dari backend, dipakai kalau daftar tiket tidak ikut terkirim. */
  minPrice?: number;
  salePeriod: string;
  /** Tanggal akhir penjualan (ISO). Dipakai untuk teks "Penjualan berakhir dalam N hari". */
  saleEndsAt?: string;
  lineup: Artist[];
  description: string;
  terms: string;
  refund: string;
  tiers: Tier[];
};

type TransferStatus = "pending" | "accepted" | "rejected" | "cancelled";

type Notif = {
  id: string;
  icon: IconName;
  title: string;
  body: string;
  time: string;
  read: boolean;
  /** Jika diisi, mengetuk notifikasi membuka detail event ini. */
  eventId?: string;
  /** Hanya untuk notifikasi transfer tiket: id baris ticket_transfers. */
  transferId?: string;
  /** Status transfer; selama "pending" tombol Terima / Tolak ditampilkan. */
  transferStatus?: TransferStatus;
  /** id tiket (order_items.id) kalau backend mengirimnya di notifikasi transfer. */
  ticketId?: string;
};

function formatRupiah(n: number) {
  return "Rp " + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function lowestPrice(e: EventItem) {
  return e.tiers.length ? Math.min(...e.tiers.map((t) => t.price)) : e.minPrice ?? 0;
}

function formatDate(v: unknown) {
  if (!v) return "";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function timeAgo(v: unknown) {
  if (!v) return "";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return String(v); // sudah berupa teks, mis. "2 jam lalu"
  const sec = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "Baru saja";
  if (sec < 3600) return `${Math.floor(sec / 60)} menit lalu`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} jam lalu`;
  const days = Math.floor(sec / 86400);
  return days === 1 ? "Kemarin" : `${days} hari lalu`;
}

/**
 * Tanggal akhir penjualan: dari event, atau tanggal akhir terjauh dari semua tiket.
 * NAMA FIELD MASIH TEBAKAN. Cocokkan dengan JSON asli dari GET /api/events.
 */
function pickSaleEnd(r: any, tiers: any[]): string | undefined {
  const fix = (v: any) => {
    const s = String(v);
    // tanggal tanpa jam dianggap berakhir di akhir hari itu
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T23:59:59` : s;
  };
  const pick = (o: any) =>
    o?.penjualan_berakhir ??
    o?.akhir_penjualan ??
    o?.tanggal_akhir_penjualan ??
    o?.sale_end ??
    o?.sale_end_date ??
    o?.tanggal_akhir;

  const own = pick(r);
  if (own) return fix(own);

  const times = tiers
    .map((t) => pick(t))
    .filter(Boolean)
    .map((v) => new Date(fix(v)).getTime())
    .filter((t) => !isNaN(t));
  return times.length ? new Date(Math.max(...times)).toISOString() : undefined;
}

/** Contoh: "Penjualan berakhir dalam 3 hari: 20 Sep 2026". */
function saleLabel(endIso?: string): string | null {
  if (!endIso) return null;
  const end = new Date(endIso);
  if (isNaN(end.getTime())) return null;

  const tgl = end.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  const ms = end.getTime() - Date.now();
  if (ms <= 0) return `Penjualan telah berakhir: ${tgl}`;

  const days = Math.ceil(ms / 86400000);
  const sisa = days <= 1 ? "kurang dari 1 hari" : `${days} hari`;
  return `Penjualan berakhir dalam ${sisa}: ${tgl}`;
}

const BADGES = ["Trending", "Populer", "Hampir Habis"] as const;

/** Urutkan event terbaru dulu: pakai created_at kalau ada, kalau tidak pakai id terbesar. */
function newestFirst(a: EventItem, b: EventItem) {
  const ta = a.createdAt ? Date.parse(a.createdAt) : NaN;
  const tb = b.createdAt ? Date.parse(b.createdAt) : NaN;
  if (!isNaN(ta) && !isNaN(tb) && ta !== tb) return tb - ta;
  const ia = Number(a.id);
  const ib = Number(b.id);
  if (isFinite(ia) && isFinite(ib)) return ib - ia;
  return 0;
}

/** Paksa nilai apa pun jadi array, supaya .map() tidak error jika backend mengirim string/objek/null. */
function toArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    return v
      .split(",")
      .map((s) => ({ nama: s.trim() }))
      .filter((a) => a.nama);
  }
  if (v && typeof v === "object") return Object.values(v);
  return [];
}

/** Elemen artis bisa berupa objek, teks (nama), atau angka (id). Samakan jadi objek. */
function normArtist(a: any): any {
  if (typeof a === "string") return { nama: a.trim() };
  if (typeof a === "number") return { id: a };
  return a ?? {};
}

/** Data artis bisa datang langsung ({nama, foto}) atau bersarang ({artis: {nama, foto}}). */
function artistObj(a: any): any {
  const inner = a?.artis ?? a?.artist;
  return inner && typeof inner === "object" ? inner : a;
}

function artistName(a: any): string {
  const x = artistObj(a);
  return String(x?.nama ?? x?.name ?? x?.nama_artis ?? a?.nama ?? a?.name ?? "");
}

/**
 * Foto artis disimpan di backend/uploads/artis.
 * - URL penuh (http...)         -> dipakai apa adanya
 * - "uploads/artis/xxx.jpg"     -> dipakai apa adanya
 * - "artis/xxx.jpg"             -> diberi awalan "uploads/"
 * - "xxx.jpg" (hanya nama file) -> diarahkan ke "uploads/artis/xxx.jpg"
 */
function artistPhoto(a: any): string | undefined {
  const x = artistObj(a);
  const raw =
    x?.foto ?? x?.photo ?? x?.foto_artis ?? x?.gambar ?? x?.image ?? x?.avatar ??
    a?.foto ?? a?.photo ?? a?.foto_artis ?? a?.gambar ?? a?.image ?? a?.avatar;
  if (typeof raw !== "string" || !raw.trim()) return undefined;

  const v = raw.trim().replace(/\\/g, "/");
  if (/^https?:\/\//i.test(v)) return imageUrl(v) ?? v;

  const clean = v.replace(/^\/+/, "");
  let path: string;
  if (clean.startsWith("uploads/")) path = clean;
  else if (clean.startsWith("artis/")) path = `uploads/${clean}`;
  else if (!clean.includes("/")) path = `uploads/artis/${clean}`;
  else path = clean;

  return imageUrl(path);
}

/** Satu baris dari GET /api/artis (sumber utama nama + foto artis). */
type ArtistRecord = { id: string; name: string; photo?: string };

function toArtistRecord(x: any): ArtistRecord {
  return { id: String(x?.id ?? x?.id_artis ?? ""), name: artistName(x), photo: artistPhoto(x) };
}

/**
 * Lengkapi lineup event dengan data dari tabel artis.
 * Dicocokkan lewat id artis, kalau tidak ada lewat nama (tanpa beda huruf besar/kecil).
 * Nama dan foto dari data artis dipakai untuk melengkapi yang kosong.
 */
function withArtistPhotos(ev: EventItem, directory: ArtistRecord[]): EventItem {
  if (!directory.length || !ev.lineup.length) return ev;
  const byId = new Map<string, ArtistRecord>();
  const byName = new Map<string, ArtistRecord>();
  for (const rec of directory) {
    if (rec.id) byId.set(rec.id, rec);
    if (rec.name) byName.set(rec.name.trim().toLowerCase(), rec);
  }
  return {
    ...ev,
    lineup: ev.lineup.map((a) => {
      const rec = (a.id ? byId.get(a.id) : undefined) ?? byName.get(a.name.trim().toLowerCase());
      if (!rec) return a;
      return { ...a, name: a.name || rec.name, photo: rec.photo ?? a.photo };
    }),
  };
}

/** Ambil nilai pertama yang terisi dari daftar nama field. */
const firstDefined = (o: any, keys: string[]) => {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};

/** Judul event: coba banyak nama field, lalu cari field yang namanya mengandung judul/title/nama event. */
function pickTitle(r: any): string {
  const direct = firstDefined(r, [
    "nama_event", "nama_acara", "judul_event", "judul", "title", "event_name", "nama", "name",
  ]);
  if (typeof direct === "string") return direct;
  const key = Object.keys(r ?? {}).find(
    (k) => /(judul|title|nama_?event|event_?name|nama_?acara)/i.test(k) && typeof r[k] === "string" && r[k]
  );
  return key ? r[key] : "";
}

/** Kategori tiket: coba banyak nama field, lalu cari array yang isinya punya harga/price. */
function pickTiers(r: any): any[] {
  const direct = firstDefined(r, [
    "kategori", "kategori_tiket", "tiers", "ticket_types", "ticket_categories", "tiket", "tickets", "jenis_tiket",
  ]);
  if (direct !== undefined) return toArray(direct);
  const key = Object.keys(r ?? {}).find(
    (k) => Array.isArray(r[k]) && r[k].some((x: any) => x && typeof x === "object" && ("harga" in x || "price" in x))
  );
  return key ? r[key] : [];
}

/** Harga terendah langsung dari event (kalau backend mengirimnya tanpa daftar tiket). */
function pickMinPrice(r: any): number | undefined {
  const v = firstDefined(r, ["harga_terendah", "harga_min", "harga_mulai", "min_price", "starting_price"]);
  const n = Number(v);
  return v !== undefined && isFinite(n) ? n : undefined;
}

/** Pecah "Jakarta • JIExpo Kemayoran" jadi kota + venue. Kalau sudah terpisah, dipakai apa adanya. */
function splitLokasi(r: any): { city: string; venue: string } {
  const raw = r.lokasi ?? r.location ?? "";
  if (typeof raw === "string" && raw.includes("•")) {
    const [city, ...rest] = raw.split("•").map((s: string) => s.trim());
    return { city, venue: rest.join(" • ") };
  }
  return { city: "", venue: typeof raw === "string" ? raw : "" };
}

/**
 * Ubah satu objek event dari backend menjadi EventItem.
 * Pembacaan field dibuat longgar. Cocokkan dengan JSON asli dari GET /api/events bila ada yang masih kosong.
 */
function toEvent(r: any): EventItem {
  const artists: any[] = toArray(r.artis ?? r.artists ?? r.lineup).map(normArtist);
  const tiers: any[] = pickTiers(r);
  const title = pickTitle(r);
  const loc = splitLokasi(r);
  const genreName = r.genre?.nama ?? r.genre?.name ?? r.nama_genre ?? (typeof r.genre === "string" ? r.genre : "");

  const totalLeft = tiers.reduce((sum, t) => sum + Number(t?.sisa ?? t?.stok ?? t?.left ?? 0), 0);
  const badge: EventItem["badge"] = BADGES.includes(r.badge)
    ? r.badge
    : tiers.length > 0 && totalLeft > 0 && totalLeft <= LOW_STOCK
    ? "Hampir Habis"
    : undefined;

  return {
    id: String(r.id),
    title,
    subtitle: r.subtitle ?? title,
    artist: artists[0] ? artistName(artists[0]) : typeof r.artist === "string" ? r.artist : "",
    genre: genreName,
    date: formatDate(r.tanggal ?? r.tanggal_mulai ?? r.date),
    venue: r.venue ?? loc.venue,
    city: r.kota ?? r.city ?? loc.city,
    address: r.alamat ?? r.address ?? "",
    image: imageUrl(r.gambar ?? r.poster ?? r.image) ?? "",
    badge,
    createdAt: r.created_at ?? r.createdAt ?? r.dibuat_pada ?? undefined,
    minPrice: pickMinPrice(r),
    salePeriod: r.periode_penjualan ?? r.salePeriod ?? "",
    saleEndsAt: pickSaleEnd(r, tiers),
    lineup: artists.map((a) => ({
      id: String(a.artis_id ?? a.id_artis ?? a.artist_id ?? artistObj(a)?.id ?? a.id ?? ""),
      name: artistName(a),
      role: a.peran ?? a.role ?? artistObj(a)?.peran ?? artistObj(a)?.role ?? "Vokal",
      photo: artistPhoto(a),
    })),
    description: r.deskripsi ?? r.description ?? "",
    terms: r.syarat ?? r.terms ?? "",
    refund: r.kebijakan_refund ?? r.refund ?? "",
    // PENTING: id tier di sini harus sama dengan yang dicari di pilihTiket.tsx
    // (String(t.id ?? index)), karena id inilah yang dikirim lewat params.
    tiers: tiers.map((t, i) => ({
      id: String(t.id ?? i),
      name: t.nama ?? t.name ?? "",
      price: Number(t.harga ?? t.price ?? 0),
      sale: t.periode ?? t.sale ?? "",
      left: Number(t.sisa ?? t.stok ?? t.left ?? 0),
      perks: t.fasilitas ?? t.perks ?? "",
      icon: "ticket-outline",
    })),
  };
}

/** Ikon notifikasi berdasarkan tipe (kolom `type` di tabel notifications). */
const NOTIF_ICON: Record<string, IconName> = {
  payment: "card-outline",
  event: "calendar-outline",
  refund: "cash-outline",
  wishlist: "heart-outline",
  ticket: "ticket-outline",
  broadcast: "megaphone-outline",
  transfer: "swap-horizontal-outline",
};

/** Tipe notifikasi yang reference_id-nya adalah id event. */
const EVENT_NOTIF_TYPES = ["event", "wishlist"];

const TRANSFER_STATUSES: TransferStatus[] = ["pending", "accepted", "rejected", "cancelled"];

/** Cocok dengan baris mentah dari GET /api/notifikasi/me (tabel notifications + transfer_status). */
function toNotif(x: any): Notif {
  const type = String(x.type ?? x.tipe ?? "");
  const refId = x.reference_id ?? x.event_id;
  const isTransfer = type === "transfer";
  const rawStatus = String(x.transfer_status ?? "pending") as TransferStatus;
  // nama field masih tebakan, cek log [NOTIF] lalu sesuaikan dengan JSON asli
  const rawTicketId = x.ticket_id ?? x.order_item_id ?? x.transfer_ticket_id ?? x.tiket_id;

  return {
    id: String(x.id),
    icon: NOTIF_ICON[type] ?? "notifications-outline",
    title: x.title ?? x.judul ?? "",
    body: x.message ?? x.pesan ?? x.body ?? "",
    time: timeAgo(x.created_at ?? x.waktu ?? x.time),
    // MySQL mengirim is_read sebagai 0/1
    read: !!Number(x.is_read ?? x.dibaca ?? x.read ?? 0),
    eventId:
      !isTransfer && refId && (EVENT_NOTIF_TYPES.includes(type) || x.event_id) ? String(refId) : undefined,
    transferId: isTransfer && refId ? String(refId) : undefined,
    transferStatus: isTransfer ? (TRANSFER_STATUSES.includes(rawStatus) ? rawStatus : "cancelled") : undefined,
    ticketId: isTransfer && rawTicketId ? String(rawTicketId) : undefined,
  };
}

/* =====================================================================
 * HALAMAN HOME (+ detail event ditampilkan di atasnya)
 * ===================================================================== */

const CHIP_PALETTE = [COLORS.accent, COLORS.peach, COLORS.sky];

export default function Home() {
  const router = useRouter();
  const params = useLocalSearchParams<{ event?: string; from?: string }>();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width * 0.7, 300);

  // Data dari API
  const [events, setEvents] = useState<EventItem[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [details, setDetails] = useState<Record<string, EventItem>>({});
  const [artistDir, setArtistDir] = useState<ArtistRecord[]>([]);
  // id event yang ada di wishlist user (dari GET /api/wishlist)
  const [wishIds, setWishIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<string>("Semua");
  const [showAllNewest, setShowAllNewest] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Jika detail dibuka dari halaman lain (mis. Wishlist), tombol kembali mengarah ke sana.
  const [returnTo, setReturnTo] = useState<"wishlist" | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  // notifikasi transfer yang tiketnya mau disimpan sebagai foto
  const [photoNotif, setPhotoNotif] = useState<Notif | null>(null);
  const unreadCount = notifs.filter((it) => !it.read).length;

  const filters = useMemo(() => ["Semua", ...genres], [genres]);

  /* ---------- Ambil data ---------- */

  const loadEvents = useCallback(async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      const raw: any = await api.getEvents();
      const rows: any[] = Array.isArray(raw) ? raw : toArray(raw?.events ?? raw?.rows);
      // Lihat bentuk data asli di terminal Expo, lalu sesuaikan toEvent bila perlu
      console.log("[EVENTS] jumlah:", rows.length, "contoh:", JSON.stringify(rows[0], null, 2));

      // Sembunyikan event yang belum/tidak aktif (kalau backend mengirim field status)
      const visible = rows;
      setEvents(visible.map(toEvent));

      // Daftar event sering tidak membawa kategori tiket: ambil detail tiap event lalu gabungkan.
      Promise.all(
        visible.map((r) =>
          api
            .getEvent(String(r.id))
            .then((d: any) => toEvent({ ...r, ...(d ?? {}) }))
            .catch(() => toEvent(r))
        )
      ).then(setEvents);
    } catch (e: any) {
      setError(e?.message ?? "Gagal memuat data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadNotifs = useCallback(() => {
    api
      .getNotifications()
      .then((list: any) => {
        const rows = Array.isArray(list) ? list : toArray(list?.notifikasi ?? list?.data ?? list?.rows);
        console.log("[NOTIF] contoh:", JSON.stringify(rows[0])); // cek nama field ticket id untuk transfer
        setNotifs(rows.map(toNotif));
      })
      .catch((e: any) => console.warn("[NOTIF] gagal:", e?.message)); // biasanya butuh login
  }, []);

  const loadWishlist = useCallback(() => {
    api
      .getWishlist()
      .then((list) => {
        const rows = Array.isArray(list) ? list : [];
        setWishIds(
          rows.map((x: any) => String(x?.event_id ?? (x?.event && x.event.id) ?? x?.id))
        );
      })
      .catch(() => {}); // butuh login, abaikan jika gagal
  }, []);

  // Sinkronkan ikon hati + notifikasi setiap kali tab Home dibuka lagi
  useFocusEffect(
    useCallback(() => {
      loadWishlist();
      loadNotifs();
    }, [loadWishlist, loadNotifs])
  );

  const toggleWish = (id: string) => {
    const has = wishIds.includes(id);
    setWishIds((l) => (has ? l.filter((x) => x !== id) : [...l, id]));
    (has ? api.removeWishlist(id) : api.addWishlist(id)).catch(() =>
      // gagal di server: kembalikan seperti semula
      setWishIds((l) => (has ? [...l, id] : l.filter((x) => x !== id)))
    );
  };

  useEffect(() => {
    loadEvents();
    loadNotifs();
    // Data artis (nama + foto dari folder uploads/artis) dari GET /api/artis
    api
      .getArtists()
      .then((raw: any) => {
        const rows = Array.isArray(raw) ? raw : toArray(raw?.artis ?? raw?.data ?? raw?.rows);
        console.log("[ARTIS API]", rows.length, JSON.stringify(rows[0]));
        setArtistDir(rows.map(toArtistRecord));
      })
      .catch((e: any) => console.warn("[ARTIS API] gagal:", e?.message));
    api
      .getGenres()
      .then((g) =>
        setGenres(
          (Array.isArray(g) ? g : [])
            .map((x: any) => (typeof x === "string" ? x : x.nama ?? x.name))
            .filter(Boolean)
        )
      )
      .catch(() => {});
  }, [loadEvents, loadNotifs]);

  // Ambil detail lengkap (tiers, lineup) saat sebuah event dibuka.
  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    api
      .getEvent(selectedId)
      .then((r) => {
        if (alive && r) {
          // Cek di terminal Expo: bentuk data artis + URL foto yang dihasilkan
          const ev = toEvent(r);
          console.log("[LINEUP EVENT]", JSON.stringify(r.artis ?? r.artists ?? r.lineup));
          setDetails((prev) => ({ ...prev, [selectedId]: ev }));
        }
      })
      .catch(() => {}); // kalau gagal, tetap pakai data dari daftar
    return () => {
      alive = false;
    };
  }, [selectedId]);

  /* ---------- Turunan ---------- */

  // Lengkapi nama artis di daftar event dari data artis (kalau daftar event tidak membawa nama artis).
  const eventsFull = useMemo(
    () =>
      events.map((e) => {
        const withDir = withArtistPhotos(e, artistDir);
        return { ...withDir, artist: e.artist || withDir.lineup[0]?.name || "" };
      }),
    [events, artistDir]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return eventsFull.filter((e) => {
      const okGenre = genre === "Semua" || e.genre === genre;
      const okQuery =
        !q ||
        e.title.toLowerCase().includes(q) ||
        e.artist.toLowerCase().includes(q) ||
        e.venue.toLowerCase().includes(q) ||
        e.city.toLowerCase().includes(q);
      return okGenre && okQuery;
    });
  }, [eventsFull, query, genre]);

  // Bagian atas: event terbaru
  const newest = useMemo(() => [...filtered].sort(newestFirst), [filtered]);
  const newestShown = showAllNewest ? newest : newest.slice(0, NEWEST_LIMIT);

  const selectedRaw = selectedId
    ? details[selectedId] ?? events.find((e) => e.id === selectedId)
    : undefined;
  const selected = useMemo(
    () => (selectedRaw ? withArtistPhotos(selectedRaw, artistDir) : undefined),
    [selectedRaw, artistDir]
  );

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    if (returnTo === "wishlist") {
      setReturnTo(null);
      router.navigate("/(tabs)/wishlist");
    }
  }, [returnTo, router]);

  // Buka detail jika datang dari halaman lain, contoh:
  // router.navigate({ pathname: "/(tabs)/home", params: { event: "12" } })
  useEffect(() => {
    if (!params.event) return;
    setSelectedId(String(params.event));
    setReturnTo(params.from === "wishlist" ? "wishlist" : null);
    router.setParams({ event: undefined, from: undefined });
  }, [params.event, params.from, router]);

  // Tombol back Android menutup detail, bukan keluar dari tab.
  const detailOpen = !!selected;
  useEffect(() => {
    if (!detailOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeDetail();
      return true;
    });
    return () => sub.remove();
  }, [detailOpen, closeDetail]);

  const openEvent = (e: EventItem) => setSelectedId(e.id);

  // Optimistic update: UI langsung berubah, lalu kirim ke server.
  // Jika gagal, ambil ulang dari server supaya status kembali sesuai database.
  const markRead = (id: string) => {
    setNotifs((list) => list.map((it) => (it.id === id ? { ...it, read: true } : it)));
    api.readNotification(id).catch(() => loadNotifs());
  };

  const markAllRead = () => {
    setNotifs((list) => list.map((it) => ({ ...it, read: true })));
    api.readAllNotifications().catch(() => loadNotifs());
  };

  // Hapus satu notifikasi (DELETE /api/notifikasi/me/:id).
  // Optimistic: item langsung hilang dari daftar. Jika gagal, daftar diambil ulang dari server.
  const deleteNotif = (id: string) => {
    setNotifs((list) => list.filter((it) => it.id !== id));
    api.deleteNotification(id).catch(() => loadNotifs());
  };

  // Jawab transfer tiket dari notifikasi: Terima (PUT /transfer/:id/terima) atau Tolak (PUT /transfer/:id/tolak).
  // Tidak optimistic: status baru dipakai setelah server berhasil, karena transfer yang sudah
  // dibatalkan pengirim atau sudah dijawab akan ditolak server.
  const respondTransfer = async (notifId: string, transferId: string, accept: boolean) => {
    try {
      await (accept ? api.acceptTransfer(transferId) : api.rejectTransfer(transferId));
      setNotifs((list) =>
        list.map((it) =>
          it.id === notifId
            ? { ...it, read: true, transferStatus: accept ? "accepted" : "rejected" }
            : it
        )
      );
      // Setelah diterima, muncul tombol Simpan di notifikasi.
      if (accept) {
        Alert.alert("Tiket diterima", "Ketuk tombol Simpan untuk menyimpan tiket sebagai foto.");
      }
    } catch (e: any) {
      Alert.alert("Gagal memproses", e?.message ?? "Coba lagi nanti.");
      loadNotifs(); // status mungkin sudah berubah (dibatalkan pengirim, dsb.)
    }
  };

  const chipBg = (g: string, i: number) =>
    g === "Semua" ? "transparent" : CHIP_PALETTE[(i - 1) % CHIP_PALETTE.length];

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Stack.Screen options={{ headerShown: false }} />

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                loadEvents(true);
                loadNotifs();
              }}
              tintColor={COLORS.brand}
              colors={[COLORS.brand]}
            />
          }
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.logo}>Encoré</Text>
            <Pressable
              hitSlop={10}
              onPress={() => {
                loadNotifs(); // segarkan daftar setiap kali popup dibuka
                setNotifOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={unreadCount > 0 ? `Notifikasi, ${unreadCount} belum dibaca` : "Notifikasi"}
            >
              <Ionicons name="notifications-outline" size={24} color={COLORS.ink} />
              {unreadCount > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Pencarian */}
          <View style={styles.searchRow}>
            <View style={styles.search}>
              <Ionicons name="search-outline" size={20} color={COLORS.brand} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Cari artis atau event..."
                placeholderTextColor={COLORS.placeholder}
                returnKeyType="search"
                accessibilityLabel="Cari artis atau event"
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityLabel="Hapus pencarian">
                  <Ionicons name="close-circle" size={18} color={COLORS.placeholder} />
                </Pressable>
              )}
            </View>
            <Pressable
              style={styles.filterBtn}
              onPress={() => {
                // TODO: buka filter lanjutan (kota, tanggal, harga)
              }}
              accessibilityRole="button"
              accessibilityLabel="Filter"
            >
              <Ionicons name="filter" size={18} color={COLORS.brand} />
            </Pressable>
          </View>

          {/* Genre */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            keyboardShouldPersistTaps="handled"
          >
            {filters.map((g, i) => {
              const active = g === genre;
              return (
                <Pressable
                  key={g}
                  onPress={() => setGenre(g)}
                  style={[
                    styles.chip,
                    { backgroundColor: chipBg(g, i) },
                    g === "Semua" && styles.chipOutline,
                    active && styles.chipActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{g}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Loading / error */}
          {loading && <ActivityIndicator style={styles.state} color={COLORS.brand} />}
          {!loading && error && (
            <Pressable style={styles.state} onPress={() => loadEvents()} accessibilityRole="button">
              <Ionicons name="cloud-offline-outline" size={30} color={COLORS.accent} />
              <Text style={styles.emptyTitle}>Gagal memuat acara</Text>
              <Text style={styles.emptyText}>{error}</Text>
              <Text style={styles.link}>Ketuk untuk coba lagi</Text>
            </Pressable>
          )}

          {/* Unggulan Minggu Ini = event terbaru */}
          {!loading && !error && newest.length > 0 && (
            <>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Unggulan Minggu Ini</Text>
                {newest.length > NEWEST_LIMIT && (
                  <Pressable hitSlop={8} onPress={() => setShowAllNewest((v) => !v)} accessibilityRole="button">
                    <Text style={styles.link}>{showAllNewest ? "Lebih Sedikit" : "Lihat Semua"}</Text>
                  </Pressable>
                )}
              </View>

              <FlatList
                data={newestShown}
                keyExtractor={(e) => e.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={cardWidth + 14}
                decelerationRate="fast"
                contentContainerStyle={styles.featuredList}
                ItemSeparatorComponent={() => <View style={{ width: 14 }} />}
                renderItem={({ item, index }) => {
                  // Badge dari backend; kalau tidak ada, event paling baru diberi "TERBARU"
                  const label =
                    item.badge && item.badge !== "Hampir Habis"
                      ? item.badge.toUpperCase()
                      : index === 0
                      ? "TERBARU"
                      : null;
                  return (
                    <Pressable
                      style={({ pressed }) => [styles.featured, { width: cardWidth }, pressed && styles.pressed]}
                      onPress={() => openEvent(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.title}, ${item.date}`}
                    >
                      {!!item.image && (
                        <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      )}
                      <View style={styles.featuredShade} />
                      <View style={styles.featuredInfo}>
                        {!!label && (
                          <View style={styles.featuredBadge}>
                            <Text style={styles.featuredBadgeText}>{label}</Text>
                          </View>
                        )}
                        <Text style={styles.featuredTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.featuredSub} numberOfLines={1}>
                          {item.subtitle}
                        </Text>
                        <View style={styles.featuredDate}>
                          <Ionicons name="calendar-outline" size={15} color={COLORS.white} />
                          <Text style={styles.featuredDateText}>{item.date}</Text>
                          <Ionicons
                            name="bookmark-outline"
                            size={16}
                            color={COLORS.white}
                            style={styles.featuredMark}
                          />
                        </View>
                      </View>
                    </Pressable>
                  );
                }}
              />
            </>
          )}

          {/* Jelajahi */}
          {!loading && !error && (
            <>
              <View style={[styles.sectionHead, { marginTop: 32 }]}>
                <Text style={styles.sectionTitle}>Jelajahi Acara</Text>
              </View>

              <View style={styles.list}>
                {filtered.map((e) => (
                  <Pressable
                    key={e.id}
                    style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                    onPress={() => openEvent(e)}
                    accessibilityRole="button"
                    accessibilityLabel={`${e.title}, ${e.venue}, ${e.city}`}
                  >
                    <Image source={{ uri: e.image || undefined }} style={styles.thumb} resizeMode="cover" />

                    <View style={styles.cardBody}>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {e.title}
                      </Text>
                      {!!e.artist && (
                        <Text style={styles.cardArtist} numberOfLines={1}>
                          {e.artist}
                        </Text>
                      )}
                      <Text style={styles.cardVenue} numberOfLines={2}>
                        {e.venue}
                        {e.city ? `, ${e.city}` : ""}
                      </Text>

                      <View style={styles.cardFoot}>
                        <View>
                          <Text style={styles.from}>Mulai dari</Text>
                          <Text style={styles.price}>
                            {lowestPrice(e) > 0 ? formatRupiah(lowestPrice(e)) : "-"}
                          </Text>
                        </View>
                        <View style={styles.buy}>
                          <Text style={styles.buyText}>Beli</Text>
                        </View>
                      </View>
                    </View>

                    {e.badge === "Hampir Habis" && (
                      <View style={styles.cardBadge}>
                        <Text style={styles.cardBadgeText}>Hampir Habis</Text>
                      </View>
                    )}
                  </Pressable>
                ))}

                {filtered.length === 0 && (
                  <View style={styles.empty}>
                    <Ionicons name="musical-notes-outline" size={32} color={COLORS.accent} />
                    <Text style={styles.emptyTitle}>Acara tidak ditemukan</Text>
                    <Text style={styles.emptyText}>Coba kata kunci atau genre lain.</Text>
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      {selected && (
        <View style={StyleSheet.absoluteFill}>
          {/* key: reset state detail (tier terpilih, dll) saat berpindah event */}
          <EventDetail
            key={selected.id}
            event={selected}
            onBack={closeDetail}
            liked={wishIds.includes(selected.id)}
            onToggleLike={() => toggleWish(selected.id)}
          />
        </View>
      )}

      <NotificationPopup
        visible={notifOpen}
        items={notifs}
        onClose={() => setNotifOpen(false)}
        onRead={markRead}
        onReadAll={markAllRead}
        onDelete={deleteNotif}
        onRespondTransfer={respondTransfer}
        onOpenEvent={(id) => {
          setNotifOpen(false);
          setReturnTo(null);
          setSelectedId(id);
        }}
        onSavePhoto={(it) => {
          // tutup popup dulu: dua Modal tidak boleh terbuka bersamaan di iOS
          setNotifOpen(false);
          setPhotoNotif(it);
        }}
      />

      <TicketPhotoModal
        visible={!!photoNotif}
        ticketId={photoNotif?.ticketId}
        hintText={photoNotif ? `${photoNotif.title} ${photoNotif.body}` : ""}
        onClose={() => setPhotoNotif(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingTop: 12, paddingBottom: 36 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  logo: { fontFamily: SERIF, fontSize: 26, fontWeight: "700", color: COLORS.brand },
  bellBadge: {
    position: "absolute",
    top: -5,
    right: -7,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: COLORS.error,
    borderWidth: 1.5,
    borderColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  bellBadgeText: { fontSize: 9.5, fontWeight: "800", color: COLORS.white },

  searchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 24, marginTop: 20 },
  search: {
    flex: 1,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    borderRadius: 25,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.ink, paddingVertical: 10 },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.sky,
    alignItems: "center",
    justifyContent: "center",
  },

  chips: { gap: 12, paddingHorizontal: 24, paddingTop: 20 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 22,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  chipOutline: { borderColor: COLORS.brand },
  chipActive: { borderColor: COLORS.brand },
  chipText: { fontSize: 14, fontWeight: "500", color: COLORS.ink },
  chipTextActive: { fontWeight: "700", color: COLORS.brand },

  state: { alignItems: "center", gap: 6, paddingVertical: 48 },

  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    marginTop: 28,
  },
  sectionTitle: { fontFamily: SERIF, fontSize: 20, fontWeight: "700", color: COLORS.ink },
  link: { fontSize: 13.5, fontWeight: "600", color: COLORS.brand },

  featuredList: { paddingHorizontal: 24, paddingTop: 16 },
  featured: {
    aspectRatio: 4 / 5, // rasio poster 4:5
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: COLORS.accent,
    justifyContent: "flex-end",
  },
  featuredShade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 190,
    backgroundColor: "rgba(30, 20, 14, 0.5)",
  },
  featuredInfo: { padding: 20, gap: 4 },
  featuredBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: COLORS.brand,
    marginBottom: 6,
  },
  featuredBadgeText: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.6, color: COLORS.white },
  featuredTitle: { fontFamily: SERIF, fontSize: 24, fontWeight: "700", color: COLORS.white },
  featuredSub: { fontSize: 14.5, color: "rgba(255,255,255,0.92)" },
  featuredDate: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  featuredDateText: { fontSize: 14, fontWeight: "600", color: COLORS.white },
  featuredMark: { marginLeft: "auto" },

  list: { paddingHorizontal: 24, paddingTop: 18, gap: 22 },
  card: {
    flexDirection: "row",
    gap: 16,
    padding: 14,
    borderRadius: 28,
    backgroundColor: COLORS.white,
    shadowColor: "#8A6A4F",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  thumb: { width: 100, aspectRatio: 4 / 5, borderRadius: 16, backgroundColor: COLORS.accent },
  cardBody: { flex: 1 },
  cardTitle: { fontFamily: SERIF, fontSize: 17, lineHeight: 23, fontWeight: "700", color: COLORS.ink },
  cardArtist: { fontSize: 14.5, fontWeight: "500", color: COLORS.brand, marginTop: 2 },
  cardVenue: { fontSize: 14, lineHeight: 20, color: COLORS.muted, marginTop: 6 },
  cardFoot: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: "auto",
    paddingTop: 8,
  },
  from: { fontSize: 10.5, color: COLORS.placeholder },
  price: { fontSize: 15, fontWeight: "600", color: COLORS.brand },
  buy: {
    minHeight: 38,
    paddingHorizontal: 24,
    borderRadius: 19,
    backgroundColor: COLORS.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  buyText: { fontSize: 14, fontWeight: "700", color: COLORS.white },
  cardBadge: {
    position: "absolute",
    top: -12,
    right: 18,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: COLORS.peach,
  },
  cardBadgeText: { fontSize: 11, fontWeight: "700", color: COLORS.muted },

  empty: { alignItems: "center", gap: 6, paddingVertical: 36 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: COLORS.ink },
  emptyText: { fontSize: 13, color: COLORS.muted, textAlign: "center", paddingHorizontal: 24 },

  pressed: { opacity: 0.88 },
});

/* =====================================================================
 * POP UP NOTIFIKASI
 * ===================================================================== */

const TRANSFER_RESULT: Record<Exclude<TransferStatus, "pending">, string> = {
  accepted: "Kamu menerima tiket ini",
  rejected: "Kamu menolak tiket ini",
  cancelled: "Transfer dibatalkan atau sudah tidak berlaku",
};

function NotificationPopup({
  visible,
  items,
  onClose,
  onRead,
  onReadAll,
  onDelete,
  onOpenEvent,
  onRespondTransfer,
  onSavePhoto,
}: {
  visible: boolean;
  items: Notif[];
  onClose: () => void;
  onRead: (id: string) => void;
  onReadAll: () => void;
  onDelete: (id: string) => void;
  onOpenEvent: (eventId: string) => void;
  /** Mengembalikan Promise supaya tombol bisa menampilkan status "memproses". */
  onRespondTransfer: (notifId: string, transferId: string, accept: boolean) => Promise<void>;
  /** Dipanggil saat tombol "Simpan" di notifikasi transfer yang sudah diterima diketuk. */
  onSavePhoto: (item: Notif) => void;
}) {
  const insets = useSafeAreaInsets();
  const unread = items.filter((it) => !it.read).length;
  // id notifikasi yang sedang menunggu respons server
  const [busyId, setBusyId] = useState<string | null>(null);

  async function respond(it: Notif, accept: boolean) {
    if (!it.transferId || busyId) return;
    setBusyId(it.id);
    try {
      await onRespondTransfer(it.id, it.transferId, accept);
    } finally {
      setBusyId(null);
    }
  }

  // Konfirmasi dulu supaya tidak terketuk tidak sengaja.
  function confirmRespond(it: Notif, accept: boolean) {
    Alert.alert(
      accept ? "Terima tiket ini?" : "Tolak tiket ini?",
      accept
        ? "Tiket akan masuk ke akunmu dan tidak bisa dikembalikan ke pengirim."
        : "Tiket akan tetap menjadi milik pengirim.",
      [
        { text: "Batal", style: "cancel" },
        { text: accept ? "Terima" : "Tolak", style: accept ? "default" : "destructive", onPress: () => respond(it, accept) },
      ]
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={n.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Tutup notifikasi" />
        <View style={[n.card, { marginTop: insets.top + 54 }]}>
          <View style={n.caret} />

          <View style={n.head}>
            <Text style={n.title}>Notifikasi</Text>
            {unread > 0 && (
              <Pressable onPress={onReadAll} hitSlop={8} accessibilityRole="button">
                <Text style={n.readAll}>Tandai semua dibaca</Text>
              </Pressable>
            )}
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Tutup">
              <Ionicons name="close" size={22} color={COLORS.ink} />
            </Pressable>
          </View>

          <ScrollView style={n.list} bounces={false} showsVerticalScrollIndicator={false}>
            {items.map((it) => {
              const isTransfer = !!it.transferId;
              const pending = isTransfer && (it.transferStatus ?? "pending") === "pending";
              const busy = busyId === it.id;
              const accepted = isTransfer && it.transferStatus === "accepted";
              const result =
                isTransfer && !pending ? TRANSFER_RESULT[(it.transferStatus as Exclude<TransferStatus, "pending">) ?? "cancelled"] : null;

              return (
                <View key={it.id} style={[n.row, !it.read && n.rowUnread]}>
                  <Pressable
                    style={({ pressed }) => [n.icon, pressed && n.pressed]}
                    onPress={() => {
                      if (!it.read && !pending) onRead(it.id);
                      if (it.eventId) onOpenEvent(it.eventId);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Buka detail notifikasi"
                  >
                    <Ionicons name={it.icon} size={20} color={COLORS.brand} />
                  </Pressable>
                  <View style={n.rowBody}>
                    <Pressable
                      style={({ pressed }) => [n.rowHeader, pressed && n.pressed]}
                      onPress={() => {
                        // Notifikasi transfer yang belum dijawab tidak ditandai dibaca sebelum dijawab.
                        if (!it.read && !pending) onRead(it.id);
                        if (it.eventId) onOpenEvent(it.eventId);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`${it.title}. ${it.body}. ${it.time}${it.read ? "" : ", belum dibaca"}`}
                    >
                      <Text style={n.rowTitle}>{it.title}</Text>
                      <Text style={n.rowText}>{it.body}</Text>
                    </Pressable>

                    {/* Pilihan Terima / Tolak untuk transfer tiket yang masih menunggu */}
                    {pending && (
                      <View style={n.decide}>
                        <Pressable
                          style={({ pressed }) => [n.btnReject, (pressed || !!busyId) && n.pressed]}
                          onPress={() => confirmRespond(it, false)}
                          disabled={!!busyId}
                          accessibilityRole="button"
                          accessibilityLabel="Tolak transfer tiket"
                        >
                          <Text style={n.btnRejectText}>Tolak</Text>
                        </Pressable>
                        <Pressable
                          style={({ pressed }) => [n.btnAccept, (pressed || !!busyId) && n.pressed]}
                          onPress={() => confirmRespond(it, true)}
                          disabled={!!busyId}
                          accessibilityRole="button"
                          accessibilityLabel="Terima transfer tiket"
                        >
                          {busy ? (
                            <ActivityIndicator size="small" color={COLORS.white} />
                          ) : (
                            <Text style={n.btnAcceptText}>Terima</Text>
                          )}
                        </Pressable>
                      </View>
                    )}

                    {/* Hasil jawaban */}
                    {!!result && (
                      <View style={[n.result, it.transferStatus === "accepted" ? n.resultOk : n.resultNo]}>
                        <Text style={it.transferStatus === "accepted" ? n.resultOkText : n.resultNoText}>
                          {result}
                        </Text>
                      </View>
                    )}

                    {/* Tombol Simpan: hanya untuk transfer yang sudah diterima */}
                    {accepted && (
                      <Pressable
                        style={({ pressed }) => [n.btnPhoto, pressed && n.pressed]}
                        onPress={() => {
                          if (!it.read) onRead(it.id);
                          onSavePhoto(it);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Simpan tiket sebagai foto"
                      >
                        <Ionicons name="download-outline" size={16} color={COLORS.white} />
                        <Text style={n.btnPhotoText}>Simpan</Text>
                      </Pressable>
                    )}

                    <View style={n.rowFoot}>
                      <Text style={n.rowTime}>{it.time}</Text>
                      <View style={n.actions}>
                        {!it.read && !pending && (
                          <Pressable
                            onPress={() => onRead(it.id)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel="Tandai telah dibaca"
                          >
                            <Text style={n.markRead}>Tandai telah dibaca</Text>
                          </Pressable>
                        )}
                        {/* Notifikasi transfer yang belum dijawab tidak bisa dihapus */}
                        {!pending && (
                          <Pressable
                            onPress={() => onDelete(it.id)}
                            hitSlop={10}
                            accessibilityRole="button"
                            accessibilityLabel="Hapus notifikasi"
                          >
                            <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                          </Pressable>
                        )}
                      </View>
                    </View>
                  </View>
                  {!it.read && <View style={n.dot} />}
                </View>
              );
            })}

            {items.length === 0 && (
              <View style={n.empty}>
                <Ionicons name="notifications-off-outline" size={30} color={COLORS.accent} />
                <Text style={n.emptyText}>Belum ada notifikasi</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const n = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(30, 20, 14, 0.4)" },
  card: {
    marginHorizontal: 20,
    maxHeight: "68%",
    borderRadius: 26,
    backgroundColor: COLORS.white,
    paddingTop: 16,
    paddingBottom: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  caret: {
    position: "absolute",
    top: -7,
    right: 26,
    width: 16,
    height: 16,
    backgroundColor: COLORS.white,
    transform: [{ rotate: "45deg" }],
  },
  head: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingBottom: 10 },
  title: { flex: 1, fontFamily: SERIF, fontSize: 19, fontWeight: "700", color: COLORS.ink },
  readAll: { fontSize: 12, fontWeight: "600", color: COLORS.brand },

  list: { flexShrink: 1 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  rowUnread: { backgroundColor: COLORS.background },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.sky,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, gap: 2 },
  rowHeader: { gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: "700", color: COLORS.ink },
  rowText: { fontSize: 12.5, lineHeight: 18, color: COLORS.muted },
  rowFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  rowTime: { fontSize: 11, color: COLORS.placeholder },
  actions: { flexDirection: "row", alignItems: "center", gap: 14 },
  markRead: { fontSize: 11.5, fontWeight: "700", color: COLORS.brand },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.brand, marginTop: 6 },

  /* Terima / Tolak */
  decide: { flexDirection: "row", gap: 10, marginTop: 10 },
  btnAccept: {
    flex: 1,
    minHeight: 38,
    borderRadius: 19,
    backgroundColor: COLORS.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  btnAcceptText: { fontSize: 13.5, fontWeight: "700", color: COLORS.white },
  btnReject: {
    flex: 1,
    minHeight: 38,
    borderRadius: 19,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.error,
    alignItems: "center",
    justifyContent: "center",
  },
  btnRejectText: { fontSize: 13.5, fontWeight: "700", color: COLORS.error },
  result: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  resultOk: { backgroundColor: COLORS.ok },
  resultNo: { backgroundColor: COLORS.sand },
  resultOkText: { fontSize: 12, fontWeight: "700", color: COLORS.okText },
  resultNoText: { fontSize: 12, fontWeight: "700", color: COLORS.muted },

  /* Simpan */
  btnPhoto: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
    minHeight: 38,
    borderRadius: 19,
    backgroundColor: COLORS.brand,
  },
  btnPhotoText: { fontSize: 13.5, fontWeight: "700", color: COLORS.white },

  empty: { alignItems: "center", gap: 8, paddingVertical: 36 },
  emptyText: { fontSize: 13.5, color: COLORS.muted },

  pressed: { opacity: 0.85 },
});

/* =====================================================================
 * DETAIL EVENT
 * ===================================================================== */

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";
}

/** Foto artis bulat; jika kosong / gagal dimuat, tampilkan inisial nama. */
function ArtistAvatar({ name, photo }: { name: string; photo?: string }) {
  const [failed, setFailed] = useState(false);

  if (photo && !failed) {
    return (
      <Image
        source={{ uri: photo }}
        style={d.avatar}
        resizeMode="cover"
        onError={() => setFailed(true)}
        accessibilityLabel={`Foto ${name}`}
      />
    );
  }
  return (
    <View style={d.avatar}>
      <Text style={d.avatarText}>{initials(name)}</Text>
    </View>
  );
}

function EventDetail({
  event,
  onBack,
  liked,
  onToggleLike,
}: {
  event: EventItem;
  onBack: () => void;
  liked: boolean;
  onToggleLike: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [tierId, setTierId] = useState<string | null>(null);
  const [hint, setHint] = useState(false);

  const accordions = [
    { key: "desc", title: "Description", body: event.description },
    { key: "terms", title: "Terms & Conditions", body: event.terms },
    { key: "refund", title: "Refund Policy", body: event.refund },
  ];

  const selected = event.tiers.find((t) => t.id === tierId);
  // Hanya artis yang namanya berhasil didapat (dari event atau dari data artis)
  const lineup = event.lineup.filter((a) => !!a.name);

  // "Penjualan berakhir dalam N hari: <tanggal>", dihitung dari tanggal akhir penjualan.
  // Kalau backend tidak mengirim tanggalnya, pakai teks periode_penjualan apa adanya.
  const saleText = saleLabel(event.saleEndsAt) ?? event.salePeriod;

  function onPickTicket() {
    if (!selected) {
      setHint(true);
      return;
    }
    // Pindah ke halaman pilih tiket (app/tiket/pilihTiket.tsx) membawa event + tier yang dipilih.
    router.push({
      pathname: "/tiket/pilihTiket",
      params: { event: event.id, tier: selected.id, title: event.title },
    });
  }

  function openMaps() {
    const q = encodeURIComponent(`${event.venue} ${event.city}`);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  }

  return (
    // Hanya inset atas: inset bawah sudah ditangani oleh tab bar.
    <SafeAreaView style={d.safe} edges={["top"]}>
      {/* Top bar */}
      <View style={d.topBar}>
        <Pressable style={d.back} onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Kembali">
          <Ionicons name="arrow-back" size={22} color={COLORS.brand} />
        </Pressable>
        <Text style={d.logo}>Encoré</Text>
        <View style={d.back} />
      </View>

      <ScrollView contentContainerStyle={d.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={d.heroWrap}>
          <Image
            source={{ uri: event.image || undefined }}
            style={d.hero}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
          <Pressable
            style={d.like}
            onPress={onToggleLike}
            accessibilityRole="button"
            accessibilityLabel={liked ? "Hapus dari wishlist" : "Tambah ke wishlist"}
            accessibilityState={{ selected: liked }}
          >
            <Ionicons name={liked ? "heart" : "heart-outline"} size={22} color={liked ? COLORS.error : COLORS.brand} />
          </Pressable>
        </View>

        {/* Info utama */}
        <View style={d.titleRow}>
          <Text style={d.title}>{event.title}</Text>
          {!!event.genre && (
            <View style={d.genre}>
              <Text style={d.genreText}>{event.genre}</Text>
            </View>
          )}
        </View>
        <Text style={d.subtitle}>{event.subtitle}</Text>

        <View style={d.dateRow}>
          <Ionicons name="calendar-outline" size={16} color={COLORS.ink} />
          <Text style={d.dateText}>{event.date}</Text>
        </View>

        {!!saleText && (
          <View style={d.sale}>
            <Text style={d.saleText}>{saleText}</Text>
          </View>
        )}

        {/* Lineup */}
        {lineup.length > 0 && (
          <>
            <Text style={d.sectionTitle}>Lineup Artis</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={d.lineup}>
              {lineup.map((a, i) => (
                <View key={`${a.id ?? a.name}-${i}`} style={d.artist}>
                  <ArtistAvatar name={a.name} photo={a.photo} />
                  <Text style={d.artistName} numberOfLines={1}>
                    {a.name}
                  </Text>
                  <Text style={d.artistRole} numberOfLines={1}>
                    {a.role}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {/* Lokasi */}
        <View style={d.venue}>
          <View style={d.venueHead}>
            <Text style={d.venueName}>{event.venue}</Text>
            <View style={d.saved}>
              <Text style={d.savedText}>Seated Venue</Text>
            </View>
          </View>
          <Text style={d.venueAddr}>{event.address}</Text>

          <View style={d.map}>
            <View style={d.mapPark} />
            <View style={[d.mapRoad, { top: "30%", left: -20, right: -20, height: 10, transform: [{ rotate: "-8deg" }] }]} />
            <View style={[d.mapRoad, { top: "62%", left: -20, right: -20, height: 7, transform: [{ rotate: "6deg" }] }]} />
            <View style={[d.mapRoad, { left: "34%", top: -20, bottom: -20, width: 9, transform: [{ rotate: "12deg" }] }]} />
            <View style={[d.mapRoad, { left: "72%", top: -20, bottom: -20, width: 6, transform: [{ rotate: "-10deg" }] }]} />
            <Ionicons name="location" size={34} color={COLORS.brand} style={d.pin} />
            <Pressable style={d.direction} onPress={openMaps} accessibilityRole="button" accessibilityLabel="Get Directions">
              <Ionicons name="navigate" size={14} color={COLORS.white} />
              <Text style={d.directionText}>Get Directions</Text>
            </Pressable>
          </View>
        </View>

        {/* Accordion */}
        <View style={d.accordions}>
          {accordions.map((a) => {
            const isOpen = open === a.key;
            return (
              <View key={a.key} style={d.accordion}>
                <Pressable
                  style={d.accHead}
                  onPress={() => setOpen(isOpen ? null : a.key)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                >
                  <Text style={d.accTitle}>{a.title}</Text>
                  <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={COLORS.ink} />
                </Pressable>
                {isOpen && <Text style={d.accBody}>{a.body || "-"}</Text>}
              </View>
            );
          })}
        </View>

        {/* Tiket */}
        <Text style={[d.sectionTitle, { marginTop: 28 }]}>Available Tiers</Text>
        <View style={d.tiers}>
          {event.tiers.length === 0 && <Text style={d.accBody}>Belum ada tiket tersedia.</Text>}
          {event.tiers.map((t) => {
            const active = t.id === tierId;
            const low = t.left <= 30;
            return (
              <Pressable
                key={t.id}
                style={({ pressed }) => [d.tier, active && d.tierActive, pressed && d.pressed]}
                onPress={() => {
                  setTierId(t.id);
                  setHint(false);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${t.name}, ${formatRupiah(t.price)}, sisa ${t.left} tiket`}
              >
                {/* Nama + harga */}
                <View style={d.tierRow}>
                  <View style={d.tierNameWrap}>
                    <Text style={d.tierName} numberOfLines={1}>
                      {t.name}
                    </Text>
                    {active && <Ionicons name="checkmark-circle" size={20} color={COLORS.brand} />}
                  </View>
                  <Text style={d.tierPrice}>{formatRupiah(t.price).toUpperCase()}</Text>
                </View>

                {/* Periode sale + sisa tiket */}
                <View style={d.tierMeta}>
                  <Text style={d.tierSale}>{t.sale ? `Sale: ${t.sale}` : ""}</Text>
                  <Text style={[d.tierLeft, low && d.tierLeftLow]}>{t.left} left</Text>
                </View>

                {/* Fasilitas (hanya tampil jika ada) */}
                {!!t.perks && (
                  <>
                    <View style={d.divider} />
                    <View style={d.perk}>
                      <Ionicons name={t.icon} size={16} color={COLORS.ink} />
                      <Text style={d.perkText}>{t.perks}</Text>
                    </View>
                  </>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* CTA */}
        {hint && <Text style={d.hint}>Pilih salah satu tiket terlebih dahulu.</Text>}
        <Pressable
          style={({ pressed }) => [d.cta, !selected && d.ctaOff, pressed && d.pressed]}
          onPress={onPickTicket}
          accessibilityRole="button"
        >
          <Text style={d.ctaText}>Pilih Ticket</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const d = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 32 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  back: { width: 40, height: 40, justifyContent: "center" },
  logo: { fontFamily: SERIF, fontSize: 18, fontWeight: "700", color: COLORS.brand },

  heroWrap: { marginTop: 4 },
  hero: { width: "100%", aspectRatio: 4 / 5, borderRadius: 24, backgroundColor: COLORS.accent },
  like: {
    position: "absolute",
    right: 4,
    bottom: -20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },

  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 26 },
  title: { flex: 1, fontFamily: SERIF, fontSize: 24, fontWeight: "700", color: COLORS.ink },
  genre: { paddingHorizontal: 16, paddingVertical: 5, borderRadius: 14, backgroundColor: COLORS.accent },
  genreText: { fontSize: 12.5, fontWeight: "600", color: COLORS.ink },
  subtitle: { fontSize: 15, color: COLORS.ink, marginTop: 2 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  dateText: { fontSize: 14, color: COLORS.ink },
  sale: {
    alignSelf: "flex-start",
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: COLORS.sand,
  },
  saleText: { fontSize: 12.5, color: COLORS.ink },

  sectionTitle: { fontFamily: SERIF, fontSize: 19, fontWeight: "700", color: COLORS.ink, marginTop: 26 },

  lineup: { gap: 22, paddingTop: 14 },
  artist: { width: 76, alignItems: "center", gap: 2 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  avatarText: { fontSize: 18, fontWeight: "700", color: COLORS.brand },
  artistName: { fontSize: 13, fontWeight: "700", color: COLORS.ink, textAlign: "center" },
  artistRole: { fontSize: 11.5, color: COLORS.muted, textAlign: "center" },

  venue: {
    marginTop: 26,
    padding: 18,
    borderRadius: 30,
    backgroundColor: COLORS.sand,
  },
  venueHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  venueName: { flex: 1, fontFamily: SERIF, fontSize: 18, fontWeight: "700", color: COLORS.ink },
  saved: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: COLORS.white },
  savedText: { fontSize: 10.5, fontWeight: "600", color: COLORS.brand },
  venueAddr: { fontSize: 13, lineHeight: 19, color: COLORS.muted, marginTop: 6 },
  map: {
    height: 150,
    marginTop: 14,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#DDE8EC",
  },
  mapPark: {
    position: "absolute",
    left: "46%",
    top: "8%",
    width: "26%",
    height: "42%",
    borderRadius: 12,
    backgroundColor: "#CFE3D0",
  },
  mapRoad: { position: "absolute", backgroundColor: COLORS.white },
  pin: { position: "absolute", left: "52%", top: "30%" },
  direction: {
    position: "absolute",
    right: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: COLORS.brand,
  },
  directionText: { fontSize: 12.5, fontWeight: "700", color: COLORS.white },

  accordions: { marginTop: 18 },
  accordion: { borderBottomWidth: 1, borderBottomColor: COLORS.line },
  accHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 56 },
  accTitle: { fontSize: 15, color: COLORS.muted },
  accBody: { fontSize: 13.5, lineHeight: 21, color: COLORS.muted, paddingBottom: 16 },

  tiers: { gap: 14, paddingTop: 14 },
  tier: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 28,
    backgroundColor: COLORS.sand,
    borderWidth: 2,
    borderColor: "transparent",
    // pastikan isi tidak pernah keluar dari kartu
    overflow: "hidden",
  },
  tierActive: { borderColor: COLORS.brand },
  tierRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  tierNameWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  tierName: { flexShrink: 1, fontSize: 18, color: COLORS.muted },
  tierPrice: { flexShrink: 0, fontSize: 16, color: COLORS.muted },
  tierMeta: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 6,
  },
  // flex: 1 + flexShrink membuat teks periode membungkus, tidak mendorong "left" keluar kartu
  tierSale: { flex: 1, flexShrink: 1, fontSize: 12.5, lineHeight: 18, fontWeight: "700", color: COLORS.ink },
  tierLeft: { flexShrink: 0, fontSize: 12.5, lineHeight: 18, fontWeight: "700", color: COLORS.ink },
  tierLeftLow: { color: COLORS.error },
  divider: { height: 1, backgroundColor: "rgba(107, 76, 59, 0.2)", marginVertical: 12 },
  perk: { flexDirection: "row", alignItems: "center", gap: 8 },
  perkText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: COLORS.ink },

  hint: { fontSize: 12.5, color: COLORS.error, textAlign: "center", marginTop: 20 },
  cta: {
    marginTop: 28,
    minHeight: 56,
    paddingHorizontal: 20,
    borderRadius: 28,
    backgroundColor: COLORS.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaOff: { opacity: 0.85 },
  ctaText: { fontSize: 17, fontWeight: "700", color: COLORS.white },
  pressed: { opacity: 0.88 },
});

/* =====================================================================
 * TIKET HASIL TRANSFER (tampilan sama dengan halaman Tiket) + SIMPAN FOTO
 * ===================================================================== */

const TK_MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const pad2 = (v: number) => String(v).padStart(2, "0");
const ORIGIN = String(BASE_URL).replace(/\/api\/?$/, "").replace(/\/$/, "");

function posterUrl(raw: unknown): string {
  if (!raw) return "";
  const s = String(raw);
  // backend kadang membuat URL dengan "localhost", HP tidak bisa membukanya
  if (/^https?:\/\//i.test(s)) return s.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, ORIGIN);
  if (!s.includes("/")) return `${ORIGIN}/uploads/poster/${s}`;
  return `${ORIGIN}/${s.replace(/^\/+/, "")}`;
}

/** "A3" -> "A-3" */
function seatLabel(code: string) {
  const c = code.replace(/^.*-/, "");
  const m = /^([A-Za-z]+)(\d+)$/.exec(c);
  return m ? `${m[1].toUpperCase()}-${m[2]}` : code;
}

function toDateStr(raw: unknown): string {
  if (!raw) return "";
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return s.slice(0, 10);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function formatEventDate(raw: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(toDateStr(raw));
  if (!m) return "-";
  return `${Number(m[3])} ${TK_MONTHS[Number(m[2]) - 1].slice(0, 3)} ${m[1]}`;
}

function toTimeStr(rawTime: unknown, rawDate: unknown): string {
  if (rawTime) {
    const m = /^(\d{2}):(\d{2})/.exec(String(rawTime));
    return m ? `${m[1]}:${m[2]} WIB` : String(rawTime);
  }
  const s = String(rawDate ?? "");
  if (/\d{2}:\d{2}/.test(s)) {
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())} WIB`;
  }
  return "-";
}

/** Ambil nilai pertama yang terisi dari beberapa kemungkinan nama kolom. */
function pickAny(r: any, keys: string[]): any {
  for (const k of keys) {
    const v = r?.[k];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "object" && (!Array.isArray(v) || v.some((x) => x && typeof x === "object"))) continue;
    return v;
  }
  return undefined;
}

/** Ratakan objek bersarang (mis. { event: { judul } }) supaya field-nya bisa dibaca langsung. */
function flatten(r: any, depth = 0, out: Record<string, any> = {}): Record<string, any> {
  if (!r || typeof r !== "object" || Array.isArray(r) || depth > 2) return out;
  const nested: any[] = [];
  for (const [k, v] of Object.entries(r)) {
    if (v && typeof v === "object" && !Array.isArray(v)) nested.push(v);
    else if (!(k in out) || out[k] === null || out[k] === undefined || out[k] === "") out[k] = v;
  }
  nested.forEach((x) => flatten(x, depth + 1, out));
  return out;
}

type ShotTicket = {
  id: string;
  code: string;
  invoice: string;
  title: string;
  subtitle: string;
  date: string;
  time: string;
  venue: string;
  area: string;
  category: string;
  seat: string;
  holder: string;
  image: string;
  /** Tiket yang sudah dipakai / dibatalkan / ditransfer lagi tidak dipilih. */
  inactive: boolean;
};

function mapShotTicket(raw: any): ShotTicket {
  const r = flatten(raw);
  const orderId = String(pickAny(r, ["order_id", "orderId", "pesanan_id"]) ?? "");
  const rowId = String(pickAny(r, ["order_item_id", "orderItemId", "id"]) ?? `${orderId}-${Math.random()}`);
  const title = String(pickAny(r, ["judul", "event_name", "event_title", "eventName", "nama_event", "title", "event"]) ?? "Konser");
  const artistRaw = pickAny(r, ["artis", "artist_name", "artist", "artists", "subtitle"]);
  const subtitle = Array.isArray(artistRaw) ? artistRaw.join(", ") : String(artistRaw ?? title);
  const dateRaw = pickAny(r, ["event_date", "start_date", "tanggal_iso", "tanggal", "date", "event_datetime"]);

  const sr = pickAny(r, ["seat_row", "row_label", "baris"]);
  const sn = pickAny(r, ["seat_number", "seat_no", "nomor"]);
  let seatRaw = pickAny(r, ["kursi", "nomor_kursi", "seat_label", "seat_code", "seat_name", "seat"]);
  if (!seatRaw && sr && sn) seatRaw = `${sr}${sn}`;
  if (!seatRaw && sn) seatRaw = sn;

  const ts = String(pickAny(r, ["statusTiket", "ticket_status", "status_tiket", "status"]) ?? "active").toLowerCase();

  return {
    id: rowId,
    code: String(pickAny(r, ["qr", "qr_code", "qrCode", "kode", "code"]) ?? `ENC-${rowId}`),
    invoice: String(pickAny(r, ["invoice_number", "invoice", "no_invoice"]) ?? `ENC-${orderId || rowId}`),
    title,
    subtitle,
    date: formatEventDate(dateRaw),
    time: toTimeStr(pickAny(r, ["waktu", "event_time", "start_time", "jam", "time"]), dateRaw),
    venue: String(pickAny(r, ["venue", "venue_name", "nama_venue", "lokasi"]) ?? "-"),
    area: String(pickAny(r, ["kota", "venue_city", "city", "alamat", "address", "location"]) ?? ""),
    category: String(
      pickAny(r, ["kategori_tiket", "ticket_type_name", "jenis_tiket", "tipe_tiket", "ticket_type", "category", "type_name", "kategori"]) ?? "-"
    ),
    seat: seatRaw ? `Kursi ${seatLabel(String(seatRaw))}` : "Standing",
    holder: String(pickAny(r, ["pemesan", "buyer_name", "user_name", "holder_name", "holder", "customer_name"]) ?? "-"),
    image: posterUrl(pickAny(r, ["poster", "poster_url", "gambar", "image", "image_url", "foto", "banner", "cover"])),
    inactive: ["used", "expired", "cancelled", "canceled", "refunded", "transferred"].includes(ts),
  };
}

/* ---------- QR placeholder (sama dengan halaman Tiket) ---------- */

function hashSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildQR(value: string, size = 25) {
  const rand = rng(hashSeed(value));
  const m: boolean[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => rand() > 0.5));
  const finder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        if (!inside) {
          m[rr][cc] = false;
          continue;
        }
        const ring = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        m[rr][cc] = ring || core;
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);
  return m;
}

function QRPlaceholder({ value, box = 132 }: { value: string; box?: number }) {
  const m = useMemo(() => buildQR(value), [value]);
  const cell = box / m.length;
  const runs: ReactElement[] = [];
  m.forEach((row, r) => {
    let start = -1;
    row.forEach((on, c) => {
      if (on && start < 0) start = c;
      const last = c === row.length - 1;
      if (start >= 0 && (!on || last)) {
        const end = on ? c + 1 : c;
        runs.push(
          <View
            key={`${r}-${start}`}
            style={{
              position: "absolute",
              left: start * cell,
              top: r * cell,
              width: (end - start) * cell,
              height: cell,
              backgroundColor: COLORS.ink,
            }}
          />
        );
        start = -1;
      }
    });
  });
  return (
    <View style={{ width: box, height: box, backgroundColor: COLORS.white }} accessible accessibilityLabel={`QR code tiket ${value}`}>
      {runs}
    </View>
  );
}

/* ---------- Modal tiket + tombol simpan foto ---------- */

function TicketPhotoModal({
  visible,
  ticketId,
  hintText,
  onClose,
}: {
  visible: boolean;
  ticketId?: string;
  hintText: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState<ShotTicket | null>(null);
  const [saving, setSaving] = useState(false);
  const shotRef = useRef<View>(null);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setLoading(true);
    setError("");
    setTicket(null);

    (async () => {
      try {
        const token = await getStorageItem(TOKEN_KEY);
        const res = await fetch(`${BASE_URL}/checkout/tiket`, {
          headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.message ?? `Error ${res.status}`);
        const rows = Array.isArray(json) ? json : json?.data ?? json?.tickets ?? json?.items ?? [];
        if (!Array.isArray(rows)) throw new Error("Format data tiket tidak dikenali.");

        const list = rows.map(mapShotTicket).filter((x) => !x.inactive);
        if (list.length === 0) throw new Error("Tiket belum ditemukan di akunmu.");

        // 1) id tiket dari notifikasi, 2) judul event di teks notifikasi, 3) tiket terbaru
        const hint = hintText.toLowerCase();
        const found =
          (ticketId ? list.find((x) => x.id === String(ticketId)) : undefined) ??
          list.find((x) => x.title && x.title !== "Konser" && hint.includes(x.title.toLowerCase())) ??
          [...list].sort((a, b) => Number(b.id) - Number(a.id))[0];

        if (alive) setTicket(found);
      } catch (e: any) {
        if (alive) setError(e?.message ?? "Gagal memuat tiket.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [visible, ticketId, hintText]);

  /** Ambil gambar dari tampilan tiket lalu buka menu bagikan/simpan bawaan HP. */
  async function saveAsPhoto() {
    if (saving || !ticket) return;
    setSaving(true);
    try {
      const uri = await captureRef(shotRef, { format: "png", quality: 1, result: "tmpfile" });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Tidak didukung", "Perangkat ini tidak mendukung menu bagikan.");
        return;
      }
      // Di menu ini pilih "Simpan ke galeri / Foto / File", atau kirim lewat WhatsApp dll.
      await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: `Tiket ${ticket.title}` });
    } catch (e: any) {
      Alert.alert("Gagal menyimpan", e?.message ?? "Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  const fields = ticket
    ? [
        { label: "KATEGORI", value: ticket.category },
        { label: "NOMOR KURSI", value: ticket.seat },
        { label: "PEMILIK", value: ticket.holder },
        { label: "NO. INVOICE", value: ticket.invoice },
      ]
    : [];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={tk.safe} edges={["top", "bottom"]}>
        <View style={tk.bar}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Tutup">
            <Ionicons name="close" size={24} color={COLORS.brand} />
          </Pressable>
          <Text style={tk.barTitle}>Tiket Diterima</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={tk.scroll} showsVerticalScrollIndicator={false}>
          {loading && (
            <View style={tk.state}>
              <ActivityIndicator color={COLORS.brand} />
              <Text style={tk.stateText}>Memuat tiketmu...</Text>
            </View>
          )}

          {!loading && !!error && (
            <View style={tk.state}>
              <Ionicons name="alert-circle-outline" size={32} color={COLORS.error} />
              <Text style={tk.stateText}>{error}</Text>
            </View>
          )}

          {!loading && ticket && (
            <>
              {/* Bagian yang difoto: tiket + sedikit ruang di sekelilingnya */}
              <View ref={shotRef} collapsable={false} style={tk.shot}>
                <View style={tk.ticket}>
                  {!!ticket.image && (
                    <Image source={{ uri: ticket.image }} style={tk.poster} resizeMode="cover" accessibilityLabel={`Poster ${ticket.title}`} />
                  )}

                  <View style={tk.top}>
                    <Text style={tk.scan}>PINDAI DI PINTU MASUK</Text>
                    <View style={tk.qrFrame}>
                      <QRPlaceholder value={ticket.code} />
                    </View>
                    <Text style={tk.code}>ID: {ticket.code}</Text>
                  </View>

                  {/* Perforasi */}
                  <View style={tk.perfRow}>
                    <View style={[tk.notch, { left: -12 }]} />
                    <View style={tk.dashClip}>
                      <View style={tk.dash} />
                    </View>
                    <View style={[tk.notch, { right: -12 }]} />
                  </View>

                  <View style={tk.bottom}>
                    <Text style={tk.title}>{ticket.title}</Text>
                    <Text style={tk.sub}>{ticket.subtitle}</Text>

                    <View style={tk.infoRow}>
                      <Ionicons name="calendar-outline" size={18} color={COLORS.ink} />
                      <Text style={tk.infoText}>
                        {ticket.date} • {ticket.time}
                      </Text>
                    </View>
                    <View style={tk.infoRow}>
                      <Ionicons name="location-outline" size={18} color={COLORS.ink} />
                      <View>
                        <Text style={tk.infoText}>{ticket.venue}</Text>
                        {!!ticket.area && <Text style={tk.infoSmall}>{ticket.area}</Text>}
                      </View>
                    </View>

                    <View style={tk.divider} />

                    <View style={tk.grid}>
                      {fields.map((f) => (
                        <View key={f.label} style={tk.cell}>
                          <Text style={tk.cellLabel}>{f.label}</Text>
                          <Text style={tk.cellValue}>{f.value}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View style={tk.stripe} />
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [tk.primary, pressed && tk.pressed, saving && tk.primaryBusy]}
                onPress={saveAsPhoto}
                disabled={saving}
                accessibilityRole="button"
                accessibilityState={{ disabled: saving, busy: saving }}
                accessibilityLabel="Simpan tiket sebagai foto"
              >
                {saving ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={17} color={COLORS.white} />
                    <Text style={tk.primaryText}>Simpan / Bagikan Tiket (Foto)</Text>
                  </>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const TK_NOTCH = 24;

const tk = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: 24, paddingTop: 26, paddingBottom: 36 },

  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: COLORS.bar,
    shadowColor: "#8A6A4F",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  barTitle: { fontSize: 19, fontWeight: "600", color: COLORS.ink },

  state: { alignItems: "center", gap: 10, paddingVertical: 60 },
  stateText: { fontSize: 13.5, color: COLORS.muted, textAlign: "center" },

  // Warna latar sama dengan halaman supaya sudut & takikan tiket menyatu di foto;
  // margin negatif mengimbangi padding agar tata letak di layar tidak bergeser.
  shot: { backgroundColor: COLORS.background, padding: 12, margin: -12 },

  ticket: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: COLORS.white,
    shadowColor: "#8A6A4F",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  poster: { width: "100%", height: 180, backgroundColor: COLORS.accent },
  top: { alignItems: "center", paddingTop: 28, paddingBottom: 22, paddingHorizontal: 20 },
  scan: { fontSize: 10.5, fontWeight: "600", letterSpacing: 1.8, color: COLORS.muted },
  qrFrame: { marginTop: 14, padding: 10, backgroundColor: COLORS.sand },
  code: { fontSize: 12.5, color: COLORS.muted, marginTop: 14 },

  perfRow: { height: TK_NOTCH, justifyContent: "center" },
  notch: {
    position: "absolute",
    top: 0,
    width: TK_NOTCH,
    height: TK_NOTCH,
    borderRadius: TK_NOTCH / 2,
    backgroundColor: COLORS.background,
  },
  dashClip: { height: 1, overflow: "hidden", marginHorizontal: 20 },
  dash: { height: 2, borderWidth: 1, borderStyle: "dashed", borderColor: COLORS.line, borderRadius: 1 },

  bottom: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 22 },
  title: { fontFamily: SERIF, fontSize: 26, fontWeight: "700", color: COLORS.brand },
  sub: { fontSize: 14.5, color: COLORS.muted, marginTop: 4 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 16 },
  infoText: { fontSize: 14, color: COLORS.ink, lineHeight: 20 },
  infoSmall: { fontSize: 12, color: COLORS.muted, marginTop: 2 },

  divider: { height: 1, backgroundColor: COLORS.line, marginTop: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 18, marginTop: 18 },
  cell: { width: "50%", gap: 4 },
  cellLabel: { fontSize: 10, fontWeight: "600", letterSpacing: 1, color: COLORS.placeholder },
  cellValue: { fontSize: 14.5, fontWeight: "600", color: COLORS.ink },

  stripe: { height: 7, backgroundColor: COLORS.accent },

  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 34,
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: COLORS.brand,
  },
  primaryBusy: { opacity: 0.7 },
  primaryText: { fontSize: 14.5, fontWeight: "600", color: COLORS.white },
  pressed: { opacity: 0.88 },
});