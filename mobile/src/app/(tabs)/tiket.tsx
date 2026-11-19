import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { captureRef } from "react-native-view-shot";

import { BASE_URL, TOKEN_KEY } from "@/lib/api";
import RatingScreen, { type RatingData } from "../tiket/rating";
import RefundList, {
  RefundForm,
  refundAmount,
  type RefundData,
  type RefundRecord,
} from "../tiket/refund";
import TransferFlow, { type TransferData, type TransferRecord } from "../tiket/transfer";

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
  bar: "#FDEFDD",
};

const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/* =====================================================================
 * DATA TIKET (diambil dari backend: GET /checkout/tiket)
 * ===================================================================== */

type Ticket = {
  id: string;
  /** Id pesanan, dipakai supaya tiket sementara tidak dobel dengan data dari server. */
  orderId?: string;
  /** Id event, dipakai untuk melengkapi venue/kota/poster dari GET /events/:id */
  eventId?: string;
  /** True jika pesanan dibuat tapi bukti bayar belum pernah diunggah (checkout ditinggalkan). */
  abandoned?: boolean;
  /** Isi QR code & teks "ID: ..." */
  code: string;
  invoice: string;
  title: string;
  subtitle: string;
  day: string;
  month: string;
  date: string;
  time: string;
  venue: string;
  area: string;
  category: string;
  seat: string;
  holder: string;
  status: "active" | "done";
  /** URL poster event (kosong = tidak ada poster). */
  image: string;
  /** Harga tiket (rupiah), dipakai untuk estimasi refund */
  price: number;
  /** True jika pesanan tiket ini punya pengajuan refund yang menunggu verifikasi admin. */
  refundRequested?: boolean;
  /** True jika bukti bayar sudah dikirim tapi belum diverifikasi admin. */
  pending?: boolean;
  /** True jika admin menolak pembayaran. */
  rejected?: boolean;
  /** Contoh: "Sabtu, 24 Oktober 2026" */
  fullDate: string;
  // Diisi setelah pengguna mengirim review
  rating?: number;
  review?: string;
  photos?: string[];
  /** Diisi jika tiket ini sudah ditransfer ke pengguna lain. */
  transferredTo?: string;
};

const INITIAL_TRANSFERS: TransferRecord[] = [
  { id: "tr-1", name: "Chika", date: "15 September, 14:30 WIB", status: "Diterima" },
];

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const pad2 = (n: number) => String(n).padStart(2, "0");

function formatNow() {
  const n = new Date();
  return `${n.getDate()} ${MONTHS[n.getMonth()]}, ${pad2(n.getHours())}:${pad2(n.getMinutes())} WIB`;
}

/* =====================================================================
 * HELPER FORMAT
 * ===================================================================== */

// Alamat server tanpa "/api", dipakai untuk poster yang disimpan sebagai path (mis. uploads/events/a.jpg)
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

/** "2026-10-24" -> potongan tanggal untuk kartu & detail tiket. */
function parseEventDate(raw: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return { day: "-", month: "-", date: "-", fullDate: "-" };
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const dd = Number(m[3]);
  const dt = new Date(y, mo, dd);
  return {
    day: String(dd).padStart(2, "0"),
    month: MONTHS[mo].slice(0, 3).toUpperCase(),
    date: `${dd} ${MONTHS[mo].slice(0, 3)} ${y}`,
    fullDate: `${DAYS[dt.getDay()]}, ${dd} ${MONTHS[mo]} ${y}`,
  };
}

