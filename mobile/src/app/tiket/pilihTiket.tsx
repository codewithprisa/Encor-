import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/lib/api";

/* =====================================================================
 * TEMA (sama dengan halaman Home)
 * ===================================================================== */

const COLORS = {
  background: "#FFF7ED",
  brand: "#2B6389",
  accent: "#A1BFD1",
  white: "#FFFFFF",
  line: "#F1E2D0",
  ink: "#3D3028",
  black: "#1B1612",
  muted: "#6B4C3B",
  placeholder: "#A89A8C",
  error: "#C4372D",
  peach: "#F8D9B4",
  sand: "#F2DDC1",
  sky: "#CFE0EA",
  soldLine: "#CDD6DC",
  soldFill: "#EDF2F5",
};

/** Warna cadangan per tiket, dipakai kalau data tiket tidak punya field warna. */
const PALETTE = [
  { bg: "#FBBF24", border: "#E2A50F" }, // kuning
  { bg: "#34D399", border: "#1FB985" }, // hijau
  { bg: "#60A5FA", border: "#3B82F6" }, // biru
  { bg: "#F9A8D4", border: "#EC72B5" }, // pink
  { bg: "#C4B5FD", border: "#9F8BF0" }, // ungu
  { bg: "#FDBA74", border: "#F08A2E" }, // oranye
];

const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/** Jumlah kursi maksimal yang bisa dipilih dalam satu pesanan. */
const MAX_SEATS = 10;

/* =====================================================================
 * TIPE & HELPER
 * ===================================================================== */

type IconName = ComponentProps<typeof Ionicons>["name"];
type SeatState = "available" | "selected" | "sold";

type Seat = { id: string; code: string; num: number; sold: boolean; tierId: string };
type SeatRow = { key: string; row: string; seats: Seat[] };
type RowBlock = { tierId: string; rows: SeatRow[] };

/** Satu kategori tiket + warnanya di denah. */
type TierStyle = { id: string; name: string; price: number; bg: string; border: string };

/** Info event + tiket yang dipilih di halaman detail (tiket awal). */
type TierInfo = { eventTitle: string; tierId: string };

/** Kategori tiket lengkap: warna di denah + detail yang tampil di kartu. */
type TierData = TierStyle & { type: string; left: number; saleEnd?: string; perks: string[] };

function formatRupiah(n: number) {
  return "Rp " + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatDate(v: unknown) {
  if (!v) return "";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function toArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return Object.values(v);
  return [];
}

/** Pecah teks fasilitas jadi daftar. Dipisah per baris / ; / • / |, kalau tidak ada baru pakai koma. */
function splitPerks(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  const s = String(v ?? "").trim();
  if (!s) return [];
  let parts = s.split(/\r?\n|;|•|\|/).map((x) => x.trim()).filter(Boolean);
  if (parts.length <= 1) parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  return parts;
}

/** Pilih ikon berdasarkan kata kunci di teks fasilitas. */
function perkIcon(text: string): IconName {
  const t = text.toLowerCase();
  if (/meet|greet|bertemu/.test(t)) return "people-outline";
  if (/merch|merchandise|goodie|kaos/.test(t)) return "gift-outline";
  if (/lounge|bar|minum|drink|food|makan/.test(t)) return "wine-outline";
  if (/masuk|prioritas|priority|entry|fast/.test(t)) return "flash-outline";
  return "checkmark-circle-outline";
}

/**
 * Tanggal akhir penjualan dari data tiket.
 * NAMA FIELD MASIH TEBAKAN. Cocokkan dengan JSON asli dari GET /api/events/:id.
 */
function pickSaleEnd(t: any): string | undefined {
  const v =
    t?.penjualan_berakhir ??
    t?.akhir_penjualan ??
    t?.tanggal_akhir_penjualan ??
    t?.sale_end ??
    t?.sale_end_date ??
    t?.tanggal_akhir;
  return v ? String(v) : undefined;
}

/* ---------- Warna ---------- */

function normHex(h: string) {
  const x = h.replace("#", "");
  const full = x.length === 3 ? x.split("").map((c) => c + c).join("") : x;
  return "#" + full.toUpperCase();
}

function darken(hex: string, k = 0.82) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Teks gelap di atas warna terang, teks putih di atas warna gelap. */
function readableOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum < 0.55 ? COLORS.white : COLORS.ink;
}

