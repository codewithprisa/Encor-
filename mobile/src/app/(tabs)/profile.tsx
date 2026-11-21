import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { removeStorageItem } from "@/lib/tokenStorage";
import * as ImagePicker from "expo-image-picker";
import { useFonts, PlayfairDisplay_700Bold } from "@expo-google-fonts/playfair-display";
import { DMSans_400Regular, DMSans_500Medium } from "@expo-google-fonts/dm-sans";

// Semua koneksi ke backend lewat lib/api (alamat server otomatis, tidak di-hardcode lagi)
import { api, imageUrl, TOKEN_KEY, type User } from "@/lib/api";

// Sesuaikan dengan lokasi file login di folder app kamu
const LOGIN_ROUTE = "/auth/login";

// Path relatif dari backend (/uploads/profile/xxx.jpg) dijadikan URL penuh
const resolvePhoto = (photo: string | null): string | null => imageUrl(photo) ?? null;

const COLORS = {
  white: "#FFFFFF",
  surface: "#F7F5F2",
  background: "#FFF7ED",
  sand: "#F1E2D0",
  tan: "#D8B58A",
  brown: "#6B4C3B",
  dark: "#3D3028",
  primary: "#2B6389",
  primarySoft: "#A1BFD1",
};

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type MenuItem = { label: string; icon: IconName; route?: string };

const menus: MenuItem[] = [
  { label: "Riwayat Pesanan", icon: "time-outline", route: "/(tabs)/tiket" },
  { label: "Wishlist", icon: "heart-outline", route: "/(tabs)/wishlist" },
  { label: "Refund", icon: "refresh-circle-outline", route: "/(tabs)/tiket" },
];

const MIN_PASSWORD = 8;
const MIN_NAME = 3; // sama dengan validasi di server

