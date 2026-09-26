/**
 * VerifyScreen — public certificate verification.
 *
 * Design mirrors the web VerifySection:
 *   • Dark navy header strip
 *   • Gold-bordered QR scanner frame with corner marks
 *   • Result card matches the web ResultPanel exactly
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { verifyCertificate } from "../services/certificates";
import { parseCertificateIdFromScan } from "../utils/parseCertificateScan";

const T = {
  navy:       "#08283F",
  gold:       "#B98A28",
  goldLight:  "#F5EBDB",
  cream:      "#F8F7F2",
  border:     "#E4E1D6",
  muted:      "#4A5A68",
  faint:      "#8A929C",
  surface:    "#fff",
  green:      "#2E7D32",
  greenLight: "#E7F1EB",
  greenBdr:   "#A3D9B1",
  red:        "#A23B34",
  redLight:   "#F5E5E3",
  redBdr:     "#E9B4B0",
  amber:      "#B98A28",
  amberLight: "#FFF8E7",
  amberBdr:   "#F0D080",
};

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ── Result panel (matches web ResultPanel) ─────────────────────────────────
function ResultPanel({ result }) {
  const outcome = result.verification_outcome;
  const cert    = result.certificate ?? {};

  if (!result.found || outcome === "not_found") {
    return (
      <View style={[r.card, { backgroundColor: T.redLight, borderColor: T.redBdr }]}>
        <Text style={r.icon}>✗</Text>
        <Text style={[r.title, { color: T.red }]}>Invalid Certificate</Text>
        <Text style={r.msg}>{result.error ?? "Verification failed. Certificate not found."}</Text>
      </View>
    );
  }
  if (outcome === "revoked") {
    return (
      <View style={[r.card, { backgroundColor: T.redLight, borderColor: T.redBdr }]}>
        <Text style={r.icon}>⛔</Text>
        <Text style={[r.title, { color: T.red }]}>Certificate Revoked</Text>
        {cert.revocation_reason
          ? <Text style={r.msg}>Reason: {cert.revocation_reason}</Text>
          : null}
      </View>
    );
  }
  if (outcome === "not_verified") {
    return (
      <View style={[r.card, { backgroundColor: T.amberLight, borderColor: T.amberBdr }]}>
        <Text style={r.icon}>⏳</Text>
        <Text style={[r.title, { color: T.amber }]}>Pending On-Chain</Text>
        <Text style={r.msg}>This certificate exists but hasn't been anchored on the blockchain yet.</Text>
      </View>
    );
  }

  // valid
  return (
    <View style={[r.card, { backgroundColor: T.greenLight, borderColor: T.greenBdr }]}>
      {/* Outcome label */}
      <View style={r.outcomeBadge}>
        <Text style={r.outcomeBadgeText}>Verified</Text>
      </View>
      {/* Detail rows — mirroring web grid */}
      {[
        ["Credential",   cert.degree_title],
        ["Recipient",    cert.student_name],
        ["Department",   cert.department],
        ["Institution",  cert.institution_name],
        ["Year",         cert.graduation_year && String(cert.graduation_year)],
        ["Grade",        cert.grade],
        ["Issued",       fmtDate(cert.chain_issued_at)],
        ["Certificate ID", cert.certificate_id],
      ].filter(([, v]) => Boolean(v)).map(([label, value]) => (
        <View key={label} style={r.row}>
          <Text style={r.rowLabel}>{label}</Text>
          <Text style={r.rowValue} numberOfLines={2}>{value}</Text>
        </View>
      ))}
      {/* Three checks */}
      <View style={r.checks}>
        {["Institution confirmed", "Document integrity valid", "Blockchain record verified"].map(c => (
          <View key={c} style={r.checkRow}>
            <Text style={r.checkMark}>✓</Text>
            <Text style={r.checkText}>{c}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Scanner overlay ────────────────────────────────────────────────────────
const CORNER = 22;
const THICK  = 3;

function ScannerView({ onScan, onCancel }) {
  return (
    <View style={sc.root}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => onScan(parseCertificateIdFromScan(data))}
      />
      {/* dark vignette */}
      <View style={sc.vignette} />
      {/* finder frame */}
      <View style={sc.frame}>
        {/* 4 corners */}
        <View style={[sc.corner, { top: -1, left: -1, borderRightWidth: 0, borderBottomWidth: 0 }]} />
        <View style={[sc.corner, { top: -1, right: -1, borderLeftWidth: 0, borderBottomWidth: 0 }]} />
        <View style={[sc.corner, { bottom: -1, left: -1, borderRightWidth: 0, borderTopWidth: 0 }]} />
        <View style={[sc.corner, { bottom: -1, right: -1, borderLeftWidth: 0, borderTopWidth: 0 }]} />
      </View>
      <Text style={sc.hint}>Point at a Credence QR code</Text>
      <TouchableOpacity style={sc.cancelBtn} onPress={onCancel}>
        <Text style={sc.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────
export default function VerifyScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning,  setScanning]  = useState(false);
  const [query,     setQuery]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState(null);

  async function verify(raw) {
    const id = parseCertificateIdFromScan(raw ?? query);
    if (!id.trim()) {
      Alert.alert("Required", "Enter a certificate ID or scan a QR code.");
      return;
    }
    setLoading(true); setResult(null);
    try {
      const data = await verifyCertificate(id);
      setQuery(id);
      setResult(data);
    } catch (err) {
      const detail = err?.response?.data?.message ?? "Verification failed. Certificate not found.";
      setResult({ found: false, verification_outcome: "not_found", error: detail });
    } finally {
      setLoading(false);
    }
  }

  async function openScanner() {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert("Camera access required", "Allow camera access to scan QR codes.");
        return;
      }
    }
    setScanning(true);
  }

  if (scanning) {
    return (
      <ScannerView
        onScan={id => { setScanning(false); setQuery(id); verify(id); }}
        onCancel={() => setScanning(false)}
      />
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      {/* Dark header strip — matches web VerifySection */}
      <View style={s.header}>
        <Text style={s.headerEyebrow}>Employers &amp; verifiers · No login needed</Text>
        <Text style={s.headerTitle}>Verify a Certificate</Text>
        <Text style={s.headerSub}>
          Scan the QR on any Credence credential, or type the certificate ID.
          Three independent checks returned instantly.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* QR button */}
        <TouchableOpacity style={s.qrBtn} onPress={openScanner} activeOpacity={0.8}>
          <Text style={s.qrBtnIcon}>📷</Text>
          <Text style={s.qrBtnText}>Scan QR Code</Text>
        </TouchableOpacity>

        {/* Divider */}
        <View style={s.divider}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>or enter manually</Text>
          <View style={s.dividerLine} />
        </View>

        {/* Input */}
        <TextInput
          style={s.input}
          placeholder="e.g. CR-2026-CUSL-A3F92C01"
          placeholderTextColor={T.faint}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => verify(query)}
        />

        {/* Verify button */}
        <TouchableOpacity
          style={[s.btnPrimary, loading && { opacity: 0.6 }]}
          onPress={() => verify(query)}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.btnPrimaryText}>Verify</Text>
          }
        </TouchableOpacity>

        {/* Result */}
        {result && <ResultPanel result={result} />}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Main styles ────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: T.navy },

  // Dark header
  header: {
    backgroundColor: T.navy,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 28,
  },
  headerEyebrow: { fontSize: 10, fontWeight: "700", color: T.gold, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 },
  headerTitle:   { fontSize: 26, fontWeight: "300", color: "#fff", lineHeight: 33, marginBottom: 8 },
  headerSub:     { fontSize: 13, color: "#B0C8DC", lineHeight: 20 },

  // Scroll body (cream bg)
  scroll: {
    backgroundColor: T.cream,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 48,
    flexGrow: 1,
  },

  // QR button
  qrBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: T.surface,
    borderRadius: 12,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: T.border,
    marginBottom: 20,
  },
  qrBtnIcon: { fontSize: 18 },
  qrBtnText: { color: T.navy, fontWeight: "700", fontSize: 15 },

  // Divider
  divider:     { flexDirection: "row", alignItems: "center", marginBottom: 18, gap: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: T.border },
  dividerText: { fontSize: 11, color: T.faint },

  // Input
  input: {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    color: T.navy,
    marginBottom: 12,
  },

  // Button
  btnPrimary: {
    backgroundColor: T.navy,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
    marginBottom: 24,
  },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});

