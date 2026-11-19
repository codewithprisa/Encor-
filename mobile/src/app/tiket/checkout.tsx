import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  TextInput,
  Image,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";

import { api, imageUrl } from "@/lib/api";

/* ===================== KONSTANTA ===================== */

const NAVY = "#1F5A8A";
const CREAM = "#FFF8EC";
const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

const SERVICE_FEE = 25000; // biaya layanan per tiket
const COUNTDOWN_SECONDS = 15 * 60;

const rupiah = (n: number) =>
  "Rp " + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const mmss = (sec: number) => {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

function formatDate(v: unknown) {
  if (!v) return "";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

/* ===================== DATA PESANAN ===================== */

/**
 * Satu kursi yang dipilih di halaman pilihTiket.
 * Dikirim lewat params.items sebagai JSON, supaya tiap kursi membawa tiket + harganya sendiri.
 */
type Item = { id: string; code: string; tierId: string; tier: string; price: number };

type EventInfo = {
  title: string;
  genre: string;
  venue: string;
  city: string;
  date: string;
  poster?: string;
};

function parseItems(raw?: string): Item[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(String(raw));
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x: any) => ({
        id: String(x?.id ?? x?.code ?? ""),
        code: String(x?.code ?? ""),
        tierId: String(x?.tierId ?? ""),
        tier: String(x?.tier ?? "Tiket"),
        price: Number(x?.price) || 0,
      }))
      .filter((x) => x.code);
  } catch {
    return [];
  }
}

/** "A3" -> "Row A-3". Kode yang tidak cocok pola ditampilkan apa adanya. */
function seatLabel(code: string) {
  const c = code.replace(/^.*-/, "");
  const m = /^([A-Za-z]+)(\d+)$/.exec(c);
  return m ? `Row ${m[1].toUpperCase()}-${m[2]}` : code;
}

/* ===================== METODE PEMBAYARAN ===================== */

/** Bentuk data dari GET /api/pembayaran/metode/aktif */
type Method = {
  id: number;
  name: string;
  account_number: string;
  is_active: boolean;
};

/** Pilih ikon berdasarkan nama metode. */
function iconFor(name: string): keyof typeof Ionicons.glyphMap {
  const n = name.toLowerCase();
  if (n.includes("qris")) return "qr-code-outline";
  if (/(gopay|ovo|dana|linkaja|shopee|wallet|pay)/.test(n)) return "wallet-outline";
  if (/(kartu|card|kredit|debit|credit)/.test(n)) return "card-outline";
  return "business-outline"; // bank / virtual account / lainnya
}

