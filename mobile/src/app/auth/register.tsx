
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

// Ganti IP ini jika IPv4 laptop berubah.
const API_URL = "http://192.168.18.13:3001";
const TIMEOUT_MS = 15000;

const LOGO = require("../../components/assets/images/logo.encore.png");

const SERIF = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "serif",
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(\+62|62|0)8[0-9]{8,12}$/;
const MIN_PASSWORD = 6;

type Errors = {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirm?: string;
  terms?: string;
  form?: string;
};

export default function Register() {
  const router = useRouter();

  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agree, setAgree] = useState(false);

  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);

  const clear = (key: keyof Errors) => {
    setErrors((e) => ({
      ...e,
      [key]: undefined,
      form: undefined,
    }));
  };

  async function onRegister() {
    if (loading) return;

    const normalizedPhone = phone.replace(/[\s-]/g, "");
    const normalizedEmail = email.trim().toLowerCase();

    const errs: Errors = {};

    if (name.trim().length < 2) {
      errs.name = "Masukkan nama lengkap Anda.";
    }

    if (!EMAIL_RE.test(normalizedEmail)) {
      errs.email = "Masukkan email yang valid.";
    }

    if (!PHONE_RE.test(normalizedPhone)) {
      errs.phone = "Masukkan nomor HP yang valid.";
    }

    if (password.length < MIN_PASSWORD) {
      errs.password = `Kata sandi minimal ${MIN_PASSWORD} karakter.`;
    }

    if (confirm !== password) {
      errs.confirm = "Kata sandi tidak sama.";
    }

    if (!agree) {
      errs.terms = "Setujui Syarat & Ketentuan untuk melanjutkan.";
    }

    setErrors(errs);

    if (Object.keys(errs).length > 0) return;

    setLoading(true);

    const controller = new AbortController();

    const timer = setTimeout(() => {
      controller.abort();
    }, TIMEOUT_MS);

    try {
      const url = `${API_URL}/api/auth/register`;

      console.log("REGISTER URL:", url);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          name: name.trim(),
          email: normalizedEmail,
          phone: normalizedPhone,
          password,
        }),
      });

      const data = await res.json().catch(() => ({}));

      console.log("REGISTER STATUS:", res.status);
      console.log("REGISTER RESPONSE:", data);

      if (!res.ok) {
        setErrors({
          form:
            data.message ||
            data.error ||
            `Pendaftaran gagal. Kode: ${res.status}`,
        });
        return;
      }

      setErrors({});

      router.replace("/auth/login");
    } catch (error: any) {
      console.error("REGISTER ERROR:", error);

      if (error?.name === "AbortError") {
        setErrors({
          form:
            "Koneksi ke server terlalu lama. Periksa jaringan dan alamat IP.",
        });
      } else {
        setErrors({
          form:
            "Tidak dapat terhubung ke server. Periksa IP laptop, Wi-Fi, dan backend.",
        });
      }
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
          <View style={styles.topBar}>
            <Pressable
              style={styles.back}
              onPress={() =>
                router.canGoBack()
                  ? router.back()
                  : router.replace("/auth/login")
              }
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Kembali"
            >
              <Ionicons
                name="arrow-back"
                size={22}
                color={COLORS.brand}
              />
            </Pressable>

            <Image
              source={LOGO}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Encoré"
            />

            <View style={styles.back} />
          </View>

          <View style={styles.decor} pointerEvents="none">
            <View style={styles.decorV} />
            <View style={styles.decorH} />
            <View style={styles.decorCircle} />
          </View>

          <Text style={styles.title}>Pendaftaran</Text>

          <View style={styles.form}>
            {/* Nama */}
            <View style={styles.field}>
              <Text style={styles.label}>NAMA LENGKAP</Text>

              <TextInput
                style={[
                  styles.input,
                  errors.name && styles.inputError,
                ]}
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  clear("name");
                }}
                placeholder="Nama Anda"
                placeholderTextColor={COLORS.placeholder}
                autoCapitalize="words"
                autoComplete="name"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                accessibilityLabel="Nama lengkap"
              />

              {errors.name && (
                <Text style={styles.error}>{errors.name}</Text>
              )}
            </View>

            {/* Email */}
            <View style={styles.field}>
              <Text style={styles.label}>EMAIL</Text>

              <TextInput
                ref={emailRef}
                style={[
                  styles.input,
                  errors.email && styles.inputError,
                ]}
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
                onSubmitEditing={() => phoneRef.current?.focus()}
                accessibilityLabel="Email"
              />

              {errors.email && (
                <Text style={styles.error}>{errors.email}</Text>
              )}
            </View>

            {/* Nomor HP */}
            <View style={styles.field}>
              <Text style={styles.label}>NOMOR HP</Text>

              <TextInput
                ref={phoneRef}
                style={[
                  styles.input,
                  errors.phone && styles.inputError,
                ]}
                value={phone}
                onChangeText={(v) => {
                  setPhone(v);
                  clear("phone");
                }}
                placeholder="+62 812 3456 7890"
                placeholderTextColor={COLORS.placeholder}
                keyboardType="phone-pad"
                autoComplete="tel"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                accessibilityLabel="Nomor HP"
              />

              {errors.phone && (
                <Text style={styles.error}>{errors.phone}</Text>
              )}
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
                  autoComplete="new-password"
                  returnKeyType="next"
                  onSubmitEditing={() => confirmRef.current?.focus()}
                  accessibilityLabel="Kata sandi"
                />

                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showPassword
                      ? "Sembunyikan kata sandi"
                      : "Tampilkan kata sandi"
                  }
                >
                  <Ionicons
                    name={
                      showPassword
                        ? "eye-off-outline"
                        : "eye-outline"
                    }
                    size={20}
                    color={COLORS.muted}
                  />
                </Pressable>
              </View>

              {errors.password && (
                <Text style={styles.error}>{errors.password}</Text>
              )}
            </View>

            {/* Konfirmasi password */}
            <View style={styles.field}>
              <Text style={styles.label}>
                KONFIRMASI KATA SANDI
              </Text>

              <View
                style={[
                  styles.input,
                  styles.passwordRow,
                  errors.confirm && styles.inputError,
                ]}
              >
                <TextInput
                  ref={confirmRef}
                  style={styles.passwordInput}
                  value={confirm}
                  onChangeText={(v) => {
                    setConfirm(v);
                    clear("confirm");
                  }}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.placeholder}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  returnKeyType="done"
                  onSubmitEditing={onRegister}
                  accessibilityLabel="Konfirmasi kata sandi"
                />

                <Pressable
                  onPress={() => setShowConfirm((v) => !v)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showConfirm
                      ? "Sembunyikan kata sandi"
                      : "Tampilkan kata sandi"
                  }
                >
                  <Ionicons
                    name={
                      showConfirm
                        ? "eye-off-outline"
                        : "eye-outline"
                    }
                    size={20}
                    color={COLORS.muted}
                  />
                </Pressable>
              </View>

              {errors.confirm && (
                <Text style={styles.error}>{errors.confirm}</Text>
              )}
            </View>

            {/* Syarat dan ketentuan */}
            <View>
              <Pressable
                style={styles.terms}
                onPress={() => {
                  setAgree((v) => !v);
                  clear("terms");
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agree }}
                accessibilityLabel="Setujui Syarat dan Ketentuan serta Kebijakan Privasi"
              >
                <View
                  style={[
                    styles.checkbox,
                    agree && styles.checkboxOn,
                    errors.terms && styles.checkboxError,
                  ]}
                >
                  {agree && (
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={COLORS.white}
                    />
                  )}
                </View>

                <Text style={styles.termsText}>
                  Saya menyetujui{" "}
                  <Text style={styles.termsLink}>
                    Syarat & Ketentuan
                  </Text>{" "}
                  serta Kebijakan Privasi yang berlaku.
                </Text>
              </Pressable>

              {errors.terms && (
                <Text style={[styles.error, styles.termsError]}>
                  {errors.terms}
                </Text>
              )}
            </View>

            {/* Error server */}
            {errors.form && (
              <Text style={[styles.error, styles.formError]}>
                {errors.form}
              </Text>
            )}

            {/* Tombol daftar */}
            <Pressable
              style={({ pressed }) => [
                styles.cta,
                !agree && styles.ctaOff,
                pressed && !loading && styles.pressed,
                loading && styles.ctaDisabled,
              ]}
              onPress={onRegister}
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
                <Text style={styles.ctaText}>Buat Akun</Text>
              )}
            </Pressable>
          </View>

          {/* Login */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Sudah punya akun?{" "}
            </Text>

            <Pressable
              onPress={() => router.replace("/auth/login")}
              hitSlop={8}
              accessibilityRole="link"
            >
              <Text style={styles.footerLink}>Masuk</Text>
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
    paddingTop: 8,
    paddingBottom: 28,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  back: {
    width: 40,
    height: 40,
    justifyContent: "center",
  },

  logo: {
    width: 110,
    height: 36,
  },

  decor: {
    height: 70,
    marginTop: 8,
    opacity: 0.55,
  },

  decorV: {
    position: "absolute",
    left: "58%",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: COLORS.accent,
  },

  decorH: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "55%",
    height: 1,
    backgroundColor: COLORS.accent,
  },

  decorCircle: {
    position: "absolute",
    right: 18,
    top: 6,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },

  title: {
    fontFamily: SERIF,
    fontSize: 28,
    fontWeight: "700",
    color: COLORS.ink,
    marginTop: 4,
  },

  form: {
    marginTop: 20,
    gap: 18,
  },

  field: {
    gap: 4,
  },

  label: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    color: COLORS.muted,
  },

  input: {
    minHeight: 46,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.muted,
    fontSize: 15,
    color: COLORS.ink,
  },

  inputError: {
    borderBottomColor: COLORS.error,
  },

  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  passwordInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.ink,
    paddingVertical: 12,
  },

  error: {
    fontSize: 12,
    color: COLORS.error,
    paddingLeft: 2,
  },

  formError: {
    textAlign: "center",
    paddingLeft: 0,
  },

  terms: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  checkbox: {
    width: 20,
    height: 20,
    marginTop: 1,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORS.brand,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
  },

  checkboxOn: {
    backgroundColor: COLORS.brand,
  },

  checkboxError: {
    borderColor: COLORS.error,
  },

  termsText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 20,
    color: COLORS.muted,
  },

  termsLink: {
    color: COLORS.brand,
    textDecorationLine: "underline",
  },

  termsError: {
    marginTop: 6,
    paddingLeft: 30,
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

  ctaOff: {
    opacity: 0.6,
  },

  ctaDisabled: {
    opacity: 0.5,
  },

  pressed: {
    opacity: 0.8,
  },

  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
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
