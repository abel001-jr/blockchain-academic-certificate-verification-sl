import React, { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { colors, createStyles } from "../theme";

export default function FormField({ label, hint, style, ...props }) {
  const [focused, setFocused] = useState(false);
  return <View style={s.field}>
    <Text style={s.label}>{label}</Text>
    <TextInput {...props} accessibilityLabel={props.accessibilityLabel || label} placeholderTextColor={colors.faint}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={[s.input, focused && s.focused, props.editable === false && s.disabled, style]} />
    {hint ? <Text style={s.hint}>{hint}</Text> : null}
  </View>;
}
const s = createStyles({
  field: { gap: 8 }, label: { color: colors.navy, fontSize: 13, fontWeight: "600" },
  input: { minHeight: 50, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, color: colors.ink, fontSize: 14 },
  focused: { borderColor: colors.navy, backgroundColor: colors.surface }, disabled: { opacity: 0.6 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 19 },
});