/** "1234567890" -> "1234 5678 90" supaya lebih mudah dibaca. */
function groupNumber(v: string) {
  const digits = v.replace(/\D/g, "");
  if (digits.length !== v.replace(/[\s-]/g, "").length) return v; // ada huruf, tampilkan apa adanya
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

/* ===================== SCREEN ===================== */
/*
 * Dibuka dari halaman pilihTiket:
 *
 *   router.push({
 *     pathname: "/tiket/checkout",
 *     params: { event: <id event>, title: <nama event>, items: JSON.stringify([...]) },
 *   });
 */

export default function CheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ event?: string; title?: string; items?: string }>();

  const eventId = params.event ? String(params.event) : "";
  const items = useMemo(() => parseItems(params.items), [params.items]);

  // Info event (poster, genre, lokasi, tanggal) dari backend; judul awal dari params
  const [ev, setEv] = useState<EventInfo>({
    title: params.title ? String(params.title) : "",
    genre: "",
    venue: "",
    city: "",
    date: "",
  });

  // Rincian harga: tiap kursi memakai harga tiketnya sendiri
  const subtotal = items.reduce((sum, it) => sum + it.price, 0);
  const serviceTotal = SERVICE_FEE * items.length;
  const grandTotal = subtotal + serviceTotal;
  const tierNames = Array.from(new Set(items.map((it) => it.tier)));

  // informasi pemesan
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [editing, setEditing] = useState(false);

  // metode pembayaran (dari backend)
  const [methods, setMethods] = useState<Method[]>([]);
  const [methodsLoading, setMethodsLoading] = useState(true);
  const [methodsError, setMethodsError] = useState<string | null>(null);
  const [methodId, setMethodId] = useState<number | null>(null);

  // countdown
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const expired = secondsLeft <= 0;

  // true selama pesanan sedang dibuat di backend (mencegah dobel tap)
  const [submitting, setSubmitting] = useState(false);

  /* ---------- Ambil metode pembayaran ---------- */

  const loadMethods = useCallback(async () => {
    setMethodsLoading(true);
    setMethodsError(null);
    try {
      // Lihat catatan: fungsi ini perlu ditambahkan di "@/lib/api".
      const res: any = await api.getMetodePembayaran();
      const list: Method[] = Array.isArray(res) ? res : res?.data ?? [];
      setMethods(list);
      // pilihan sebelumnya dipertahankan kalau masih ada; kalau tidak, kosongkan
      setMethodId((prev) => (list.some((m) => m.id === prev) ? prev : null));
    } catch (e: any) {
      setMethodsError(e?.message || "Gagal memuat metode pembayaran.");
    } finally {
      setMethodsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMethods();
  }, [loadMethods]);

  /* ---------- Ambil data event & pemesan ---------- */

  useEffect(() => {
    let alive = true;

    if (eventId) {
      api
        .getEvent(eventId)
        .then((r: any) => {
          if (!alive || !r) return;
          const genre =
            r.genre?.nama ??
            r.genre?.name ??
            r.nama_genre ??
            (typeof r.genre === "string" ? r.genre : "");
          setEv((prev) => ({
            title: String(r.nama_event ?? r.nama ?? r.title ?? prev.title),
            genre: String(genre ?? ""),
            venue: String(r.venue ?? r.lokasi ?? ""),
            city: String(r.kota ?? r.city ?? ""),
            date: formatDate(r.tanggal ?? r.tanggal_mulai ?? r.date),
            poster: imageUrl(r.gambar ?? r.poster ?? r.image),
          }));
        })
        .catch(() => {}); // kalau gagal, tetap pakai judul dari params
    }

    // Isi data pemesan dari akun yang login
    api
      .getMe()
      .then((u: any) => {
        if (!alive || !u) return;
        setName((prev) => prev || String(u.name ?? ""));
        setEmail((prev) => prev || String(u.email ?? ""));
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [eventId]);

  /* ---------- Countdown ---------- */

  useEffect(() => {
    const t = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (secondsLeft !== 0) return;
    Alert.alert("Waktu habis", "Waktu pembayaran sudah berakhir. Silakan pilih tiket lagi.", [
      { text: "OK", onPress: () => router.back() },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  /* ---------- Bayar ---------- */

  const selected = methods.find((m) => m.id === methodId) ?? null;
  const canPay =
    items.length > 0 &&
    !!selected &&
    !submitting &&
    !expired &&
    email.trim() !== "" &&
    name.trim() !== "";

  const handlePay = async () => {
    if (items.length === 0) {
      Alert.alert("Belum ada kursi", "Silakan pilih kursi terlebih dahulu.");
      return;
    }
    if (!selected) {
      Alert.alert("Pilih metode", "Pilih salah satu metode pembayaran dulu.");
      return;
    }
    if (!name.trim() || !email.trim()) {
      Alert.alert("Data pemesan", "Nama dan email wajib diisi.");
      return;
    }

    if (submitting) return;
    setSubmitting(true);

    // 1) Buat pesanan di backend. Sesuaikan isi `body` dengan yang diminta Checkoutroutes kamu.
    let orderId = "";
    try {
      const r: any = await api.createOrder({
        paymentMethod: selected.name, // nama persis seperti di tabel payment_methods
        items: items.map((it) => ({
          ticketTypeId: Number(it.tierId),
          quantity: 1, // 1 kursi = 1 tiket
          // seatId hanya dikirim kalau id kursi dari pilihTiket adalah id numerik di tabel seats
          ...(/^\d+$/.test(it.id) ? { seatId: Number(it.id) } : {}),
        })),
      });
      orderId = String(r?.orderId ?? r?.order_id ?? r?.order?.id ?? r?.id ?? "");
      if (!orderId) throw new Error("Pesanan gagal dibuat. Coba lagi.");
    } catch (e: any) {
      setSubmitting(false);
      Alert.alert("Gagal membuat pesanan", e?.message ?? "Coba lagi.");
      return;
    }
    setSubmitting(false);

    // 2) Langsung pindah ke halaman payment. `replace` supaya tombol kembali
    //    tidak membawa user ke checkout lagi (dan tidak membuat pesanan ganda).
    router.replace({
      pathname: "/tiket/payment" as any,
      params: {
        orderId,
        eventId,
        event: ev.title, // nama event (kompatibel dengan versi lama)
        tier: tierNames.join(" + "),
        seats: items.map((it) => it.code).join(","),
        items: JSON.stringify(items), // rincian kursi + tiket + harga
        method: selected.name, // nama metode, persis seperti di tabel payment_methods
        methodId: String(selected.id),
        accountNumber: selected.account_number,
        bank: "", // tidak dipakai lagi; disisakan agar halaman lama tidak error
        name,
        email,
        subtotal: String(subtotal),
        serviceFee: String(serviceTotal),
        total: String(grandTotal),
      },
    });
  };

  /* ---------- UI ---------- */

  const venueLine = [ev.venue && (ev.city ? `${ev.venue}, ${ev.city}` : ev.venue), ev.date]
    .filter(Boolean)
    .join(" • ");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerSide}>
          <Ionicons name="arrow-back" size={20} color={NAVY} />
        </Pressable>
        <Text style={styles.brand}>Encoré</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 200 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Judul */}
        <Text style={styles.pageTitle}>Penyelesaian Pesanan</Text>
        <Text style={styles.pageSub}>
          Selesaikan pembayaran dalam{" "}
          <Text style={{ color: NAVY, fontWeight: "700" }}>{mmss(secondsLeft)}</Text>
        </Text>

        {/* Informasi pemesan */}
        <View style={styles.labelRow}>
          <Text style={styles.label}>INFORMASI PEMESAN</Text>
          <Pressable onPress={() => setEditing((e) => !e)} hitSlop={8}>
            <Text style={styles.editLink}>{editing ? "Selesai" : "Ubah"}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Ionicons name="person-outline" size={16} color={NAVY} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>NAMA LENGKAP</Text>
              {editing ? (
                <TextInput
                  value={name}
                  onChangeText={setName}
                  style={styles.input}
                  placeholder="Nama lengkap"
                  placeholderTextColor="#B5AE9E"
                />
              ) : (
                <Text style={[styles.infoValue, !name && styles.infoEmpty]}>
                  {name || "Belum diisi"}
                </Text>
              )}
            </View>
          </View>

          <View style={[styles.infoRow, { marginTop: 14 }]}>
            <View style={styles.infoIcon}>
              <Ionicons name="mail-outline" size={16} color={NAVY} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>EMAIL</Text>
              {editing ? (
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor="#B5AE9E"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              ) : (
                <Text style={[styles.infoValue, !email && styles.infoEmpty]}>
                  {email || "Belum diisi"}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Detail tiket */}
        <Text style={[styles.label, { marginTop: 26, marginBottom: 10 }]}>DETAIL TIKET</Text>

        <View style={styles.card}>
          <View style={styles.eventRow}>
            {ev.poster ? (
              <Image source={{ uri: ev.poster }} style={styles.posterImg} resizeMode="cover" />
            ) : (
              <View style={styles.poster}>
                <Ionicons name="musical-notes" size={26} color="#fff" />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 14 }}>
              {!!ev.genre && (
                <View style={styles.genreBadge}>
                  <Text style={styles.genreText}>{ev.genre}</Text>
                </View>
              )}
              <Text style={styles.eventName} numberOfLines={2}>
                {ev.title || "Event"}
              </Text>
              {!!venueLine && (
                <View style={styles.venueRow}>
                  <Ionicons name="location-outline" size={12} color="#8A8575" />
                  <Text style={styles.venueText} numberOfLines={2}>
                    {venueLine}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.divider} />

          {items.length === 0 ? (
            <Text style={styles.emptyText}>Belum ada kursi yang dipilih.</Text>
          ) : (
            items.map((it) => (
              <View key={it.id} style={styles.lineRow}>
                <Text style={styles.lineLeft}>
                  {it.tier} — {seatLabel(it.code)} (x1)
                </Text>
                <Text style={styles.lineRight}>{rupiah(it.price)}</Text>
              </View>
            ))
          )}

          <View style={styles.lineRow}>
            <Text style={styles.lineLeft}>Biaya Layanan ({items.length} tiket)</Text>
            <Text style={[styles.lineRight, { fontWeight: "500" }]}>{rupiah(serviceTotal)}</Text>
          </View>

          <View style={[styles.divider, { marginTop: 6 }]} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL</Text>
            <Text style={styles.totalValue}>{rupiah(grandTotal)}</Text>
          </View>
        </View>

        {/* Metode pembayaran */}
        <Text style={[styles.label, { marginTop: 26, marginBottom: 10 }]}>METODE PEMBAYARAN</Text>

        {methodsLoading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator color={NAVY} />
            <Text style={styles.stateText}>Memuat metode pembayaran…</Text>
          </View>
        ) : methodsError ? (
          <View style={styles.stateBox}>
            <Ionicons name="alert-circle-outline" size={26} color="#C4372D" />
            <Text style={styles.stateText}>{methodsError}</Text>
            <Pressable onPress={loadMethods} style={styles.retryBtn} accessibilityRole="button">
              <Text style={styles.retryText}>Coba lagi</Text>
            </Pressable>
          </View>
        ) : methods.length === 0 ? (
          <View style={styles.stateBox}>
            <Ionicons name="card-outline" size={26} color="#8A8575" />
            <Text style={styles.stateText}>
              Belum ada metode pembayaran yang tersedia. Hubungi admin atau coba lagi nanti.
            </Text>
          </View>
        ) : (
          methods.map((m) => {
            const active = methodId === m.id;
            return (
              <Pressable
                key={m.id}
                onPress={() => setMethodId(m.id)}
                style={[styles.methodCard, active && styles.methodCardActive, { marginBottom: 10 }]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <View style={styles.methodIcon}>
                  <Ionicons name={iconFor(m.name)} size={18} color={NAVY} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.methodTitle}>{m.name}</Text>
                  <Text style={styles.methodSub}>{groupNumber(m.account_number)}</Text>
                </View>
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active && <View style={styles.radioDot} />}
                </View>
              </Pressable>
            );
          })
        )}

        {/* Syarat */}
        <Text style={styles.terms}>
          Dengan melanjutkan, Anda menyetujui{" "}
          <Text style={styles.termsLink}>Syarat & Ketentuan</Text> serta{" "}
          <Text style={styles.termsLink}>Kebijakan Privasi</Text> yang berlaku di Encoré.
        </Text>
      </ScrollView>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        <View style={styles.bottomTop}>
          <Text style={styles.bottomLabel}>TOTAL PEMBAYARAN</Text>
          <Text style={styles.bottomTimer}>Berakhir dalam {mmss(secondsLeft)}</Text>
        </View>
        <Text style={styles.bottomTotal}>{rupiah(grandTotal)}</Text>

        <Pressable
          onPress={handlePay}
          disabled={!canPay}
          style={[styles.payBtn, !canPay && { opacity: 0.5 }]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canPay }}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.payText}>Bayar Sekarang</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/* ===================== STYLES ===================== */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CREAM },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerSide: { width: 24 },
  brand: { fontFamily: SERIF, fontSize: 18, fontWeight: "700", color: NAVY },

  pageTitle: { fontFamily: SERIF, fontSize: 26, fontWeight: "700", color: "#1A1A1A" },
  pageSub: { fontSize: 13, color: "#6B6455", marginTop: 6, marginBottom: 24 },

  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  label: { fontSize: 10, fontWeight: "700", color: "#6B6455", letterSpacing: 1.2 },
  editLink: { fontSize: 12, color: NAVY, fontWeight: "700" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  infoRow: { flexDirection: "row", alignItems: "center" },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#DCEAF5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  infoLabel: { fontSize: 9, fontWeight: "700", color: "#8A8575", letterSpacing: 0.8 },
  infoValue: { fontSize: 14, fontWeight: "600", color: "#1A1A1A", marginTop: 2 },
  infoEmpty: { color: "#B5AE9E", fontWeight: "500" },
  input: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A1A",
    marginTop: 2,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#D8D0BC",
  },

  eventRow: { flexDirection: "row", alignItems: "center" },
  poster: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: "#22303F",
    alignItems: "center",
    justifyContent: "center",
  },
  posterImg: { width: 64, height: 80, borderRadius: 10, backgroundColor: "#A1BFD1" },
  genreBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#E8DCC0",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
  },
  genreText: { fontSize: 9, fontWeight: "700", color: "#7A5F1E" },
  eventName: { fontFamily: SERIF, fontSize: 17, fontWeight: "700", color: "#1A1A1A" },
  venueRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  venueText: { flex: 1, fontSize: 11, color: "#8A8575", marginLeft: 4 },

  divider: { height: 1, backgroundColor: "#EFE8D8", marginVertical: 14 },
  emptyText: { fontSize: 12, color: "#8A8575", marginBottom: 8 },
  lineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  lineLeft: { fontSize: 13, color: "#444", flex: 1, paddingRight: 8 },
  lineRight: { fontSize: 13, fontWeight: "700", color: "#1A1A1A" },

  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: { fontSize: 11, fontWeight: "700", color: "#6B6455", letterSpacing: 1 },
  totalValue: { fontFamily: SERIF, fontSize: 18, fontWeight: "700", color: NAVY },

  methodCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  methodCardActive: { backgroundColor: "#EDF5EC", borderColor: "#6FA832" },
  methodIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#F2E3D6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  methodTitle: { fontSize: 14, fontWeight: "700", color: "#1A1A1A" },
  methodSub: { fontSize: 11, color: "#6B6455", marginTop: 2 },

  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#BDB6A5",
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { borderColor: NAVY },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: NAVY },

  stateBox: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 10,
  },
  stateText: { fontSize: 12.5, color: "#6B6455", textAlign: "center", lineHeight: 18 },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D8D0BC",
  },
  retryText: { fontSize: 13, fontWeight: "700", color: NAVY },

  terms: {
    fontSize: 10,
    color: "#6B6455",
    textAlign: "center",
    lineHeight: 16,
    marginTop: 18,
    paddingHorizontal: 12,
  },
  termsLink: { textDecorationLine: "underline" },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FDF0EC",
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#F1E1D8",
  },
  bottomTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bottomLabel: { fontSize: 10, fontWeight: "700", color: "#6B6455", letterSpacing: 1 },
  bottomTimer: { fontSize: 10, color: "#E5533D", fontWeight: "600" },
  bottomTotal: {
    fontFamily: SERIF,
    fontSize: 24,
    fontWeight: "700",
    color: NAVY,
    marginTop: 2,
    marginBottom: 12,
  },
  payBtn: {
    backgroundColor: NAVY,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
  },
  payText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});