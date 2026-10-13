import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";

// Native adaptation of the research controls using the app's navy/maroon theme.
export default function AnimatedButton({ variant = "action", direction = "forward", label, onPress, disabled = false, busy = false, compact = false, style, accessibilityLabel }) {
  const progress = useRef(new Animated.Value(0)).current;
  const bounce = useRef(new Animated.Value(0)).current;
  const [reduced, setReduced] = useState(true);
  const [engaged, setEngaged] = useState(false);
  const timer = useRef(null);
  const download = variant === "download";
  const navigation = variant === "navigation";

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduced(value); });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => { alive = false; subscription.remove(); clearTimeout(timer.current); };
  }, []);

  useEffect(() => {
    const running = engaged || busy;
    const fill = Animated.timing(progress, { toValue: running ? 1 : 0, duration: reduced ? 0 : 300, useNativeDriver: false });
    fill.start();
    let loop;
    if ((download || navigation) && running && !reduced) {
      loop = Animated.loop(Animated.sequence([
        Animated.timing(bounce, { toValue: 4, duration: 350, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]));
      loop.start();
    } else bounce.setValue(0);
    return () => { fill.stop(); loop?.stop(); };
  }, [engaged, busy, reduced, download, navigation, progress, bounce]);

  function press(event) {
    clearTimeout(timer.current);
    setEngaged(true);
    timer.current = setTimeout(() => setEngaged(false), 1000);
    onPress?.(event);
  }

  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={press} onPressIn={() => setEngaged(true)} onPressOut={() => setEngaged(false)} onHoverIn={() => setEngaged(true)} onHoverOut={() => setEngaged(false)} onFocus={() => setEngaged(true)} onBlur={() => setEngaged(false)} style={[styles.outer, compact && styles.compactOuter, style, (disabled || busy) && styles.disabled]}>
    <Animated.View style={[styles.control, download ? styles.download : styles.action, navigation && styles.navigation, compact && styles.compact, { backgroundColor: download ? "#08283F" : progress.interpolate({ inputRange: [0, 1], outputRange: ["#08283F", "#780110"] }) }]}>
      {download && <Animated.View pointerEvents="none" style={[styles.downloadFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ["20%", "100%"] }) }]} />}
      {!download && !navigation && <Animated.View pointerEvents="none" style={[styles.frame, { opacity: progress }]} />}
      <Animated.Text style={[styles.label, compact && styles.compactLabel, navigation && !reduced && { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, direction === "back" ? -100 : 100] }) }] }]}>{label}</Animated.Text>
      {navigation && <Animated.View pointerEvents="none" style={[styles.flight, { left: reduced ? "5%" : progress.interpolate({ inputRange: [0, 1], outputRange: ["5%", "45%"] }), transform: [{ translateY: bounce }] }]}><Text style={[styles.arrow, { transform: [{ rotate: direction === "back" ? "180deg" : "0deg" }] }]}>{"\u27a4"}</Text></Animated.View>}
      {download && <View style={styles.iconPanel}><Animated.View style={{ transform: [{ translateY: bounce }] }}>{busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.arrow}>↓</Text>}</Animated.View></View>}
    </Animated.View>
  </Pressable>;
}

const styles = StyleSheet.create({
  outer: { width: "100%", marginVertical: 5 },
  compactOuter: { width: undefined, flex: 1, marginVertical: 0 },
  control: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#08283F" },
  action: { borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 },
  navigation: { overflow: "hidden", paddingLeft: 42 },
  flight: { position: "absolute", width: 26 },
  download: { borderRadius: 8, overflow: "hidden" },
  downloadFill: { position: "absolute", top: 0, bottom: 0, right: 0, backgroundColor: "#780110" },
  compact: { minHeight: 44 },
  frame: { position: "absolute", top: -5, left: -5, right: -5, bottom: -5, borderWidth: 1, borderStyle: "dashed", borderColor: "#780110", borderRadius: 8 },
  label: { flexShrink: 1, color: "#fff", fontSize: 14, fontWeight: "600", textAlign: "center", paddingHorizontal: 12, paddingVertical: 12 },
  compactLabel: { fontSize: 11, paddingHorizontal: 7 },
  iconPanel: { alignSelf: "stretch", width: 40, backgroundColor: "#780110", borderLeftWidth: 1, borderLeftColor: "#ffffff26", alignItems: "center", justifyContent: "center" },
  arrow: { color: "white", fontSize: 25, fontWeight: "600", lineHeight: 28 },
  disabled: { opacity: .55 },
});
