import { useToast } from "../components/ToastProvider";
import { apiErrorMessage } from "../utils/apiError";
import PageIntro from "../components/PageIntro";
import { Share2, ArrowUpRight, ScanLine } from "lucide-react-native";
import BrandHeader from "../components/BrandHeader";
import StudentSidePanel from "../components/StudentSidePanel";
import { colors as T, createStyles, fonts, cardShadow } from "../theme";
import { verificationUrl } from "../config";
import AnimatedButton from "../components/AnimatedButton";
import DurationWheel from "../components/DurationWheel";
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
  Modal,
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
import { saveDocumentArchive } from "../services/documents";
import { getMyCertificates, downloadMyDocuments, createVerificationShare } from "../services/certificates";

// ── design tokens ──────────────────────────────────────────────────────────

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
function CertCard({ cert, onPress, onShare, onDownload, downloadBusy, downloadDisabled }) {
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

        </View>
        {/* Cert ID + date */}
        <Text style={s.certId} numberOfLines={1}>{cert.certificate_id}</Text>
        {issuedDate
          ? <Text style={s.certDate}>Anchored {issuedDate}</Text>
          : null}
      </TouchableOpacity>

      {/* Quick Actions */}
      {anchored && cert.status === "issued" && (
        <View style={s.certActions}>
          <TouchableOpacity accessibilityRole="button" style={s.certActionBtn} onPress={onPress}><ArrowUpRight size={17} color={T.navy} /><Text style={s.certActionText}>Access</Text></TouchableOpacity>
          <TouchableOpacity
            style={s.certActionBtn}
            onPress={() => onShare(cert)}
            activeOpacity={0.7}
          >
            <Share2 size={17} color={T.navy} strokeWidth={1.7} />
            <Text style={s.certActionText}>Share</Text>
          </TouchableOpacity>
          <AnimatedButton variant="download" compact label={downloadBusy ? "Fetching?" : "Download"} onPress={() => onDownload(cert)} busy={downloadBusy} disabled={downloadDisabled} />

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
        <Text style={[s.resultTitle, { color: T.red }]}>Certificate not found</Text>
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
      {["Institution record found", "Credential status reported as issued"].map(c => (
        <Text key={c} style={s.checkItem}>✓  {c}</Text>
      ))}
    </View>
  );
}

// ── Student dashboard ──────────────────────────────────────────────────────
function StudentDashboard({ user, navigation, shareCertificate, collectionOnly = false }) {
  const { showToast } = useToast();
  const tab = "certs";
  const [certs, setCerts] = useState([]);
  const [certsLoading, setClLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [downloading, setDownloading] = useState(null);
  const [shareTarget, setShareTarget] = useState(null);
  const [shareHours, setShareHours] = useState(0);
  const [shareMinutes, setShareMinutes] = useState(15);
  const [creatingShare, setCreatingShare] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [documentError, setDocumentError] = useState("");
  useEffect(() => {
    if (shareCertificate) { setShareMinutes(15); setShareHours(0); setShareTarget({cert: shareCertificate}); navigation.setParams({shareCertificate: null}); }
  }, [shareCertificate, navigation]);

  const loadCerts = useCallback(async () => {
    setLoadError("");
    try {
      const data = await getMyCertificates();
      setCerts(data);
    } catch (error) {
      setLoadError(error?.response?.status === 401 ? "Your session has ended. Sign in again to view your credentials." : "We could not refresh your credentials. Check your connection and try again. Previously loaded records remain visible.");
    } finally {
      setClLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadCerts(); }, [loadCerts]);
  useEffect(() => { if (loadError) showToast(loadError, { title: "Credentials unavailable" }); }, [loadError, showToast]);

  // Filter and search certificates
  const filteredCerts = certs.filter(cert => {
    // Search filter
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery || 
      cert.degree_title?.toLowerCase().includes(searchLower) ||
      cert.institution_name?.toLowerCase().includes(searchLower) ||
      cert.certificate_id?.toLowerCase().includes(searchLower) ||
      cert.student_name?.toLowerCase().includes(searchLower);

    return matchesSearch;
  });

  // Share certificate
  function handleShare(cert) {
    setShareHours(0);
    setShareMinutes(15);
    setShareTarget({cert});
  }

  async function prepareShare() {
    const minutes = shareHours === 24 ? 1440 : shareHours * 60 + shareMinutes;
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 1440) {
      showToast("Choose an expiry between 15 minutes and 24 hours.", {title: "Invalid expiry"}); return;
    }
    setCreatingShare(true);
    try {
      const cert = shareTarget.cert;
      const data = await createVerificationShare(cert.certificate_id, minutes);
      const text = `Academic credential | Credence\n\nI am sharing my ${cert.degree_title} credential from ${cert.institution_name}.\nCredential ID: ${cert.certificate_id}\n\nThis private link authorizes one verification and expires at ${new Date(data.expires_at).toLocaleString()}. Please do not forward it.\n\nOpen the link to review the credential and its verification checks.`;
      setShareTarget({cert, url: data.share_url, title: "Credential verification", text, message: `${text}\n\n${data.share_url}`});
    } catch (error) { showToast(apiErrorMessage(error, "Could not create the sharing link."), {title: "Sharing unavailable"}); }
    finally { setCreatingShare(false); }
  }

  async function openShareDestination(destination) {
    if (!shareTarget) return;
    try {
      if (destination === "native") {
        await Share.share({title: shareTarget.title, message: shareTarget.message, url: shareTarget.url});
      } else if (destination === "system") {
        await navigator.share({title: shareTarget.title, text: shareTarget.text, url: shareTarget.url});
      } else {
        const url = destination === "whatsapp"
          ? `https://wa.me/?text=${encodeURIComponent(shareTarget.message)}`
          : `mailto:?subject=${encodeURIComponent(shareTarget.title)}&body=${encodeURIComponent(shareTarget.message)}`;
        await Linking.openURL(url);
      }
      setShareTarget(null);
    } catch (error) {
      if (error?.name !== "AbortError") showToast("This sharing destination could not open. Please try another option.", {title: "Could not share"});
    }
  }

  // Download certificate and transcript
  async function handleDownload(cert) {
    if (!cert.certificate_id || downloading) return;
    setDownloading(cert.id || cert.certificate_id); setDocumentError("");
    try {
      const bytes = await downloadMyDocuments(cert.certificate_id);
      await saveDocumentArchive(bytes, cert.certificate_id);
      showToast("Your document archive is ready. Check browser downloads or choose Save to Files on your device.", {title: "Documents ready", tone: "success"});
    } catch (err) {
      const detail = apiErrorMessage(err, "Download failed. Please try again.");
      setDocumentError(detail);
      showToast(detail, { title: "Documents unavailable" });
    } finally {
      setDownloading(null);
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
      contentContainerStyle={{ paddingBottom: 48, width: "100%", maxWidth: 840, alignSelf: "center" }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); loadCerts(); }}
          tintColor={T.navy}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {documentError ? <Text accessibilityRole="alert" style={{padding: 14, color: T.red}}>{documentError}</Text> : null}
      <Modal visible={Boolean(shareTarget)} transparent animationType="fade" onRequestClose={() => setShareTarget(null)}>
        <View style={{flex: 1, backgroundColor: "rgba(0,0,0,.45)", justifyContent: "center", padding: 24}}>
          <View accessibilityViewIsModal style={{backgroundColor: T.surface, padding: 24, borderRadius: 16, width: "100%", maxWidth: 420, alignSelf: "center", gap: 12}}>
            <Text accessibilityRole="header" style={{fontSize: 20, fontWeight: "700", color: T.navy}}>Share credential</Text>
            <Text style={{color: T.text}}>Private access for one verification. Choose how long the link remains available.</Text>
            {!shareTarget?.url && <>
              <Text style={{fontSize: 14, fontWeight: "600", color: T.navy}}>Link expires after</Text>
              <View style={{flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8}}>
                <DurationWheel label="Hours" values={Array.from({length: 25}, (_, i) => i)} value={shareHours} onChange={setShareHours} disabled={creatingShare} />
                <Text style={{fontSize: 30, color: T.navy, paddingTop: 20}}>:</Text>
                <DurationWheel label="Minutes" values={shareHours === 24 ? [0] : Array.from({length: 46}, (_, i) => i + 15)} value={shareHours === 24 ? 0 : shareMinutes} onChange={setShareMinutes} disabled={creatingShare} />
              </View>
              <View style={{marginTop: -8, alignItems: "center", gap: 4}}>
                <Text accessibilityLiveRegion="polite" style={{fontSize: 14, color: T.navy}}>Selected: <Text style={{fontWeight: "700"}}>{shareHours === 24 ? "24 hours" : `${shareHours} hours, ${shareMinutes} minutes`}</Text></Text>
                <Text style={{fontSize: 11, color: T.muted}}>Default: 15 minutes ? Maximum: 24 hours</Text>
              </View>
              <AnimatedButton label={creatingShare ? "Creating link?" : "Create single-use link"} disabled={creatingShare} onPress={prepareShare} />
            </>}
            {shareTarget?.url && <>
            <Text style={{fontSize: 12}}>Link ready. Choose a destination; all options use the same single-use link.</Text>
            <AnimatedButton label="WhatsApp" onPress={() => openShareDestination("whatsapp")} />
            <AnimatedButton label="Email" onPress={() => openShareDestination("email")} />
            {Platform.OS === "web" && typeof navigator !== "undefined" && typeof navigator.share === "function" && <AnimatedButton label="More apps?" onPress={() => openShareDestination("system")} />}
            <Text style={{fontSize: 12, color: T.text}}>For Instagram, use More apps if it appears in your device share menu, or copy the link and paste it into a message.</Text>
            {Platform.OS !== "web" && <AnimatedButton label="Share to other apps" onPress={() => openShareDestination("native")} />}
            </>}
            <AnimatedButton label="Cancel" disabled={creatingShare} onPress={() => setShareTarget(null)} />
          </View>
        </View>
      </Modal>
      {/* ── Welcome hero ── */}
      {!collectionOnly && (tab === "certs" ? <>
      <View style={s.hero}>
        <View style={s.heroText}>
          <Text style={s.heroRole}>YOUR STUDENT PORTAL</Text>
          <Text style={s.heroGreeting}>
            {user?.first_name ? `Hi, ${user.first_name}` : "Welcome"}
          </Text>
          <Text style={s.heroRole}>Student · My Credentials</Text>
        </View>
        <Text style={s.heroDescription}>Your achievements, ready for the next chapter. View your credentials or verify a record.</Text>
        <TouchableOpacity accessibilityRole="button" style={s.scanAction} onPress={() => navigation.navigate("Verify")}>
          <ScanLine size={21} color={T.navy} /><Text style={s.scanTitle}>Scan or verify a credential</Text><ArrowUpRight size={20} color={T.navy} />
        </TouchableOpacity>
      </View>

      {/* ── Tab bar ── */}
        <View style={s.heroStats}>
          <View style={s.statBox}>
            <Text style={s.statNum}>{certsLoading ? "—" : issued}</Text>
            <Text style={s.statLabel}>Issued</Text>
          </View>
          <View style={[s.statBox, s.statBoxBorder]}>
            <Text style={s.statNum}>{certsLoading ? "—" : pending}</Text>
            <Text style={s.statLabel}>Pending</Text>
          </View>
          <View style={[s.statBox, s.statBoxBorder]}>
            <Text style={s.statNum}>{certsLoading ? "—" : revoked}</Text>
            <Text style={s.statLabel}>Revoked</Text>
          </View>
        </View>

      </> : <View style={{ margin: 18, marginBottom: 10 }}>
        <PageIntro eyebrow="STUDENT PROFILE" title="Your profile" description="Your details, credentials and sign-in account." dark />
      </View>)}


      {/* ── My Certificates ── */}
      {tab === "certs" && (
        <View style={s.tabPanel}>
          {!user?.google_linked ? <View style={s.profileCard}>
            <Text style={s.profileSectionTitle}>Secure your account</Text>
            <Text style={s.aboutText}>Link Google so you can return to your credentials after signing out.</Text>
            <AnimatedButton label="Set up my account" onPress={() => navigation.navigate("StudentAccount", { afterClaim: false })} style={{ marginTop: 12 }} />
          </View> : null}
          <Text style={s.collectionTitle}>Your credential collection</Text>
          <Text style={s.collectionHint}>Open a record to view details. Issued credentials include download and sharing options.</Text>
          {loadError ? <View accessibilityRole="alert" style={s.loadError}>
            <Text style={{ color: T.red, lineHeight: 21 }}>{loadError}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => { setRefreshing(true); loadCerts(); }} disabled={refreshing} style={s.retryButton}><Text style={{ color: T.navy, fontWeight: "700" }}>{refreshing ? "Retrying..." : "Try again"}</Text></TouchableOpacity>
          </View> : null}
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

          </View>

          {certsLoading ? (
            <ActivityIndicator color={T.navy} style={{ marginTop: 40 }} />
          ) : loadError && certs.length === 0 ? null : filteredCerts.length === 0 ? (
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>
                {searchQuery ? "🔍" : "🎓"}
              </Text>
              <Text style={s.emptyTitle}>
                {searchQuery
                  ? "No matching certificates" 
                  : "No certificates yet"}
              </Text>
              <Text style={s.emptyMsg}>
                {searchQuery
                  ? "Try adjusting your search"
                  : "Already claimed your invitation? Pull down to refresh. If a credential is still missing, ask your institution to confirm it was issued to this account."}
              </Text>
              {(searchQuery) && (
                <TouchableOpacity
                  style={s.clearBtn}
                  onPress={() => { setSearchQuery(""); }}
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
                downloadBusy={downloading === (cert.id || cert.certificate_id)}
                downloadDisabled={downloading !== null}
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
            <Text style={s.profileSectionTitle}>Profile and sign-in</Text>
            <View style={s.profileCard}>
              <Text style={[s.profileValue, { textAlign: "left" }]}>{user?.google_linked ? "Google account linked" : "Google account not linked"}</Text>
              <Text style={[s.aboutText, { marginVertical: 12 }]}>{user?.google_linked ? user.google_email : "Link Google to keep a way to sign in after claiming your invitation."}</Text>
              <AnimatedButton label={user?.google_linked ? "Edit profile and account" : "Set up profile and link Google"} onPress={() => navigation.navigate("StudentAccount", { afterClaim: false })} />
            </View>
          </View>
          <View style={s.profileSection}>
            <Text style={s.profileSectionTitle}>Quick Actions</Text>
            <AnimatedButton label="Verify a Certificate" onPress={() => navigation.navigate("Verify")} />
            <AnimatedButton label="View the welcome guide" onPress={() => navigation.navigate("Onboarding")} style={{ marginTop: 12 }} />
          </View>

          <View style={s.profileSection}>
            <Text style={s.profileSectionTitle}>About</Text>
            <View style={s.profileCard}>
              <Text style={s.aboutText}>
                Intelligent Academic Credentialing is a blockchain-based academic certificate verification system for Sierra Leone.
              </Text>
              <Text style={[s.aboutText, { marginTop: 12 }]}>
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
export default function DashboardScreen({ navigation, route, user, onLogout }) {
  const role = user?.role ?? "student";
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>


      {/* Header */}
      <BrandHeader action="Sign out" onAction={onLogout} subtitle="STUDENT PORTAL" onMenuPress={role === "student" ? () => setPanelOpen(true) : undefined} menuOpen={panelOpen} />
      <StudentSidePanel visible={panelOpen} onClose={() => setPanelOpen(false)} navigation={navigation} user={user} onLogout={onLogout} />

      {role === "student"
        ? <StudentDashboard user={user} navigation={navigation} shareCertificate={route?.params?.shareCertificate} collectionOnly={route?.params?.view === "credentials"} />
        : <StaffPlaceholder role={role} />
      }
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = createStyles({
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
  hero: { backgroundColor: T.navy, marginHorizontal: 18, marginTop: 20, padding: 22, borderRadius: 18 },
  heroText:      { marginBottom: 16 },
  heroDescription: { color: T.navyMuted, fontSize: 13, lineHeight: 22 },
  scanAction: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, backgroundColor: "#F5EBDB", borderRadius: 12, padding: 16, marginTop: 16, minHeight: 48 },
  scanTitle: { color: T.navy, fontWeight: "700", fontSize: 14, flex: 1 },
  scanArrow: { color: T.navy, fontSize: 22 },
  collectionTitle: { color: T.navy, fontSize: 20, fontWeight: "600", marginTop: 12, marginBottom: 8, letterSpacing: -0.4 },
  collectionHint: { color: T.muted, fontSize: 13, lineHeight: 20, marginBottom: 18 },
  loadError: { backgroundColor: T.redLight, borderRadius: 12, borderWidth: 1, borderColor: T.redBdr, padding: 16, marginBottom: 16 },
  retryButton: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", paddingHorizontal: 8, marginTop: 4 },
  heroGreeting: { color: T.cream, fontSize: 28, fontWeight: "600", letterSpacing: -0.8, marginTop: 8, marginBottom: 8 },
  heroRole: { color: T.navyMuted, fontSize: 11, letterSpacing: 0.8 },
  heroStats: { flexDirection: "row", gap: 10, marginHorizontal: 18, marginVertical: 18 },
  statBox: { flex: 1, paddingVertical: 16, paddingHorizontal: 12, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 12, ...cardShadow },
  statBoxBorder: { borderLeftWidth: 1, borderLeftColor: T.border },
  statNum: { color: T.navy, fontSize: 28, fontWeight: "600", letterSpacing: -0.5 },
  statLabel: { color: T.muted, fontSize: 11, marginTop: 6 },

  // Tab bar
  tabBar: { flexDirection: "row", backgroundColor: T.cream, borderBottomWidth: 1, borderBottomColor: T.border, marginHorizontal: 18 },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent", minHeight: 48 },
  tabBtnActive: { borderBottomColor: T.accent },
  tabBtnText:       { fontSize: 13, fontWeight: "600", color: T.faint },
  tabBtnTextActive: { color: T.navy },

  // Tab panel
  tabPanel: { padding: 18, gap: 4 },

  // Search section
  searchSection: { marginBottom: 16 },
  searchInput: { backgroundColor: T.input, borderWidth: 1, borderColor: T.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14, fontSize: 14, color: T.ink, marginBottom: 12 },
  filterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  filterChip: { paddingHorizontal: 14, paddingVertical: 10, minHeight: 40, borderRadius: 8, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface },
  filterChipActive: {
    backgroundColor: T.navy,
    borderColor: T.navy,
  },
  filterChipText: { fontSize: 12, fontWeight: "600", color: T.faint },
  filterChipTextActive: { color: "#fff" },

  // Certificate card
  certCard: { backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 18, marginBottom: 12, ...cardShadow },
  certRow:        { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  certDegree: { fontSize: 16, fontWeight: "600", lineHeight: 23, color: T.navy, flex: 1, marginRight: 10 },
  statusPill:     { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:     { fontSize: 10, fontWeight: "700" },
  certInstitution: { fontSize: 12, color: T.muted, marginTop: 6, marginBottom: 14, lineHeight: 19 },
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
  profileCard: { backgroundColor: T.surface, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 18, marginBottom: 12, ...cardShadow },
  profileRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.border },
  profileLabel: { fontSize: 13, color: T.faint, fontWeight: "600" },
  profileValue: { fontSize: 13, color: T.navy, fontWeight: "500", flexShrink: 1, textAlign: "right", lineHeight: 21 },
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
