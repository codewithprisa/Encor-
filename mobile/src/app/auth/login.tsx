import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { setStorageItem } from "../../lib/tokenStorage";

// Alamat server diatur di satu tempat: lib/api.ts
import { API_URL, BASE_URL, TOKEN_KEY } from "../../lib/api";

const LOGIN_TIMEOUT_MS = 10000;

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
};

const LOGO = require("../../components/assets/images/logo.encore.png");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

type Errors = {
  email?: string;
  password?: string;
  form?: string;
};

export default function Login() {
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);

  const clear = (key: keyof Errors) => {
    setErrors((e) => ({
      ...e,
      [key]: undefined,
      form: undefined,
    }));
  };

  async function onLogin() {
    if (loading) return;

    const errs: Errors = {};

    if (!EMAIL_RE.test(email.trim())) {
      errs.email = "Masukkan email yang valid.";
    }

    if (password.length < MIN_PASSWORD) {
      errs.password = `Kata sandi minimal ${MIN_PASSWORD} karakter.`;
    }

    setErrors(errs);

    if (Object.keys(errs).length > 0) return;

    setLoading(true);

    // Timeout: kalau server tidak menjawab, spinner berhenti dan pesan muncul
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, LOGIN_TIMEOUT_MS);

    try {
      const url = `${BASE_URL}/auth/login`;
      console.log("[LOGIN] API_URL =", API_URL);
      console.log("[LOGIN] POST", url);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
        signal: controller.signal,
      });

      console.log("[LOGIN] status", response.status);

      // Kalau server membalas non-JSON, jangan dianggap gagal koneksi
      const data = await response.json().catch(() => ({} as any));

      // Gagal hanya jika HTTP error atau server eksplisit mengirim success: false
      if (!response.ok || data?.success === false) {
        setErrors({
          form: data?.message || "Login gagal. Periksa akun kamu.",
        });
        return;
      }

      // Token bisa di { token } atau di { data: { token } }
      const token: string | undefined = data?.token ?? data?.data?.token;
      const user = data?.user ?? data?.data?.user;

      if (!token) {
        setErrors({
          form: "Token login tidak ditemukan dari server.",
        });
        return;
      }

      // Simpan token JWT dengan aman (mendukung Native & Web)
      await setStorageItem(TOKEN_KEY, token);

      // Simpan informasi pengguna (hanya kalau server mengirimnya)
      if (user) {
        await setStorageItem("encore_user", JSON.stringify(user));
      }

      // Bersihkan password
      setPassword("");

      // Masuk ke halaman Home
      router.replace("/(tabs)/home");
    } catch (error: any) {
      console.error("Login error:", error);

      setErrors({
        form: error?.message || (timedOut
          ? `Server tidak merespons (${API_URL}). Cek koneksi backend.`
          : `Tidak dapat login.`),
      });
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Tombol Kembali ke Intro */}
          <View style={styles.topBar}>
            <Pressable
              style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
              onPress={() => router.replace("/auth/intro")}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Kembali ke halaman intro"
            >
              <Ionicons name="arrow-back" size={22} color={COLORS.brand} />
            </Pressable>
          </View>

          {/* Header */}
          <View style={styles.header}>
            <Image
              source={LOGO}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Encoré"
            />

            <Text style={styles.subtitle}>
              Masuk untuk menemukan{"\n"}
              konser terbaik di kota Anda.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Email */}
            <View style={styles.field}>
              <Text style={styles.label}>EMAIL</Text>

              <TextInput
                style={[styles.input, errors.email && styles.inputError]}
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  clear("email");
                }}
                placeholder="nama@email.com"
                placeholderTextColor={COLORS.placeholder}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                accessibilityLabel="Email"
              />

              {errors.email && <Text style={styles.error}>{errors.email}</Text>}
            </View>

            {/* Password */}
            <View style={styles.field}>
              <Text style={styles.label}>KATA SANDI</Text>

              <View
                style={[
                  styles.input,
                  styles.passwordRow,
                  errors.password && styles.inputError,
                ]}
              >
                <TextInput
                  ref={passwordRef}
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    clear("password");
                  }}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.placeholder}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password"
                  returnKeyType="done"
                  onSubmitEditing={onLogin}
                  accessibilityLabel="Kata sandi"
                />

                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
                  }
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={COLORS.muted}
                  />
                </Pressable>
              </View>

              {errors.password && <Text style={styles.error}>{errors.password}</Text>}

              <Pressable
                style={styles.forgot}
                hitSlop={8}
                onPress={() => {
                  // TODO: halaman lupa password
                }}
              >
                <Text style={styles.forgotText}>Lupa password?</Text>
              </Pressable>
            </View>

            {/* Form Error */}
            {errors.form && (
              <Text style={[styles.error, styles.formError]}>{errors.form}</Text>
            )}

            {/* Login Button */}
            <Pressable
              style={({ pressed }) => [
                styles.cta,
                pressed && !loading && styles.pressed,
                loading && styles.ctaDisabled,
              ]}
              onPress={onLogin}
              disabled={loading}
              accessibilityRole="button"
              accessibilityState={{
                disabled: loading,
                busy: loading,
              }}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.ctaText}>Masuk</Text>
              )}
            </Pressable>
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>atau lanjutkan dengan</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social Login */}
          <View style={styles.socials}>
            <Pressable
              style={({ pressed }) => [styles.social, pressed && styles.pressed]}
              onPress={() => {
                // TODO: login Google
              }}
              accessibilityRole="button"
              accessibilityLabel="Lanjutkan dengan Google"
            >
              <Ionicons name="logo-google" size={18} color={COLORS.ink} />
              <Text style={styles.socialText}>Google</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.social, pressed && styles.pressed]}
              onPress={() => {
                // TODO: login Apple
              }}
              accessibilityRole="button"
              accessibilityLabel="Lanjutkan dengan Apple"
            >
              <Ionicons name="logo-apple" size={20} color={COLORS.ink} />
              <Text style={styles.socialText}>Apple</Text>
            </Pressable>
          </View>

          {/* Register */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Belum punya akun? </Text>

            <Pressable
              onPress={() => router.push("/auth/register")}
              hitSlop={8}
              accessibilityRole="link"
            >
              <Text style={styles.footerLink}>Daftar</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 28,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    marginBottom: 4,
  },

  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
  },

  header: {
    alignItems: "center",
    gap: 8,
  },

  logo: {
    width: 150,
    height: 44,
    marginTop: 8,
  },

  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    color: COLORS.muted,
  },

  form: {
    marginTop: 28,
    gap: 16,
  },

  field: { gap: 8 },

  label: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    color: COLORS.muted,
  },

  input: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
    fontSize: 14,
    color: COLORS.ink,
  },

  inputError: { borderColor: COLORS.error },

  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  passwordInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.ink,
    paddingVertical: 12,
  },

  forgot: {
    alignSelf: "flex-end",
    marginTop: 2,
  },

  forgotText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.brand,
  },

  error: {
    fontSize: 12,
    color: COLORS.error,
    paddingLeft: 6,
  },

  formError: {
    textAlign: "center",
    paddingLeft: 0,
  },

  cta: {
    marginTop: 4,
    minHeight: 46,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: COLORS.brand,
    alignItems: "center",
    justifyContent: "center",
  },

  ctaText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.white,
  },

  ctaDisabled: { opacity: 0.5 },

  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 24,
  },

  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.line,
  },

  dividerText: {
    fontSize: 11.5,
    color: COLORS.muted,
  },

  socials: {
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
  },

  social: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    borderRadius: 24,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.line,
  },

  socialText: {
    fontSize: 13.5,
    fontWeight: "500",
    color: COLORS.ink,
  },

  pressed: { opacity: 0.8 },

  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 28,
  },

  footerText: {
    fontSize: 13,
    color: COLORS.muted,
  },

  footerLink: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.brand,
  },
});