/** Tanggal dari server (bisa "2026-10-24" atau ISO "2026-10-23T17:00:00.000Z") -> "YYYY-MM-DD" waktu lokal. */
function toDateStr(raw: unknown): string {
  if (!raw) return "";
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const id = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(s);
  if (id) {
    const mi = MONTHS.findIndex((m) => m.toLowerCase() === id[2].toLowerCase() || m.slice(0, 3).toLowerCase() === id[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return `${id[3]}-${pad2(mi + 1)}-${pad2(Number(id[1]))}`;
  }
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return s.slice(0, 10);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/** Jam dari kolom waktu ("19:30:00") atau dari datetime; hasil "19:30 WIB". */
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
function pick(r: any, keys: string[]): any {
  for (const k of keys) {
    const v = r?.[k];
    if (v === undefined || v === null || v === "") continue;
    // objek / array berisi objek tidak bisa ditampilkan sebagai teks
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
  nested.forEach((n) => flatten(n, depth + 1, out));
  return out;
}

/* Nilai status dari backend. Kalau backend kamu memakai kata lain, tambahkan di sini. */
const PAID = ["paid", "success", "settlement", "verified", "approved", "confirmed", "completed", "lunas", "berhasil", "diterima", "disetujui"];
const REJECTED = ["rejected", "failed", "declined", "ditolak", "gagal", "expired", "cancelled", "canceled"];

/** Ubah satu baris dari GET /checkout/tiket menjadi Ticket. */
function mapApiTicket(raw: any): Ticket {
  const r = flatten(raw);

  const orderId = String(pick(r, ["order_id", "orderId", "pesanan_id"]) ?? "");
  const rowId = String(pick(r, ["order_item_id", "orderItemId", "id"]) ?? `${orderId}-${Math.random()}`);

  const title = String(pick(r, ["judul", "event_name", "event_title", "eventName", "nama_event", "title", "event"]) ?? "Konser");
  const artistRaw = pick(r, ["artis", "artist_name", "artist", "artists", "subtitle"]);
  const subtitle = Array.isArray(artistRaw) ? artistRaw.join(", ") : String(artistRaw ?? title);

  const dateRaw = pick(r, ["event_date", "start_date", "tanggal_iso", "tanggal", "date", "event_datetime"]);
  const d = parseEventDate(toDateStr(dateRaw));
  const time = toTimeStr(pick(r, ["waktu", "event_time", "start_time", "jam", "time"]), dateRaw);

  const sr = pick(r, ["seat_row", "row_label", "baris"]);
  const sn = pick(r, ["seat_number", "seat_no", "nomor"]);
  let seatRaw = pick(r, ["kursi", "nomor_kursi", "seat_label", "seat_code", "seat_name", "seat"]);
  if (!seatRaw && sr && sn) seatRaw = `${sr}${sn}`;
  if (!seatRaw && sn) seatRaw = sn;

  const ts = String(pick(r, ["statusTiket", "ticket_status", "status_tiket", "status"]) ?? "active").toLowerCase();
  const done = ["used", "expired", "cancelled", "canceled", "refunded", "transferred"].includes(ts);
  const ps = String(pick(r, ["statusBayar", "payment_status"]) ?? "").toLowerCase();
  const os = String(pick(r, ["statusPesanan", "order_status"]) ?? "").toLowerCase();
  console.log("[TIKET] status bayar/pesanan/tiket:", ps, os, ts); // hapus kalau sudah beres

  const states = [ps, os].filter(Boolean);
  const isPaid = states.some((s) => PAID.includes(s));
  const isRejected = !isPaid && states.some((s) => REJECTED.includes(s));
  const pending = !isPaid && !isRejected && states.length > 0;

  const transferredTo = pick(r, ["transferred_to_name", "transferredTo"]);
  const eventId = String(raw?.event?.id ?? raw?.eventId ?? raw?.event_id ?? "");
  // "bukti" ada di data tapi kosong = bukti bayar belum pernah diunggah
  const noProof = "bukti" in r && !pick(r, ["bukti", "bukti_bayar", "proof"]);

  return {
    id: rowId,
    orderId,
    code: String(pick(r, ["qr", "qr_code", "qrCode", "kode", "code"]) ?? `ENC-${rowId}`),
    invoice: String(pick(r, ["invoice_number", "invoice", "no_invoice"]) ?? `ENC-${orderId || rowId}`),
    title,
    subtitle,
    day: d.day,
    month: d.month,
    date: d.date,
    fullDate: d.fullDate,
    time,
    venue: String(pick(r, ["venue", "venue_name", "nama_venue", "lokasi"]) ?? "-"),
    area: String(pick(r, ["kota", "venue_city", "city", "alamat", "address", "location"]) ?? ""),
    category: String(
      pick(r, ["kategori_tiket", "ticket_type_name", "jenis_tiket", "tipe_tiket", "ticket_type", "category", "type_name", "kategori"]) ?? "-"
    ),
    seat: seatRaw ? `Kursi ${seatLabel(String(seatRaw))}` : "Standing",
    holder: String(pick(r, ["pemesan", "buyer_name", "user_name", "holder_name", "holder", "customer_name"]) ?? "-"),
    image: posterUrl(pick(r, ["poster", "poster_url", "gambar", "image", "image_url", "foto", "banner", "cover"])),
    price: Number(pick(r, ["price", "harga", "unit_price"])) || 0,
    status: done || isRejected ? "done" : "active",
    pending: !done && pending,
    rejected: isRejected,
    eventId: eventId || undefined,
    abandoned: !done && pending && noProof,
    transferredTo: transferredTo ? String(transferredTo) : ts === "transferred" ? "pengguna lain" : undefined,
  };
}

/* =====================================================================
 * TIKET SEMENTARA DARI PESANAN (dikirim halaman payment lewat params)
 * Dipakai supaya tiket langsung muncul sebelum data server selesai dimuat.
 * ===================================================================== */

type OrderParams = {
  newOrder?: string;
  event?: string;
  tier?: string;
  seats?: string;
  name?: string;
  subtotal?: string;
  total?: string;
  date?: string;
  time?: string;
  venue?: string;
  area?: string;
  image?: string;
};

/** Satu kursi = satu tiket. Tanpa kursi (festival/standing) = satu tiket. */
function buildTicketsFromOrder(p: OrderParams): Ticket[] {
  const orderId = String(p.newOrder ?? "");
  const seatList = p.seats ? String(p.seats).split(",").filter(Boolean) : [];
  const slots = seatList.length ? seatList : [""];

  const subtotal = Number(p.subtotal) || 0;
  const total = Number(p.total) || 0;
  const perTicket = Math.round((subtotal > 0 ? subtotal : total) / slots.length);

  const title = p.event ? String(p.event) : "Konser";
  const d = parseEventDate(p.date ? String(p.date) : "");

  return slots.map((s) => {
    const suffix = s ? seatLabel(s) : "";
    return {
      id: suffix ? `${orderId}-${suffix}` : orderId,
      orderId,
      code: suffix ? `ENC-${orderId}-${suffix}` : `ENC-${orderId}`,
      invoice: `ENC-${orderId}`,
      title,
      subtitle: title,
      day: d.day,
      month: d.month,
      date: d.date,
      fullDate: d.fullDate,
      time: p.time ? String(p.time) : "-",
      venue: p.venue ? String(p.venue) : "-",
      area: p.area ? String(p.area) : "",
      category: p.tier ? String(p.tier) : "-",
      seat: suffix ? `Kursi ${suffix}` : "Standing",
      holder: p.name ? String(p.name) : "-",
      image: posterUrl(p.image),
      price: perTicket,
      status: "active" as const,
      pending: true,
    };
  });
}

/* =====================================================================
 * QR CODE (placeholder visual)
 * Tampilan saja, belum bisa dipindai. Untuk QR sungguhan:
 *   npx expo install react-native-qrcode-svg react-native-svg
 *   <QRCode value={ticket.code} size={132} />
 * ===================================================================== */

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
  const m: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => rand() > 0.5)
  );
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
    <View
      style={{ width: box, height: box, backgroundColor: COLORS.white }}
      accessible
      accessibilityLabel={`QR code tiket ${value}`}
    >
      {runs}
    </View>
  );
}

