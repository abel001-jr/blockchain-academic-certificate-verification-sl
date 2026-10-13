import AnimatedButton from "../components/AnimatedButton";
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
  Alert,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { getMyCertificates, downloadMyDocuments } from "../services/certificates";

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
function CertCard({ cert, onPress, onShare, onDownload, onCopyLink, downloadBusy, downloadDisabled }) {
  const meta      = statusMeta(cert.status);
  const anchored  = Boolean(cert.chain_issued_at);
  const issuedDate = fmtDate(cert.chain_issued_at);

  return (
    <View style={s.certCard}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.75}
        style={{ flex: 1 }}
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

      {/* Quick Actions */}
      {anchored && (
        <View style={s.certActions}>
          <TouchableOpacity
            style={s.certActionBtn}
            onPress={() => onShare(cert)}
            activeOpacity={0.7}
          >
            <Text style={s.certActionIcon}>📤</Text>
            <Text style={s.certActionText}>Share</Text>
          </TouchableOpacity>
          <AnimatedButton variant="download" compact label="Download" onPress={() => onDownload(cert)} busy={downloadBusy} disabled={downloadDisabled} />
          <TouchableOpacity
            style={s.certActionBtn}
            onPress={() => onCopyLink(cert)}
            activeOpacity={0.7}
          >
            <Text style={s.certActionIcon}>🔗</Text>
            <Text style={s.certActionText}>Link</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
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
  const [tab, setTab] = useState("certs");
  const [certs, setCerts] = useState([]);
  const [certsLoading, setClLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [downloading, setDownloading] = useState(null);

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

  // Filter and search certificates
  const filteredCerts = certs.filter(cert => {
    // Search filter
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery || 
      cert.degree_title?.toLowerCase().includes(searchLower) ||
      cert.institution_name?.toLowerCase().includes(searchLower) ||
      cert.certificate_id?.toLowerCase().includes(searchLower) ||
      cert.student_name?.toLowerCase().includes(searchLower);

    // Status filter
    const matchesStatus = filterStatus === "all" || 
      (filterStatus === "issued" && cert.status === "issued") ||
      (filterStatus === "pending" && ["pending_vc", "pending_chancellor", "pending_finalize"].includes(cert.status)) ||
      (filterStatus === "revoked" && cert.status === "revoked");

    return matchesSearch && matchesStatus;
  });

  // Share certificate
  async function handleShare(cert) {
    const verifyUrl = `https://credence.edu.sl/verify/${cert.certificate_id}`;
    const message = `Verify my ${cert.degree_title} certificate from ${cert.institution_name}:\n${verifyUrl}`;

    try {
      if (Platform.OS === "web") {
        await navigator.clipboard.writeText(verifyUrl);
        Alert.alert("Link copied!", "Verification link copied to clipboard.");
      } else {
        await Share.share({
          message,
          title: "Share Certificate",
          url: verifyUrl,
        });
      }
    } catch (err) {
      console.error("Share error:", err);
    }
  }

  // Download certificate and transcript
  async function handleDownload(cert) {
    if (!cert.certificate_id || downloading) return;
    setDownloading(cert.id);
    try {
      const bytes = await downloadMyDocuments(cert.certificate_id);
      const file = new File(Paths.cache, `${cert.certificate_id}-documents.zip`);
      file.write(new Uint8Array(bytes));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/zip",
          dialogTitle: "Your certificate and transcript",
          UTI: "public.zip-archive",
        });
      } else {
        Alert.alert("Downloaded", `Saved to ${file.uri}`);
      }
    } catch (err) {
      const detail = err?.response?.data?.detail ?? "Download failed. Please try again.";
      Alert.alert("Download Error", detail);
    } finally {
      setDownloading(null);
    }
  }

  // Copy verification link
  async function handleCopyLink(cert) {
    const verifyUrl = `https://credence.edu.sl/verify/${cert.certificate_id}`;
    
    try {
      if (Platform.OS === "web") {
        await navigator.clipboard.writeText(verifyUrl);
      } else {
        // For React Native, use Clipboard from react-native
        await Linking.openURL(`sms:?body=${encodeURIComponent(verifyUrl)}`);
        return;
      }
      Alert.alert("Link Copied!", "Verification link copied to clipboard.");
    } catch (err) {
      // Fallback - show the link
      Alert.alert("Verification Link", verifyUrl, [
        { text: "OK" }
      ]);
    }
  }

  const issued = certs.filter(c => c.status === "issued").length;
  const pending = certs.filter(c =>
    ["pending_vc", "pending_chancellor", "pending_finalize"].includes(c.status)
  ).length;
  const revoked = certs.filter(c => c.status === "revoked").length;

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
          <View style={[s.statBox, s.statBoxBorder]}>
            <Text style={s.statNum}>{revoked}</Text>
            <Text style={s.statLabel}>Revoked</Text>
          </View>
        </View>
      </View>

      {/* ── Tab bar ── */}
      <View style={s.tabBar}>
        {[["certs", "My Certificates"], ["profile", "Profile"]].map(([key, label]) => (
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
          {/* Search and filter */}
          <View style={s.searchSection}>
            <TextInput
              style={s.searchInput}
              placeholder="Search certificates..."
              placeholderTextColor={T.faint}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={s.filterRow}>
              {[
                ["all", "All"],
                ["issued", "Issued"],
                ["pending", "Pending"],
                ["revoked", "Revoked"]
              ].map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[s.filterChip, filterStatus === key && s.filterChipActive]}
                  onPress={() => setFilterStatus(key)}
                >
                  <Text style={[s.filterChipText, filterStatus === key && s.filterChipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {certsLoading ? (
            <ActivityIndicator color={T.navy} style={{ marginTop: 40 }} />
          ) : filteredCerts.length === 0 ? (
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>
                {searchQuery || filterStatus !== "all" ? "🔍" : "🎓"}
              </Text>
              <Text style={s.emptyTitle}>
                {searchQuery || filterStatus !== "all" 
                  ? "No matching certificates" 
                  : "No certificates yet"}
              </Text>
              <Text style={s.emptyMsg}>
                {searchQuery || filterStatus !== "all"
                  ? "Try adjusting your search or filter"
                  : "Your issued certificates appear here once anchored on-chain."}
              </Text>
              {(searchQuery || filterStatus !== "all") && (
                <TouchableOpacity
                  style={s.clearBtn}
                  onPress={() => { setSearchQuery(""); setFilterStatus("all"); }}
                >
                  <Text style={s.clearBtnText}>Clear filters</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filteredCerts.map(cert => (
              <CertCard
                key={cert.id}
                cert={cert}
                onPress={() => navigation.navigate("CertificateDetail", { cert })}
                onShare={handleShare}
                onDownload={handleDownload}
                downloadBusy={downloading === cert.id}
                downloadDisabled={downloading !== null}
                onCopyLink={handleCopyLink}
              />
            ))
          )}
        </View>
      )}

      {/* ── Profile ── */}
      {tab === "profile" && (
        <View style={s.tabPanel}>
          <View style={s.profileSection}>
            <Text style={s.profileSectionTitle}>Account</Text>
            <View style={s.profileCard}>
              <View style={s.profileRow}>
                <Text style={s.profileLabel}>Name</Text>
                <Text style={s.profileValue}>
                  {user?.first_name} {user?.last_name}
                </Text>
              </View>
              <View style={s.profileRow}>
                <Text style={s.profileLabel}>Email</Text>
                <Text style={s.profileValue}>{user?.email || "—"}</Text>
              </View>
              <View style={s.profileRow}>
                <Text style={s.profileLabel}>Role</Text>
                <Text style={s.profileValue}>{roleLabel(user?.role)}</Text>
              </View>
            </View>
          </View>

          <View style={s.profileSection}>
            <Text style={s.profileSectionTitle}>Quick Actions</Text>
            <AnimatedButton label="Verify a Certificate" onPress={() => navigation.navigate("Verify")} />
          </View>

          <View style={s.profileSection}>
            <Text style={s.profileSectionTitle}>About</Text>
            <View style={s.profileCard}>
              <Text style={s.aboutText}>
                Intelligent Academic Credentialing is a blockchain-based academic certificate verification system for Sierra Leone.
              </Text>
              <Text style={s.aboutText} style={{ marginTop: 12 }}>
                Your certificates are anchored on Ethereum for permanent verification.
              </Text>
            </View>
          </View>
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
        The Intelligent Academic Credentialing mobile app is designed for students and certificate verifiers.
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
        <Text style={s.headerBrand} numberOfLines={2}>Intelligent Academic Credentialing</Text>
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
  headerBrand:   { color: "#fff", fontSize: 13, fontWeight: "700", letterSpacing: 0.2, flexShrink: 1, lineHeight: 16 },
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

  // Search section
  searchSection: { marginBottom: 16 },
  searchInput: {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: T.navy,
    marginBottom: 10,
  },
  filterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
  },
  filterChipActive: {
    backgroundColor: T.navy,
    borderColor: T.navy,
  },
  filterChipText: { fontSize: 12, fontWeight: "600", color: T.faint },
  filterChipTextActive: { color: "#fff" },

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

  // Certificate quick actions
  certActions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: T.border,
    marginTop: 12,
    paddingTop: 12,
    gap: 4,
  },
  certActionBtn: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    paddingVertical: 8,
    gap: 4,
  },
  certActionIcon: { fontSize: 16 },
  certActionText: { fontSize: 10, color: T.muted, fontWeight: "600" },

  // Profile section
  profileSection: { marginBottom: 24 },
  profileSectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: T.faint,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  profileCard: {
    backgroundColor: T.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
    padding: 16,
  },
  profileRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  profileLabel: { fontSize: 13, color: T.faint, fontWeight: "600" },
  profileValue: { fontSize: 13, color: T.navy, fontWeight: "500" },
  profileActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: T.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
    padding: 16,
    gap: 12,
  },
  profileActionIcon: { fontSize: 20 },
  profileActionText: { fontSize: 14, color: T.navy, fontWeight: "600", flex: 1 },
  profileActionArrow: { fontSize: 18, color: T.faint },
  aboutText: { fontSize: 13, color: T.muted, lineHeight: 20 },

  // Empty / placeholder
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 64, paddingHorizontal: 32 },
  emptyIcon:  { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: T.navy, marginBottom: 6 },
  emptyMsg:   { color: T.muted, textAlign: "center", fontSize: 13, lineHeight: 20 },
  clearBtn: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.navy,
  },
  clearBtnText: { color: T.navy, fontSize: 13, fontWeight: "600" },
});
