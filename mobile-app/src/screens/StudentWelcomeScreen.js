import AnimatedButton from "../components/AnimatedButton";
/**
 * StudentWelcomeScreen
 *
 * The screen students land on when they open the app.
 * Two paths — clearly labelled:
 *
 *   1. Continue with Google  — for returning students who already claimed
 *      their invite and linked their Google account.
 *
 *   2. I have an invite link — student received the WhatsApp link, copies
 *      the token from the URL and pastes it here to claim their certificate.
 *      After claiming they are encouraged to link Google for future logins.
 *
 * Deep-link (credence://student-invite?token=...) bypasses this screen
 * entirely — handled in App.js before navigation even starts.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { makeRedirectUri } from "expo-auth-session";
import { loginWithGoogle, claimInviteToken, getMe } from "../services/auth";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID =
  "335667631038-vouui7i0uqde3v04jcs2lb1l9sk9h0pr.apps.googleusercontent.com";

const T = {
  navy:    "#08283F",
  gold:    "#B98A28",
  cream:   "#F8F7F2",
  border:  "#E4E1D6",
  muted:   "#4A5A68",
  faint:   "#8A929C",
  surface: "#fff",
  green:   "#2E7D32",
  greenBg: "#E7F1EB",
  red:     "#A23B34",
  redBg:   "#F5E5E3",
};

export default function StudentWelcomeScreen({ navigation, onLoginSuccess, initialError = "" }) {
  const [token,      setToken]      = useState("");
  const [claiming,   setClaiming]   = useState(false);
  const [gBusy,      setGBusy]      = useState(false);
  const [error,      setError]      = useState(initialError);
  const [claimedMsg, setClaimedMsg] = useState("");

  // ── Google OAuth ──────────────────────────────────────────────────────────
  const redirectUri = makeRedirectUri({ scheme: "credence" });

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId:     GOOGLE_CLIENT_ID,
    redirectUri,
    scopes:       ["openid", "profile", "email"],
    responseType: "id_token",
  });

  const handleIdToken = useCallback(async (idToken) => {
    setGBusy(true);
    setError("");
    try {
      await loginWithGoogle(idToken);
      const user = await getMe();
      onLoginSuccess(user);
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
        "Google sign-in failed. Try using your invite link instead."
      );
      setGBusy(false);
    }
  }, [onLoginSuccess]);

  useEffect(() => {
    if (!response) return;
    if (response.type === "success") {
      const idToken = response.params?.id_token;
      if (idToken) handleIdToken(idToken);
      else setError("Google did not return a token. Please try again.");
    } else if (response.type === "error") {
      setError(response.error?.message || "Google sign-in failed.");
    }
    if (response.type !== "success") setGBusy(false);
  }, [response, handleIdToken]);

  async function handleGooglePress() {
    setError("");
    setGBusy(true);
    await promptAsync();
  }

  // ── Invite token claim ────────────────────────────────────────────────────
  async function handleClaimToken() {
    const raw = token.trim();
    if (!raw) {
      setError("Paste your invite token first.");
      return;
    }

    // Accept the full URL or just the raw token.
    // Simple regex — works in React Native without URL() polyfill.
    const urlMatch = raw.match(/[?&]token=([^&\s]+)/);
    const extracted = urlMatch ? decodeURIComponent(urlMatch[1]) : raw;

    setClaiming(true);
    setError("");
    setClaimedMsg("");
    try {
      const data = await claimInviteToken(extracted);
      const user = data.user ?? (await getMe());
      setClaimedMsg(
        `✓ Certificate access granted${user?.first_name ? ` — welcome, ${user.first_name}!` : "."}`
      );
      // Brief pause so the student sees the success message, then enter dashboard
      setTimeout(() => onLoginSuccess(user), 1400);
    } catch (err) {
      const detail = err?.response?.data?.detail || "";
      if (!err?.response) {
        // Network error — wrong API address, server not running, etc.
        setError(
          "Cannot reach the server. Make sure the Intelligent Academic Credentialing backend is running and try again."
        );
      } else if (detail.toLowerCase().includes("expired")) {
        setError(
          "This invite link has expired (24-hour window). Ask your institution to resend it."
        );
      } else if (detail.toLowerCase().includes("already been used")) {
        setError(
          "This link has already been used. Sign in with Google to access your account."
        );
      } else {
        setError(detail || "Invalid invite link. Check you copied the full token.");
      }
    } finally {
      setClaiming(false);
    }
  }

  const busy = claiming || gBusy;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: T.cream }}
    >
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Error / success ── */}
        {error ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}
        {claimedMsg ? (
          <View style={s.successBox}>
            <Text style={s.successText}>{claimedMsg}</Text>
          </View>
        ) : null}

        {/* ── Path 1: Google (returning students) ── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>Returning student</Text>
          <Text style={s.cardSub}>
            Already claimed your certificate? Sign in with Google to open your portal.
          </Text>
          <TouchableOpacity
            style={[s.googleBtn, (busy || !request) && s.disabled]}
            onPress={handleGooglePress}
            disabled={busy || !request}
            activeOpacity={0.85}
          >
            {gBusy
              ? <ActivityIndicator color={T.navy} size="small" />
              : (
                <View style={s.googleBtnInner}>
                  <Text style={s.gIcon}>G</Text>
                  <Text style={s.googleBtnText}>Continue with Google</Text>
                </View>
              )
            }
          </TouchableOpacity>
        </View>

        {/* ── Divider ── */}
        <View style={s.divider}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>or</Text>
          <View style={s.dividerLine} />
        </View>

        {/* ── Path 2: Invite token (first-time students) ── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>First time? Use your invite link</Text>
          <Text style={s.cardSub}>
            Your WhatsApp message contains a link ending with{"\n"}
            <Text style={s.example}>…student-invite?token=HSt-CquA-2AF…</Text>
            {"\n\n"}Paste the full link, or just the token after{" "}
            <Text style={s.example}>token=</Text>
          </Text>

          <TextInput
            style={[s.tokenInput, claiming && s.disabled]}
            placeholder="Paste invite link or token here"
            placeholderTextColor={T.faint}
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            numberOfLines={2}
            editable={!claiming}
          />

          <TouchableOpacity
            style={[s.btnGold, claiming && s.disabled]}
            onPress={handleClaimToken}
            disabled={claiming}
            activeOpacity={0.85}
          >
            {claiming
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.btnGoldText}>Claim my certificate →</Text>
            }
          </TouchableOpacity>
        </View>

        {/* ── Verify without signing in ── */}
        <AnimatedButton label="Verify a certificate (no login needed)" onPress={() => navigation.navigate("Verify")} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: 22, paddingVertical: 20, paddingBottom: 48 },

  // Alerts
  errorBox:   { backgroundColor: T.redBg,   borderRadius: 10, padding: 13, marginBottom: 14 },
  errorText:  { color: T.red,   fontSize: 13, lineHeight: 19 },
  successBox: { backgroundColor: T.greenBg, borderRadius: 10, padding: 13, marginBottom: 14 },
  successText:{ color: T.green, fontSize: 13, lineHeight: 19, fontWeight: "600" },

  // Card
  card: {
    backgroundColor: T.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    padding: 20,
    marginBottom: 6,
    gap: 12,
    ...Platform.select({
      native: { shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 },
      web:    { boxShadow: "0 2px 12px rgba(8,40,63,0.05)" },
    }),
  },
  cardLabel: { fontSize: 13, fontWeight: "700", color: T.navy },
  cardSub:   { fontSize: 13, color: T.muted, lineHeight: 19 },
  example:   { fontFamily: "monospace", fontSize: 11, color: T.faint },

  // Google button
  googleBtn: {
    height: 50,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: T.border,
    backgroundColor: T.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  googleBtnInner: { flexDirection: "row", alignItems: "center", gap: 10 },
  gIcon:          { fontSize: 17, fontWeight: "800", color: "#4285F4", width: 20, textAlign: "center" },
  googleBtnText:  { fontSize: 15, fontWeight: "600", color: T.navy },

  // Divider
  divider:     { flexDirection: "row", alignItems: "center", marginVertical: 10, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: T.border },
  dividerText: { fontSize: 12, color: T.faint },

  // Token input
  tokenInput: {
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    color: T.navy,
    backgroundColor: T.cream,
    textAlignVertical: "top",
    minHeight: 64,
  },

  // Gold claim button
  btnGold: {
    height: 50,
    backgroundColor: T.gold,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGoldText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  disabled: { opacity: 0.55 },

  // Bottom link
  verifyRow: { alignItems: "center", paddingTop: 22 },
  verifyText:{ color: T.faint, fontSize: 12 },
});