/* =====================================================================
 * HALAMAN TIKET (+ detail E-Ticket ditampilkan di atasnya)
 * ===================================================================== */

type Tab = "active" | "done";

/* Tiket yang sudah ditransfer disimpan di HP { idTiket: namaPenerima } supaya tetap
 * ada di Riwayat setelah aplikasi ditutup / data dimuat ulang dari server. */
const TRANSFER_KEY = "encore_transferred";

async function readTransferred(): Promise<Record<string, string>> {
  try {
    const raw = await SecureStore.getItemAsync(TRANSFER_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

async function saveTransferred(ticketId: string, name: string) {
  try {
    const cur = await readTransferred();
    cur[ticketId] = name;
    await SecureStore.setItemAsync(TRANSFER_KEY, JSON.stringify(cur));
  } catch {
    // gagal menyimpan: tiket tetap pindah ke Riwayat selama aplikasi terbuka
  }
}

/* =====================================================================
 * REFUND DARI BACKEND
 * Refund di backend dihitung per PESANAN (order), bukan per tiket.
 *   POST   /refund              ajukan refund  { orderId, alasan }
 *   GET    /refund/saya         daftar refund milik user
 *   DELETE /refund/saya/:id     batalkan / hapus refund milik user
 * (GET /refund dan DELETE /refund/:id adalah route admin.)
 * ===================================================================== */

const REFUND_PATH = "/refund";
const MY_REFUND_PATH = "/refund/saya";

/** fetch ke backend dengan token login; melempar Error berisi pesan server jika gagal. */
async function authFetch(path: string, init: RequestInit = {}): Promise<any> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.message ?? `Error ${res.status}`);
  return json;
}

/** Ubah satu baris refund dari GET /refund/saya menjadi RefundRecord. */
function mapApiRefund(raw: any): RefundRecord | null {
  const id = raw?.id;
  if (id === undefined || id === null) return null;

  const kode = String(raw?.statusKode ?? "").toLowerCase();
  let status: RefundRecord["status"] = "Diproses";
  if (kode === "approved" || kode === "completed") status = "Disetujui";
  else if (kode === "rejected") status = "Ditolak";

  return {
    id: String(id),
    orderId: String(raw.orderId ?? ""),
    title: String(raw.event ?? "Tiket"),
    invoice: String(raw.invoice ?? `ENC-${raw.orderId ?? id}`),
    date: String(raw.diajukan ?? "-"),
    amount: Number(raw.jumlah) || 0,
    reason: String(raw.alasan ?? "-"),
    status,
    ...(raw.catatanAdmin ? { note: String(raw.catatanAdmin) } : {}),
  } as RefundRecord;
}

export default function TiketScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<OrderParams>();

  const [tab, setTab] = useState<Tab>("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [ratingId, setRatingId] = useState<string | null>(null);
  const [transferId, setTransferId] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<TransferRecord[]>(INITIAL_TRANSFERS);
  const [refundId, setRefundId] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);

  // Pesanan yang punya pengajuan refund "Diproses" (menunggu admin) -> semua tiket di pesanan itu ditandai refundRequested
  const refundedOrders = useMemo(
    () => new Set(refunds.filter((x) => x.status === "Diproses" && (x as any).orderId).map((x) => String((x as any).orderId))),
    [refunds]
  );
  const allTickets = useMemo(
    () => tickets.map((t) => ({ ...t, refundRequested: !!t.orderId && refundedOrders.has(String(t.orderId)) })),
    [tickets, refundedOrders]
  );

  const list = allTickets.filter((t) => t.status === tab);
  const selected = allTickets.find((t) => t.id === selectedId);
  const ratingTicket = allTickets.find((t) => t.id === ratingId);
  const transferTicket = allTickets.find((t) => t.id === transferId);
  const refundTicket = allTickets.find((t) => t.id === refundId);
  const pendingRefunds = refunds.filter((x) => x.status === "Diproses").length;

  /** Ambil tiket milik user yang login dari backend. `silent` = tanpa pesan error (untuk auto-refresh). */
  const loadTickets = useCallback(async (silent = false) => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const res = await fetch(`${BASE_URL}/checkout/tiket`, {
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message ?? `Error ${res.status}`);

      const rows = Array.isArray(json) ? json : json?.data ?? json?.tickets ?? json?.items ?? [];
      if (!Array.isArray(rows)) throw new Error("Format data tiket tidak dikenali.");

      console.log("[TIKET] jumlah:", rows.length, "contoh:", JSON.stringify(rows[0], null, 2));

      // satu tiket (order_items.id) hanya tampil sekali
      const seen = new Set<string>();
      const mapped = rows.map(mapApiTicket).filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
      const serverOrders = new Set(mapped.map((t) => t.orderId).filter(Boolean));

      // pesanan yang bukti bayarnya belum pernah diunggah = checkout yang ditinggalkan, jangan ditampilkan
      const visible = mapped.filter((t) => !t.abandoned);
      console.log("[TIKET] tampil:", visible.length, "dari", rows.length, "baris");

      // venue/kota/poster/jam dari tiketSaya bisa kosong, lengkapi dari GET /events/:id
      const authHeaders = {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const eventIds = Array.from(new Set(visible.map((t) => t.eventId).filter(Boolean) as string[]));
      const extra: Record<string, Record<string, any>> = {};
      await Promise.all(
        eventIds.map(async (id) => {
          try {
            const er = await fetch(`${BASE_URL}/events/${id}`, { headers: authHeaders });
            const ej = await er.json();
            if (er.ok) extra[id] = flatten(ej?.data ?? ej);
          } catch {
            // lewati, tiket tetap tampil dengan data yang ada
          }
        })
      );
      const fromServer = visible.map((t) => {
        const e = t.eventId ? extra[t.eventId] : undefined;
        if (!e) return t;
        return {
          ...t,
          venue: t.venue === "-" ? String(pick(e, ["venue", "lokasi"]) ?? "-") : t.venue,
          area: t.area || String(pick(e, ["kota", "alamat"]) ?? ""),
          image: t.image || posterUrl(pick(e, ["poster"])),
          time: t.time === "-" ? toTimeStr(pick(e, ["waktu", "jam"]), null) : t.time,
          subtitle: t.subtitle === t.title ? String(pick(e, ["artis"]) ?? t.subtitle) : t.subtitle,
        };
      });

      // tiket yang sudah ditransfer (tersimpan di HP) langsung masuk Riwayat
      const sent = await readTransferred();
      const withTransfer = fromServer.map((t) =>
        sent[t.id]
          ? { ...t, status: "done" as const, pending: false, transferredTo: sent[t.id] }
          : t
      );

      // tiket sementara tetap tampil selama pesanannya belum ada di data server;
      // data lokal (rating, transfer) dipertahankan saat dimuat ulang
      setTickets((prev) => {
        const old = new Map(prev.map((t) => [t.id, t]));
        const merged = withTransfer.map((t) => {
          const o = old.get(t.id);
          if (!o) return t;
          return {
            ...t,
            rating: o.rating,
            review: o.review,
            photos: o.photos,
            transferredTo: o.transferredTo ?? t.transferredTo,
            status: o.transferredTo || o.rating ? ("done" as const) : t.status,
          };
        });
        return [...prev.filter((t) => t.orderId && !serverOrders.has(t.orderId)), ...merged];
      });
      setLoadError("");
    } catch (e: any) {
      if (!silent) setLoadError(e?.message ?? "Gagal memuat tiket.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  /** Ambil pengajuan refund milik user yang login dari backend (GET /refund/saya). */
  const loadRefunds = useCallback(async () => {
    try {
      const json = await authFetch(MY_REFUND_PATH);
      const rows = Array.isArray(json) ? json : json?.data ?? json?.refunds ?? json?.items ?? [];
      if (!Array.isArray(rows)) return;
      console.log("[REFUND] jumlah:", rows.length, "contoh:", JSON.stringify(rows[0], null, 2));
      setRefunds(rows.map(mapApiRefund).filter((x): x is RefundRecord => !!x));
    } catch (e: any) {
      console.log("[REFUND] gagal memuat:", e?.message);
    }
  }, []);

  // Muat ulang setiap halaman ini dibuka (termasuk saat pindah dari tab lain)
  useFocusEffect(
    useCallback(() => {
      loadTickets(true);
      loadRefunds();
    }, [loadTickets, loadRefunds])
  );

  // Selama ada tiket menunggu verifikasi atau refund yang diproses, cek ke server tiap 10 detik
  const hasPending = tickets.some((t) => t.pending);
  const hasRefundPending = pendingRefunds > 0;
  useEffect(() => {
    if (!hasPending && !hasRefundPending) return;
    const id = setInterval(() => {
      // saat refund diproses, tiket ikut dimuat ulang supaya pindah ke Riwayat begitu admin menyetujui
      if (hasPending || hasRefundPending) loadTickets(true);
      if (hasRefundPending) loadRefunds();
    }, 10000);
    return () => clearInterval(id);
  }, [hasPending, hasRefundPending, loadTickets, loadRefunds]);

  // Pesanan baru dari halaman payment -> tampilkan dulu tiket sementara, lalu muat ulang dari server.
  useEffect(() => {
    const orderId = params.newOrder ? String(params.newOrder) : "";
    if (!orderId) return;

    const fresh = buildTicketsFromOrder(params);
    setTickets((all) => {
      const add = fresh.filter((f) => !all.some((t) => t.id === f.id));
      return add.length ? [...add, ...all] : all;
    });

    setTab("active");
    setSelectedId(null);

    // kosongkan param supaya tidak ditambahkan dua kali
    router.setParams({ newOrder: "" });

    loadTickets();

    Alert.alert(
      "Bukti terkirim",
      "Pembayaranmu sedang diverifikasi admin. Tiketmu sudah muncul di sini."
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.newOrder]);

  function sendTransfer(data: TransferData) {
    // TODO: kirim transfer ke API kamu (data.contact = email / nomor HP penerima)
    // Setelah dikirim, tiket otomatis pindah ke Riwayat (status "done") dan statusnya
    // disimpan di HP supaya tidak kembali ke Aktif saat data dimuat ulang.
    if (transferId) saveTransferred(transferId, data.name);
    setTickets((all) =>
      all.map((t) =>
        t.id === transferId
          ? { ...t, status: "done", pending: false, transferredTo: data.name }
          : t
      )
    );
    setTransfers((list) => [
      { id: `tr-${Date.now()}`, name: data.name, date: formatNow(), status: "Menunggu" },
      ...list,
    ]);
    setTransferId(null);
    setSelectedId(null);
    setTab("done");
    Alert.alert("Transfer terkirim", `Tiket dikirim ke ${data.name}. Tiket ini sekarang ada di Riwayat.`);
  }

  function submitReview(data: RatingData) {
    // TODO: kirim review (dan unggah foto) ke API kamu
    // Setelah review terkirim, tiket otomatis pindah ke Riwayat (status "done").
    setTickets((all) =>
      all.map((t) =>
        t.id === ratingId
          ? { ...t, status: "done", rating: data.rating, review: data.text, photos: data.photos }
          : t
      )
    );
    setRatingId(null);
    setSelectedId(null);
    setTab("done");
    Alert.alert("Terima kasih!", "Review terkirim. Tiket ini sekarang ada di Riwayat.");
  }

  async function submitRefund(data: RefundData) {
    if (!refundTicket) return;
    const ticket = refundTicket;
    const orderId = Number(ticket.orderId);
    if (!Number.isInteger(orderId) || orderId < 1) {
      Alert.alert("Pengajuan gagal", "Pesanan belum tersinkron dengan server. Tarik ke bawah untuk memuat ulang, lalu coba lagi.");
      return;
    }
    try {
      await authFetch(REFUND_PATH, {
        method: "POST",
        body: JSON.stringify({
          orderId,
          alasan: [data.reason, (data as any).detail].filter(Boolean).join(" - "),
        }),
      });
    } catch (e: any) {
      Alert.alert("Pengajuan gagal", e?.message ?? "Coba lagi.");
      return;
    }
    await loadRefunds();
    setRefundId(null);
    setSelectedId(null);
    setRefundOpen(true);
    Alert.alert(
      "Pengajuan terkirim",
      "Refund menunggu verifikasi admin. Kamu bisa memantaunya di Status Refund."
    );
  }

  async function cancelRefund(id: string) {
    try {
      await authFetch(`${MY_REFUND_PATH}/${id}`, { method: "DELETE" });
    } catch (e: any) {
      Alert.alert("Gagal membatalkan", e?.message ?? "Coba lagi.");
      return;
    }
    setRefunds((all) => all.filter((x) => x.id !== id));
  }

  // Hanya tiket di Riwayat (status "done") yang boleh dihapus.
  function confirmDelete(ticket: Ticket) {
    if (ticket.status !== "done") return;
    Alert.alert(
      "Hapus dari riwayat?",
      `Tiket "${ticket.title}" akan dihapus dari riwayat dan tidak bisa dikembalikan.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: () => {
            setTickets((all) => all.filter((t) => t.id !== ticket.id));
            setSelectedId((cur) => (cur === ticket.id ? null : cur));
          },
        },
      ]
    );
  }

  // Tombol back Android menutup halaman rating / detail, bukan keluar dari tab.
  useEffect(() => {
    if ((!selected && !ratingTicket) || transferTicket || refundTicket || refundOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (ratingTicket) setRatingId(null);
      else setSelectedId(null);
      return true;
    });
    return () => sub.remove();
  }, [selected, ratingTicket, transferTicket, refundTicket, refundOpen]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Stack.Screen options={{ headerShown: false }} />

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadTickets();
                loadRefunds();
              }}
              tintColor={COLORS.brand}
              colors={[COLORS.brand]}
            />
          }
        >
          <View style={styles.headRow}>
            <Text style={styles.heading}>Tiket Saya</Text>
            <Pressable
              style={({ pressed }) => [styles.refundLink, pressed && styles.pressed]}
              onPress={() => setRefundOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Status refund"
            >
              <Ionicons name="receipt-outline" size={15} color={COLORS.brand} />
              <Text style={styles.refundLinkText}>Status Refund</Text>
              {pendingRefunds > 0 && (
                <View style={styles.refundBadge}>
                  <Text style={styles.refundBadgeText}>{pendingRefunds}</Text>
                </View>
              )}
            </Pressable>
          </View>
          <Text style={styles.subtitle}>Simpan tiketmu dan bersiaplah untuk konser.</Text>

          {/* Tab */}
          <View style={styles.tabs}>
            {(["active", "done"] as Tab[]).map((k) => {
              const on = tab === k;
              return (
                <Pressable
                  key={k}
                  style={[styles.tab, on && styles.tabOn]}
                  onPress={() => setTab(k)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.tabText, on && styles.tabTextOn]}>
                    {k === "active" ? "Aktif" : "Riwayat"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {!!loadError && <Text style={styles.errorNote}>{loadError} Tarik ke bawah untuk mencoba lagi.</Text>}

          {/* Daftar */}
          <View style={styles.list}>
            {list.map((t) => (
              <Pressable
                key={t.id}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                onPress={() => setSelectedId(t.id)}
                accessibilityRole="button"
                accessibilityLabel={`Tiket ${t.title}, ${t.date}, ${t.category}`}
              >
                <View style={styles.dateBox}>
                  {!!t.image && (
                    <>
                      <Image source={{ uri: t.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      <View style={[StyleSheet.absoluteFill, styles.posterShade]} />
                    </>
                  )}
                  <Text style={[styles.dateDay, !!t.image && styles.onPoster]}>{t.day}</Text>
                  <Text style={[styles.dateMonth, !!t.image && styles.onPoster]}>{t.month}</Text>
                </View>

                <View style={styles.cardBody}>
                  <Text style={styles.cardLabel}>TIKET KONSER</Text>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {t.title}
                  </Text>
                  <View style={styles.cardRow}>
                    <Ionicons name="location-outline" size={14} color={COLORS.muted} />
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {t.venue}
                    </Text>
                  </View>
                  <View style={styles.cardRow}>
                    <Ionicons name="time-outline" size={14} color={COLORS.muted} />
                    <Text style={styles.cardMeta}>{t.time}</Text>
                  </View>
                  <View style={styles.cardRow}>
                    <Ionicons name="ticket-outline" size={14} color={COLORS.muted} />
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {t.seat}
                    </Text>
                  </View>

                  <View style={styles.cardFoot}>
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>{t.category}</Text>
                    </View>
                    <View
                      style={[
                        styles.status,
                        t.status === "done" && styles.statusDone,
                        t.status === "active" && (t.pending || t.refundRequested) && styles.statusPending,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          t.status === "done" && styles.statusTextDone,
                          t.status === "active" && (t.pending || t.refundRequested) && styles.statusTextPending,
                        ]}
                      >
                        {t.status === "active"
                          ? t.refundRequested
                            ? "Refund menunggu verifikasi"
                            : t.pending
                              ? "Menunggu verifikasi"
                              : "Aktif"
                          : t.rejected
                            ? "Pembayaran ditolak"
                            : t.transferredTo
                              ? "Ditransfer"
                              : "Selesai"}
                      </Text>
                    </View>
                  </View>
                </View>

                {t.status === "done" ? (
                  <Pressable
                    style={({ pressed }) => [styles.trashBtn, pressed && styles.pressed]}
                    onPress={() => confirmDelete(t)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Hapus tiket ${t.title} dari riwayat`}
                  >
                    <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                  </Pressable>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={COLORS.placeholder} />
                )}
              </Pressable>
            ))}

            {list.length === 0 && loading && (
              <View style={styles.empty}>
                <ActivityIndicator color={COLORS.brand} />
                <Text style={styles.emptyText}>Memuat tiketmu...</Text>
              </View>
            )}

            {list.length === 0 && !loading && (
              <View style={styles.empty}>
                <Ionicons name="ticket-outline" size={34} color={COLORS.accent} />
                <Text style={styles.emptyTitle}>
                  {tab === "active" ? "Belum ada tiket aktif" : "Belum ada riwayat tiket"}
                </Text>
                <Text style={styles.emptyText}>Tiket yang berhasil kamu beli akan muncul di sini.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      {selected && (
        <View style={StyleSheet.absoluteFill}>
          <ETicket
            ticket={selected}
            onBack={() => setSelectedId(null)}
            onDelete={() => confirmDelete(selected)}
            onRate={() => setRatingId(selected.id)}
            onTransfer={() => setTransferId(selected.id)}
            onRefund={() => setRefundId(selected.id)}
          />
        </View>
      )}

      {ratingTicket && (
        <View style={StyleSheet.absoluteFill}>
          <RatingScreen ticket={ratingTicket} onBack={() => setRatingId(null)} onSubmit={submitReview} />
        </View>
      )}

      {transferTicket && (
        <View style={StyleSheet.absoluteFill}>
          <TransferFlow
            ticket={transferTicket}
            history={transfers}
            onBack={() => setTransferId(null)}
            onSend={sendTransfer}
          />
        </View>
      )}

      {refundTicket && (
        <View style={StyleSheet.absoluteFill}>
          <RefundForm ticket={refundTicket} onBack={() => setRefundId(null)} onSubmit={submitRefund} />
        </View>
      )}

      {refundOpen && (
        <View style={StyleSheet.absoluteFill}>
          <RefundList refunds={refunds} onBack={() => setRefundOpen(false)} onCancel={cancelRefund} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 36 },

  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  heading: { fontFamily: SERIF, fontSize: 28, fontWeight: "700", color: COLORS.brand },
  refundLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: COLORS.brand,
  },
  refundLinkText: { fontSize: 12.5, fontWeight: "600", color: COLORS.brand },
  refundBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: COLORS.error,
    alignItems: "center",
    justifyContent: "center",
  },
  refundBadgeText: { fontSize: 10.5, fontWeight: "700", color: COLORS.white },
  subtitle: { fontSize: 13.5, lineHeight: 20, color: COLORS.muted, marginTop: 6 },

  tabs: {
    flexDirection: "row",
    marginTop: 22,
    padding: 4,
    borderRadius: 24,
    backgroundColor: COLORS.sand,
  },
  tab: { flex: 1, minHeight: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: COLORS.white },
  tabText: { fontSize: 14, fontWeight: "500", color: COLORS.muted },
  tabTextOn: { fontWeight: "700", color: COLORS.brand },

  errorNote: { fontSize: 12.5, lineHeight: 18, color: COLORS.error, marginTop: 14 },

  list: { marginTop: 20, gap: 16 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 26,
    backgroundColor: COLORS.white,
    shadowColor: "#8A6A4F",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  dateBox: {
    width: 62,
    height: 80,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  posterShade: { backgroundColor: "rgba(43,99,137,0.45)" },
  onPoster: { color: COLORS.white },
  dateDay: { fontFamily: SERIF, fontSize: 26, fontWeight: "700", color: COLORS.brand },
  dateMonth: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: COLORS.brand },
  cardBody: { flex: 1, gap: 3 },
  cardLabel: { fontSize: 9.5, fontWeight: "700", letterSpacing: 1.4, color: COLORS.placeholder },
  cardTitle: { fontFamily: SERIF, fontSize: 17, lineHeight: 22, fontWeight: "700", color: COLORS.ink },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardMeta: { flex: 1, fontSize: 13, color: COLORS.muted },
  cardFoot: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 6 },
  pill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: COLORS.sand },
  pillText: { fontSize: 11.5, fontWeight: "600", color: COLORS.ink },
  status: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: COLORS.brand },
  statusDone: { backgroundColor: COLORS.line },
  statusPending: { backgroundColor: "#FFF1DB" },
  statusText: { fontSize: 11, fontWeight: "700", color: COLORS.white },
  statusTextDone: { color: COLORS.muted },
  statusTextPending: { color: "#9A5A00" },

  trashBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FBE9E7",
    alignItems: "center",
    justifyContent: "center",
  },

  empty: { alignItems: "center", gap: 6, paddingVertical: 44 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: COLORS.ink },
  emptyText: { fontSize: 13, color: COLORS.muted, textAlign: "center" },

  pressed: { opacity: 0.88 },
});

