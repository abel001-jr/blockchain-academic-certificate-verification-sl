/**
 * LoginScreen — institution staff only (registrar, VC, chancellor, admin).
 *
 * Students should use StudentWelcomeScreen — Google OAuth + invite token claim.
 * A banner at the top redirects students if they arrive here by mistake.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { loginWithEmail, getMe } from "../services/auth";

const T = {
  navy:    "#08283F",
  gold:    "#B98A28",
  cream:   "#F8F7F2",
  border:  "#E4E1D6",
  muted:   "#4A5A68",
  faint:   "#8A929C",
  surface: "#fff",
  red:     "#A23B34",
  redBg:   "#F5E5E3",
  goldBg:  "#FFF8E7",
  goldBdr: "#F0D080",
};

export default function LoginScreen({ navigation, onLoginSuccess }) {
  const [email,   setEmail]   = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function handleLogin() {
    const e = email.trim().toLowerCase();
    if (!e || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await loginWithEmail(e, password);
      const user = await getMe();
      onLoginSuccess(user);
    } catch (err) {
      setError(err?.response?.data?.detail || "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Brand ── */}
          <View style={s.brand}>
            <View style={s.logoWrap}>
              <Image
                source={require("../../assets/logo.png")}
                style={s.logo}
                resizeMode="contain"
              />
            </View>
            <Text style={s.brandName}>Credence</Text>
            <Text style={s.brandSub}>Institution staff sign in</Text>
          </View>

          {/* ── Student redirect notice ── */}
          <TouchableOpacity
            style={s.studentNotice}
            onPress={() => navigation.navigate("StudentWelcome")}
            activeOpacity={0.8}
          >
            <Text style={s.studentNoticeText}>
              🎓 Are you a student?{" "}
              <Text style={s.studentNoticeLink}>Access your certificates here →</Text>
            </Text>
          </TouchableOpacity>

          {/* ── Card ── */}
          <View style={s.card}>
            {error ? (
              <View style={s.errorBox}>
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={s.field}>
              <Text style={s.label}>Email address</Text>
              <TextInput
                style={s.input}
                placeholder="your@institution.edu"
                placeholderTextColor={T.faint}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="next"
                value={email}
                onChangeText={setEmail}
                editable={!loading}
              />
            </View>

            <View style={s.field}>
              <Text style={s.label}>Password</Text>
              <TextInput
                style={s.input}
                placeholder="••••••••"
                placeholderTextColor={T.faint}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                value={password}
                onChangeText={setPassword}
                editable={!loading}
              />
            </View>

            <TouchableOpacity
              style={[s.btnPrimary, loading && s.disabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.btnPrimaryText}>Sign In</Text>
              }
            </TouchableOpacity>
          </View>

          {/* ── Back ── */}
          <TouchableOpacity
            style={s.backRow}
            onPress={() => navigation.goBack()}
          >
            <Text style={s.backText}>← Back to home</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: T.cream },
  scroll: { paddingHorizontal: 22, paddingBottom: 40 },

  brand: { alignItems: "center", paddingTop: 44, paddingBottom: 24 },
  logoWrap: {
    width: 58,
    height: 58,
    borderRadius: 15,
    backgroundColor: T.navy,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  logo:      { width: 36, height: 36 },
  brandName: { fontSize: 22, fontWeight: "700", color: T.navy, marginBottom: 3 },
  brandSub:  { fontSize: 14, color: T.muted },

  // Student redirect banner
  studentNotice: {
    backgroundColor: T.goldBg,
    borderWidth: 1,
    borderColor: T.goldBdr,
    borderRadius: 10,
    padding: 13,
    marginBottom: 18,
  },
  studentNoticeText: { fontSize: 13, color: T.muted, lineHeight: 19 },
  studentNoticeLink: { color: T.gold, fontWeight: "700" },

  card: {
    backgroundColor: T.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    padding: 20,
    gap: 14,
    ...Platform.select({
      native: { shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 },
      web:    { boxShadow: "0 2px 12px rgba(8,40,63,0.05)" },
    }),
  },

  errorBox:  { backgroundColor: T.redBg, borderRadius: 10, padding: 12 },
  errorText: { color: T.red, fontSize: 13, lineHeight: 19 },

  field: { gap: 6 },
  label: {
    fontSize: 11, fontWeight: "700", color: T.navy,
    textTransform: "uppercase", letterSpacing: 0.7,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: T.navy,
    backgroundColor: T.cream,
  },

  btnPrimary: {
    height: 50,
    backgroundColor: T.navy,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  disabled:       { opacity: 0.55 },

  backRow: { alignItems: "center", paddingTop: 22 },
  backText: { color: T.muted, fontSize: 13, fontWeight: "500" },
});
