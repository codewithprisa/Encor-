import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const COLORS = {
  background: "#FFF7ED",
  brand: "#2B6389",
  accent: "#A1BFD1",
  white: "#FFFFFF",
  ink: "#3D3028",
  muted: "#6B4C3B",
};

const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

// Ganti dengan gambar lokal kamu, contoh:
// const HERO = require("../../../assets/images/intro.jpg");
const HERO = {
  uri: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=900&q=80",
};

export default function Intro() {
  const router = useRouter();

  const goToLogin = () => router.replace("/auth/login");

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>Encoré</Text>
          <Pressable onPress={goToLogin} hitSlop={12} accessibilityRole="button" accessibilityLabel="Lewati">
            <Text style={styles.skip}>Lewati</Text>
          </Pressable>
        </View>

        {/* Gambar utama */}
        <View style={styles.hero}>
          <Image source={HERO} style={styles.heroImage} resizeMode="cover" accessibilityIgnoresInvertColors />
          <View style={styles.badge}>
            <Ionicons name="location-outline" size={22} color={COLORS.brand} />
          </View>
        </View>

        {/* Teks */}
        <View style={styles.copy}>
          <Text style={styles.title}>Temukan konser di sekitarmu</Text>
          <Text style={styles.desc}>
            Akses eksklusif ke berbagai pertunjukan musik dan seni pertunjukan pilihan terbaik di kotamu.
          </Text>
        </View>

        {/* Tombol */}
        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          onPress={() => router.push("/auth/login")}
          accessibilityRole="button"
          accessibilityLabel="Mulai"
        >
          <Text style={styles.ctaText}>Mulai</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: {
    fontFamily: SERIF,
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.brand,
  },
  skip: {
    fontSize: 13,
    color: COLORS.brand,
  },
  hero: {
    flex: 1,
    marginTop: 24,
    maxHeight: 420,
  },
  heroImage: {
    width: "100%",
    height: "100%",
    borderRadius: 28,
  },
  badge: {
    position: "absolute",
    right: -6,
    bottom: -26,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.accent,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  copy: {
    marginTop: 44,
    gap: 10,
  },
  title: {
    fontFamily: SERIF,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
    color: COLORS.ink,
  },
  desc: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.muted,
  },
  cta: {
    marginTop: 28,
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
  pressed: {
    opacity: 0.8,
  },
});