/* =====================================================================
 * DETAIL E-TICKET
 * ===================================================================== */

function ETicket({
  ticket,
  onBack,
  onDelete,
  onRate,
  onTransfer,
  onRefund,
}: {
  ticket: Ticket;
  onBack: () => void;
  onDelete: () => void;
  onRate: () => void;
  onTransfer: () => void;
  onRefund: () => void;
}) {
  const done = ticket.status === "done";
  // Refund sedang menunggu verifikasi admin (hanya relevan untuk tiket yang masih aktif)
  const refunding = !!ticket.refundRequested && !done;

  // Foto tiket hanya untuk tiket yang pembayarannya sudah diterima (bukan menunggu / ditolak / ditransfer / refund diproses)
  const canDownload = !ticket.pending && !ticket.rejected && !ticket.transferredTo && !refunding;

  const shotRef = useRef<View>(null);
  const [saving, setSaving] = useState(false);

  /** Ambil gambar dari tampilan tiket lalu buka menu bagikan/simpan bawaan HP. */
  async function saveAsPhoto() {
    if (saving || !canDownload) return;
    setSaving(true);
    try {
      const uri = await captureRef(shotRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Tidak didukung", "Perangkat ini tidak mendukung menu bagikan.");
        return;
      }

      // Di menu ini pilih "Simpan ke galeri / Foto / File", atau kirim lewat WhatsApp dll.
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        UTI: "public.png",
        dialogTitle: `Tiket ${ticket.title}`,
      });
    } catch (e: any) {
      console.error("Simpan tiket gagal:", e);
      Alert.alert("Gagal menyimpan", e?.message ?? "Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  const fields = [
    { label: "KATEGORI", value: ticket.category },
    { label: "NOMOR KURSI", value: ticket.seat },
    { label: "PEMESAN", value: ticket.holder },
    { label: "NO. INVOICE", value: ticket.invoice },
  ];

  return (
    <SafeAreaView style={d.safe} edges={["top", "bottom"]}>
      {/* Top bar */}
      <View style={d.bar}>
        <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Kembali">
          <Ionicons name="arrow-back" size={22} color={COLORS.brand} />
        </Pressable>
        <Text style={d.barTitle}>E-Ticket</Text>
        <Pressable
          hitSlop={10}
          onPress={() => {
            // TODO: buka notifikasi
          }}
          accessibilityRole="button"
          accessibilityLabel="Notifikasi"
        >
          <Ionicons name="notifications-outline" size={22} color={COLORS.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={d.scroll} showsVerticalScrollIndicator={false}>
        {/* Bagian yang difoto: tiket + sedikit ruang di sekelilingnya */}
        <View ref={shotRef} collapsable={false} style={d.shot}>
          <View style={d.ticket}>
            {!!ticket.image && (
              <Image source={{ uri: ticket.image }} style={d.poster} resizeMode="cover" accessibilityLabel={`Poster ${ticket.title}`} />
            )}

            <View style={d.top}>
              <Text style={d.scan}>
                {ticket.rejected
                  ? "PEMBAYARAN DITOLAK"
                  : ticket.transferredTo
                    ? "TIKET SUDAH DITRANSFER"
                    : refunding
                      ? "REFUND MENUNGGU VERIFIKASI ADMIN"
                      : ticket.pending
                        ? "MENUNGGU VERIFIKASI ADMIN"
                        : "PINDAI DI PINTU MASUK"}
              </Text>
              <View
                style={[
                  d.qrFrame,
                  (!!ticket.transferredTo || !!ticket.pending || !!ticket.rejected || refunding) && d.qrOff,
                ]}
              >
                <QRPlaceholder value={ticket.code} />
              </View>
              <Text style={d.code}>ID: {ticket.code}</Text>
            </View>

            {/* Perforasi */}
            <View style={d.perfRow}>
              <View style={[d.notch, { left: -12 }]} />
              <View style={d.dashClip}>
                <View style={d.dash} />
              </View>
              <View style={[d.notch, { right: -12 }]} />
            </View>

            <View style={d.bottom}>
              <Text style={d.title}>{ticket.title}</Text>
              <Text style={d.sub}>{ticket.subtitle}</Text>

              <View style={d.infoRow}>
                <Ionicons name="calendar-outline" size={18} color={COLORS.ink} />
                <Text style={d.infoText}>
                  {ticket.date} • {ticket.time}
                </Text>
              </View>
              <View style={d.infoRow}>
                <Ionicons name="location-outline" size={18} color={COLORS.ink} />
                <View>
                  <Text style={d.infoText}>{ticket.venue}</Text>
                  {!!ticket.area && <Text style={d.infoSmall}>{ticket.area}</Text>}
                </View>
              </View>

              <View style={d.divider} />

              <View style={d.grid}>
                {fields.map((f) => (
                  <View key={f.label} style={d.cell}>
                    <Text style={d.cellLabel}>{f.label}</Text>
                    <Text style={d.cellValue}>{f.value}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={d.stripe} />
          </View>
        </View>

        {ticket.pending && !ticket.transferredTo && !refunding && (
          <Text style={d.note}>
            Pembayaranmu sedang diverifikasi admin. QR code aktif dan tiket bisa diunduh setelah pembayaran disetujui.
          </Text>
        )}

        {refunding && (
          <Text style={d.note}>
            Pengajuan refund sedang menunggu verifikasi admin. QR code dinonaktifkan sementara dan tiket tidak bisa
            ditransfer. Kamu bisa memantau statusnya di Status Refund.
          </Text>
        )}

        {ticket.rejected && (
          <Text style={d.note}>
            Pembayaran ditolak admin, jadi tiket ini tidak berlaku. Hubungi admin atau pesan ulang tiketmu.
          </Text>
        )}

        {/* Rating */}
        {ticket.transferredTo ? (
          <Text style={d.note}>Tiket ini sudah ditransfer ke {ticket.transferredTo}.</Text>
        ) : !done && !refunding ? (
          <Pressable
            style={({ pressed }) => [d.rateBtn, pressed && d.pressed]}
            onPress={onRate}
            accessibilityRole="button"
          >
            <Ionicons name={ticket.rating ? "star" : "star-outline"} size={15} color={COLORS.brand} />
            <Text style={d.rateText}>{ticket.rating ? `Rating ${ticket.rating}/5` : "Beri Rating"}</Text>
          </Pressable>
        ) : null}

        {/* Simpan sebagai foto (hanya jika pembayaran sudah diterima) */}
        {canDownload && (
          <Pressable
            style={({ pressed }) => [d.primary, pressed && d.pressed, saving && d.primaryBusy]}
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
                <Text style={d.primaryText}>Simpan / Bagikan Tiket (Foto)</Text>
              </>
            )}
          </Pressable>
        )}

        {done && (
          <Pressable
            style={d.remove}
            hitSlop={8}
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel="Hapus tiket dari riwayat"
          >
            <Ionicons name="trash-outline" size={16} color={COLORS.error} />
            <Text style={d.refundText}>Hapus dari Riwayat</Text>
          </Pressable>
        )}

        {/* Transfer & Ajukan Refund disembunyikan selama refund menunggu verifikasi admin */}
        {!done && !refunding && (
          <>
            <Pressable
              style={({ pressed }) => [d.secondary, pressed && d.pressed]}
              onPress={onTransfer}
              accessibilityRole="button"
            >
              <Ionicons name="paper-plane-outline" size={16} color={COLORS.brand} />
              <Text style={d.secondaryText}>Transfer Tiket</Text>
            </Pressable>

            <Pressable style={d.refund} hitSlop={8} onPress={onRefund} accessibilityRole="button">
              <Text style={d.refundText}>Ajukan Refund</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const NOTCH = 24;

const d = StyleSheet.create({
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

  // Pembungkus area foto. Warna latar sama dengan halaman supaya sudut & takikan tiket menyatu;
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
  qrFrame: {
    marginTop: 14,
    padding: 10,
    backgroundColor: COLORS.sand,
  },
  qrOff: { opacity: 0.3 },
  code: { fontSize: 12.5, color: COLORS.muted, marginTop: 14 },

  perfRow: { height: NOTCH, justifyContent: "center" },
  notch: {
    position: "absolute",
    top: 0,
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    backgroundColor: COLORS.background,
  },
  dashClip: { height: 1, overflow: "hidden", marginHorizontal: 20 },
  dash: {
    height: 2,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: COLORS.line,
    borderRadius: 1,
  },

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

  rateBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 26,
    minHeight: 38,
    paddingHorizontal: 18,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: COLORS.brand,
  },
  rateText: { fontSize: 13, fontWeight: "500", color: COLORS.brand },
  stars: { flexDirection: "row", gap: 10, marginTop: 14 },
  note: { fontSize: 13, lineHeight: 19, color: COLORS.muted, marginTop: 26 },

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
  secondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
    minHeight: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: COLORS.brand,
  },
  secondaryText: { fontSize: 14.5, fontWeight: "600", color: COLORS.brand },
  refund: { alignSelf: "center", marginTop: 22, padding: 4 },
  remove: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, marginTop: 22, padding: 4 },
  refundText: { fontSize: 13.5, fontWeight: "700", color: COLORS.error },

  pressed: { opacity: 0.88 },
});