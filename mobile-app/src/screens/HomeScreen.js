import AnimatedButton from "../components/AnimatedButton";
/**
 * HomeScreen — editorial landing page matching the web aesthetic.
 *
 * Sections:
 *   1. Navbar strip (logo + "Sign in" link)
 *   2. Hero — headline, sub-copy, two CTAs
 *   3. Trust strip — three proof points
 *   4. Lifecycle — 4-step issuance flow
 *   5. Dark verify teaser — nudges public users to verify
 *   6. Footer note
 */
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ─── design tokens (mirrors web) ─────────────────────────────────────────────
const T = {
  navy:      "#08283F",
  navyDark:  "#051E2E",
  gold:      "#B98A28",
  goldLight: "#F5EBDB",
  muted:     "#4A5A68",
  faint:     "#8A929C",
  cream:     "#F8F7F2",
  border:    "#E4E1D6",
  surface:   "#fff",
  green:     "#2E7D32",
};

const LIFECYCLE = [
  { n: "01", title: "Institution issues",  body: "Your university creates and approves your certificate on Intelligent Academic Credentialing." },
  { n: "02", title: "Anchored on-chain",   body: "The certificate hash is written to Ethereum — permanent and tamper-proof." },
  { n: "03", title: "You receive it",      body: "A link arrives via WhatsApp. Sign in with Google to access your certificate." },
  { n: "04", title: "Share with anyone",   body: "Give employers a QR code or share link — they verify in seconds, no login needed." },
];

const TRUST = [
  { icon: "⛓", label: "Ethereum-anchored" },
  { icon: "📌", label: "IPFS-pinned PDFs"  },
  { icon: "🔐", label: "SHA-256 hashed"   },
];