// ── Result card styles ─────────────────────────────────────────────────────
const r = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    alignItems: "center",
    gap: 6,
  },
  icon:  { fontSize: 28, marginBottom: 4 },
  title: { fontSize: 16, fontWeight: "800", textAlign: "center", marginBottom: 4 },
  msg:   { fontSize: 13, color: T.muted, textAlign: "center", lineHeight: 19 },
  outcomeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: T.green,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 12,
  },
  outcomeBadgeText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  row:      { flexDirection: "row", justifyContent: "space-between", width: "100%", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" },
  rowLabel: { fontSize: 12, color: T.faint, fontWeight: "600" },
  rowValue: { fontSize: 12, color: T.navy, flex: 1, textAlign: "right" },
  checks:   { alignSelf: "flex-start", marginTop: 10, gap: 4 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  checkMark:{ color: T.gold, fontWeight: "800", fontSize: 13 },
  checkText:{ color: T.muted, fontSize: 12 },
});

// ── Scanner styles ─────────────────────────────────────────────────────────
const sc = StyleSheet.create({
  root:     { flex: 1, backgroundColor: "#000" },
  vignette: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.48)" },
  frame: {
    position: "absolute",
    width: 240,
    height: 240,
    top: "50%",
    left: "50%",
    marginTop: -150,
    marginLeft: -120,
  },
  corner: {
    position: "absolute",
    width: CORNER,
    height: CORNER,
    borderColor: T.gold,
    borderWidth: THICK,
  },
  hint: {
    position: "absolute",
    bottom: "28%",
    alignSelf: "center",
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cancelBtn: {
    position: "absolute",
    bottom: "13%",
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 22,
    paddingVertical: 11,
    paddingHorizontal: 34,
  },
  cancelText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
