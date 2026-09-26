/**
 * DashboardScreen — student portal hub.
 *
 * Design matches the web My Certificates / Verifications pages:
 *   • Navy header card with greeting + stats
 *   • Tab bar: My Certificates | Verify
 *   • Certificate cards match web certificate list rows
 *   • Inline verify tab mirrors the web VerifySection result panel
 *   • Non-student roles: clean placeholder
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getMyCertificates, verifyCertificate } from "../services/certificates";
import { parseCertificateIdFromScan } from "../utils/parseCertificateScan";

// ── design tokens ──────────────────────────────────────────────────────────
const T = {
  navy:       "#08283F",
  navyMid:    "#0D3A5C",
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

// status → { label, color, bg }
const STATUS = {
  issued:             { label: "Issued",             color: T.green,  bg: T.greenLight },
  revoked:            { label: "Revoked",            color: T.red,    bg: T.redLight   },
  pending_vc:         { label: "Pending VC",         color: T.amber,  bg: T.amberLight },
  pending_chancellor: { label: "Pending Chancellor", color: T.amber,  bg: T.amberLight },
  pending_finalize:   { label: "Pending Finalize",   color: T.amber,  bg: T.amberLight },
  draft:              { label: "Draft",              color: T.faint,  bg: T.cream      },
};
function statusMeta(s) {
  return STATUS[s] ?? { label: s ?? "Unknown", color: T.faint, bg: T.cream };
}

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
}

function roleLabel(role) {
  return { student: "Student", officer: "Officer", registrar: "Registrar",
    inst_admin: "Inst. Admin", super_admin: "Super Admin" }[role] ?? role;
}

// ── Certificate card ───────────────────────────────────────────────────────
function CertCard({ cert, onPress }) {
  const meta      = statusMeta(cert.status);
  const anchored  = Boolean(cert.chain_issued_at);
  const issuedDate = fmtDate(cert.chain_issued_at);

  return (
    <TouchableOpacity
      style={s.certCard}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Row 1: degree + status pill */}
      <View style={s.certRow}>
        <Text style={s.certDegree} numberOfLines={2}>{cert.degree_title ?? "Certificate"}</Text>
        <View style={[s.statusPill, { backgroundColor: meta.bg }]}>
          <Text style={[s.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>
      {/* Institution */}
      <Text style={s.certInstitution} numberOfLines={1}>{cert.institution_name ?? ""}</Text>
      {/* Row 2: year · grade · chain badge */}
      <View style={s.certMeta}>
        {cert.graduation_year
          ? <Text style={s.certMetaItem}>Class of {cert.graduation_year}</Text>
          : null}
        {cert.grade
          ? <Text style={s.certMetaItem}> · {cert.grade}</Text>
          : null}
        <View style={{ flex: 1 }} />
        <View style={[s.chainPill, !anchored && s.chainPillPending]}>
          <Text style={[s.chainPillText, !anchored && { color: T.amber }]}>
            {anchored ? "⛓ On-chain" : "⏳ Pending"}
          </Text>
        </View>
      </View>
      {/* Cert ID + date */}
      <Text style={s.certId} numberOfLines={1}>{cert.certificate_id}</Text>
      {issuedDate
        ? <Text style={s.certDate}>Anchored {issuedDate}</Text>
        : null}
    </TouchableOpacity>
  );
}

// ── Verify result card (mirrors web result panel) ──────────────────────────
function VerifyResultCard({ result }) {
  const outcome = result.verification_outcome;
  const cert = result.certificate ?? {};

  if (!result.found || outcome === "not_found") {
    return (
      <View style={[s.resultCard, { backgroundColor: T.redLight, borderColor: T.redBdr }]}>
        <Text style={s.resultIcon}>✗</Text>
        <Text style={[s.resultTitle, { color: T.red }]}>Invalid Certificate</Text>
        <Text style={[s.resultMsg, { color: T.muted }]}>
          {result.error ?? "Verification failed. Certificate not found."}
        </Text>
      </View>
    );
  }
  if (outcome === "revoked") {
    return (
      <View style={[s.resultCard, { backgroundColor: T.redLight, borderColor: T.redBdr }]}>
        <Text style={s.resultIcon}>⛔</Text>
        <Text style={[s.resultTitle, { color: T.red }]}>Certificate Revoked</Text>
        {cert.revocation_reason
          ? <Text style={[s.resultMsg, { color: T.muted }]}>Reason: {cert.revocation_reason}</Text>
          : null}
      </View>
    );
  }
  if (outcome === "not_verified") {
    return (
      <View style={[s.resultCard, { backgroundColor: T.amberLight, borderColor: T.amberBdr }]}>
        <Text style={s.resultIcon}>⏳</Text>
        <Text style={[s.resultTitle, { color: T.amber }]}>Pending On-Chain</Text>
        <Text style={[s.resultMsg, { color: T.muted }]}>
          Certificate exists but hasn't been anchored yet.
        </Text>
      </View>
    );
  }
  return (
    <View style={[s.resultCard, { backgroundColor: T.greenLight, borderColor: T.greenBdr }]}>
      <View style={s.validBadge}>
        <Text style={s.validBadgeText}>✓  Verified</Text>
      </View>
      {[
        ["Student",     cert.student_name],
        ["Degree",      cert.degree_title],
        ["Institution", cert.institution_name],
        ["Year",        cert.graduation_year && String(cert.graduation_year)],
        ["Grade",       cert.grade],
        ["Anchored",    fmtDate(cert.chain_issued_at)],
        ["Cert ID",     cert.certificate_id],
      ].filter(([, v]) => Boolean(v)).map(([label, value]) => (
        <View key={label} style={s.resultRow}>
          <Text style={s.resultLabel}>{label}</Text>
          <Text style={s.resultValue} numberOfLines={2}>{value}</Text>
        </View>
      ))}
      {["Institution confirmed", "Document integrity valid", "Blockchain record verified"].map(c => (
        <Text key={c} style={s.checkItem}>✓  {c}</Text>
      ))}
    </View>
  );
}

