import React from "react";
import { Image, Text, View } from "react-native";
import { BadgeCheck, FileText } from "lucide-react-native";
import { colors, createStyles, fonts, cardShadow } from "../theme";

// A clearly labelled illustration, matching the web landing certificate visual.
export default function CredentialPreview() {
  return <View style={s.card}>
    <View style={s.top}><Text style={s.kicker}>YOUR CREDENTIAL WALLET</Text><Text style={s.badge}>PREVIEW</Text></View>
    <View style={s.paper}>
      <Image source={require("../../assets/restored-shield.png")} style={s.logo} />
      <Text style={s.institution}>Issued by your institution</Text>
      <View style={s.rule} />
      <Text style={s.title}>A record of{`\n`}your achievement.</Text>
      <Text style={s.body}>Your certificate and academic transcript,{`\n`}together in one place.</Text>
      <View style={s.bottom}><View style={s.line} /><BadgeCheck color={colors.accent} size={36} strokeWidth={1.2} /><View style={s.line} /></View>
    </View>
    <View style={s.note}><FileText size={15} color={colors.accent} /><Text style={s.noteText}>Keep your records. Share your next chapter.</Text></View>
  </View>;
}
const s = createStyles({
  card: { marginTop: 28, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 18, backgroundColor: colors.surface, ...cardShadow },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 18 },
  kicker: { fontSize: 9, fontWeight: "600", letterSpacing: 1.1, color: colors.muted, flexShrink: 1 },
  badge: { fontSize: 8, fontWeight: "600", letterSpacing: 0.8, color: colors.accent, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 5 },
  paper: { alignItems: "center", backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.accentBorder, borderTopWidth: 3, borderTopColor: colors.accent, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 24 },
  logo: { width: 28, height: 32, resizeMode: "contain", marginBottom: 12 },
  institution: { color: colors.muted, fontSize: 10, letterSpacing: 0.3 },
  rule: { width: 44, height: 1, backgroundColor: colors.accent, marginVertical: 16 },
  title: { fontFamily: fonts.serif, color: colors.navy, fontSize: 32, lineHeight: 37, textAlign: "center", letterSpacing: -0.6 },
  body: { color: colors.muted, fontSize: 11, lineHeight: 19, textAlign: "center", marginTop: 12 },
  bottom: { marginTop: 22, flexDirection: "row", alignItems: "center", gap: 20 },
  line: { width: 40, height: 1, backgroundColor: colors.accentBorder },
  note: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 14 },
  noteText: { color: colors.muted, fontSize: 10, flexShrink: 1, lineHeight: 17 },
});