export default function HomeScreen({ navigation }) {
  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Navbar strip ── */}
        <View style={s.nav}>
          <View style={s.navBrand}>
            <Image
              source={require("../../assets/logo.png")}
              style={s.navLogo}
              resizeMode="contain"
            />
            <Text style={s.navName} numberOfLines={2}>Intelligent Academic Credentialing</Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate("StudentWelcome")}
            style={s.navSignIn}
          >
            <Text style={s.navSignInText}>My certificates</Text>
          </TouchableOpacity>
        </View>

        {/* ── Hero ── */}
        <View style={s.hero}>
          <Text style={s.heroEyebrow}>For students &amp; certificate verifiers</Text>
          <Text style={s.heroH1}>
            Your credentials,{"\n"}anywhere
          </Text>
          <Text style={s.heroSub}>
            Students access and share blockchain-anchored certificates.
            Employers and verifiers confirm authenticity instantly —
            no institution contact needed.
          </Text>
          <View style={s.heroCtas}>
            {/* Primary — verifiers (largest audience, no login) */}
            <AnimatedButton label="Verify a certificate" onPress={() => navigation.navigate("Verify")} />

            {/* Secondary — students accessing their portal */}
            <TouchableOpacity
              style={s.btnNavy}
              onPress={() => navigation.navigate("StudentWelcome")}
              activeOpacity={0.85}
            >
              <Text style={s.btnNavyText}>Access my certificates</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Trust strip ── */}
        <View style={s.trustStrip}>
          {TRUST.map((t) => (
            <View key={t.label} style={s.trustPill}>
              <Text style={s.trustIcon}>{t.icon}</Text>
              <Text style={s.trustLabel}>{t.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Lifecycle ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>How it works</Text>
          <Text style={s.sectionTitle}>From your university{"\n"}to your pocket</Text>
          <View style={s.lifecycleList}>
            {LIFECYCLE.map((step, i) => (
              <View key={step.n} style={s.lifecycleRow}>
                {/* connector line */}
                <View style={s.lifecycleLeft}>
                  <View style={[s.lifecycleDot, i === LIFECYCLE.length - 1 && s.lifecycleDotLast]}>
                    <Text style={s.lifecycleDotNum}>{step.n}</Text>
                  </View>
                  {i < LIFECYCLE.length - 1 && <View style={s.lifecycleLine} />}
                </View>
                <View style={s.lifecycleContent}>
                  <Text style={s.lifecycleTitle}>{step.title}</Text>
                  <Text style={s.lifecycleBody}>{step.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── Dark verify teaser ── */}
        <View style={s.darkSection}>
          <Text style={s.darkEyebrow}>For employers &amp; verifiers · No login required</Text>
          <Text style={s.darkTitle}>
            Verify in seconds,{"\n"}not days
          </Text>
          <Text style={s.darkSub}>
            Scan the QR on any Intelligent Academic Credentialing certificate or enter the ID.
            Three independent checks — institution, document, and chain record.
          </Text>
          <View style={s.darkChecks}>
            {[
              "Institution confirmed",
              "Document integrity valid",
              "Blockchain record verified",
            ].map((c) => (
              <View key={c} style={s.darkCheckRow}>
                <Text style={s.darkCheckMark}>✓</Text>
                <Text style={s.darkCheckText}>{c}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={s.darkBtn}
            onPress={() => navigation.navigate("Verify")}
            activeOpacity={0.85}
          >
            <Text style={s.darkBtnText}>Try it now →</Text>
          </TouchableOpacity>
        </View>

        {/* ── Footer ── */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            Built for Sierra Leone · Powered by Ethereum &amp; IPFS
          </Text>
          <Text style={s.footerText}>© 2026 Intelligent Academic Credentialing</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: T.cream },
  scroll: { paddingBottom: 0 },

  // ── Navbar ──
  nav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    backgroundColor: T.cream,
  },
  navBrand:     { flexDirection: "row", alignItems: "center", gap: 8 },
  navLogo:      { width: 26, height: 26, borderRadius: 6 },
  navName:      { fontSize: 14, fontWeight: "700", color: T.navy, letterSpacing: 0.2, flexShrink: 1, lineHeight: 17 },
  navSignIn:    { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: T.navy },
  navSignInText:{ fontSize: 13, fontWeight: "600", color: T.navy },

  // ── Hero ──
  hero: {
    paddingHorizontal: 22,
    paddingTop: 44,
    paddingBottom: 36,
    backgroundColor: T.cream,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: T.gold,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  heroH1: {
    fontSize: 34,
    fontWeight: "300",
    color: T.navy,
    lineHeight: 42,
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  heroSub: {
    fontSize: 15,
    color: T.muted,
    lineHeight: 23,
    marginBottom: 28,
  },
  heroCtas:    { gap: 10 },
  btnPrimary: {
    backgroundColor: T.gold,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  btnNavy: {
    backgroundColor: T.navy,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
  },
  btnNavyText: { color: "#fff", fontWeight: "600", fontSize: 15 },

  // ── Trust strip ──
  trustStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    gap: 8,
  },
  trustPill:  { flex: 1, alignItems: "center", gap: 4 },
  trustIcon:  { fontSize: 18 },
  trustLabel: { fontSize: 10, fontWeight: "600", color: T.muted, textAlign: "center" },

  // ── Section ──
  section: {
    paddingHorizontal: 22,
    paddingTop: 40,
    paddingBottom: 40,
    backgroundColor: T.cream,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: T.gold,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "300",
    color: T.navy,
    lineHeight: 32,
    marginBottom: 28,
  },

  // ── Lifecycle ──
  lifecycleList: { gap: 0 },
  lifecycleRow: {
    flexDirection: "row",
    gap: 16,
    paddingBottom: 0,
  },
  lifecycleLeft: { alignItems: "center", width: 36 },
  lifecycleDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: T.navy,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  lifecycleDotLast: { backgroundColor: T.gold },
  lifecycleDotNum:  { color: "#fff", fontSize: 10, fontWeight: "800" },
  lifecycleLine: {
    width: 1,
    flex: 1,
    backgroundColor: T.border,
    marginTop: 4,
    marginBottom: 4,
    minHeight: 24,
  },
  lifecycleContent: { flex: 1, paddingBottom: 24, paddingTop: 8 },
  lifecycleTitle:   { fontSize: 14, fontWeight: "700", color: T.navy, marginBottom: 3 },
  lifecycleBody:    { fontSize: 13, color: T.muted, lineHeight: 19 },

  // ── Dark section ──
  darkSection: {
    backgroundColor: T.navy,
    paddingHorizontal: 22,
    paddingVertical: 44,
  },
  darkEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: T.gold,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  darkTitle: {
    fontSize: 30,
    fontWeight: "300",
    color: "#fff",
    lineHeight: 38,
    marginBottom: 14,
  },
  darkSub: {
    fontSize: 14,
    color: "#B0C8DC",
    lineHeight: 22,
    marginBottom: 24,
  },
  darkChecks:   { gap: 10, marginBottom: 28 },
  darkCheckRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  darkCheckMark:{ color: T.gold, fontSize: 14, fontWeight: "800" },
  darkCheckText:{ color: "#D0E4EF", fontSize: 14 },
  darkBtn: {
    alignSelf: "flex-start",
    backgroundColor: T.gold,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 24,
  },
  darkBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // ── Footer ──
  footer: {
    paddingHorizontal: 22,
    paddingVertical: 28,
    borderTopWidth: 1,
    borderTopColor: T.border,
    backgroundColor: T.cream,
    gap: 4,
    alignItems: "center",
  },
  footerText: { fontSize: 11, color: T.faint, textAlign: "center" },
});