/**
 * Warna tiket: pakai field warna dari data bila ada (hex), kalau tidak ada pakai PALETTE.
 * NAMA FIELD MASIH TEBAKAN: warna / color / warna_hex / hex.
 */
function pickColor(t: any, i: number) {
  const raw = t?.warna ?? t?.color ?? t?.warna_hex ?? t?.hex;
  if (typeof raw === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw.trim())) {
    const bg = normHex(raw.trim());
    return { bg, border: darken(bg) };
  }
  return PALETTE[i % PALETTE.length];
}

/* =====================================================================
 * DATA KURSI
 * =====================================================================
 * Halaman ini mencari fungsi api.getSeats(eventId, tierId) atau api.getKursi(...)
 * di lib/api.ts. Bentuk data yang dikenali (nama field boleh salah satu):
 *
 *   [{ id, kode, zona, baris, nomor, kategori_id, status: "tersedia" | "terjual" }, ...]
 *
 * kategori_id (atau id_kategori / tier_id) menentukan warna + harga kursi.
 * Kalau tidak ada, tiket dibagi rata per baris dari atas ke bawah.
 *
 * Kalau fungsinya belum ada (atau datanya kosong), halaman memakai denah contoh
 * (baris A-D, 10 kursi) supaya tampilan tetap bisa dicoba.
 */

/** Isi tierId kursi yang kosong / tidak dikenal: bagi rata per baris mengikuti urutan tiket. */
function assignTiers(rows: SeatRow[], tiers: TierStyle[]): SeatRow[] {
  const n = tiers.length;
  return rows.map((r, i) => {
    const fallback = n ? tiers[Math.min(Math.floor((i * n) / rows.length), n - 1)].id : "";
    return {
      ...r,
      seats: r.seats.map((st) => ({
        ...st,
        tierId: st.tierId && tiers.some((t) => t.id === st.tierId) ? st.tierId : fallback,
      })),
    };
  });
}

function parseSeats(raw: any, tiers: TierStyle[]): SeatRow[] | null {
  const list = toArray(raw?.kursi ?? raw?.seats ?? raw?.data ?? raw);
  if (!list.length) return null;

  const rowMap = new Map<string, { zone: string; row: string; items: Seat[] }>();

  list.forEach((x: any, i: number) => {
    const code = String(x?.kode ?? x?.code ?? x?.nomor_kursi ?? x?.seat_code ?? `K${i + 1}`);
    const zone = String(x?.zona ?? x?.zone ?? x?.area ?? x?.tribun ?? "");
    const rowName = String(x?.baris ?? x?.row ?? code.replace(/^.*-/, "").charAt(0) ?? "A");
    const numRaw = x?.nomor ?? x?.number ?? x?.no ?? code.replace(/\D+/g, "");
    const num = Number(numRaw) || i + 1;

    const status = String(x?.status ?? "").toLowerCase();
    const sold =
      /terjual|sold|booked|dipesan|reserved|unavailable|habis/.test(status) ||
      x?.tersedia === false ||
      x?.available === false;

    const tierRaw =
      x?.kategori_id ?? x?.id_kategori ?? x?.tier_id ?? x?.kategori?.id ?? x?.tier?.id;

    const key = `${zone}|${rowName}`;
    if (!rowMap.has(key)) rowMap.set(key, { zone, row: rowName, items: [] });
    rowMap.get(key)!.items.push({
      id: String(x?.id ?? code),
      code: `${rowName}${num}`,
      num,
      sold,
      tierId: tierRaw != null ? String(tierRaw) : "",
    });
  });

  const rows: SeatRow[] = Array.from(rowMap.values())
    .sort(
      (a, b) =>
        a.zone.localeCompare(b.zone, undefined, { numeric: true }) ||
        a.row.localeCompare(b.row, undefined, { numeric: true })
    )
    .map((r) => ({
      key: `${r.zone}|${r.row}`,
      row: r.row,
      seats: [...r.items].sort((a, b) => a.num - b.num),
    }));

  return assignTiers(rows, tiers);
}

