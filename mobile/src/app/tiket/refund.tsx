import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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
  errorBg: "#FBE9E7",
  peach: "#F8D9B4",
  sand: "#F2DDC1",
  bar: "#FDEFDD",
  warn: "#F6E6CE",
  warnLine: "#E8CFA8",
  ok: "#DCEFE0",
  okText: "#2E7D4F",
};

const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/* =====================================================================
 * TIPE & HELPER
 * ===================================================================== */

/** Field yang dibutuhkan dari Ticket di tiket.tsx */
export type RefundTicket = {
  title: string;
  subtitle: string;
  date: string;
  area: string;
  invoice: string;
  image: string;
  /** Harga tiket dalam rupiah, contoh: 875000 */
  price: number;
};

export type RefundStatus = "Diproses" | "Disetujui" | "Ditolak";

export type RefundRecord = {
  id: string;
  /** Diisi jika pengajuan berasal dari tiket di aplikasi (dipakai untuk pembatalan). */
  ticketId?: string;
  title: string;
  invoice: string;
  /** Waktu pengajuan, contoh: "9 Oktober, 10:15 WIB" */
  date: string;
  /** Nominal refund (setelah dipotong biaya admin) */
  amount: number;
  reason: string;
  status: RefundStatus;
  /** Catatan dari admin (misalnya alasan penolakan) */
  note?: string;
};

export type RefundData = {
  reason: string;
  detail: string;
};

/** Biaya admin 5% */
export const ADMIN_FEE = 0.05;

export const refundAmount = (price: number) => Math.round(price * (1 - ADMIN_FEE));

export const rupiah = (n: number) => "Rp " + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const REASONS = [
  "Berhalangan hadir",
  "Acara dibatalkan",
  "Acara diundur / jadwal berubah",
  "Salah membeli tiket",
  "Pembelian ganda",
  "Alasan lainnya",
];

/* =====================================================================
 * FORM — AJUKAN REFUND
 * ===================================================================== */

