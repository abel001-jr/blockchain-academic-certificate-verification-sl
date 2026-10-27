import { colors, createStyles, fonts } from "../theme";
import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SplashBackground } from "../components/ContourSplash";
import { completeOnboarding } from "../services/onboarding";

const pages = [
  { label: "RECEIVE YOUR CREDENTIALS", title: "Your achievements,\nready to receive.", body: "Access certificates and official transcripts issued to you by your institution.", note: "Your institution issues the credential. You receive and hold it.", art: "CERTIFICATE" },
  { label: "KEEP AND SHARE", title: "Your records.\nReady when needed.", body: "Keep your academic credentials together and share them with employers and institutions.", note: "Choose the credential you want to share.", art: "TRANSCRIPT" },
  { label: "QR VERIFICATION", title: "Scan. Check.\nKnow the record.", body: "Scan a credential QR code to check its issuing institution and current status.", note: "A QR code opens the check; the verification result tells you the credential status.", art: "SCAN QR" },
];
export default function OnboardingScreen({ onComplete }) {
  const [step, setStep] = useState(0), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const motion = useRef(new Animated.Value(1)).current;
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) setReduced(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => { alive = false; sub.remove(); };
  }, []);
  useEffect(() => {
    motion.setValue(reduced ? 1 : 0);
    const animation = Animated.timing(motion, { toValue: 1, duration: reduced ? 0 : 350, useNativeDriver: true });
    animation.start(); return () => animation.stop();
  }, [step, reduced, motion]);
  async function finish() {
    if (saving) return;
    setSaving(true); setError("");
    try { await completeOnboarding(); onComplete(); }
    catch { setError("Could not remember your preference on this device. Try again or continue for this visit."); }
    finally { setSaving(false); }
  }
  const page = pages[step];
  return <SafeAreaView style={s.screen}>
    <SplashBackground reduced={reduced} />
    <View pointerEvents="none" style={s.wave} /><View pointerEvents="none" style={[s.wave, s.waveTwo]} />
    <View style={s.header}><Text style={s.brand}>CREDENCE</Text><TouchableOpacity accessibilityRole="button" onPress={finish} disabled={saving} style={s.tap}><Text style={s.link}>Skip</Text></TouchableOpacity></View>
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <Animated.View style={{ opacity: motion, transform: [{ translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
        <View style={s.art} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={s.paper}><Text style={s.paperLabel}>{page.art}</Text>{[0, 1, 2, 3].map(i => <View key={i} style={[s.rule, i === 2 && { width: "65%" }]} />)}<View style={s.seal}><Text style={s.check}>✓</Text></View></View>
          <View style={s.bubble}><Text style={s.bubbleText}>{step === 0 ? "From your institution" : step === 1 ? "Share your achievements" : "Open the scanner from home"}</Text></View>
        </View>
        <View accessibilityLiveRegion="polite"><Text style={s.eyebrow}>{page.label}</Text><Text accessibilityRole="header" style={s.title}>{page.title}</Text><Text style={s.body}>{page.body}</Text><Text style={s.note}>{page.note}</Text></View>
      </Animated.View>
      {error ? <View accessibilityRole="alert"><Text style={s.note}>{error}</Text><TouchableOpacity accessibilityRole="button" onPress={onComplete} style={s.tap}><Text style={s.link}>Continue for this visit</Text></TouchableOpacity></View> : null}
    </ScrollView>
    <View style={s.bottom}>
      <View style={s.dots} accessible accessibilityLabel={`Onboarding step ${step + 1} of 3`}>{pages.map((_, i) => <View key={i} style={[s.dot, i === step && s.active]} />)}</View>
      <TouchableOpacity accessibilityRole="button" style={s.next} disabled={saving} onPress={() => step === 2 ? finish() : setStep(step + 1)}><Text style={s.nextText}>{saving ? "Saving..." : step === 2 ? "Get started" : "Next"}</Text><Text style={s.nextText}>→</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={[s.tap, { alignSelf: "center", opacity: step ? 1 : 0 }]} disabled={!step || saving} onPress={() => setStep(step - 1)}><Text style={s.link}>Back</Text></TouchableOpacity>
    </View>
  </SafeAreaView>;
}
const s = createStyles({
  screen: { flex: 1, backgroundColor: colors.cream, overflow: "hidden" },
  wave: { position: "absolute", width: 650, height: 500, borderRadius: 250, backgroundColor: "#ECE6DA", opacity: .4, left: -300, top: 220, transform: [{ rotate: "-25deg" }] },
  waveTwo: { left: 40, top: 500, opacity: .35 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 28 },
  brand: { color: colors.navy, fontSize: 11, letterSpacing: 2, fontWeight: "600" },
  tap: { minHeight: 44, paddingHorizontal: 14, justifyContent: "center" }, link: { color: colors.navy, fontSize: 14 },
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 30, paddingVertical: 24 },
  art: { height: 200, alignItems: "center", justifyContent: "center", marginBottom: 28 },
  paper: { width: 140, height: 165, borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 18, backgroundColor: colors.cream, transform: [{ rotate: "-7deg" }] },
  paperLabel: { fontSize: 9, color: colors.navy, letterSpacing: 1, marginBottom: 16, fontWeight: "600" },
  rule: { height: 3, backgroundColor: colors.accentBorder, marginVertical: 5, borderRadius: 2 },
  seal: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.navy, marginTop: 12, alignSelf: "flex-end", alignItems: "center", justifyContent: "center" }, check: { color: colors.navy },
  bubble: { position: "absolute", right: 0, bottom: 8, backgroundColor: colors.navy, borderRadius: 10, padding: 12 }, bubbleText: { color: colors.cream, fontSize: 11 },
  eyebrow: { color: colors.navy, letterSpacing: 1.5, fontSize: 10, fontWeight: "600" },
  title: { fontFamily: fonts.serif, fontSize: 33, lineHeight: 40, color: colors.navy, marginTop: 14, marginBottom: 17 },
  body: { color: colors.navy, fontSize: 14, lineHeight: 24 },
  note: { color: colors.navy, fontSize: 12, lineHeight: 20, borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: 11, marginTop: 17 },
  bottom: { paddingHorizontal: 30, paddingBottom: 12 }, dots: { flexDirection: "row", gap: 8, justifyContent: "center", marginBottom: 20 }, dot: { width: 6, height: 6, borderRadius: 4, backgroundColor: colors.accentBorder }, active: { width: 24, backgroundColor: colors.navy },
  next: { minHeight: 50, backgroundColor: colors.navy, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 }, nextText: { color: colors.cream, fontSize: 14, fontWeight: "600" },
});
