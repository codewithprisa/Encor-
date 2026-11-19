import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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

import { api, imageUrl } from "@/lib/api";

/* =====================================================================
 * TEMA (sama dengan halaman lain)
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
  warn: "#F6E6CE",
  warnLine: "#E8CFA8",
  okText: "#2E7D4F",
};

const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/* =====================================================================
 * TIPE
 * ===================================================================== */

export type TransferTicket = {
  /** id tiket/kursi yang ditransfer (dikirim ke backend). WAJIB diisi dari tiket.tsx. */
  id: string;
  subtitle: string;
  date: string;
  image: string;
  category: string;
  seat: string;
};

export type TransferRecord = {
  id: string;
  name: string;
  date: string;
  status: "Diterima" | "Menunggu";
};

export type TransferData = {
  /** id transfer yang dibuat backend (status awal: menunggu) */
  transferId?: string;
  recipientId: string;
  name: string;
  contact: string;
  message: string;
};

type Recipient = {
  id: string;
  name: string;
  email: string;
  phone: string;
  photo?: string;
};

/* =====================================================================
 * HELPER
 * ===================================================================== */

function initials(name: string) {
  return (
    name
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

/** Ubah satu baris user dari backend jadi Recipient (nama field dibuat longgar). */
function toRecipient(x: any): Recipient {
  return {
    id: String(x?.id ?? x?.user_id ?? ""),
    name: String(x?.name ?? x?.nama ?? ""),
    email: String(x?.email ?? ""),
    phone: String(x?.phone ?? x?.no_hp ?? x?.telepon ?? ""),
    photo: imageUrl(x?.photo ?? x?.foto ?? null),
  };
}

/** Foto bulat; jika kosong / gagal dimuat, tampilkan inisial nama. */
function Avatar({ name, photo, size = 44 }: { name: string; photo?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: size / 2 };

  if (photo && !failed) {
    return <Image source={{ uri: photo }} style={[t.avatar, box]} onError={() => setFailed(true)} />;
  }
  return (
    <View style={[t.avatar, box]}>
      <Text style={t.avatarText}>{initials(name)}</Text>
    </View>
  );
}

/* =====================================================================
 * ALUR TRANSFER: 1) cari & pilih penerima  →  2) tinjau & kirim
 * ===================================================================== */

export default function TransferFlow({
  ticket,
  onBack,
  onSend,
}: {
  ticket: TransferTicket;
  /** Tidak dipakai lagi. Dibiarkan opsional supaya tiket.tsx tetap valid. */
  history?: TransferRecord[];
  onBack: () => void;
  onSend: (data: TransferData) => void;
}) {
  const [step, setStep] = useState<"pick" | "form">("pick");
  const [recipient, setRecipient] = useState<Recipient | null>(null);

  // Tombol back Android: dari form kembali ke pilih penerima, dari pilih penerima menutup alur.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (step === "form") setStep("pick");
      else onBack();
      return true;
    });
    return () => sub.remove();
  }, [step, onBack]);

  if (step === "form" && recipient) {
    return (
      <TransferForm
        ticket={ticket}
        recipient={recipient}
        onBack={() => setStep("pick")}
        onSend={onSend}
      />
    );
  }

  return (
    <PickRecipient
      onBack={onBack}
      onPick={(r) => {
        setRecipient(r);
        setStep("form");
      }}
    />
  );
}

/* =====================================================================
 * LANGKAH 1 — PILIH PENERIMA
 * Semua pengguna dimuat dulu (GET /users/search tanpa q), lalu kolom
 * pencarian hanya menyaring daftar yang sudah ada di perangkat.
 * ===================================================================== */

