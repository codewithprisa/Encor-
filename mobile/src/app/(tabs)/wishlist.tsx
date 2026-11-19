import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, imageUrl } from "@/lib/api";

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
};

const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });
const CHIP_PALETTE = [COLORS.accent, COLORS.peach, COLORS.sky];

/* =====================================================================
 * TIPE & HELPER
 * ===================================================================== */

type WishItem = {
  /** id EVENT (bukan id baris wishlist), dipakai untuk membuka detail & hapus favorit */
  id: string;
  title: string;
  artist: string;
  genre: string;
  date: string;
  /** Waktu event dalam ms, null jika tanggal tidak valid */
  dateMs: number | null;
  venue: string;
  city: string;
  price: number | null;
  image: string;
  almostSoldOut: boolean;
};

/** Ambil nilai pertama yang tidak kosong. */
function first(...vals: any[]): string {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return "";
}

function formatRupiah(n: number) {
  return "Rp " + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

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

function parseDate(raw: unknown): Date | null {
  if (!raw) return null;
  const s = String(raw);
  // "YYYY-MM-DD" saja -> anggap acara mulai pukul 19.00 waktu setempat
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T19:00:00` : s);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(raw: unknown) {
  const d = parseDate(raw);
  if (!d) return raw ? String(raw) : "";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function countdown(ms: number | null) {
  if (ms === null) return null;
  const days = Math.ceil((ms - Date.now()) / 86400000);
  if (days < 0) return { label: "Selesai", past: true };
  if (days === 0) return { label: "Hari ini", past: false };
  if (days === 1) return { label: "Besok", past: false };
  return { label: `${days} hari lagi`, past: false };
}

/**
 * Ubah satu baris dari GET /api/wishlist menjadi WishItem.
 * Mendukung dua bentuk: baris event langsung, atau baris wishlist yang membungkus event
 * (mis. { id, event_id, event: { ... } }). Sesuaikan nama field bila perlu.
 */
function toWishItem(r: any): WishItem {
  const e = (r?.event && typeof r.event === "object" && r.event) || (r?.acara && typeof r.acara === "object" && r.acara) || r;

  const artists = toArray(e.artis ?? e.artists ?? e.lineup);
  const tiers = toArray(e.kategori ?? e.tiers ?? e.ticket_types);
  const prices = tiers.map((t) => Number(t.harga ?? t.price)).filter((n) => Number.isFinite(n) && n > 0);
  const direct = Number(e.harga_terendah ?? e.harga_mulai ?? e.harga ?? e.price);
  const price = Number.isFinite(direct) && direct > 0 ? direct : prices.length ? Math.min(...prices) : null;

  const rawDate = e.tanggal ?? e.tanggal_mulai ?? e.date;
  const when = parseDate(rawDate);
  const title = first(
    e.nama_event, e.nama, e.title, e.judul, e.judul_event, e.nama_konser, e.nama_acara,
    e.event_name, e.name, e.subtitle
  );
  const genreName = e.genre?.nama ?? e.genre?.name ?? e.nama_genre ?? (typeof e.genre === "string" ? e.genre : "");
  const artist =
    artists[0]?.nama ?? artists[0]?.name ?? (typeof e.artist === "string" ? e.artist : e.nama_artis ?? "");

  return {
    id: String(r?.event_id ?? e.event_id ?? e.id ?? r?.id),
    title,
    artist,
    genre: genreName,
    date: formatDate(rawDate),
    dateMs: when ? when.getTime() : null,
    venue: e.venue ?? e.lokasi ?? "",
    city: e.kota ?? e.city ?? "",
    price,
    image: imageUrl(e.gambar ?? e.poster ?? e.image) ?? "",
    almostSoldOut: e.badge === "Hampir Habis",
  };
}

/* =====================================================================
 * HALAMAN WISHLIST
 * ===================================================================== */

export default function WishlistScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cardW = (width - 24 * 2 - 16) / 2;

  const [items, setItems] = useState<WishItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genre, setGenre] = useState("Semua");
  const [undo, setUndo] = useState<{ item: WishItem; index: number } | null>(null);
  const firstLoad = useRef(true);

  /* ---------- Ambil data ---------- */

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else if (firstLoad.current) setLoading(true);
      setError(null);

      // Backend hanya mengirim id event yang difavoritkan; detail event diambil dari GET /api/events
      const [wishRaw, eventsRaw]: any[] = await Promise.all([api.getWishlist(), api.getEvents()]);
      const wishRows: any[] = Array.isArray(wishRaw)
        ? wishRaw
        : toArray(wishRaw?.wishlist ?? wishRaw?.rows ?? wishRaw?.data);
      const eventRows: any[] = Array.isArray(eventsRaw)
        ? eventsRaw
        : toArray(eventsRaw?.events ?? eventsRaw?.rows);
      console.log("[WISHLIST] jumlah:", wishRows.length, "contoh:", JSON.stringify(wishRows[0]));

      const byId = new Map(eventRows.map((e) => [String(e.id), e]));
      const ids = wishRows.map((w) => String(w.event_id ?? w.id));

      // Daftar event biasanya tanpa kategori tiket (harga), jadi ambil detail tiap favorit
      const details = await Promise.all(ids.map((id) => api.getEvent(id).catch(() => null)));

      const list: WishItem[] = [];
      ids.forEach((id, i) => {
        const base = byId.get(id);
        const detail = details[i];
        if (base || detail) {
          const merged = { ...(base ?? {}), ...(detail ?? {}), event_id: id };
          if (i === 0) console.log("[WISHLIST] kolom event:", Object.keys(merged).join(", "));
          list.push(toWishItem(merged));
        } else {
          const w = wishRows[i];
          if (w.event || w.nama_event || w.nama || w.title) list.push(toWishItem(w)); // backend sudah menyertakan data event
        }
      });
      setItems(list);
    } catch (e: any) {
      setError(e?.message ?? "Gagal memuat favorit");
    } finally {
      firstLoad.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Muat ulang setiap kali tab Wishlist dibuka (mis. setelah menambah favorit dari detail event)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  /* ---------- Turunan ---------- */

  const filters = useMemo(() => {
    const names = Array.from(new Set(items.map((i) => i.genre).filter(Boolean)));
    return ["Semua", ...names];
  }, [items]);

  const activeGenre = filters.includes(genre) ? genre : "Semua";

  const shown = useMemo(
    () => (activeGenre === "Semua" ? items : items.filter((i) => i.genre === activeGenre)),
    [items, activeGenre]
  );

  const chipBg = (g: string, i: number) =>
    g === "Semua" ? "transparent" : CHIP_PALETTE[(i - 1) % CHIP_PALETTE.length];

  const genreBg = (g: string) => {
    const i = filters.indexOf(g);
    return i > 0 ? chipBg(g, i) : COLORS.accent;
  };

  // Snackbar "Urungkan" hilang otomatis
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 4000);
    return () => clearTimeout(t);
  }, [undo]);

  /* ---------- Aksi ---------- */

  function putBack(item: WishItem, index: number) {
    setItems((list) => {
      if (list.some((i) => i.id === item.id)) return list;
      const next = [...list];
      next.splice(Math.min(index, next.length), 0, item);
      return next;
    });
  }

  function remove(item: WishItem) {
    const index = items.findIndex((i) => i.id === item.id);
    setItems((list) => list.filter((i) => i.id !== item.id));
    setUndo({ item, index });
    api.removeWishlist(item.id).catch(() => {
      // gagal di server: kembalikan ke daftar
      putBack(item, index);
      setUndo(null);
    });
  }

  function restore() {
    if (!undo) return;
    const { item, index } = undo;
    putBack(item, index);
    setUndo(null);
    api.addWishlist(item.id).catch(() => setItems((list) => list.filter((i) => i.id !== item.id)));
  }

  const goExplore = () => router.navigate("/(tabs)/home");

  // Detail event ada di halaman Home; kita buka dengan mengirim id-nya.
  const openDetail = (id: string) =>
    router.navigate({ pathname: "/(tabs)/home", params: { event: id, from: "wishlist" } });

  const isEmpty = !loading && !error && items.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={COLORS.brand}
            colors={[COLORS.brand]}
          />
        }
      >
        <View style={styles.headerWrap}>
          <Text style={styles.heading}>Konser Favorit</Text>
          {!loading && !error && items.length > 0 && (
            <Text style={styles.count}>{items.length} konser tersimpan</Text>
          )}
        </View>

        {/* Loading */}
        {loading && <ActivityIndicator style={styles.state} color={COLORS.brand} />}

        {/* Error */}
        {!loading && error && (
          <Pressable style={styles.state} onPress={() => load()} accessibilityRole="button">
            <Ionicons name="cloud-offline-outline" size={30} color={COLORS.accent} />
            <Text style={styles.noMatchTitle}>Gagal memuat favorit</Text>
            <Text style={styles.noMatchText}>{error}</Text>
            <Text style={styles.retry}>Ketuk untuk coba lagi</Text>
          </Pressable>
        )}

        {/* Kosong */}
        {isEmpty && (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyArt} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={[styles.dot, { width: 18, height: 18, top: 8, left: 24, backgroundColor: COLORS.peach }]} />
              <View style={[styles.dot, { width: 12, height: 12, top: 40, right: 6, backgroundColor: COLORS.accent }]} />
              <View style={[styles.dot, { width: 10, height: 10, bottom: 18, left: 8, backgroundColor: COLORS.accent }]} />
              <View style={styles.emptyCircle}>
                <Ionicons name="heart" size={48} color={COLORS.brand} />
              </View>
              <View style={styles.emptyNote}>
                <Ionicons name="musical-notes" size={18} color={COLORS.brand} />
              </View>
            </View>

            <Text style={styles.emptyTitle}>Belum ada favorit</Text>
            <Text style={styles.emptyText}>
              Tandai konser yang ingin kamu tonton, dan semuanya akan tersimpan rapi di sini.
            </Text>

            <Pressable
              style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
              onPress={goExplore}
              accessibilityRole="button"
            >
              <Ionicons name="compass-outline" size={18} color={COLORS.white} />
              <Text style={styles.ctaText}>Jelajahi Konser</Text>
            </Pressable>
          </View>
        )}

        {/* Berisi */}
        {!loading && !error && items.length > 0 && (
          <>
            {/* Genre */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
              contentContainerStyle={styles.chips}
            >
              {filters.map((g, i) => {
                const active = g === activeGenre;
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

            {/* Grid */}
            <View style={styles.grid}>
              {shown.map((e) => {
                const cd = countdown(e.dateMs);
                return (
                  <Pressable
                    key={e.id}
                    style={({ pressed }) => [styles.card, { width: cardW }, pressed && styles.pressed]}
                    onPress={() => openDetail(e.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${e.title}, ${e.date}, ${e.venue}`}
                  >
                    <View style={styles.imgWrap}>
                      {!!e.image && <Image source={{ uri: e.image }} style={styles.img} resizeMode="cover" />}
                      <View style={styles.imgShade} />

                      {cd && (
                        <View style={[styles.when, cd.past && styles.whenPast]}>
                          <Text style={[styles.whenText, cd.past && styles.whenTextPast]}>{cd.label}</Text>
                        </View>
                      )}

                      <Pressable
                        style={styles.heartBtn}
                        onPress={() => remove(e)}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={`Hapus ${e.title} dari favorit`}
                      >
                        <Ionicons name="heart" size={18} color={COLORS.error} />
                      </Pressable>

                      {!!e.genre && (
                        <View style={[styles.genre, { backgroundColor: genreBg(e.genre) }]}>
                          <Text style={styles.genreText}>{e.genre}</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.info}>
                      {!!e.title && (
                        <Text style={styles.title} numberOfLines={2}>
                          {e.title}
                        </Text>
                      )}
                      {!!e.artist && (
                        <Text style={styles.artist} numberOfLines={1}>
                          {e.artist}
                        </Text>
                      )}

                      {!!e.date && (
                        <View style={styles.metaRow}>
                          <Ionicons name="calendar-outline" size={13} color={COLORS.muted} />
                          <Text style={styles.meta}>{e.date}</Text>
                        </View>
                      )}
                      {!!(e.venue || e.city) && (
                        <View style={styles.metaRow}>
                          <Ionicons name="location-outline" size={13} color={COLORS.muted} />
                          <Text style={styles.meta} numberOfLines={1}>
                            {[e.venue, e.city].filter(Boolean).join(", ")}
                          </Text>
                        </View>
                      )}

                      {e.almostSoldOut && (
                        <View style={styles.hot}>
                          <Text style={styles.hotText}>Hampir Habis</Text>
                        </View>
                      )}

                      <View style={styles.foot}>
                        <Text style={styles.from}>Mulai dari</Text>
                        <Text style={styles.price}>{e.price !== null ? formatRupiah(e.price) : "-"}</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {shown.length === 0 && (
              <View style={styles.noMatch}>
                <Text style={styles.noMatchTitle}>Tidak ada favorit {activeGenre}</Text>
                <Text style={styles.noMatchText}>Coba pilih genre lain.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {undo && <Snack onUndo={restore} />}
    </SafeAreaView>
  );
}

function Snack({ onUndo }: { onUndo: () => void }) {
  return (
    <View style={styles.snack} accessibilityLiveRegion="polite">
      <Text style={styles.snackText}>Dihapus dari favorit</Text>
      <Pressable onPress={onUndo} hitSlop={10} accessibilityRole="button">
        <Text style={styles.snackAction}>Urungkan</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingBottom: 36 },

  headerWrap: { paddingHorizontal: 24, paddingTop: 16 },
  heading: { fontFamily: SERIF, fontSize: 28, fontWeight: "700", color: COLORS.brand },
  count: { fontSize: 13.5, color: COLORS.muted, marginTop: 4 },

  state: { alignItems: "center", gap: 6, paddingVertical: 48 },
  retry: { fontSize: 13.5, fontWeight: "600", color: COLORS.brand, marginTop: 2 },

  // flexGrow: 0 -> chip hanya setinggi isinya (tidak melar mengisi layar)
  chipsScroll: { flexGrow: 0, flexShrink: 0 },
  chips: { gap: 12, paddingHorizontal: 24, paddingTop: 20, alignItems: "center" },
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

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16, paddingHorizontal: 24, paddingTop: 22 },
  card: {
    borderRadius: 26,
    backgroundColor: COLORS.white,
    overflow: "hidden",
    shadowColor: "#8A6A4F",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  // rasio poster 4:5, sama dengan halaman home & detail
  imgWrap: { width: "100%", aspectRatio: 4 / 5, backgroundColor: COLORS.accent },
  img: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  imgShade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 70,
    backgroundColor: "rgba(30, 20, 14, 0.28)",
  },
  when: {
    position: "absolute",
    left: 10,
    top: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: COLORS.brand,
  },
  whenPast: { backgroundColor: COLORS.line },
  whenText: { fontSize: 10.5, fontWeight: "700", color: COLORS.white },
  whenTextPast: { color: COLORS.muted },
  heartBtn: {
    position: "absolute",
    right: 10,
    top: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
  },
  genre: {
    position: "absolute",
    left: 10,
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 11,
  },
  genreText: { fontSize: 10.5, fontWeight: "700", color: COLORS.ink },

  info: { padding: 12, gap: 3 },
  title: { fontFamily: SERIF, fontSize: 15, lineHeight: 20, fontWeight: "700", color: COLORS.ink },
  artist: { fontSize: 13, fontWeight: "500", color: COLORS.brand },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  meta: { flex: 1, fontSize: 12, color: COLORS.muted },
  hot: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: COLORS.peach,
  },
  hotText: { fontSize: 10, fontWeight: "700", color: COLORS.muted },
  foot: { marginTop: 8 },
  from: { fontSize: 10, color: COLORS.placeholder },
  price: { fontSize: 14.5, fontWeight: "700", color: COLORS.brand },

  noMatch: { alignItems: "center", paddingVertical: 48, gap: 4 },
  noMatchTitle: { fontSize: 15, fontWeight: "700", color: COLORS.ink },
  noMatchText: { fontSize: 13, color: COLORS.muted, textAlign: "center", paddingHorizontal: 24 },

  emptyWrap: { alignItems: "center", paddingHorizontal: 36, paddingTop: 72 },
  emptyArt: { width: 170, height: 150, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", borderRadius: 20 },
  emptyCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: COLORS.sky,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyNote: {
    position: "absolute",
    right: 22,
    bottom: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontFamily: SERIF, fontSize: 22, fontWeight: "700", color: COLORS.ink, marginTop: 16 },
  emptyText: { fontSize: 13.5, lineHeight: 21, color: COLORS.muted, textAlign: "center", marginTop: 8 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 26,
    minHeight: 48,
    paddingHorizontal: 28,
    borderRadius: 24,
    backgroundColor: COLORS.brand,
  },
  ctaText: { fontSize: 14.5, fontWeight: "700", color: COLORS.white },

  snack: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 20,
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: COLORS.ink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  snackText: { fontSize: 13.5, color: COLORS.white },
  snackAction: { fontSize: 13.5, fontWeight: "700", color: COLORS.peach },

  pressed: { opacity: 0.88 },
});