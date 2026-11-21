import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, Feather } from "@expo/vector-icons";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { captureRef } from "react-native-view-shot";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { getStorageItem } from "@/lib/tokenStorage";

import { BASE_URL, TOKEN_KEY } from "@/lib/api";

// Logo Encoré (mobile/assets/images/logo.png). Sesuaikan jalur jika lokasinya beda.
const LOGO = require("../../components/assets/images/logo.encore.png");

/* ---------- Colors ---------- */
const BG = "#FFFCE8";
const HEADER_BG = "#FFF1EE";
const PURPLE = "#4A3560";
const TAN = "#F3DDBB";
const ORANGE = "#FF9A1F";
const TEAL = "#2B5F86";
const STEP_BLUE = "#A9CBE8";
const TEXT = "#1F1F1F";
const MUTED = "#6B6455";
const BORDER_LIGHT = "#B9A9CF";
const LINE = "#EFE6CC";

const EXPIRE_SECONDS = 15 * 60; // samakan dengan halaman checkout
const MAX_FILE = 5 * 1024 * 1024;

const rupiah = (n: number) =>
  "Rp " + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const formatTime = (s: number) => {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};

const formatStamp = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** "1234567890" -> "1234 5678 90"; kalau ada huruf, tampilkan apa adanya. */
function groupNumber(v: string) {
  if (/[^\d\s-]/.test(v)) return v;
  return v.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

/** "A3" -> "A-3" */
function seatLabel(code: string) {
  const c = code.replace(/^.*-/, "");
  const m = /^([A-Za-z]+)(\d+)$/.exec(c);
  return m ? `${m[1].toUpperCase()}-${m[2]}` : code;
}

/**
 * Kirim FormData (multipart) lewat XMLHttpRequest.
 * fetch bawaan Expo versi baru menolak file berformat { uri, name, type }
 * ("Unsupported FormDataPart implementation"), XHR tidak.
 * Jangan set Content-Type manual, biar boundary-nya dibuat otomatis.
 */
function postForm(
  url: string,
  form: FormData,
  token?: string | null
): Promise<{ ok: boolean; status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = 30000;
    xhr.setRequestHeader("Accept", "application/json");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.onload = () => {
      let data: any = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // respons bukan JSON, biarkan kosong
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error("Tidak bisa terhubung ke server."));
    xhr.ontimeout = () => reject(new Error("Koneksi terlalu lama. Coba lagi."));

    xhr.send(form as any);
  });
}

