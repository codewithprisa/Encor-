import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const COLORS = {
  bg: "#F7F2FA",
  cardBg: "#FAF6FC",
  purpleDark: "#2B2149",
  purpleBrand: "#322553",
  purpleMuted: "#63567D",
  purpleLight: "#E8DEF2",
  purpleWave: "#EFE6F7",
  white: "#FFFFFF",
  sparkleLight: "rgba(255, 255, 255, 0.9)",
  dotActive: "#322553",
  dotInactive: "#D4C8E2",
};

const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

// Gambar konser (fallback ke file lokal kalau offline)
const HERO_IMAGE = require("../../components/assets/images/concert-bg.jpg");

export default function Intro() {
  const router = useRouter();

  const handleStart = () => {
    router.replace("/auth/login");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Background Decorative Shapes / Curves */}
      <View style={styles.bgDecor} pointerEvents="none">
        <View style={styles.curveTopRight} />
        <View style={styles.curveBottomLeft} />
        <View style={styles.curveBottomRight} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Sparkle Atas Kiri */}
        <Text style={styles.sparkleTopLeft} pointerEvents="none">
          ✦
        </Text>

        {/* ── Brand Header ── */}
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <Text style={styles.logo}>Encoré</Text>
            <Text style={styles.logoSparkle}>✦</Text>
          </View>
          <Text style={styles.subtitle}>Discover Your Next Concert</Text>
        </View>

        {/* ── Hero Concert Image ── */}
        <View style={styles.heroWrap}>
          <Image
            source={HERO_IMAGE}
            style={styles.heroImage}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />

          {/* Sparkles di atas gambar */}
          <Text style={styles.sparkleHeroLeft} pointerEvents="none">
            ✦
          </Text>
          <Text style={styles.sparkleHeroRight} pointerEvents="none">
            ✦
          </Text>
        </View>

        {/* ── Copy / Teks Promo ── */}
        <View style={styles.copy}>
          <Text style={styles.title}>
            Temukan{"\n"}Konser Favoritmu
          </Text>
          <Text style={styles.desc}>
            Dari musisi indie hingga panggung megah, temukan pengalaman musik yang paling cocok untukmu.
          </Text>
        </View>

        {/* ── Tombol CTA Mulai Jelajahi ── */}
        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          onPress={handleStart}
          accessibilityRole="button"
          accessibilityLabel="Mulai Jelajahi"
        >
          <Text style={styles.ctaText}>Mulai Jelajahi</Text>
          <Ionicons name="arrow-forward" size={18} color={COLORS.white} style={styles.ctaIcon} />
        </Pressable>

        {/* ── Pagination Dots ── */}
        <View style={styles.dotsRow}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>

        {/* Sparkle Bawah Kiri */}
        <Text style={styles.sparkleBottomLeft} pointerEvents="none">
          ✦
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  bgDecor: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
  },
  curveTopRight: {
    position: "absolute",
    top: -60,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: COLORS.purpleWave,
    opacity: 0.7,
  },
  curveBottomLeft: {
    position: "absolute",
    bottom: -80,
    left: -70,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: COLORS.purpleWave,
    opacity: 0.6,
  },
  curveBottomRight: {
    position: "absolute",
    bottom: -40,
    right: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: COLORS.purpleWave,
    opacity: 0.5,
  },

  scroll: {
    flexGrow: 1,
    paddingHorizontal: 26,
    paddingTop: 12,
    paddingBottom: 24,
    justifyContent: "space-between",
  },

  // Sparkles
  sparkleTopLeft: {
    position: "absolute",
    top: 20,
    left: 24,
    fontSize: 20,
    color: COLORS.purpleBrand,
    opacity: 0.9,
  },
  sparkleHeroLeft: {
    position: "absolute",
    left: 18,
    top: "38%",
    fontSize: 18,
    color: COLORS.sparkleLight,
    textShadowColor: "rgba(0, 0, 0, 0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  sparkleHeroRight: {
    position: "absolute",
    right: 22,
    bottom: 22,
    fontSize: 24,
    color: COLORS.sparkleLight,
    textShadowColor: "rgba(0, 0, 0, 0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  sparkleBottomLeft: {
    position: "absolute",
    bottom: 24,
    left: 20,
    fontSize: 18,
    color: COLORS.purpleMuted,
    opacity: 0.8,
  },

  // Header
  header: {
    alignItems: "center",
    marginTop: 8,
    marginBottom: 16,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  logo: {
    fontFamily: SERIF,
    fontSize: 42,
    fontWeight: "700",
    letterSpacing: -0.5,
    color: COLORS.purpleDark,
  },
  logoSparkle: {
    fontSize: 16,
    color: COLORS.purpleDark,
    marginTop: 2,
    marginLeft: 2,
  },
  subtitle: {
    fontSize: 13.5,
    fontWeight: "500",
    color: COLORS.purpleMuted,
    marginTop: 4,
    letterSpacing: 0.3,
  },

  // Hero Image
  heroWrap: {
    width: "100%",
    height: 280,
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: COLORS.purpleDark,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 6,
    backgroundColor: COLORS.purpleLight,
    marginBottom: 20,
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },

  // Copy
  copy: {
    marginBottom: 20,
  },
  title: {
    fontFamily: SERIF,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
    color: COLORS.purpleDark,
    letterSpacing: -0.3,
  },
  desc: {
    fontSize: 13.5,
    lineHeight: 21,
    color: COLORS.purpleMuted,
    marginTop: 10,
  },

  // CTA Button
  cta: {
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: COLORS.purpleBrand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    shadowColor: COLORS.purpleBrand,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.white,
    letterSpacing: 0.2,
  },
  ctaIcon: {
    marginLeft: 8,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },

  // Pagination Dots
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    marginTop: 18,
    marginBottom: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.dotInactive,
  },
  dotActive: {
    backgroundColor: COLORS.dotActive,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