function PickRecipient({ onBack, onPick }: { onBack: () => void; onPick: (r: Recipient) => void }) {
  const [users, setUsers] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw: any = await api.getUsers();
      const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.users) ? raw.users : [];
      setUsers(rows.map(toRecipient).filter((r: Recipient) => !!r.id));
    } catch (e: any) {
      setError(e?.message ?? "Gagal memuat pengguna");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const digits = q.replace(/[\s-]/g, "");

  const results = useMemo(() => {
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (digits.length > 0 && u.phone.replace(/[\s-]/g, "").includes(digits))
    );
  }, [users, q, digits]);

  return (
    <SafeAreaView style={t.safe} edges={["top", "bottom"]}>
      <View style={t.bar}>
        <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Kembali">
          <Ionicons name="arrow-back" size={22} color={COLORS.brand} />
        </Pressable>
        <Text style={t.barTitle}>Pilih Penerima</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={t.searchWrap}>
        <View style={t.search}>
          <Ionicons name="search-outline" size={20} color={COLORS.brand} />
          <TextInput
            style={t.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Cari nama, email, atau nomor HP"
            placeholderTextColor={COLORS.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Cari penerima"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityLabel="Hapus pencarian">
              <Ionicons name="close-circle" size={18} color={COLORS.placeholder} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={t.list}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading && <ActivityIndicator style={{ paddingVertical: 40 }} color={COLORS.brand} />}

        {!loading && error && (
          <Pressable style={t.empty} onPress={load} accessibilityRole="button">
            <Ionicons name="cloud-offline-outline" size={32} color={COLORS.accent} />
            <Text style={t.emptyTitle}>Gagal memuat pengguna</Text>
            <Text style={t.emptyText}>{error}</Text>
            <Text style={t.change}>Ketuk untuk coba lagi</Text>
          </Pressable>
        )}

        {!loading && !error && results.length > 0 && (
          <Text style={t.label}>{q ? "HASIL PENCARIAN" : "PENGGUNA ENCORÉ"}</Text>
        )}

        {!loading &&
          !error &&
          results.map((u) => (
            <Pressable
              key={u.id}
              style={({ pressed }) => [t.row, pressed && t.pressed]}
              onPress={() => onPick(u)}
              accessibilityRole="button"
              accessibilityLabel={`${u.name}, ${u.email}`}
            >
              <Avatar name={u.name} photo={u.photo} />
              <View style={t.rowBody}>
                <Text style={t.rowName}>{u.name}</Text>
                <Text style={t.rowSub}>{u.email}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.placeholder} />
            </Pressable>
          ))}

        {!loading && !error && results.length === 0 && (
          <View style={t.empty}>
            <Ionicons name="person-outline" size={32} color={COLORS.accent} />
            <Text style={t.emptyTitle}>Pengguna tidak ditemukan</Text>
            <Text style={t.emptyText}>
              {users.length === 0 ? "Belum ada pengguna lain yang bisa menerima tiket." : "Coba nama, email, atau nomor HP lain."}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* =====================================================================
 * LANGKAH 2 — TINJAU & KIRIM
 * ===================================================================== */

function TransferForm({
  ticket,
  recipient,
  onBack,
  onSend,
}: {
  ticket: TransferTicket;
  recipient: Recipient;
  onBack: () => void;
  onSend: (data: TransferData) => void;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  function submit() {
    setError(null);
    Alert.alert(
      "Kirim tiket?",
      `Permintaan transfer akan dikirim ke ${recipient.name}. Tiket baru berpindah setelah ${recipient.name} menerimanya, dan transfer yang sudah diterima tidak bisa dibatalkan.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Kirim",
          onPress: async () => {
            setSending(true);
            try {
              const res: any = await api.transferTicket({
                ticketId: ticket.id,
                recipientId: recipient.id,
                message: message.trim(),
              });
              onSend({
                transferId: res?.id ? String(res.id) : undefined,
                recipientId: recipient.id,
                name: recipient.name,
                contact: recipient.email,
                message: message.trim(),
              });
            } catch (e: any) {
              setError(e?.message ?? "Gagal mengirim transfer. Coba lagi.");
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={t.safe} edges={["top", "bottom"]}>
      <View style={t.bar}>
        <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Kembali">
          <Ionicons name="arrow-back" size={22} color={COLORS.brand} />
        </Pressable>
        <Text style={t.barTitle}>Transfer Ticket</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView style={t.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={t.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Tiket */}
          <Text style={t.label}>TIKET YANG INGIN DITRANSFER</Text>
          <View style={t.ticket}>
            <Image
              source={{ uri: ticket.image }}
              style={t.poster}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
            <View style={t.ticketBody}>
              <View style={t.pill}>
                <Text style={t.pillText}>{ticket.category}</Text>
              </View>
              <Text style={t.ticketTitle} numberOfLines={2}>
                {ticket.subtitle}
              </Text>
              <View style={t.dateRow}>
                <Ionicons name="calendar-outline" size={14} color={COLORS.ink} />
                <Text style={t.dateText}>{ticket.date}</Text>
              </View>
              <View style={t.seatRow}>
                <Text style={t.seatText}>
                  Seat: <Text style={t.seatValue}>{ticket.seat}</Text>
                </Text>
              </View>
            </View>
          </View>

          {/* Info alur */}
          <View style={t.warn}>
            <Ionicons name="information-circle-outline" size={20} color={COLORS.muted} />
            <Text style={t.warnText}>
              Penerima akan mendapat notifikasi dan bisa memilih Terima atau Tolak. Tiket tetap milikmu sampai
              transfer diterima, dan tidak berlaku lagi di akunmu setelah itu.
            </Text>
          </View>

          {/* Penerima (data dari akun pengguna) */}
          <View style={t.labelRow}>
            <Text style={t.label}>PENERIMA</Text>
            <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button">
              <Text style={t.change}>Ganti penerima</Text>
            </Pressable>
          </View>
          <View style={[t.row, { marginTop: 10 }]}>
            <Avatar name={recipient.name} photo={recipient.photo} />
            <View style={t.rowBody}>
              <Text style={t.rowName}>{recipient.name}</Text>
              <Text style={t.rowSub}>{recipient.email}</Text>
              {!!recipient.phone && <Text style={t.rowSub}>{recipient.phone}</Text>}
            </View>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.okText} />
          </View>

          {/* Pesan */}
          <Text style={[t.label, { marginTop: 22 }]}>PESAN SINGKAT (OPSIONAL)</Text>
          <TextInput
            style={t.textarea}
            value={message}
            onChangeText={setMessage}
            placeholder="Tulis pesan untuk penerima tiket ini..."
            placeholderTextColor={COLORS.placeholder}
            multiline
            maxLength={200}
            textAlignVertical="top"
            accessibilityLabel="Pesan singkat"
          />

          {!!error && <Text style={t.error}>{error}</Text>}
        </ScrollView>

        <View style={t.footer}>
          <Pressable
            style={({ pressed }) => [t.submit, pressed && !sending && t.pressed, sending && t.submitOff]}
            onPress={submit}
            disabled={sending}
            accessibilityRole="button"
            accessibilityState={{ disabled: sending, busy: sending }}
          >
            <Ionicons name="paper-plane-outline" size={17} color={COLORS.white} />
            <Text style={t.submitText}>{sending ? "Mengirim..." : "Kirim Transfer"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const t = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 },

  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: COLORS.bar,
  },
  barTitle: { fontSize: 19, fontWeight: "600", color: COLORS.brand },

  /* Pilih penerima */
  searchWrap: { paddingHorizontal: 24, paddingTop: 20 },
  search: {
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
  list: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 32, gap: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 24,
    backgroundColor: COLORS.white,
    shadowColor: "#8A6A4F",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  avatar: {
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 15, fontWeight: "700", color: COLORS.brand },
  rowBody: { flex: 1, gap: 2 },
  rowName: { fontSize: 14.5, fontWeight: "700", color: COLORS.ink },
  rowSub: { fontSize: 12.5, color: COLORS.muted },
  empty: { alignItems: "center", gap: 6, paddingVertical: 40 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: COLORS.ink },
  emptyText: { fontSize: 13, lineHeight: 19, color: COLORS.muted, textAlign: "center" },

  /* Form transfer */
  label: { fontSize: 10.5, fontWeight: "600", letterSpacing: 1.1, color: COLORS.muted },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22 },
  change: { fontSize: 12, fontWeight: "600", color: COLORS.brand },

  ticket: {
    flexDirection: "row",
    gap: 14,
    marginTop: 10,
    padding: 12,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    shadowColor: "#8A6A4F",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  poster: { width: 84, height: 112, borderRadius: 12, backgroundColor: COLORS.accent },
  ticketBody: { flex: 1, gap: 4 },
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: COLORS.peach,
  },
  pillText: { fontSize: 11, fontWeight: "700", color: COLORS.muted },
  ticketTitle: { fontFamily: SERIF, fontSize: 18, lineHeight: 23, fontWeight: "700", color: COLORS.ink },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dateText: { fontSize: 13, color: COLORS.ink },
  seatRow: { marginTop: "auto", borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 8 },
  seatText: { fontSize: 12.5, color: COLORS.muted },
  seatValue: { color: COLORS.brand, fontWeight: "600" },

  warn: {
    flexDirection: "row",
    gap: 10,
    marginTop: 22,
    padding: 14,
    borderRadius: 14,
    backgroundColor: COLORS.warn,
    borderWidth: 1,
    borderColor: COLORS.warnLine,
  },
  warnText: { flex: 1, fontSize: 12.5, lineHeight: 19, color: COLORS.muted },

  error: { fontSize: 12.5, color: COLORS.error, marginTop: 14, paddingLeft: 6 },
  textarea: {
    minHeight: 100,
    marginTop: 10,
    padding: 16,
    borderRadius: 24,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.ink,
  },

  footer: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 12, backgroundColor: COLORS.background },
  submit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 54,
    borderRadius: 27,
    backgroundColor: COLORS.brand,
  },
  submitOff: { opacity: 0.6 },
  submitText: { fontSize: 15.5, fontWeight: "700", color: COLORS.white },

  pressed: { opacity: 0.88 },
});