// ── Student dashboard ──────────────────────────────────────────────────────
function StudentDashboard({ user, navigation }) {
  const [tab, setTab]             = useState("certs");
  const [certs, setCerts]         = useState([]);
  const [certsLoading, setClLoading] = useState(true);
  const [refreshing, setRefreshing]  = useState(false);
  const [query, setQuery]         = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  const loadCerts = useCallback(async () => {
    try {
      const data = await getMyCertificates();
      setCerts(data);
    } catch {
      setCerts([]);
    } finally {
      setClLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadCerts(); }, [loadCerts]);

  async function runVerify() {
    const id = parseCertificateIdFromScan(query.trim());
    if (!id) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const data = await verifyCertificate(id);
      setVerifyResult(data);
    } catch (err) {
      const detail = err?.response?.data?.message ?? "Certificate not found.";
      setVerifyResult({ found: false, verification_outcome: "not_found", error: detail });
    } finally {
      setVerifying(false);
    }
  }

  const issued  = certs.filter(c => c.status === "issued").length;
  const pending = certs.filter(c =>
    ["pending_vc","pending_chancellor","pending_finalize"].includes(c.status)
  ).length;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); loadCerts(); }}
          tintColor={T.navy}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* ── Welcome hero ── */}
      <View style={s.hero}>
        <View style={s.heroText}>
          <Text style={s.heroGreeting}>
            {user?.first_name ? `Hi, ${user.first_name}` : "Welcome"}
          </Text>
          <Text style={s.heroRole}>Student · My Credentials</Text>
        </View>
        <View style={s.heroStats}>
          <View style={s.statBox}>
            <Text style={s.statNum}>{issued}</Text>
            <Text style={s.statLabel}>Issued</Text>
          </View>
          <View style={[s.statBox, s.statBoxBorder]}>
            <Text style={s.statNum}>{pending}</Text>
            <Text style={s.statLabel}>Pending</Text>
          </View>
        </View>
      </View>

      {/* ── Tab bar ── */}
      <View style={s.tabBar}>
        {[["certs","My Certificates"],["verify","Verify"]].map(([key,label]) => (
          <TouchableOpacity
            key={key}
            style={[s.tabBtn, tab === key && s.tabBtnActive]}
            onPress={() => setTab(key)}
          >
            <Text style={[s.tabBtnText, tab === key && s.tabBtnTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── My Certificates ── */}
      {tab === "certs" && (
        <View style={s.tabPanel}>
          {certsLoading
            ? <ActivityIndicator color={T.navy} style={{ marginTop: 40 }} />
            : certs.length === 0
              ? (
                <View style={s.emptyState}>
                  <Text style={s.emptyIcon}>🎓</Text>
                  <Text style={s.emptyTitle}>No certificates yet</Text>
                  <Text style={s.emptyMsg}>
                    Your issued certificates appear here once anchored on-chain.
                  </Text>
                </View>
              )
              : certs.map(cert => (
                <CertCard
                  key={cert.id}
                  cert={cert}
                  onPress={() => navigation.navigate("CertificateDetail", { cert })}
                />
              ))
          }
        </View>
      )}

      {/* ── Verify ── */}
      {tab === "verify" && (
        <View style={s.tabPanel}>
          <Text style={s.verifyTitle}>Verify a Certificate</Text>
          <Text style={s.verifySub}>
            Enter any certificate ID to check its blockchain status.
          </Text>
          <TextInput
            style={s.verifyInput}
            placeholder="e.g. CR-2026-CUSL-A3F92C01"
            placeholderTextColor={T.faint}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={runVerify}
          />
          <TouchableOpacity
            style={[s.verifyBtn, verifying && { opacity: 0.6 }]}
            onPress={runVerify}
            disabled={verifying}
            activeOpacity={0.85}
          >
            {verifying
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.verifyBtnText}>Verify</Text>
            }
          </TouchableOpacity>
          {verifyResult && <VerifyResultCard result={verifyResult} />}
        </View>
      )}
    </ScrollView>
  );
}

// ── Staff placeholder ──────────────────────────────────────────────────────
function StaffPlaceholder({ role }) {
  return (
    <View style={s.emptyState}>
      <Text style={s.emptyIcon}>🏛️</Text>
      <Text style={s.emptyTitle}>Staff access</Text>
      <Text style={s.emptyMsg}>
        The Credence mobile app is designed for students and certificate verifiers.
        Staff members ({roleLabel(role).toLowerCase()}) should use the web dashboard at credence.edu.sl
      </Text>
    </View>
  );
}

// ── Entry ──────────────────────────────────────────────────────────────────
export default function DashboardScreen({ navigation, user, onLogout }) {
  const role = user?.role ?? "student";

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerBrand}>Credence</Text>
        <View style={s.headerRight}>
          <Text style={s.headerRole}>{roleLabel(role)}</Text>
          <TouchableOpacity onPress={onLogout} style={s.signOutBtn}>
            <Text style={s.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {role === "student"
        ? <StudentDashboard user={user} navigation={navigation} />
        : <StaffPlaceholder role={role} />
      }
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: T.cream },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: T.navy,
    borderBottomWidth: 1,
    borderBottomColor: T.navyMid,
  },
  headerBrand:   { color: "#fff", fontSize: 17, fontWeight: "700", letterSpacing: 0.3 },
  headerRight:   { flexDirection: "row", alignItems: "center", gap: 10 },
  headerRole:    { color: "#B0C8DC", fontSize: 11, fontWeight: "600" },
  signOutBtn:    { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 7, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  signOutText:   { color: "#fff", fontSize: 12, fontWeight: "600" },

  // Welcome hero
  hero: {
    backgroundColor: T.navy,
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 20,
  },
  heroText:      { marginBottom: 16 },
  heroGreeting:  { color: "#fff", fontSize: 22, fontWeight: "700", marginBottom: 2 },
  heroRole:      { color: "#B0C8DC", fontSize: 12 },
  heroStats: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 12,
    overflow: "hidden",
  },
  statBox:       { flex: 1, alignItems: "center", paddingVertical: 12 },
  statBoxBorder: { borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.18)" },
  statNum:       { color: "#fff", fontSize: 22, fontWeight: "800" },
  statLabel:     { color: "#B0C8DC", fontSize: 11, marginTop: 2 },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: T.surface,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 13,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabBtnActive:     { borderBottomColor: T.navy },
  tabBtnText:       { fontSize: 13, fontWeight: "600", color: T.faint },
  tabBtnTextActive: { color: T.navy },

  // Tab panel
  tabPanel: { padding: 16 },

  // Certificate card
  certCard: {
    backgroundColor: T.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      native: { shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
      web:    { boxShadow: "0 1px 6px rgba(0,0,0,0.04)" },
    }),
  },
  certRow:        { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  certDegree:     { fontSize: 14, fontWeight: "700", color: T.navy, flex: 1, marginRight: 8 },
  statusPill:     { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:     { fontSize: 10, fontWeight: "700" },
  certInstitution:{ fontSize: 12, color: T.muted, marginBottom: 8 },
  certMeta:       { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginBottom: 6 },
  certMetaItem:   { fontSize: 11, color: T.faint },
  chainPill:      { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: T.greenLight },
  chainPillPending: { backgroundColor: T.amberLight },
  chainPillText:  { fontSize: 10, fontWeight: "600", color: T.green },
  certId:         { fontSize: 10, color: T.faint, fontFamily: "monospace", marginTop: 2 },
  certDate:       { fontSize: 10, color: T.faint, marginTop: 1 },

  // Verify tab
  verifyTitle: { fontSize: 18, fontWeight: "700", color: T.navy, marginBottom: 4 },
  verifySub:   { fontSize: 13, color: T.muted, lineHeight: 19, marginBottom: 16 },
  verifyInput: {
    backgroundColor: T.surface,
    borderWidth: 1, borderColor: T.border,
    borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 14, color: T.navy, marginBottom: 10,
  },
  verifyBtn: {
    backgroundColor: T.navy,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 18,
  },
  verifyBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  // Result card
  resultCard: {
    borderRadius: 14, borderWidth: 1, padding: 18, alignItems: "center", gap: 6,
  },
  resultIcon:  { fontSize: 28, marginBottom: 4 },
  resultTitle: { fontSize: 16, fontWeight: "800", marginBottom: 4 },
  resultMsg:   { fontSize: 13, textAlign: "center", lineHeight: 19 },
  validBadge:  { backgroundColor: T.green, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 10 },
  validBadgeText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  resultRow:   { flexDirection: "row", justifyContent: "space-between", width: "100%", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" },
  resultLabel: { fontSize: 12, color: T.faint, fontWeight: "600" },
  resultValue: { fontSize: 12, color: T.navy, flex: 1, textAlign: "right" },
  checkItem:   { fontSize: 11, color: T.green, fontWeight: "700", alignSelf: "flex-start", marginTop: 2 },

  // Empty / placeholder
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 64, paddingHorizontal: 32 },
  emptyIcon:  { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: T.navy, marginBottom: 6 },
  emptyMsg:   { color: T.muted, textAlign: "center", fontSize: 13, lineHeight: 20 },
});