/** Satu baris rincian di gambar bukti. */
function ReceiptRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.rcRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.rcLabel}>{label}</Text>
      <Text style={styles.rcValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

type PickedFile = { name: string; uri: string; mime: string } | null;

/* ===================== SCREEN ===================== */
/*
 * Dibuka dari halaman checkout dengan params:
 *   event, tier, seats, method, accountNumber, name,
 *   subtotal, serviceFee, total, orderId (dibutuhkan untuk upload)
 *
 * Params tambahan (opsional, supaya tiket di halaman Tiket lengkap):
 *   date (format "2026-10-24"), time ("19:30 WIB"), venue, area, image
 */

export default function PaymentScreen() {
  const router = useRouter();
  const p = useLocalSearchParams<{
    orderId?: string;
    event?: string;
    tier?: string;
    seats?: string;
    method?: string;
    accountNumber?: string;
    name?: string;
    subtotal?: string;
    serviceFee?: string;
    total?: string;
    date?: string;
    time?: string;
    venue?: string;
    area?: string;
    image?: string;
  }>();

  const orderId = p.orderId ? String(p.orderId) : "";
  const eventTitle = p.event ? String(p.event) : "";
  const tier = p.tier ? String(p.tier) : "";
  const buyerName = p.name ? String(p.name) : "-";
  const methodName = p.method ? String(p.method) : "Pembayaran";
  const accountNumber = p.accountNumber ? String(p.accountNumber) : "";
  const total = Number(p.total) || 0;
  const subtotal = Number(p.subtotal) || 0;
  const serviceFee = Number(p.serviceFee) || 0;
  const seats = useMemo(
    () => (p.seats ? String(p.seats).split(",").filter(Boolean) : []),
    [p.seats]
  );

  const isQris = methodName.toLowerCase().includes("qris");

  const [secondsLeft, setSecondsLeft] = useState(EXPIRE_SECONDS);
  const [file, setFile] = useState<PickedFile>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [receiptSent, setReceiptSent] = useState(false);
  const [stamp, setStamp] = useState(formatStamp(new Date()));
  const expired = secondsLeft <= 0;

  const receiptRef = useRef<View>(null);
  const logoReady = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const uploadY = useRef(0);

  /* ---------- Rincian di gambar bukti ---------- */

  const receiptRows: [string, string][] = [
    ["Pembeli", buyerName],
    ["No. pesanan", `#${orderId || "-"}`],
    ...(eventTitle ? [["Event", eventTitle] as [string, string]] : []),
    ...(tier ? [["Kategori", tier] as [string, string]] : []),
    ...(seats.length ? [["Kursi", seats.map(seatLabel).join(", ")] as [string, string]] : []),
    ["Metode", methodName],
    ["Waktu", stamp],
  ];

  /* ---------- Countdown ---------- */

  useEffect(() => {
    const t = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (secondsLeft !== 0 || uploaded) return;
    Alert.alert("Waktu habis", "Waktu pembayaran sudah berakhir. Silakan pesan lagi.", [
      { text: "OK", onPress: () => router.back() },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  /* ---------- Langkah-langkah sesuai metode ---------- */

  const steps = isQris
    ? [
        "Buka aplikasi m-banking atau dompet digital Anda.",
        "Scan kode QR di atas.",
        `Pastikan nominal ${rupiah(total)}, lalu selesaikan pembayaran.`,
        'Tekan "Saya sudah bayar", lalu upload foto bukti pembayaran di bawah.',
      ]
    : [
        `Buka aplikasi ${methodName} atau m-banking Anda.`,
        `Transfer ke nomor ${groupNumber(accountNumber) || "tujuan"} di bawah.`,
        `Masukkan nominal tepat ${rupiah(total)}.`,
        'Tekan "Saya sudah bayar", lalu upload foto bukti pembayaran di bawah.',
      ];


  const goToTickets = () => {
    router.replace({
      pathname: "/(tabs)/tiket",
      params: {
        newOrder: orderId,
        event: eventTitle,
        tier,
        seats: seats.join(","),
        name: buyerName === "-" ? "" : buyerName,
        subtotal: String(subtotal),
        total: String(total),
        date: p.date ? String(p.date) : "",
        time: p.time ? String(p.time) : "",
        venue: p.venue ? String(p.venue) : "",
        area: p.area ? String(p.area) : "",
        image: p.image ? String(p.image) : "",
      },
    } as any);
  };

  /* ---------- Aksi ---------- */

  const copyNumber = async () => {
    await Clipboard.setStringAsync(accountNumber.replace(/[\s-]/g, ""));
    Alert.alert("Disalin", `Nomor ${methodName} berhasil disalin.`);
  };

  const scrollToUpload = () => {
    scrollRef.current?.scrollTo({ y: Math.max(uploadY.current - 12, 0), animated: true });
  };

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["image/jpeg", "image/png", "image/webp"],
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    const asset = res.assets[0];
    if (asset.size && asset.size > MAX_FILE) {
      Alert.alert("File terlalu besar", "Maksimal ukuran file 5MB.");
      return;
    }
    setFile({
      name: asset.name,
      uri: asset.uri,
      mime: asset.mimeType ?? "image/jpeg",
    });
  };

  /** Upload foto bukti dari user -> backend/uploads/payment, lalu langsung ke halaman Tiket */
  const onUpload = async () => {
    if (uploaded) return;
    if (!file) {
      Alert.alert("Belum ada file", "Pilih bukti pembayaran terlebih dahulu.");
      return;
    }
    if (!orderId) {
      Alert.alert(
        "Pesanan belum dibuat",
        "Nomor pesanan tidak ditemukan. Kembali ke checkout dan coba lagi."
      );
      return;
    }

    setUploading(true);
    try {
      const token = await getStorageItem(TOKEN_KEY);
      const form = new FormData();
      // di React Native, file dikirim sebagai objek { uri, name, type }
      form.append("bukti", { uri: file.uri, name: file.name, type: file.mime } as any);

      const { ok, status, data } = await postForm(
        `${BASE_URL}/pembayaran/${orderId}/bukti`,
        form,
        token
      );
      if (!ok) throw new Error(data?.message ?? `Error ${status}`);

      setUploaded(true);
      // langsung pindah ke halaman tiket, tanpa menunggu user menekan OK
      goToTickets();
    } catch (e: any) {
      Alert.alert("Gagal mengunggah", e?.message ?? "Coba lagi.");
    } finally {
      setUploading(false);
    }
  };

  /**
   * "Saya sudah bayar": buat gambar bukti konfirmasi otomatis,
   * lalu kirim lewat multer -> backend/uploads/payment-user (nama file sesuai user).
   */
  const onPaid = async () => {
    if (uploaded) {
      goToTickets();
      return;
    }
    if (confirming || expired) return;
    if (!orderId) {
      Alert.alert(
        "Pesanan belum dibuat",
        "Nomor pesanan tidak ditemukan. Kembali ke checkout dan coba lagi."
      );
      return;
    }
    if (receiptSent) {
      Alert.alert("Sudah dikonfirmasi", "Silakan upload foto bukti pembayaran di bawah.");
      scrollToUpload();
      return;
    }

    setConfirming(true);
    try {
      // perbarui waktu di gambar, tunggu render + logo selesai, lalu tangkap
      setStamp(formatStamp(new Date()));
      for (let i = 0; i < 20 && !logoReady.current; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      await new Promise((r) => setTimeout(r, 120));

      const shot = await captureRef(receiptRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });
      if (!shot) throw new Error("Gagal membuat gambar konfirmasi.");
      const uri = shot.startsWith("file://") ? shot : `file://${shot}`;

      const token = await getStorageItem(TOKEN_KEY);
      const form = new FormData();
      form.append("struk", { uri, name: "konfirmasi.png", type: "image/png" } as any);

      const { ok, status, data } = await postForm(
        `${BASE_URL}/pembayaran/${orderId}/konfirmasi`,
        form,
        token
      );
      if (!ok) throw new Error(data?.message ?? `Error ${status}`);

      setReceiptSent(true);
      Alert.alert(
        "Pembayaran dicatat",
        "Bukti konfirmasi sudah dibuat. Sekarang upload foto bukti pembayaranmu di bawah."
      );
      scrollToUpload();
    } catch (e: any) {
      Alert.alert("Gagal membuat konfirmasi", e?.message ?? "Coba lagi.");
    } finally {
      setConfirming(false);
    }
  };

  /* ---------- UI ---------- */

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Gambar bukti konfirmasi (di luar layar, hanya untuk ditangkap jadi PNG) */}
      <View style={styles.offscreen} pointerEvents="none">
        <View ref={receiptRef} collapsable={false} style={styles.rcOuter}>
          <View style={styles.rcCard}>
            <View style={styles.rcStripe} />

            {/* Kop: logo + nama + judul dokumen */}
            <View style={styles.rcHeader}>
              <Image
                source={LOGO}
                style={styles.rcLogo}
                resizeMode="contain"
                onLoadEnd={() => (logoReady.current = true)}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.rcBrand}>Encoré</Text>
                <Text style={styles.rcTitle}>Bukti Konfirmasi Pembayaran</Text>
              </View>
            </View>

            {/* Status + total */}
            <View style={styles.rcTotalWrap}>
              <View style={styles.rcPill}>
                <View style={styles.rcDot} />
                <Text style={styles.rcPillText}>Menunggu verifikasi admin</Text>
              </View>
              <Text style={styles.rcTotalLabel}>Total pembayaran</Text>
              <Text style={styles.rcTotalValue}>{rupiah(total)}</Text>
            </View>

            {/* Perforasi ala tiket */}
            <View style={styles.rcPerf}>
              <View style={[styles.rcNotch, { left: -11 }]} />
              <View style={styles.rcDashRow}>
                {Array.from({ length: 26 }).map((_, i) => (
                  <View key={i} style={styles.rcDash} />
                ))}
              </View>
              <View style={[styles.rcNotch, { right: -11 }]} />
            </View>

            {/* Rincian */}
            <View style={styles.rcDetails}>
              {receiptRows.map(([label, value], i) => (
                <ReceiptRow
                  key={label}
                  label={label}
                  value={value}
                  last={i === receiptRows.length - 1}
                />
              ))}
            </View>

            {/* Catatan kaki */}
            <View style={styles.rcFooter}>
              <Text style={styles.rcFooterText}>
                Dokumen ini dibuat otomatis oleh aplikasi Encoré. Pembayaran dinyatakan sah setelah
                diverifikasi oleh admin.
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={20} color={PURPLE} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Kartu utama: total + (QR bila QRIS) */}
        <View style={styles.qrCard}>
          <View style={styles.expireBadge}>
            <Ionicons name="time-outline" size={11} color={TEXT} />
            <Text style={styles.expireText}>
              {expired ? "WAKTU HABIS" : `EXPIRES IN ${formatTime(secondsLeft)}`}
            </Text>
          </View>

          {isQris && accountNumber ? (
            <View style={styles.qrBox}>
              <QRCode value={accountNumber} size={124} backgroundColor="#fff" />
            </View>
          ) : (
            <View style={styles.methodBadge}>
              <Ionicons name={isQris ? "qr-code-outline" : "business-outline"} size={26} color={PURPLE} />
              <Text style={styles.methodBadgeText}>{methodName}</Text>
            </View>
          )}

          <Text style={styles.totalLabel}>Total Yang Harus Di Bayar</Text>
          <Text style={styles.totalValue}>{rupiah(total)}</Text>
        </View>

        {/* Ringkasan pesanan */}
        <View style={styles.summary}>
          {!!eventTitle && (
            <Text style={styles.summaryTitle} numberOfLines={2}>
              {eventTitle}
            </Text>
          )}
          {(!!tier || seats.length > 0) && (
            <Text style={styles.summarySub}>
              {[tier, seats.length ? `Kursi ${seats.map(seatLabel).join(", ")}` : ""]
                .filter(Boolean)
                .join(" • ")}
            </Text>
          )}
          {subtotal > 0 && (
            <View style={styles.sumRow}>
              <Text style={styles.sumLeft}>Tiket</Text>
              <Text style={styles.sumRight}>{rupiah(subtotal)}</Text>
            </View>
          )}
          {serviceFee > 0 && (
            <View style={styles.sumRow}>
              <Text style={styles.sumLeft}>Biaya layanan</Text>
              <Text style={styles.sumRight}>{rupiah(serviceFee)}</Text>
            </View>
          )}
        </View>

        {/* Nomor tujuan */}
        <View style={styles.vaCard}>
          <View style={styles.vaHeader}>
            <View style={styles.vaIcon}>
              <Ionicons name={isQris ? "qr-code-outline" : "business-outline"} size={14} color={TEXT} />
            </View>
            <Text style={styles.vaHeaderText}>{methodName}</Text>
          </View>

          <View style={styles.vaBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.vaLabel}>{isQris ? "Nomor QRIS" : "Nomor Tujuan"}</Text>
              <Text style={styles.vaNumber}>{groupNumber(accountNumber) || "-"}</Text>
            </View>
            {!!accountNumber && (
              <TouchableOpacity style={styles.copyBtn} onPress={copyNumber} accessibilityLabel="Salin nomor">
                <Ionicons name="copy-outline" size={14} color={TEXT} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Cara bayar */}
        <Text style={styles.howTitle}>Cara Membayar Pakai {methodName}</Text>
        {steps.map((s, i) => (
          <View key={i} style={styles.stepRow}>
            <View style={styles.stepCircle}>
              <Text style={styles.stepNum}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{s}</Text>
          </View>
        ))}

        {/* Saya sudah bayar -> buat gambar konfirmasi otomatis */}
        <TouchableOpacity
          style={[styles.paidBtn, (confirming || (expired && !uploaded)) && { opacity: 0.6 }]}
          activeOpacity={0.85}
          onPress={onPaid}
          disabled={confirming || (expired && !uploaded)}
        >
          {confirming ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.paidText}>
              {uploaded ? "Selesai" : receiptSent ? "Pembayaran dicatat ✓" : "Saya sudah bayar"}
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.divider} />

        {/* Upload bukti dari user */}
        <View onLayout={(e) => (uploadY.current = e.nativeEvent.layout.y)}>
          <Text style={styles.uploadLabel}>Upload Bukti Pembayaran</Text>
          <TouchableOpacity
            style={styles.dropBox}
            activeOpacity={0.8}
            onPress={pickFile}
            disabled={uploading || uploaded}
          >
            <View style={styles.cloudCircle}>
              <Feather name={uploaded ? "check" : "upload-cloud"} size={16} color={PURPLE} />
            </View>
            <Text style={styles.dropTitle}>
              {uploaded ? "Bukti terkirim" : file ? file.name : "Upload Bukti Disini!"}
            </Text>
            <Text style={styles.dropSub}>JPG, PNG, or WEBP (Max 5MB)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.uploadBtn, (uploading || uploaded || !file) && { opacity: 0.5 }]}
            activeOpacity={0.8}
            onPress={onUpload}
            disabled={uploading || uploaded || !file}
          >
            {uploading ? (
              <ActivityIndicator color={PURPLE} />
            ) : (
              <Text style={styles.uploadBtnText}>{uploaded ? "Terkirim" : "Upload"}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: HEADER_BG,
  },
  headerTitle: { fontSize: 15, fontWeight: "500", color: PURPLE },

  scroll: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 32 },

  qrCard: {
    backgroundColor: TAN,
    borderRadius: 22,
    alignItems: "center",
    paddingTop: 14,
    paddingBottom: 18,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  expireBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 12,
    gap: 4,
  },
  expireText: { fontSize: 9, fontWeight: "700", color: TEXT, letterSpacing: 0.4 },
  qrBox: { backgroundColor: "#fff", borderRadius: 18, padding: 14, marginBottom: 12 },
  methodBadge: {
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 32,
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  methodBadgeText: { fontSize: 15, fontWeight: "700", color: PURPLE },
  totalLabel: { fontSize: 10, color: MUTED },
  totalValue: { fontSize: 28, fontWeight: "800", color: ORANGE, marginTop: 4, letterSpacing: 0.5 },

  summary: { marginTop: 14, paddingHorizontal: 6 },
  summaryTitle: { fontSize: 14, fontWeight: "700", color: TEXT },
  summarySub: { fontSize: 11, color: MUTED, marginTop: 3, marginBottom: 8 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  sumLeft: { fontSize: 12, color: MUTED },
  sumRight: { fontSize: 12, color: TEXT, fontWeight: "600" },

  vaCard: {
    backgroundColor: TAN,
    borderRadius: 18,
    padding: 12,
    marginTop: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  vaHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  vaIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  vaHeaderText: { fontSize: 11, color: TEXT },
  vaBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  vaLabel: { fontSize: 8, color: MUTED },
  vaNumber: { fontSize: 13, fontWeight: "700", color: TEXT, letterSpacing: 1, marginTop: 2 },
  copyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: TAN,
    alignItems: "center",
    justifyContent: "center",
  },

  howTitle: { fontSize: 15, fontWeight: "700", color: TEXT, marginTop: 22, marginBottom: 12 },
  stepRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  stepCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: STEP_BLUE,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  stepNum: { fontSize: 11, fontWeight: "700", color: TEXT },
  stepText: { flex: 1, fontSize: 11, color: TEXT, lineHeight: 16 },

  paidBtn: {
    backgroundColor: TEAL,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 14,
  },
  paidText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  divider: { height: 1, backgroundColor: LINE, marginVertical: 18 },

  uploadLabel: { fontSize: 10, color: TEXT, marginBottom: 8 },
  dropBox: {
    borderWidth: 1.5,
    borderColor: BORDER_LIGHT,
    borderRadius: 18,
    paddingVertical: 28,
    alignItems: "center",
    backgroundColor: BG,
  },
  cloudCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EDE6F5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  dropTitle: { fontSize: 11, color: TEXT, fontWeight: "500", paddingHorizontal: 12, textAlign: "center" },
  dropSub: { fontSize: 8, color: MUTED, marginTop: 6 },

  uploadBtn: {
    borderWidth: 1.5,
    borderColor: PURPLE,
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
  },
  uploadBtnText: { fontSize: 14, color: PURPLE, fontWeight: "500" },

  /* ----- Gambar bukti konfirmasi (offscreen) ----- */
  offscreen: { position: "absolute", left: -2000, top: 0 },

  rcOuter: { width: 380, backgroundColor: BG, padding: 18 },
  rcCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: TAN,
    overflow: "hidden",
  },
  rcStripe: { height: 6, backgroundColor: PURPLE },

  rcHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  rcLogo: { width: 56, height: 56 },
  rcBrand: { fontSize: 24, fontWeight: "800", color: PURPLE },
  rcTitle: { fontSize: 13, color: MUTED, marginTop: 2 },

  rcTotalWrap: { alignItems: "center", paddingTop: 6, paddingBottom: 22, paddingHorizontal: 20 },
  rcPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFF1DB",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 18,
  },
  rcDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ORANGE },
  rcPillText: { fontSize: 12, fontWeight: "700", color: "#9A5A00" },
  rcTotalLabel: { fontSize: 13, color: MUTED },
  rcTotalValue: { fontSize: 34, fontWeight: "800", color: PURPLE, marginTop: 4, letterSpacing: 0.3 },

  rcPerf: { height: 22, justifyContent: "center" },
  rcNotch: {
    position: "absolute",
    top: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: TAN,
  },
  rcDashRow: { flexDirection: "row", justifyContent: "space-between", marginHorizontal: 24 },
  rcDash: { width: 6, height: 2, borderRadius: 1, backgroundColor: "#D9CBB0" },

  rcDetails: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  rcRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  rcLabel: { fontSize: 13, color: MUTED, width: 96 },
  rcValue: { fontSize: 13, color: TEXT, fontWeight: "700", flex: 1, textAlign: "right" },

  rcFooter: {
    backgroundColor: BG,
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: LINE,
  },
  rcFooterText: { fontSize: 10.5, color: MUTED, textAlign: "center", lineHeight: 15 },
});