export default function ProfileScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const nameRef = useRef<TextInput>(null);
  const formY = useRef<number>(0);
  const hasLoaded = useRef<boolean>(false); // spinner penuh hanya untuk muat pertama
  const editingRef = useRef<boolean>(false); // jangan timpa ketikan saat sedang edit

  const [fontsLoaded] = useFonts({
    PlayfairDisplay_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
  });

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [savedName, setSavedName] = useState<string>("");

  const [fullName, setFullName] = useState<string>("");
  const [currentPassword, setCurrentPassword] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [showCurrent, setShowCurrent] = useState<boolean>(false);
  const [showNew, setShowNew] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [newPhoto, setNewPhoto] = useState<string | null>(null); // foto baru (belum diunggah)

  // Ambil data profil setiap tab Profil dibuka (bukan hanya sekali)
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!hasLoaded.current) setLoading(true);
        setLoadError(null);
        try {
          const me = await api.getMe();
          if (!active) return;
          setUser(me);
          setSavedName(me.name);
          if (!editingRef.current) setFullName(me.name);
          hasLoaded.current = true;
        } catch (e: any) {
          if (active) setLoadError(e.message ?? "Periksa koneksi lalu coba lagi.");
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [reloadKey])
  );

  if (!fontsLoaded) return null;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={styles.flex} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorTitle}>Gagal memuat profil</Text>
          <Text style={styles.errorText}>{loadError ?? "Terjadi kesalahan."}</Text>
          <Pressable
            style={styles.editButton}
            onPress={() => {
              hasLoaded.current = false;
              setReloadKey((k) => k + 1);
            }}
          >
            <Text style={styles.editButtonText}>COBA LAGI</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const passwordFilled: boolean = newPassword.length > 0 || currentPassword.length > 0;
  const photoUri: string | null = newPhoto ?? resolvePhoto(user.photo);

  const startEdit = () => {
    editingRef.current = true;
    setIsEditing(true);
    scrollRef.current?.scrollTo({ y: Math.max(formY.current - 12, 0), animated: true });
    setTimeout(() => nameRef.current?.focus(), 350);
  };

  const exitEdit = () => {
    editingRef.current = false;
    setFullName(savedName);
    setCurrentPassword("");
    setNewPassword("");
    setShowCurrent(false);
    setShowNew(false);
    setNewPhoto(null);
    setIsEditing(false);
  };

  const pickPhoto = async () => {
    if (!isEditing || saving) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setNewPhoto(result.assets[0].uri);
      }
    } catch {
      Alert.alert("Gagal", "Tidak bisa membuka galeri.");
    }
  };

  const handleSave = async () => {
    const trimmedName = fullName.trim();

    if (trimmedName.length < MIN_NAME) {
      Alert.alert("Nama tidak valid", `Nama lengkap minimal ${MIN_NAME} karakter.`);
      return;
    }

    if (passwordFilled) {
      if (!currentPassword) {
        Alert.alert(
          "Kata sandi saat ini kosong",
          "Masukkan kata sandi saat ini untuk mengubah kata sandi."
        );
        return;
      }
      if (!newPassword) {
        Alert.alert("Kata sandi baru kosong", "Masukkan kata sandi baru.");
        return;
      }
      if (newPassword.length < MIN_PASSWORD) {
        Alert.alert(
          "Kata sandi terlalu pendek",
          `Kata sandi baru minimal ${MIN_PASSWORD} karakter.`
        );
        return;
      }
      if (newPassword === currentPassword) {
        Alert.alert(
          "Kata sandi sama",
          "Kata sandi baru harus berbeda dari kata sandi saat ini."
        );
        return;
      }
    }

    try {
      setSaving(true);

      // Password dulu: kalau kata sandi lama salah, nama tidak ikut tersimpan
      if (passwordFilled) {
        await api.updatePassword({ oldPassword: currentPassword, newPassword });
      }
      const updated = await api.updateProfile({ name: trimmedName });

      // Foto terakhir; hanya diunggah kalau user memilih foto baru
      let savedPhoto: string | null = user.photo;
      if (newPhoto) {
        const uploaded = await api.uploadProfilePhoto(newPhoto);
        savedPhoto = uploaded.photo;
      }

      setUser((u: User | null) => (u ? { ...u, name: updated.name, photo: savedPhoto } : u));
      setSavedName(updated.name);
      setFullName(updated.name);
      setCurrentPassword("");
      setNewPassword("");
      setShowCurrent(false);
      setShowNew(false);
      setNewPhoto(null);
      editingRef.current = false;
      setIsEditing(false); // kunci lagi setelah simpan

      Alert.alert("Berhasil", "Perubahan profil berhasil disimpan.");
    } catch (e: any) {
      Alert.alert("Gagal menyimpan", e.message ?? "Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Keluar dari akun", "Yakin ingin keluar?", [
      { text: "Batal", style: "cancel" },
      {
        text: "Keluar",
        style: "destructive",
        onPress: async () => {
          try {
            await removeStorageItem(TOKEN_KEY);
            await removeStorageItem("encore_user");
          } finally {
            hasLoaded.current = false;
            editingRef.current = false;
            router.replace(LOGIN_ROUTE as any);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar */}
          <View style={styles.avatarWrap}>
            <Pressable
              style={styles.avatarRing}
              onPress={pickPhoto}
              disabled={!isEditing || saving}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarText}>
                    {savedName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </Pressable>
            {!isEditing ? (
              <Pressable style={styles.editBadge} onPress={startEdit}>
                <Ionicons name="pencil" size={12} color={COLORS.white} />
              </Pressable>
            ) : (
              <Pressable style={styles.editBadge} onPress={pickPhoto} disabled={saving}>
                <Ionicons name="camera" size={13} color={COLORS.white} />
              </Pressable>
            )}
          </View>

          <Text style={styles.name}>{savedName}</Text>
          <Text style={styles.info}>{user.email}</Text>
          <Text style={styles.info}>{user.phone}</Text>

          {!isEditing ? (
            <Pressable style={styles.editButton} onPress={startEdit}>
              <Text style={styles.editButtonText}>EDIT PROFIL</Text>
            </Pressable>
          ) : (
            <View style={styles.editingPill}>
              <Ionicons name="create-outline" size={14} color={COLORS.primary} />
              <Text style={styles.editingText}>Mode edit aktif</Text>
            </View>
          )}

          {/* Menu */}
          <View style={[styles.card, styles.menuCard]}>
            {menus.map((menu) => (
              <Pressable
                key={menu.label}
                style={styles.menuItem}
                onPress={() => {
                  if (menu.route) router.push(menu.route as any);
                }}
              >
                <View style={styles.menuIcon}>
                  <Ionicons name={menu.icon} size={20} color={COLORS.primary} />
                </View>
                <Text style={styles.menuText}>{menu.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={COLORS.brown} />
              </Pressable>
            ))}
          </View>

          {/* Form wrapper (dipakai untuk auto-scroll ke form saat edit) */}
          <View
            style={styles.formWrap}
            onLayout={(e) => {
              formY.current = e.nativeEvent.layout.y;
            }}
          >
            {/* Informasi Akun */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Informasi Akun</Text>
              <View style={styles.card}>
                <Text style={styles.label}>NAMA LENGKAP</Text>
                <View style={styles.fieldWrap}>
                  <TextInput
                    ref={nameRef}
                    style={[
                      styles.input,
                      !isEditing ? styles.inputLocked : null,
                      !isEditing ? styles.inputPadRight : null,
                    ]}
                    value={fullName}
                    onChangeText={setFullName}
                    editable={isEditing}
                    placeholder="Masukkan nama lengkap"
                    placeholderTextColor={COLORS.tan}
                    autoCapitalize="words"
                    maxLength={50}
                  />
                  {!isEditing ? (
                    <Ionicons
                      name="lock-closed-outline"
                      size={16}
                      color={COLORS.tan}
                      style={styles.rightIcon}
                    />
                  ) : null}
                </View>

                <Text style={[styles.label, styles.labelGap]}>EMAIL</Text>
                <View style={styles.fieldWrap}>
                  <TextInput
                    style={[styles.input, styles.inputLocked, styles.inputPadRight]}
                    value={user.email}
                    editable={false}
                  />
                  <Ionicons
                    name="lock-closed-outline"
                    size={16}
                    color={COLORS.tan}
                    style={styles.rightIcon}
                  />
                </View>

                <Text style={[styles.label, styles.labelGap]}>NOMOR HP</Text>
                <View style={styles.fieldWrap}>
                  <TextInput
                    style={[styles.input, styles.inputLocked, styles.inputPadRight]}
                    value={user.phone ?? ""}
                    editable={false}
                  />
                  <Ionicons
                    name="lock-closed-outline"
                    size={16}
                    color={COLORS.tan}
                    style={styles.rightIcon}
                  />
                </View>

                <Text style={styles.hint}>Email dan nomor HP tidak dapat diubah.</Text>
              </View>
            </View>

            {/* Keamanan */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Keamanan</Text>
              <View style={styles.card}>
                <Text style={styles.label}>KATA SANDI SAAT INI</Text>
                <View style={styles.fieldWrap}>
                  <TextInput
                    style={[
                      styles.input,
                      styles.inputPadRight,
                      !isEditing ? styles.inputLocked : null,
                    ]}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    editable={isEditing}
                    placeholder={isEditing ? "Masukkan kata sandi saat ini" : "••••••••"}
                    placeholderTextColor={COLORS.tan}
                    secureTextEntry={!showCurrent}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {isEditing ? (
                    <Pressable
                      style={styles.rightIcon}
                      onPress={() => setShowCurrent((v) => !v)}
                      hitSlop={10}
                    >
                      <Ionicons
                        name={showCurrent ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={COLORS.brown}
                      />
                    </Pressable>
                  ) : (
                    <Ionicons
                      name="lock-closed-outline"
                      size={16}
                      color={COLORS.tan}
                      style={styles.rightIcon}
                    />
                  )}
                </View>

                <Text style={[styles.label, styles.labelGap]}>KATA SANDI BARU</Text>
                <View style={styles.fieldWrap}>
                  <TextInput
                    style={[
                      styles.input,
                      styles.inputPadRight,
                      !isEditing ? styles.inputLocked : null,
                    ]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    editable={isEditing}
                    placeholder="Masukkan kata sandi baru"
                    placeholderTextColor={COLORS.tan}
                    secureTextEntry={!showNew}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {isEditing ? (
                    <Pressable
                      style={styles.rightIcon}
                      onPress={() => setShowNew((v) => !v)}
                      hitSlop={10}
                    >
                      <Ionicons
                        name={showNew ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={COLORS.brown}
                      />
                    </Pressable>
                  ) : (
                    <Ionicons
                      name="lock-closed-outline"
                      size={16}
                      color={COLORS.tan}
                      style={styles.rightIcon}
                    />
                  )}
                </View>

                <Text style={styles.hint}>
                  {`Minimal ${MIN_PASSWORD} karakter. Kosongkan jika tidak ingin mengubah kata sandi.`}
                </Text>
              </View>
            </View>
          </View>

          {/* Simpan / Batal (hanya saat mode edit) */}
          {isEditing ? (
            <View style={styles.actions}>
              <Pressable
                style={[styles.saveButton, saving ? styles.saveButtonDisabled : null]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.saveText}>
                  {saving ? "MENYIMPAN..." : "SIMPAN PERUBAHAN"}
                </Text>
              </Pressable>

              {!saving ? (
                <Pressable style={styles.cancelButton} onPress={exitEdit}>
                  <Text style={styles.cancelText}>BATAL</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* Logout */}
          <Pressable style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={18} color={COLORS.brown} />
            <Text style={styles.logoutText}>KELUAR DARI AKUN</Text>
          </Pressable>

          <Text style={styles.version}>Versi Aplikasi 1.4.2</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // Latar krem agar area status bar menyatu dengan halaman (header putih sudah dihapus)
  safe: { flex: 1, backgroundColor: COLORS.background },

  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 20,
    color: COLORS.dark,
  },
  errorText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.brown,
    textAlign: "center",
    marginTop: 8,
  },

  container: { flex: 1, backgroundColor: COLORS.background },
  content: { alignItems: "center", paddingTop: 24, paddingBottom: 40 },

  avatarWrap: { width: 92, height: 92 },
  avatarRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 2,
    borderColor: COLORS.primarySoft,
    padding: 3,
    backgroundColor: COLORS.white,
  },
  avatar: { width: "100%", height: "100%", borderRadius: 44 },
  avatarFallback: {
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 34,
    color: COLORS.white,
  },
  editBadge: {
    position: "absolute",
    right: 0,
    bottom: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.background,
  },

  name: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 20,
    color: COLORS.dark,
    marginTop: 14,
  },
  info: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12.5,
    color: COLORS.brown,
    marginTop: 4,
  },

  editButton: {
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  editButtonText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12.5,
    letterSpacing: 1,
    color: COLORS.primary,
  },
  editingPill: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: COLORS.sand,
  },
  editingText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    color: COLORS.primary,
  },

  card: {
    alignSelf: "stretch",
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.sand,
    shadowColor: COLORS.dark,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  menuCard: {
    marginHorizontal: 20,
    marginTop: 32,
    borderRadius: 28,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.sand,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  menuText: {
    flex: 1,
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: COLORS.dark,
  },

  formWrap: { alignSelf: "stretch" },
  section: { alignSelf: "stretch", marginHorizontal: 20, marginTop: 32 },
  sectionTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 20,
    color: COLORS.dark,
    marginBottom: 12,
  },
  label: {
    fontFamily: "DMSans_500Medium",
    fontSize: 10.5,
    letterSpacing: 0.8,
    color: COLORS.brown,
    marginBottom: 6,
  },
  labelGap: { marginTop: 16 },

  fieldWrap: { justifyContent: "center" },
  input: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: COLORS.dark,
    borderWidth: 1,
    borderColor: COLORS.tan,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.white,
  },
  inputPadRight: { paddingRight: 44 },
  inputLocked: {
    color: COLORS.brown,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.sand,
  },
  rightIcon: { position: "absolute", right: 14 },
  hint: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11.5,
    lineHeight: 16,
    color: COLORS.brown,
    marginTop: 12,
  },

  actions: { alignSelf: "stretch", marginHorizontal: 20, marginTop: 28 },
  saveButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  saveButtonDisabled: { backgroundColor: COLORS.primarySoft },
  saveText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    letterSpacing: 1,
    color: COLORS.white,
  },
  cancelButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    marginTop: 8,
  },
  cancelText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12.5,
    letterSpacing: 1,
    color: COLORS.brown,
  },

  logoutButton: {
    alignSelf: "stretch",
    marginHorizontal: 20,
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: COLORS.brown,
    backgroundColor: COLORS.white,
  },
  logoutText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 13,
    letterSpacing: 1,
    color: COLORS.brown,
  },
  version: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11.5,
    color: COLORS.brown,
    marginTop: 16,
  },
});