export function RefundForm({
  ticket,
  onBack,
  onSubmit,
}: {
  ticket: RefundTicket;
  onBack: () => void;
  onSubmit: (data: RefundData) => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const estimate = refundAmount(ticket.price);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  function submit() {
    if (!reason) {
      setError("Pilih alasan refund terlebih dahulu.");
      return;
    }
    if (reason === "Alasan lainnya" && !detail.trim()) {
      setError("Ceritakan alasanmu pada kolom detail tambahan.");
      return;
    }
    Alert.alert(
      "Kirim pengajuan refund?",
      `Estimasi dana kembali ${rupiah(estimate)} setelah dipotong biaya admin 5%.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Kirim",
          onPress: async () => {
            setSending(true);
            // TODO: panggil API pengajuan refund. Simulasi singkat:
            await new Promise((r) => setTimeout(r, 700));
            setSending(false);
            onSubmit({ reason, detail: detail.trim() });
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={r.safe} edges={["top", "bottom"]}>
      <View style={r.bar}>
        <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Kembali">
          <Ionicons name="arrow-back" size={22} color={COLORS.brand} />
        </Pressable>
        <Text style={r.barTitle}>Ajukan Refund</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView style={r.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={r.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Detail pesanan */}
          <Text style={r.label}>DETAIL PESANAN</Text>
          <View style={r.order}>
            <Image source={{ uri: ticket.image }} style={r.poster} resizeMode="cover" accessibilityIgnoresInvertColors />
            <View style={r.orderBody}>
              <Text style={r.orderTitle} numberOfLines={2}>
                {ticket.subtitle}
              </Text>
              <Text style={r.orderMeta} numberOfLines={1}>
                {ticket.date} • {ticket.area.split(",")[0]}
              </Text>
              <Text style={r.orderId}>ID #{ticket.invoice}</Text>
            </View>
            <Text style={r.orderPrice}>{rupiah(ticket.price)}</Text>
          </View>

          {/* Alasan */}
          <Text style={[r.label, { marginTop: 26 }]}>ALASAN PENGEMBALIAN</Text>
          <Pressable
            style={[r.select, error && !reason && r.fieldError]}
            onPress={() => setOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="Pilih alasan refund"
            accessibilityState={{ expanded: open }}
          >
            <Text style={[r.selectText, !reason && r.selectPlaceholder]}>{reason ?? "Pilih alasan refund"}</Text>
            <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={COLORS.ink} />
          </Pressable>

          {open && (
            <View style={r.menu}>
              {REASONS.map((x, i) => {
                const on = reason === x;
                return (
                  <Pressable
                    key={x}
                    style={({ pressed }) => [r.option, i > 0 && r.optionBorder, pressed && r.pressed]}
                    onPress={() => {
                      setReason(x);
                      setOpen(false);
                      setError(null);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[r.optionText, on && r.optionTextOn]}>{x}</Text>
                    {on && <Ionicons name="checkmark" size={18} color={COLORS.brand} />}
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Detail */}
          <Text style={[r.label, { marginTop: 22 }]}>DETAIL TAMBAHAN</Text>
          <TextInput
            style={r.textarea}
            value={detail}
            onChangeText={(v) => (setDetail(v), setError(null))}
            placeholder="Ceritakan detail kendala Anda di sini..."
            placeholderTextColor={COLORS.placeholder}
            multiline
            maxLength={300}
            textAlignVertical="top"
            accessibilityLabel="Detail tambahan"
          />

          {error && <Text style={r.error}>{error}</Text>}

          {/* Estimasi */}
          <View style={r.estimate}>
            <View style={r.estimateLeft}>
              <Text style={r.estimateLabel}>Estimasi Nominal Refund</Text>
              <Text style={r.estimateNote}>(Dipotong biaya admin 5%)</Text>
            </View>
            <Text style={r.estimateValue}>{rupiah(estimate)}</Text>
          </View>
        </ScrollView>

        <View style={r.footer}>
          <Pressable
            style={({ pressed }) => [r.submit, pressed && !sending && r.pressed, sending && r.submitOff]}
            onPress={submit}
            disabled={sending}
            accessibilityRole="button"
            accessibilityState={{ disabled: sending, busy: sending }}
          >
            <Text style={r.submitText}>{sending ? "Mengirim..." : "Kirim Pengajuan Refund"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* =====================================================================
 * DAFTAR REFUND — 2 tab: Sedang Diajukan | Riwayat
 * ===================================================================== */

type RefundTab = "pending" | "history";

const STATUS_STYLE: Record<RefundStatus, { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  Diproses: { bg: COLORS.peach, fg: COLORS.muted, icon: "time-outline" },
  Disetujui: { bg: COLORS.ok, fg: COLORS.okText, icon: "checkmark-circle-outline" },
  Ditolak: { bg: COLORS.errorBg, fg: COLORS.error, icon: "close-circle-outline" },
};

export default function RefundList({
  refunds,
  onBack,
  onCancel,
}: {
  refunds: RefundRecord[];
  onBack: () => void;
  /** Dipanggil setelah pengguna mengonfirmasi pembatalan pengajuan. */
  onCancel: (id: string) => void;
}) {
  const [tab, setTab] = useState<RefundTab>("pending");

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const pending = refunds.filter((x) => x.status === "Diproses");
  const history = refunds.filter((x) => x.status !== "Diproses");
  const list = tab === "pending" ? pending : history;

  function confirmCancel(item: RefundRecord) {
    Alert.alert("Batalkan pengajuan?", `Pengajuan refund untuk "${item.title}" akan dibatalkan.`, [
      { text: "Tidak", style: "cancel" },
      {
        text: "Batalkan",
        style: "destructive",
        onPress: () => {
          // TODO: batalkan pengajuan di API kamu
          onCancel(item.id);
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={r.safe} edges={["top", "bottom"]}>
      <View style={r.bar}>
        <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Kembali">
          <Ionicons name="arrow-back" size={22} color={COLORS.brand} />
        </Pressable>
        <Text style={r.barTitle}>Status Refund</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={r.scroll} showsVerticalScrollIndicator={false}>
        {/* Tab */}
        <View style={r.tabs}>
          {(["pending", "history"] as RefundTab[]).map((k) => {
            const on = tab === k;
            const count = k === "pending" ? pending.length : history.length;
            return (
              <Pressable
                key={k}
                style={[r.tab, on && r.tabOn]}
                onPress={() => setTab(k)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[r.tabText, on && r.tabTextOn]}>
                  {k === "pending" ? "Sedang Diajukan" : "Riwayat"}
                  {count > 0 ? ` (${count})` : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={r.list}>
          {list.map((item) => {
            const s = STATUS_STYLE[item.status];
            return (
              <View key={item.id} style={r.card}>
                <View style={r.cardHead}>
                  <View style={r.cardHeadBody}>
                    <Text style={r.cardTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={r.cardInvoice}>ID #{item.invoice}</Text>
                  </View>
                  <View style={[r.badge, { backgroundColor: s.bg }]}>
                    <Ionicons name={s.icon} size={13} color={s.fg} />
                    <Text style={[r.badgeText, { color: s.fg }]}>{item.status}</Text>
                  </View>
                </View>

                <View style={r.divider} />

                <View style={r.kv}>
                  <Text style={r.k}>Diajukan</Text>
                  <Text style={r.v}>{item.date}</Text>
                </View>
                <View style={r.kv}>
                  <Text style={r.k}>Alasan</Text>
                  <Text style={r.v}>{item.reason}</Text>
                </View>
                <View style={r.kv}>
                  <Text style={r.k}>{item.status === "Ditolak" ? "Nominal diajukan" : "Nominal refund"}</Text>
                  <Text style={[r.v, r.amount, item.status === "Ditolak" && r.amountOff]}>
                    {rupiah(item.amount)}
                  </Text>
                </View>

                {item.status === "Diproses" && (
                  <>
                    <View style={r.info}>
                      <Ionicons name="information-circle-outline" size={18} color={COLORS.muted} />
                      <Text style={r.infoText}>
                        Pengajuanmu sedang ditinjau. Estimasi proses 3–5 hari kerja.
                      </Text>
                    </View>
                    <Pressable
                      style={({ pressed }) => [r.cancel, pressed && r.pressed]}
                      onPress={() => confirmCancel(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Batalkan pengajuan refund ${item.title}`}
                    >
                      <Text style={r.cancelText}>Batalkan Pengajuan</Text>
                    </Pressable>
                  </>
                )}

                {item.status === "Disetujui" && (
                  <View style={[r.info, r.infoOk]}>
                    <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.okText} />
                    <Text style={[r.infoText, { color: COLORS.okText }]}>
                      {item.note ?? "Refund disetujui. Dana dikembalikan ke metode pembayaranmu."}
                    </Text>
                  </View>
                )}

                {item.status === "Ditolak" && (
                  <View style={[r.info, r.infoErr]}>
                    <Ionicons name="alert-circle-outline" size={18} color={COLORS.error} />
                    <Text style={[r.infoText, { color: COLORS.error }]}>
                      {item.note ?? "Pengajuan refund tidak dapat diproses."}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}

          {list.length === 0 && (
            <View style={r.empty}>
              <Ionicons name="receipt-outline" size={34} color={COLORS.accent} />
              <Text style={r.emptyTitle}>
                {tab === "pending" ? "Tidak ada pengajuan refund" : "Belum ada riwayat refund"}
              </Text>
              <Text style={r.emptyText}>
                {tab === "pending"
                  ? "Pengajuan refund yang sedang diproses akan muncul di sini."
                  : "Refund yang sudah disetujui atau ditolak akan muncul di sini."}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const r = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32 },

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
  barTitle: { fontFamily: SERIF, fontSize: 19, fontWeight: "700", color: COLORS.brand },

  label: { fontSize: 10.5, fontWeight: "600", letterSpacing: 1.1, color: COLORS.muted },

  /* Form */
  order: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 10,
    padding: 14,
    borderRadius: 24,
    backgroundColor: COLORS.white,
    shadowColor: "#8A6A4F",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  poster: { width: 72, height: 72, borderRadius: 8, backgroundColor: COLORS.accent },
  orderBody: { flex: 1, gap: 3 },
  orderTitle: { fontFamily: SERIF, fontSize: 17, lineHeight: 22, fontWeight: "700", color: COLORS.ink },
  orderMeta: { fontSize: 12.5, color: COLORS.muted },
  orderId: { fontSize: 11.5, color: COLORS.placeholder, marginTop: 4 },
  orderPrice: { fontFamily: SERIF, fontSize: 14.5, fontWeight: "700", color: COLORS.brand, marginTop: 2 },

  select: {
    minHeight: 48,
    marginTop: 10,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldError: { borderColor: COLORS.error },
  selectText: { flex: 1, fontSize: 14, color: COLORS.ink },
  selectPlaceholder: { color: COLORS.ink },
  menu: {
    marginTop: 6,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    overflow: "hidden",
  },
  option: {
    minHeight: 46,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionBorder: { borderTopWidth: 1, borderTopColor: COLORS.line },
  optionText: { fontSize: 14, color: COLORS.ink },
  optionTextOn: { fontWeight: "700", color: COLORS.brand },

  textarea: {
    minHeight: 130,
    marginTop: 10,
    padding: 16,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.ink,
  },
  error: { fontSize: 12, color: COLORS.error, marginTop: 8, paddingLeft: 4 },

  estimate: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 26,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 22,
    backgroundColor: COLORS.sand,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  estimateLeft: { flex: 1, gap: 2 },
  estimateLabel: { fontSize: 12, color: COLORS.muted },
  estimateNote: { fontSize: 13, color: COLORS.ink },
  estimateValue: { fontFamily: SERIF, fontSize: 21, fontWeight: "700", color: COLORS.brand },

  footer: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 12, backgroundColor: COLORS.background },
  submit: {
    minHeight: 54,
    borderRadius: 27,
    backgroundColor: COLORS.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  submitOff: { opacity: 0.6 },
  submitText: { fontSize: 15, fontWeight: "700", color: COLORS.white },

  /* Daftar */
  tabs: { flexDirection: "row", padding: 4, borderRadius: 24, backgroundColor: COLORS.sand },
  tab: { flex: 1, minHeight: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: COLORS.white },
  tabText: { fontSize: 13.5, fontWeight: "500", color: COLORS.muted },
  tabTextOn: { fontWeight: "700", color: COLORS.brand },

  list: { marginTop: 20, gap: 16 },
  card: {
    padding: 16,
    borderRadius: 24,
    backgroundColor: COLORS.white,
    shadowColor: "#8A6A4F",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardHeadBody: { flex: 1, gap: 3 },
  cardTitle: { fontFamily: SERIF, fontSize: 17, lineHeight: 22, fontWeight: "700", color: COLORS.ink },
  cardInvoice: { fontSize: 12, color: COLORS.placeholder },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
  divider: { height: 1, backgroundColor: COLORS.line, marginVertical: 14 },
  kv: { flexDirection: "row", justifyContent: "space-between", gap: 16, marginBottom: 8 },
  k: { fontSize: 12.5, color: COLORS.muted },
  v: { flex: 1, fontSize: 13, fontWeight: "600", color: COLORS.ink, textAlign: "right" },
  amount: { fontFamily: SERIF, fontSize: 15, color: COLORS.brand },
  amountOff: { color: COLORS.muted, textDecorationLine: "line-through" },

  info: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
    padding: 12,
    borderRadius: 14,
    backgroundColor: COLORS.warn,
    borderWidth: 1,
    borderColor: COLORS.warnLine,
  },
  infoOk: { backgroundColor: COLORS.ok, borderColor: COLORS.ok },
  infoErr: { backgroundColor: COLORS.errorBg, borderColor: COLORS.errorBg },
  infoText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: COLORS.muted },

  cancel: {
    marginTop: 14,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.error,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontSize: 13.5, fontWeight: "700", color: COLORS.error },

  empty: { alignItems: "center", gap: 6, paddingVertical: 44 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: COLORS.ink },
  emptyText: { fontSize: 13, lineHeight: 19, color: COLORS.muted, textAlign: "center" },

  pressed: { opacity: 0.88 },
});