/** Denah contoh: baris A-D, masing-masing 10 kursi. */
function buildDemo(tiers: TierStyle[]): SeatRow[] {
  const rows: SeatRow[] = Array.from({ length: 4 }, (_, r) => {
    const row = String.fromCharCode(65 + r);
    return {
      key: row,
      row,
      seats: Array.from({ length: 10 }, (_, c) => ({
        id: `${row}${c + 1}`,
        code: `${row}${c + 1}`,
        num: c + 1,
        sold: (r * 7 + c * 3 + 2) % 5 === 0,
        tierId: "",
      })),
    };
  });
  return assignTiers(rows, tiers);
}

/* =====================================================================
 * KOMPONEN KURSI
 * ===================================================================== */

function SeatBox({
  seat,
  state,
  tier,
  onPress,
}: {
  seat: Seat;
  state: SeatState;
  tier: TierStyle;
  onPress: () => void;
}) {
  const sold = state === "sold";
  const sel = state === "selected";

  const bg = sel ? COLORS.black : sold ? COLORS.soldFill : tier.bg;
  const border = sel ? COLORS.black : sold ? COLORS.soldLine : tier.border;
  const color = sel ? COLORS.white : sold ? COLORS.placeholder : readableOn(tier.bg);
  const label = sold ? "terjual" : sel ? "dipilih" : "tersedia";

  return (
    <Pressable
      disabled={sold}
      hitSlop={2}
      onPress={onPress}
      style={[s.seatBox, { backgroundColor: bg, borderColor: border }]}
      accessibilityRole="button"
      accessibilityLabel={`Kursi ${seat.code}, ${tier.name}, ${formatRupiah(tier.price)}, ${label}`}
      accessibilityState={{ selected: sel, disabled: sold }}
    >
      <Text style={[s.seatText, { color }, sold && s.seatTextSold]}>{seat.num}</Text>
    </Pressable>
  );
}

function SeatRowView({
  row,
  selectedIds,
  tierOf,
  onToggle,
  onToggleRow,
}: {
  row: SeatRow;
  selectedIds: string[];
  tierOf: (tierId: string) => TierStyle;
  onToggle: (seat: Seat) => void;
  onToggleRow: (row: SeatRow) => void;
}) {
  return (
    <View style={s.seatRow}>
      <Pressable
        style={s.rowLetter}
        hitSlop={6}
        onPress={() => onToggleRow(row)}
        accessibilityRole="button"
        accessibilityLabel={`Pilih satu baris ${row.row}`}
      >
        <Text style={s.rowLetterText}>{row.row}</Text>
      </Pressable>

      <View style={s.seats}>
        {row.seats.map((seat) => {
          const state: SeatState = seat.sold
            ? "sold"
            : selectedIds.includes(seat.id)
            ? "selected"
            : "available";
          return (
            <SeatBox
              key={seat.id}
              seat={seat}
              state={state}
              tier={tierOf(seat.tierId)}
              onPress={() => onToggle(seat)}
            />
          );
        })}
      </View>
    </View>
  );
}

/* =====================================================================
 * HALAMAN PILIH TIKET
 * =====================================================================
 * Dibuka dari detail event (home.tsx) lewat:
 *
 *   router.push({ pathname: "/tiket/pilihTiket", params: { event, tier, title } });
 *
 * Simpan file ini sebagai src/app/tiket/pilihTiket.tsx (di luar folder (tabs),
 * supaya tab bar tidak tampil).
 *
 * Tombol Checkout membuka /tiket/checkout dengan params:
 *   event  = id event
 *   title  = nama event
 *   items  = JSON [{ id, code, tierId, tier, price }, ...]  (satu per kursi yang dipilih)
 */

