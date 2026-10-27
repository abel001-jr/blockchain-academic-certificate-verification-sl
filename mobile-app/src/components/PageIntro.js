import React from "react";
import { Text, View } from "react-native";
import { colors, createStyles, fonts } from "../theme";

export default function PageIntro({ eyebrow, title, description, dark = false, serif = false }) {
  return <View style={[s.root, dark && s.dark]}>
    <View style={s.kicker}><View style={[s.rule, dark && s.lightRule]} /><Text style={[s.eyebrow, dark && s.light]}>{eyebrow}</Text></View>
    <Text accessibilityRole="header" style={[s.title, serif && s.serif, dark && s.light]}>{title}</Text>
    {description ? <Text style={[s.body, dark && s.lightBody]}>{description}</Text> : null}
  </View>;
}
const s = createStyles({
  root: { gap: 12, paddingVertical: 10 },
  dark: { backgroundColor: colors.navy, borderRadius: 18, padding: 24 },
  kicker: { flexDirection: "row", alignItems: "center", gap: 9 },
  rule: { height: 2, width: 22, backgroundColor: colors.accent },
  lightRule: { backgroundColor: colors.cream },
  eyebrow: { color: colors.muted, fontSize: 10, fontWeight: "600", letterSpacing: 1.25, flexShrink: 1 },
  title: { fontSize: 28, lineHeight: 35, color: colors.navy, fontWeight: "600", letterSpacing: -0.7 },
  serif: { fontFamily: fonts.serif, fontSize: 36, lineHeight: 41, fontWeight: "normal" },
  body: { fontSize: 14, lineHeight: 23, color: colors.muted },
  light: { color: colors.cream }, lightBody: { color: colors.navyMuted },
});
