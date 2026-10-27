import CredentialPreview from "../components/CredentialPreview";
import { Link2, FileText, Fingerprint } from "lucide-react-native";
import BrandHeader from "../components/BrandHeader";
import { colors as T, createStyles, fonts, cardShadow } from "../theme";
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
import React, { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
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

const LIFECYCLE = [
  { n: "01", title: "Institution issues",  body: "Your university creates and approves your certificate on Intelligent Academic Credentialing." },
  { n: "02", title: "Anchored on-chain",   body: "A blockchain record lets verifiers check the issued credential and its current status." },
  { n: "03", title: "You receive it",      body: "A link arrives via WhatsApp. Claim your credential, then link Google in account setup for future sign-ins." },
  { n: "04", title: "Share with anyone",   body: "Give employers a QR code or share link — they verify in seconds, no login needed." },
];

const TRUST = [
  { icon: Link2, label: "Ethereum-anchored" },
  { icon: FileText, label: "IPFS-pinned PDFs"  },
  { icon: Fingerprint, label: "SHA-256 hashed"   },
];

const ACTIONS = [
  { title: "Sign in", body: "Already claimed? Open your student dashboard.", screen: "StudentWelcome", intent: "login" },
  { title: "Verify a credential", body: "Scan a QR code or enter a credential ID. No login required.", screen: "Verify" },
  { title: "Claim credential", body: "Have an institution invitation? Paste the link or token to receive your credential.", screen: "StudentWelcome", intent: "claim" },
];
export default function HomeScreen({ navigation }) {
  const [tour, setTour] = useState(null), [seen, setSeen] = useState(false);
  useEffect(() => {
    let alive = true;
    async function readTour() {
      try {
        const value = Platform.OS === "web" ? window.localStorage.getItem("credence:landing-tour-v1") : await SecureStore.getItemAsync("credence-landing-tour-v1");
        if (alive) setSeen(value === "done");
      } catch { /* The optional tour works without persistent storage. */ }
    }
    void readTour();
    return () => { alive = false; };
  }, []);
  async function finishTour() {
    setTour(null); setSeen(true);
    try {
      if (Platform.OS === "web") window.localStorage.setItem("credence:landing-tour-v1", "done");
      else await SecureStore.setItemAsync("credence-landing-tour-v1", "done");
    } catch { /* Optional tour remains dismissible when storage is unavailable. */ }
  }
  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Navbar strip ── */}
        <BrandHeader action="Student access" onAction={() => navigation.navigate("StudentWelcome")} />

        <View style={s.hero}>
          <Text style={s.heroEyebrow}>STUDENTS & VERIFIERS</Text>
          <Text style={s.heroH1}>
            Your achievement.{"\n"}Always with you.
          </Text>
          <Text style={s.heroSub}>
            Keep your certificate and transcript together. Open your student portal,
            share your achievements, or check a credential with its QR code.
          </Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => setTour(0)} style={s.guideButton}><Text style={s.guideLink}>{seen ? "Show guide again" : "Take a quick tour"}</Text></TouchableOpacity>
          {tour !== null && <View style={s.tourBox}>
            <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={s.actionTitle}>Step {tour + 1} of 3: {ACTIONS[tour].title}</Text>
            <Text style={s.actionBody}>{ACTIONS[tour].body}</Text>
            <View style={s.tourControls}>
              <TouchableOpacity accessibilityRole="button" onPress={finishTour} style={s.guideButton}><Text style={s.guideLink}>Skip tour</Text></TouchableOpacity>
              {tour > 0 && <TouchableOpacity accessibilityRole="button" onPress={() => setTour(tour - 1)} style={s.guideButton}><Text style={s.guideLink}>Back</Text></TouchableOpacity>}
              <TouchableOpacity accessibilityRole="button" onPress={() => tour === 2 ? finishTour() : setTour(tour + 1)} style={s.guideButton}><Text style={s.guideLink}>{tour === 2 ? "Finish" : "Next"}</Text></TouchableOpacity>
            </View>
          </View>}
          <View style={s.heroCtas}>{ACTIONS.map((action, i) => <TouchableOpacity key={action.title} accessibilityRole="button" accessibilityLabel={`${action.title}. ${action.body}`} style={[s.actionCard, tour === i && s.actionSelected]} onPress={() => navigation.navigate(action.screen, { intent: action.intent })}>
            <Text style={s.actionTitle}>{action.title}</Text><Text style={s.actionBody}>{action.body}</Text>
          </TouchableOpacity>)}</View>
          <TouchableOpacity accessibilityRole="button" style={s.guideButton} onPress={() => navigation.navigate("Onboarding")}><Text style={s.guideLink}>View the welcome guide</Text></TouchableOpacity>
          <CredentialPreview />
        </View>

        {/* ── Trust strip ── */}
        <View style={s.trustStrip}>
          {TRUST.map((t) => (
            <View key={t.label} style={s.trustPill}>
              <t.icon size={18} color={T.accent} strokeWidth={1.5} />
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

const s = createStyles({
  safe:   { flex: 1, backgroundColor: T.cream },
  scroll: { paddingBottom: 0, width: "100%", maxWidth: 840, alignSelf: "center" },

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
  navBrand:     { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, marginRight: 12 },
  navLogo:      { width: 26, height: 26, borderRadius: 6 },
  navName:      { fontSize: 14, fontWeight: "700", color: T.navy, letterSpacing: 0.2, flexShrink: 1, lineHeight: 17 },
  navSignIn:    { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: T.navy },
  navSignInText:{ fontSize: 13, fontWeight: "600", color: T.navy },

  // ── Hero ──
  hero: { paddingHorizontal: 22, paddingTop: 38, paddingBottom: 36, backgroundColor: T.cream },
  heroEyebrow: { fontSize: 10, fontWeight: "600", color: T.accent, letterSpacing: 1.4, marginBottom: 16 },
  heroH1: { fontFamily: fonts.serif, fontSize: 43, color: T.navy, lineHeight: 47, letterSpacing: -1.3, marginBottom: 18 },
  heroSub: { fontSize: 14, color: T.muted, lineHeight: 24, marginBottom: 20 },
  heroCtas:    { gap: 10 },
  guideButton: { minHeight: 44, justifyContent: "center", paddingVertical: 10, paddingHorizontal: 4 },
  guideLink: { color: T.accent, fontSize: 12, fontWeight: "600" },
  actionCard: { borderWidth: 1, borderColor: T.border, borderLeftWidth: 3, borderLeftColor: T.accent, borderRadius: 12, padding: 18, backgroundColor: T.surface, ...cardShadow },
  actionSelected: { borderColor: T.accent, backgroundColor: T.accentSoft },
  actionTitle: { color: T.navy, fontSize: 15, fontWeight: "600" },
  actionBody: { color: T.muted, fontSize: 13, lineHeight: 21, marginTop: 6 },
  tourBox: { backgroundColor: "#F0E5DF", borderRadius: 14, padding: 18, marginBottom: 14 },
  tourControls: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 12 },
  previewCard: { marginTop: 26, padding: 24, borderRadius: 12, backgroundColor: T.cream, borderWidth: 1, borderColor: T.border, borderTopWidth: 3, borderTopColor: T.accent, ...cardShadow },
  previewHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  previewEyebrow: { fontSize: 10, fontWeight: "700", color: T.muted, letterSpacing: 1 },
  previewTag: { fontSize: 10, color: T.muted, backgroundColor: T.cream, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  previewTitle: { fontFamily: fonts.serif, fontSize: 29, lineHeight: 34, color: T.navy, marginTop: 20, marginBottom: 8 },
  previewBody: { fontSize: 13, lineHeight: 21, color: T.muted },
  previewRule: { height: 1, backgroundColor: T.border, marginVertical: 18 },
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
  trustIcon: { fontSize: 16, color: T.accent },
  trustLabel: { fontSize: 10, fontWeight: "600", color: T.muted, textAlign: "center" },

  // ── Section ──
  section: {
    paddingHorizontal: 22,
    paddingTop: 40,
    paddingBottom: 40,
    backgroundColor: T.cream,
  },
  sectionLabel: { fontSize: 10, fontWeight: "600", color: T.accent, letterSpacing: 1.3, marginBottom: 12 },
  sectionTitle: { fontFamily: fonts.serif, fontSize: 32, color: T.navy, lineHeight: 38, marginBottom: 26 },

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
  darkSection: { backgroundColor: T.navy, paddingHorizontal: 24, paddingVertical: 36, marginHorizontal: 16, borderRadius: 18, marginBottom: 24 },
  darkEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: T.gold,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  darkTitle: { fontFamily: fonts.serif, color: T.cream, fontSize: 34, lineHeight: 40, marginBottom: 18 },
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