export default function PilihTiket() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ event?: string; tier?: string; title?: string }>();
  const eventId = params.event ? String(params.event) : "";
  const tierParam = params.tier ? String(params.tier) : "";

  const [info, setInfo] = useState<TierInfo | null>(null);
  const [tiers, setTiers] = useState<TierData[]>([]);
  const [rows, setRows] = useState<SeatRow[]>([]);
  const [fromApi, setFromApi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);

  /* ---------- Ambil data ---------- */

  const load = useCallback(async () => {
    if (!eventId) {
      setError("Event tidak ditemukan.");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);

      const r: any = await api.getEvent(eventId);
      const rawTiers = toArray(r?.kategori ?? r?.tiers ?? r?.ticket_types);

      // Semua kategori tiket event ini, lengkap dengan warna + harga
      const tierList: TierData[] = rawTiers.map((x: any, i: number) => ({
        id: String(x?.id ?? i),
        name: String(x?.nama ?? x?.name ?? `Tiket ${i + 1}`),
        price: Number(x?.harga ?? x?.price ?? 0),
        type: String(x?.tipe ?? x?.type ?? "seated"),
        left: Number(x?.sisa ?? x?.stok ?? x?.left ?? 0),
        saleEnd: pickSaleEnd(x) ?? pickSaleEnd(r),
        perks: splitPerks(x?.fasilitas ?? x?.perks),
        ...pickColor(x, i),
      }));
      setTiers(tierList);

      // Tiket yang dipilih di halaman detail (id sama dengan yang dikirim lewat params)
      const t: any =
        rawTiers.find((x: any, i: number) => String(x?.id ?? i) === tierParam) ?? rawTiers[0] ?? {};

      setInfo({
        eventTitle: String(r?.nama_event ?? r?.nama ?? r?.title ?? params.title ?? ""),
        tierId: String(t?.id ?? tierParam),
      });

      // Denah kursi
      let parsed: SeatRow[] | null = null;
      const getSeats = (api as any).getSeats ?? (api as any).getKursi;
      if (typeof getSeats === "function") {
        try {
          const raw = await getSeats.call(api, eventId, t?.id);
          console.log("[KURSI API]", JSON.stringify(toArray(raw?.kursi ?? raw?.seats ?? raw?.data ?? raw)[0]));
          parsed = parseSeats(raw, tierList);
        } catch (e: any) {
          console.warn("[KURSI API] gagal:", e?.message);
        }
      } else {
        console.warn("[KURSI API] api.getSeats belum ada di lib/api, memakai denah contoh.");
      }

      setFromApi(!!parsed);
      setRows(parsed ?? buildDemo(tierList));
      setSelectedIds([]);
    } catch (e: any) {
      setError(e?.message ?? "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, [eventId, tierParam, params.title]);

  useEffect(() => {
    load();
  }, [load]);

  /* ---------- Turunan ---------- */

  const tierMap = useMemo(
    () => new Map<string, TierData>(tiers.map((t) => [t.id, t] as [string, TierData])),
    [tiers]
  );

  // Dipakai kalau kursi tidak punya kategori yang cocok
  const fallbackTier = useMemo<TierData>(
    () => ({ id: "", name: "Tiket", price: 0, type: "seated", left: 0, perks: [], ...PALETTE[0] }),
    []
  );

  const tierOf = useCallback(
    (id: string) => tierMap.get(id) ?? fallbackTier,
    [tierMap, fallbackTier]
  );

  const seatMap = useMemo(() => {
    const m = new Map<string, Seat>();
    rows.forEach((r) => r.seats.forEach((st) => m.set(st.id, st)));
    return m;
  }, [rows]);

  // Baris berurutan dengan tiket yang sama digabung jadi satu blok (dengan judul nama + harga).
  const blocks = useMemo(() => {
    const out: RowBlock[] = [];
    for (const r of rows) {
      const tid = r.seats[0]?.tierId ?? "";
      const last = out[out.length - 1];
      if (last && last.tierId === tid) last.rows.push(r);
      else out.push({ tierId: tid, rows: [r] });
    }
    return out;
  }, [rows]);

  const selectedSeats = selectedIds
    .map((id) => seatMap.get(id))
    .filter((x): x is Seat => !!x);

  // Tiket "aktif": mengikuti kursi yang terakhir dipilih. Kalau belum ada kursi
  // terpilih, pakai tiket yang dipilih di halaman detail.
  const lastSeat = selectedSeats[selectedSeats.length - 1];
  const active = tierOf(lastSeat ? lastSeat.tierId : info?.tierId ?? "");

  const remaining = useMemo(() => {
    const free = Array.from(seatMap.values()).filter((x) => !x.sold);
    const inTier = free.filter((x) => x.tierId === active.id).length;
    if (!fromApi) return active.left || inTier || free.length;
    return inTier;
  }, [seatMap, fromApi, active]);

  // Rincian per tiket, contoh: "Reguler x 2 = Rp 300.000"
  const summary = useMemo(() => {
    const m = new Map<string, { tier: TierData; count: number }>();
    for (const st of selectedSeats) {
      const tier = tierOf(st.tierId);
      const g = m.get(tier.id);
      if (g) g.count += 1;
      else m.set(tier.id, { tier, count: 1 });
    }
    return Array.from(m.values());
  }, [selectedSeats, tierOf]);

  // Total = jumlah harga tiap kursi sesuai tiketnya
  const total = selectedSeats.reduce((sum, st) => sum + tierOf(st.tierId).price, 0);

  const codesLabel =
    selectedSeats.length <= 2
      ? selectedSeats.map((x) => x.code).join(", ")
      : `${selectedSeats[0].code} +${selectedSeats.length - 1}`;

  /* ---------- Aksi ---------- */

  const toggleSeat = (seat: Seat) => {
    if (seat.sold) return;
    const has = selectedIds.includes(seat.id);
    if (!has && selectedIds.length >= MAX_SEATS) {
      setHint(`Maksimal ${MAX_SEATS} kursi per pesanan.`);
      return;
    }
    setHint(null);
    setSelectedIds(has ? selectedIds.filter((x) => x !== seat.id) : [...selectedIds, seat.id]);
  };

  // Ketuk huruf baris: pilih semua kursi kosong di baris itu (ketuk lagi untuk batal)
  const toggleRow = (row: SeatRow) => {
    const free = row.seats.filter((x) => !x.sold);
    if (!free.length) return;

    const allSelected = free.every((x) => selectedIds.includes(x.id));
    if (allSelected) {
      setHint(null);
      setSelectedIds(selectedIds.filter((id) => !free.some((x) => x.id === id)));
      return;
    }

    const add = free.filter((x) => !selectedIds.includes(x.id));
    if (selectedIds.length + add.length > MAX_SEATS) {
      setHint(`Maksimal ${MAX_SEATS} kursi per pesanan.`);
      return;
    }
    setHint(null);
    setSelectedIds([...selectedIds, ...add.map((x) => x.id)]);
  };

  // Lanjut ke checkout: tiap kursi dikirim bersama nama tiket + harganya sendiri,
  // jadi checkout menampilkan persis tiket yang dipilih (termasuk kalau campur kategori).
  const onCheckout = () => {
    if (!selectedSeats.length || !info) return;

    const items = selectedSeats.map((st) => {
      const t = tierOf(st.tierId);
      return { id: st.id, code: st.code, tierId: t.id, tier: t.name, price: t.price };
    });

    router.push({
      pathname: "/tiket/checkout" as any,
      params: {
        event: eventId,
        title: info.eventTitle,
        items: JSON.stringify(items),
      },
    });
  };

  /* ---------- Tampilan ---------- */

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView style={s.safe} edges={["top"]}>
        {/* Top bar */}
        <View style={s.topBar}>
          <Pressable
            style={s.back}
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Kembali"
          >
            <Ionicons name="arrow-back" size={22} color={COLORS.brand} />
          </Pressable>
          <Text style={s.topTitle} numberOfLines={1}>
            {info?.eventTitle || params.title || "Pilih Tiket"}
          </Text>
          <View style={s.back} />
        </View>

        {loading && <ActivityIndicator style={s.state} color={COLORS.brand} />}

        {!loading && error && (
          <Pressable style={s.state} onPress={load} accessibilityRole="button">
            <Ionicons name="cloud-offline-outline" size={30} color={COLORS.accent} />
            <Text style={s.stateTitle}>Gagal memuat denah kursi</Text>
            <Text style={s.stateText}>{error}</Text>
            <Text style={s.link}>Ketuk untuk coba lagi</Text>
          </Pressable>
        )}

        {!loading && !error && info && (
          <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
            {/* Kartu tiket yang dipilih */}
            <View style={s.ticket}>
              <View style={s.ticketTop}>
                <Text style={s.tierName}>{active.name}</Text>
                <View style={s.typeBadge}>
                  <Text style={s.typeText}>{active.type.toUpperCase()}</Text>
                </View>
              </View>
              <Text style={s.price}>
                {formatRupiah(active.price)}
                <Text style={s.perSeat}> / kursi</Text>
              </Text>
              <View style={s.ticketMeta}>
                <View style={s.leftPill}>
                  <Text style={s.leftText}>{remaining} tersisa</Text>
                </View>
                {!!active.saleEnd && (
                  <Text style={s.saleText}>Sale ends {formatDate(active.saleEnd)}</Text>
                )}
              </View>
              {summary.length > 0 && (
                <View style={s.summary}>
                  {summary.map((g) => (
                    <View key={g.tier.id || "x"} style={s.sumRow}>
                      <View
                        style={[s.tierDot, { backgroundColor: g.tier.bg, borderColor: g.tier.border }]}
                      />
                      <Text style={s.sumName} numberOfLines={1}>
                        {g.tier.name} x {g.count}
                      </Text>
                      <Text style={s.sumPrice}>{formatRupiah(g.tier.price * g.count)}</Text>
                    </View>
                  ))}
                  <View style={s.sumTotalRow}>
                    <Text style={s.sumTotalLabel}>Total {selectedSeats.length} kursi</Text>
                    <Text style={s.sumTotal}>{formatRupiah(total)}</Text>
                  </View>
                </View>
              )}
            </View>

            {/* Fasilitas (mengikuti tiket aktif) */}
            {active.perks.length > 0 && (
              <>
                <Text style={s.sectionTitle}>Yang Kamu Dapatkan</Text>
                <View style={s.perks}>
                  {active.perks.map((p, i) => (
                    <View key={`${p}-${i}`} style={s.perk}>
                      <Ionicons name={perkIcon(p)} size={18} color={COLORS.brand} />
                      <Text style={s.perkText}>{p}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Denah kursi */}
            <View style={s.mapCard}>
              <View style={s.stage}>
                <Text style={s.stageText}>PANGGUNG UTAMA (STAGE)</Text>
              </View>

              <View style={s.blocks}>
                {blocks.map((b, i) => {
                  const tier = tierOf(b.tierId);
                  const mine = !!info.tierId && tier.id === info.tierId;
                  return (
                    <View key={`${b.tierId}-${i}`} style={s.block}>
                      <View style={s.tierHead}>
                        <View
                          style={[s.tierDot, { backgroundColor: tier.bg, borderColor: tier.border }]}
                        />
                        <Text style={s.tierHeadName} numberOfLines={1}>
                          {tier.name}
                        </Text>
                        {mine && (
                          <View style={s.mine}>
                            <Text style={s.mineText}>Pilihan awal</Text>
                          </View>
                        )}
                        <Text style={s.tierHeadPrice}>{formatRupiah(tier.price)}</Text>
                      </View>

                      <View style={s.rows}>
                        {b.rows.map((r) => (
                          <SeatRowView
                            key={r.key}
                            row={r}
                            selectedIds={selectedIds}
                            tierOf={tierOf}
                            onToggle={toggleSeat}
                            onToggleRow={toggleRow}
                          />
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>

              <Text style={s.note}>
                Ketuk kursi untuk memilih (jadi hitam), atau ketuk huruf baris untuk memilih satu
                baris penuh.
              </Text>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Bar bawah */}
      {!loading && !error && info && (
        <View style={[s.bottom, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {!!hint && <Text style={s.hint}>{hint}</Text>}
          <View style={s.bottomRow}>
            <Pressable
              disabled={!selectedSeats.length}
              style={({ pressed }) => [
                s.cta,
                !selectedSeats.length && s.ctaOff,
                pressed && s.pressed,
              ]}
              onPress={onCheckout}
              accessibilityRole="button"
              accessibilityState={{ disabled: !selectedSeats.length }}
            >
              <Text style={s.ctaTitle}>{selectedSeats.length ? "CHECKOUT" : "PILIH KURSI"}</Text>
              <Text style={s.ctaSub}>
                {selectedSeats.length
                  ? `${codesLabel} | ${formatRupiah(total)}`
                  : "Pilih minimal 1 kursi"}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  safe: { flex: 1, backgroundColor: COLORS.background },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
  },
  back: { width: 40, height: 40, justifyContent: "center" },
  topTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: SERIF,
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.brand,
  },

  state: { alignItems: "center", gap: 6, paddingVertical: 64 },
  stateTitle: { fontSize: 15, fontWeight: "700", color: COLORS.ink },
  stateText: { fontSize: 13, color: COLORS.muted, textAlign: "center", paddingHorizontal: 24 },
  link: { fontSize: 13.5, fontWeight: "600", color: COLORS.brand },

  scroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },

  /* kartu tiket */
  ticket: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    shadowColor: "#8A6A4F",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  ticketTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  tierName: { flex: 1, fontFamily: SERIF, fontSize: 28, fontWeight: "700", color: COLORS.brand },
  typeBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, backgroundColor: COLORS.sand },
  typeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6, color: COLORS.muted },
  price: { fontSize: 20, fontWeight: "800", color: COLORS.ink, marginTop: 8 },
  ticketMeta: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  leftPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: COLORS.sand },
  leftText: { fontSize: 11, fontWeight: "700", color: COLORS.muted },
  saleText: { fontSize: 11.5, color: COLORS.ink },
  perSeat: { fontSize: 12, fontWeight: "600", color: COLORS.muted },

  /* rincian pesanan */
  summary: {
    marginTop: 14,
    paddingTop: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
  },
  sumRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sumName: { flex: 1, fontSize: 13, color: COLORS.ink },
  sumPrice: { fontSize: 13, fontWeight: "700", color: COLORS.ink },
  sumTotalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
  },
  sumTotalLabel: { fontSize: 13, fontWeight: "700", color: COLORS.muted },
  sumTotal: { fontSize: 17, fontWeight: "800", color: COLORS.brand },

  /* fasilitas */
  sectionTitle: { fontFamily: SERIF, fontSize: 20, fontWeight: "700", color: COLORS.brand, marginTop: 28 },
  perks: { gap: 14, paddingTop: 16 },
  perk: { flexDirection: "row", alignItems: "center", gap: 12 },
  perkText: { flex: 1, fontSize: 13.5, lineHeight: 19, color: COLORS.ink },

  /* denah */
  mapCard: {
    marginTop: 28,
    padding: 16,
    borderRadius: 24,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    shadowColor: "#8A6A4F",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  stage: {
    alignSelf: "center",
    width: "64%",
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: COLORS.ink,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  stageText: { fontSize: 10.5, fontWeight: "800", letterSpacing: 1.1, color: COLORS.white },

  blocks: { gap: 20, marginTop: 22 },
  block: { gap: 10 },
  tierHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  tierDot: { width: 12, height: 12, borderRadius: 4, borderWidth: 1 },
  tierHeadName: { flex: 1, fontSize: 13, fontWeight: "700", color: COLORS.ink },
  tierHeadPrice: { fontSize: 13, fontWeight: "800", color: COLORS.brand },
  mine: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: COLORS.sand },
  mineText: { fontSize: 10, fontWeight: "700", color: COLORS.muted },

  rows: { gap: 8 },
  seatRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowLetter: { width: 20, height: 28, alignItems: "center", justifyContent: "center" },
  rowLetterText: { fontSize: 13, fontWeight: "800", color: COLORS.brand },
  seats: { flex: 1, flexDirection: "row", gap: 4 },

  /* kursi */
  seatBox: {
    flex: 1,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  seatText: { fontSize: 10.5, fontWeight: "700" },
  seatTextSold: { textDecorationLine: "line-through" },

  note: { fontSize: 12, lineHeight: 18, color: COLORS.muted, marginTop: 20 },

  /* bar bawah */
  bottom: {
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
  },
  hint: { fontSize: 12.5, color: COLORS.error, textAlign: "center", marginBottom: 8 },
  bottomRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  cta: {
    flex: 1,
    minHeight: 56,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: COLORS.brand,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  ctaOff: { opacity: 0.5 },
  ctaTitle: { fontSize: 14, fontWeight: "800", letterSpacing: 0.8, color: COLORS.white },
  ctaSub: { fontSize: 12.5, color: "rgba(255,255,255,0.92)" },
  pressed: { opacity: 0.88 },
});