import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  Alert,
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
  sand: "#F2DDC1",
  bar: "#FDEFDD",
};

const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/* =====================================================================
 * HALAMAN RATING
 * Foto memakai expo-image-picker:  npx expo install expo-image-picker
 * ===================================================================== */

/** Data minimal yang dibutuhkan halaman ini (Ticket di tiket.tsx sudah memenuhinya). */
export type RatingTicket = {
  subtitle: string;
  fullDate: string;
  image: string;
  rating?: number;
  review?: string;
  photos?: string[];
};

export type RatingData = { rating: number; text: string; photos: string[] };

const MAX_PHOTOS = 3;
const RATING_LABEL = ["Ketuk untuk memberi rating", "Kurang", "Cukup", "Baik", "Sangat baik", "Luar biasa"];

export default function RatingScreen({
  ticket,
  onBack,
  onSubmit,
}: {
  ticket: RatingTicket;
  onBack: () => void;
  onSubmit: (data: RatingData) => void;
}) {
  const [rating, setRating] = useState(ticket.rating ?? 0);
  const [text, setText] = useState(ticket.review ?? "");
  const [photos, setPhotos] = useState<string[]>(ticket.photos ?? []);
  const [hint, setHint] = useState(false);
  const [sending, setSending] = useState(false);

  async function pickPhotos() {
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) return;
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: remaining > 1,
        selectionLimit: remaining,
        quality: 0.7,
      });
      if (res.canceled) return;
      setPhotos((cur) => [...cur, ...res.assets.map((a) => a.uri)].slice(0, MAX_PHOTOS));
    } catch {
      Alert.alert("Gagal membuka galeri", "Pastikan aplikasi punya izin mengakses foto.");
    }
  }

  async function submit() {
    if (rating === 0) {
      setHint(true);
      return;
    }
    setSending(true);
    // TODO: kirim ke API. Simulasi singkat:
    await new Promise((r) => setTimeout(r, 600));
    setSending(false);
    onSubmit({ rating, text: text.trim(), photos });
  }

  return (
    <SafeAreaView style={r.safe} edges={["top", "bottom"]}>
      {/* Top bar */}
      <View style={r.bar}>
        <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Kembali">
          <Ionicons name="arrow-back" size={22} color={COLORS.brand} />
        </Pressable>
        <Text style={r.barTitle}>Encoré</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView style={r.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={r.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Event */}
          <View style={r.posterWrap}>
            <Image source={{ uri: ticket.image }} style={r.poster} resizeMode="cover" accessibilityIgnoresInvertColors />
          </View>
          <Text style={r.kicker}>PENGALAMAN TERAKHIR</Text>
          <Text style={r.title}>{ticket.subtitle}</Text>
          <Text style={r.date}>{ticket.fullDate}</Text>

          {/* Bintang */}
          <View style={r.card}>
            <Text style={r.cardTitle}>Bagaimana kesan Anda?</Text>
            <View style={r.stars} accessibilityRole="radiogroup">
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => (setRating(n), setHint(false))}
                  hitSlop={6}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: n === rating }}
                  accessibilityLabel={`${n} bintang`}
                >
                  <Ionicons
                    name={n <= rating ? "star" : "star-outline"}
                    size={34}
                    color={n <= rating ? COLORS.brand : COLORS.accent}
                  />
                </Pressable>
              ))}
            </View>
            <Text style={[r.caption, hint && r.captionError]}>
              {hint ? "Pilih rating terlebih dahulu." : RATING_LABEL[rating]}
            </Text>
          </View>

          {/* Cerita */}
          <Text style={r.label}>CERITAKAN PENGALAMAN ANDA</Text>
          <TextInput
            style={r.input}
            value={text}
            onChangeText={setText}
            placeholder="Bagikan momen favorit atau pesan untuk artis..."
            placeholderTextColor={COLORS.placeholder}
            multiline
            maxLength={500}
            textAlignVertical="top"
            accessibilityLabel="Ceritakan pengalaman Anda"
          />

          {/* Foto */}
          <View style={r.photoHead}>
            <Text style={r.label}>UNGGAH FOTO (MAKS. {MAX_PHOTOS})</Text>
            <Text style={r.count}>
              {photos.length}/{MAX_PHOTOS}
            </Text>
          </View>
          <View style={r.photos}>
            {photos.length < MAX_PHOTOS && (
              <Pressable
                style={({ pressed }) => [r.add, pressed && r.pressed]}
                onPress={pickPhotos}
                accessibilityRole="button"
                accessibilityLabel="Tambah foto"
              >
                <Ionicons name="camera-outline" size={24} color={COLORS.muted} />
                <Text style={r.addText}>TAMBAH</Text>
              </Pressable>
            )}
            {photos.map((uri) => (
              <View key={uri} style={r.thumbWrap}>
                <Image source={{ uri }} style={r.thumb} resizeMode="cover" />
                <Pressable
                  style={r.remove}
                  onPress={() => setPhotos((cur) => cur.filter((u) => u !== uri))}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Hapus foto"
                >
                  <Ionicons name="close" size={14} color={COLORS.white} />
                </Pressable>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Kirim */}
        <View style={r.footer}>
          <Pressable
            style={({ pressed }) => [r.submit, rating === 0 && r.submitOff, pressed && !sending && r.pressed]}
            onPress={submit}
            disabled={sending}
            accessibilityRole="button"
            accessibilityState={{ disabled: sending, busy: sending }}
          >
            <Text style={r.submitText}>{sending ? "Mengirim..." : "Kirim Review"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const r = StyleSheet.create({
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
  barTitle: { fontFamily: SERIF, fontSize: 20, fontWeight: "700", color: COLORS.brand },

  posterWrap: {
    alignSelf: "center",
    borderRadius: 28,
    shadowColor: "#8A6A4F",
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  poster: { width: 112, height: 140, borderRadius: 28, backgroundColor: COLORS.accent },
  kicker: {
    textAlign: "center",
    fontSize: 10.5,
    fontWeight: "600",
    letterSpacing: 1.6,
    color: COLORS.brand,
    marginTop: 18,
  },
  title: { textAlign: "center", fontFamily: SERIF, fontSize: 26, fontWeight: "700", color: COLORS.ink, marginTop: 6 },
  date: { textAlign: "center", fontSize: 13, color: COLORS.ink, marginTop: 4 },

  card: {
    alignItems: "center",
    marginTop: 24,
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 28,
    backgroundColor: COLORS.white,
    shadowColor: "#8A6A4F",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  cardTitle: { fontFamily: SERIF, fontSize: 18, fontWeight: "700", color: COLORS.ink },
  stars: { flexDirection: "row", gap: 12, marginTop: 16 },
  caption: { fontSize: 12.5, fontWeight: "500", color: COLORS.brand, marginTop: 14 },
  captionError: { color: COLORS.error },

  label: { fontSize: 10.5, fontWeight: "600", letterSpacing: 1.1, color: COLORS.muted },
  input: {
    minHeight: 130,
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
  photoHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 26 },
  count: { fontSize: 11.5, color: COLORS.muted },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  add: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: COLORS.sand,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addText: { fontSize: 9.5, fontWeight: "700", letterSpacing: 1, color: COLORS.muted },
  thumbWrap: { width: 84, height: 84 },
  thumb: { width: 84, height: 84, borderRadius: 24, backgroundColor: COLORS.accent },
  remove: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.ink,
    alignItems: "center",
    justifyContent: "center",
  },

  footer: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 12, backgroundColor: COLORS.background },
  submit: {
    minHeight: 54,
    borderRadius: 27,
    backgroundColor: COLORS.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  submitOff: { opacity: 0.6 },
  submitText: { fontSize: 15.5, fontWeight: "700", color: COLORS.white },

  pressed: { opacity: 0.88 },
});