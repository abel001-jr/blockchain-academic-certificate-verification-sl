import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { StatusBar } from "expo-status-bar";

const C = { cream: "#FAF7EF", maroon: "#751C2A" };
export function useReducedMotion() {
  const [reduced, setReduced] = useState(null);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduced(value); }).catch(() => { if (alive) setReduced(true); });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => { alive = false; sub.remove(); };
  }, []);
  return reduced;
}

/** Shared particle field: three slow tracks, repeated to avoid an empty seam. */
export function SplashBackground({ reduced = true }) {
  const { height } = useWindowDimensions();
  const tracks = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  useEffect(() => {
    if (reduced !== false) { tracks.forEach(track => track.setValue(0)); return; }
    const animations = tracks.map((track, index) => Animated.loop(Animated.timing(track, {
      toValue: 1, duration: [220000, 170000, 135000][index], easing: Easing.linear, useNativeDriver: true,
    })));
    animations.forEach(animation => animation.start());
    return () => animations.forEach(animation => animation.stop());
  }, [reduced, tracks]);
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: C.cream }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {tracks.map((track, group) => <Animated.View key={group} style={[StyleSheet.absoluteFill, { transform: [{ translateY: track.interpolate({ inputRange: [0, 1], outputRange: [0, -height] }) }] }]}>
      {[0, 1].map(copy => Array.from({ length: [90, 40, 20][group] }, (_, i) => <View key={`${copy}-${i}`} style={{ position: "absolute", left: `${(i * 37 + group * 19 + 7) % 100}%`, top: ((i * 71 + group * 23) % 1000) / 1000 * height + copy * height, width: group + 1, height: group + 1, borderRadius: 2, backgroundColor: C.maroon, opacity: [.18, .25, .32][group] }} />))}
    </Animated.View>)}
  </View>;
}

/** Lightweight startup view: no entrance sequence or minimum display time. */
export default function ContourSplash({ message = "Your academic credentials, connected.", loadingLabel = "Loading application" }) {
  return <View style={s.screen}>
    <StatusBar style="dark" />
    <View style={s.brand}>
      <Image source={require("../../assets/restored-shield.png")} resizeMode="contain" style={s.logo} accessibilityLabel="Credence" />
      <Text style={s.heading}>CREDENCE</Text>
      <Text style={s.tagline}>{message}</Text>
    </View>
    <ActivityIndicator size="small" color={C.maroon} accessibilityLabel={loadingLabel} />
  </View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.cream, alignItems: "center", justifyContent: "center", padding: 24 },
  brand: { alignItems: "center", marginBottom: 28, maxWidth: 360 },
  logo: { width: 100, height: 100, tintColor: C.maroon, marginBottom: 20 },
  heading: { fontSize: 22, fontWeight: "700", letterSpacing: 3, color: C.maroon, textAlign: "center" },
  tagline: { marginTop: 10, fontSize: 14, lineHeight: 21, textAlign: "center", color: C.maroon },
});
