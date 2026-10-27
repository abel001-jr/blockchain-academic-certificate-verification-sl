import { useToast } from "../components/ToastProvider";
import { apiErrorMessage, apiErrorData } from "../utils/apiError";
import { colors as T, createStyles, fonts, cardShadow } from "../theme";
import { verificationFailure } from "../utils/verification";
import AnimatedButton from "../components/AnimatedButton";
import ContourSplash from "../components/ContourSplash";
/**
 * CertificateDetailScreen — full certificate detail.
 *
 * Design mirrors the web certificate detail page:
 *   • Navy hero card with degree title + anchor badge
 *   • Live verification result banner (re-runs /api/verify on mount)
 *   • Metadata table (student, institution, grade, year…)
 *   • Blockchain record section (tx hash)
 *   • Action buttons: download my documents, open verification link
 *
 * On documents: this screen used to render `ipfs_cid_pdf` / `ipfs_cid_json`
 * from the public verify payload and link straight to a Pinata gateway URL.
 * That stopped being true in REMAINING_WORK item 1, which removed document
 * locations from public verification — the rows rendered an em dash and the
 * "View PDF" button never appeared. The documents are now fetched from the
 * owner-scoped endpoint instead, which needs the signed-in student's JWT and
 * therefore cannot be a plain `Linking.openURL`.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { saveDocumentArchive, createDocumentPreview } from "../services/documents";
import { downloadMyDocuments, verifyCertificate, getMyDocumentPreview } from "../services/certificates";


function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
}

function shortHash(h) {
  if (!h || h.length < 14) return h || "—";
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <View style={s.section}>
      {title ? <Text style={s.sectionTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

function MetaRow({ label, value, mono }) {
  return (
    <View style={s.metaRow}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={[s.metaValue, mono && s.mono]}>{value || "—"}</Text>
    </View>
  );
}

function AnchorBadge({ txHash, chainIssuedAt }) {
  const anchored = Boolean(txHash || chainIssuedAt);
  return (
    <View style={[s.anchorBadge, anchored ? s.anchorGreen : s.anchorAmber]}>
      <Text style={[s.anchorText, { color: anchored ? T.green : T.amber }]}>
        {anchored ? "⛓  Anchored on Ethereum" : "⏳  Not yet anchored"}
      </Text>
      {anchored && chainIssuedAt
        ? <Text style={s.anchorDate}>{fmtDate(chainIssuedAt)}</Text>
        : null}
    </View>
  );
}

function VerifyBanner({ result }) {
  if (!result) return null;
  const o = result.verification_outcome;

  if (o === "unavailable" || !["valid", "revoked", "not_found", "not_verified"].includes(o)) {
    return <View style={[s.banner, s.bannerAmber]}><View style={{ flex: 1 }}><Text style={[s.bannerTitle, { color: T.amber }]}>Verification unavailable</Text><Text style={s.bannerSub}>{result.error || "Pull down to try again."}</Text></View></View>;
  }
  if (result.found === false || o === "not_found") {
    return (
      <View style={[s.banner, s.bannerRed]}>
        <Text style={s.bannerIcon}>✗</Text>
        <View style={{ flex: 1 }}>
          <Text style={[s.bannerTitle, { color: T.red }]}>Not found in registry</Text>
          <Text style={s.bannerSub}>{result.error ?? "Certificate not found."}</Text>
        </View>
      </View>
    );
  }
  if (o === "revoked") {
    return (
      <View style={[s.banner, s.bannerRed]}>
        <Text style={s.bannerIcon}>⛔</Text>
        <View style={{ flex: 1 }}>
          <Text style={[s.bannerTitle, { color: T.red }]}>Revoked</Text>
          {result.certificate?.revocation_reason
            ? <Text style={s.bannerSub}>{result.certificate.revocation_reason}</Text>
            : null}
        </View>
      </View>
    );
  }
  if (o === "not_verified") {
    return (
      <View style={[s.banner, s.bannerAmber]}>
        <Text style={s.bannerIcon}>⏳</Text>
        <View style={{ flex: 1 }}>
          <Text style={[s.bannerTitle, { color: T.amber }]}>Pending on-chain</Text>
          <Text style={s.bannerSub}>Not yet anchored to the blockchain.</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[s.banner, s.bannerGreen]}>
      <Text style={s.bannerIcon}>✓</Text>
      <View style={{ flex: 1 }}>
        <Text style={[s.bannerTitle, { color: T.green }]}>Certificate verified</Text>
        <Text style={s.bannerSub}>The registry reports this certificate as issued.</Text>
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────
export default function CertificateDetailScreen({ route, navigation }) {
  const { showToast } = useToast();
  const cert = route.params?.cert ?? {};

  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyLoading, setVerifyLoading] = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [downloading,   setDownloading]   = useState(false);
  const [documentKind, setDocumentKind] = useState("certificate");
  const [documentPage, setDocumentPage] = useState(1);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [previewRetry, setPreviewRetry] = useState(0);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    if (!cert.certificate_id || cert.status !== "issued") return;
    let active = true, cleanup;
    setPreviewLoading(true); setImageReady(false); setPreviewError(""); setPreview(null);
    getMyDocumentPreview(cert.certificate_id, documentKind, documentPage).then(data => {
      if (!active) return;
      const image = createDocumentPreview(data.bytes);
      cleanup = image.cleanup;
      setPreview({uri: image.uri, pages: data.pages, source: data.source});
    }).catch(error => {if (active) setPreviewError(apiErrorData(error).detail || apiErrorMessage(error, "Could not load this document."));})
      .finally(() => {if (active) setPreviewLoading(false);});
    return () => {active = false; cleanup?.();};
  }, [cert.certificate_id, cert.status, documentKind, documentPage, previewRetry]);


  const runVerify = useCallback(async () => {
    if (!cert.certificate_id) { setVerifyLoading(false); setRefreshing(false); return; }
    setVerifyLoading(true);
    try {
      const data = await verifyCertificate(cert.certificate_id);
      setVerifyResult(data);
    } catch (err) {
      setVerifyResult(verificationFailure(err));
    } finally {
      setVerifyLoading(false);
      setRefreshing(false);
    }
  }, [cert.certificate_id]);

  useEffect(() => { runVerify(); }, [runVerify]);

  /**
   * Fetch the certificate + transcript pair and hand it to the system share
   * sheet, which is how a graduate actually keeps a copy — "Save to Files",
   * AirDrop, mail it to themselves. The archive is written to the cache
   * directory rather than the document directory because it is a transient
   * copy of a credential the app can always re-fetch; leaving decrypted
   * documents in a permanent location would outlive the session for no reason.
   */
  const handleDownload = useCallback(async () => {
    if (!cert.certificate_id || downloading) return;
    setDownloading(true); setDownloadError("");
    try {
      const bytes = await downloadMyDocuments(cert.certificate_id);
      await saveDocumentArchive(bytes, cert.certificate_id);
    } catch (err) {
      const message = apiErrorMessage(err, "Could not download your documents.");
      setDownloadError(message);
      showToast(message, { title: "Documents unavailable" });
    } finally {
      setDownloading(false);
    }
  }, [cert.certificate_id, downloading, showToast]);

  const live       = verifyResult?.certificate ?? {};
  const txHash     = live.tx_hash      || cert.tx_hash      || "";
  const issuedAt   = live.chain_issued_at || cert.chain_issued_at || "";
  const hasTranscript = Boolean(live.has_transcript ?? cert.has_transcript);

  if (verifyLoading) return <ContourSplash message="Checking your credential against the blockchain?" loadingLabel="Verifying credential against blockchain" />;

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); runVerify(); }}
            tintColor={T.navy}
          />
        }
      >
        {/* ── Hero ── */}
        <View style={s.hero}>
          <Text style={s.heroEyebrow}>{live.institution_name || cert.institution_name || ""}</Text>
          <Text style={s.heroDegree}>
            {live.degree_title || cert.degree_title || "Certificate"}
          </Text>
          <Text style={s.heroStudent}>
            {live.student_name || cert.student_name || ""}
          </Text>
          <AnchorBadge txHash={txHash} chainIssuedAt={issuedAt} />
        </View>

        {/* ── Verification banner ── */}
        <Section><VerifyBanner result={verifyResult} /></Section>

        {/* ── Academic details ── */}
        <Section title="Academic Details">
          <MetaRow label="Student"     value={live.student_name    || cert.student_name} />
          <MetaRow label="Degree"      value={live.degree_title    || cert.degree_title} />
          <MetaRow label="Department"  value={live.department      || cert.department || "—"} />
          <MetaRow label="Institution" value={live.institution_name || cert.institution_name} />
          <MetaRow label="Year"        value={String(live.graduation_year || cert.graduation_year || "—")} />
          <MetaRow label="Grade"       value={live.grade           || cert.grade || "—"} />
          <MetaRow label="Issued by"   value={live.issued_by       || cert.issued_by_name || "—"} />
          <MetaRow
            label="Transcript"
            value={hasTranscript ? "Included with this award" : "Not attached"}
          />
        </Section>

        {/* ── Certificate identity ── */}
        <Section title="Certificate Identity">
          <MetaRow label="Certificate ID" value={live.certificate_id || cert.certificate_id} mono />
          {live.cert_hash
            ? <MetaRow label="Data Hash" value={shortHash(live.cert_hash)} mono />
            : null}
        </Section>

        {/* ── Blockchain record ──
            No document CIDs: public verification no longer exposes document
            locations, and a CID shown here would be a location with no access
            control attached to it. */}
        <Section title="Blockchain Record">
          <MetaRow
            label="Transaction"
            value={txHash ? shortHash(txHash) : "Not yet anchored"}
            mono
          />
          <MetaRow label="Anchored" value={fmtDate(issuedAt)} />
        </Section>

        {/* ── Actions ── */}
        {cert.status === "issued" && <Section title="Access your credential">
          <View style={{padding: 16, gap: 14}}>
            <Text style={{fontSize: 13, lineHeight: 19, color: T.muted}}>Choose a document to review, then download it or share employer access.</Text>
            <View style={{flexDirection: "row", backgroundColor: T.input, borderRadius: 10, padding: 4, gap: 4}}>
              {["certificate", "transcript"].map(kind => <TouchableOpacity accessibilityRole="tab" accessibilityState={{selected: documentKind === kind}} key={kind} onPress={() => {setDocumentKind(kind); setDocumentPage(1);}} style={{flex: 1, minHeight: 46, justifyContent: "center", alignItems: "center", padding: 8, borderRadius: 8, backgroundColor: documentKind === kind ? T.navy : "transparent"}}><Text style={{fontSize: 14, fontWeight: "600", color: documentKind === kind ? T.cream : T.navy}}>{kind === "certificate" ? "Certificate" : "Transcript"}</Text></TouchableOpacity>)}
            </View>
            <View accessibilityLiveRegion="polite" style={{flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8}}>
              <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: previewError ? T.red : imageReady ? T.green : T.amber}} />
              <Text style={{fontSize: 12, fontWeight: "700", color: previewError ? T.red : imageReady ? T.green : T.navy}}>{previewError ? "Viewing unavailable" : previewLoading ? "Retrieving document" : preview && !imageReady ? "Preparing preview" : imageReady ? (preview?.source === "local_cache" || preview?.source === "local_file" ? "Currently viewing locally" : "Ready to view") : "Waiting for document"}</Text>
              <Text style={{fontSize: 12, color: T.muted}}>{documentKind === "certificate" ? "Certificate" : "Transcript"}{preview ? ` ? Page ${documentPage} of ${preview.pages}` : ""}</Text>
            </View>
            {imageReady && !previewError && (preview?.source === "local_cache" || preview?.source === "local_file") && <Text style={{fontSize: 12, lineHeight: 18, color: T.muted}}>Showing your verified local copy automatically. Cloud access is not needed to view this document.</Text>}
            {previewLoading && <View style={{paddingVertical: 28, alignItems: "center", gap: 10}}><ActivityIndicator color={T.navy} /><Text style={{fontSize: 12, color: T.muted}}>Loading your verified document copy?</Text></View>}
            {previewError ? <View style={{padding: 14, borderRadius: 10, backgroundColor: T.redLight, borderWidth: 1, borderColor: T.redBdr, gap: 10}}>
              <Text accessibilityRole="alert" style={{fontSize: 13, lineHeight: 20, color: T.red}}>{previewError}</Text>
              <Text style={{fontSize: 12, lineHeight: 18, color: T.muted}}>Your credential record is still available. Retry viewing, choose the other document, or contact your registrar if the file remains unavailable.</Text>
              <AnimatedButton label="Retry viewing" onPress={() => setPreviewRetry(value => value+1)} />
            </View> : null}
            {preview && !previewError && <View style={{borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: T.border}}>
              <Image source={{uri: preview.uri}} accessibilityLabel={`${documentKind} page ${documentPage}`} onLoad={() => setImageReady(true)} onError={() => {setImageReady(false); setPreviewError("The document was retrieved, but its preview could not be displayed. Please retry viewing.");}} resizeMode="contain" style={{width: "100%", height: 360, backgroundColor: T.input}} />
              <View style={{flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 4}}><TouchableOpacity accessibilityRole="button" disabled={documentPage <= 1} onPress={() => setDocumentPage(value => value-1)} style={{padding: 12, opacity: documentPage <= 1 ? .35 : 1}}><Text>Previous</Text></TouchableOpacity><Text style={{fontSize: 12}}>{documentPage} / {preview.pages}</Text><TouchableOpacity accessibilityRole="button" disabled={documentPage >= preview.pages} onPress={() => setDocumentPage(value => value+1)} style={{padding: 12, opacity: documentPage >= preview.pages ? .35 : 1}}><Text>Next</Text></TouchableOpacity></View>
            </View>}
            <View style={{borderTopWidth: 1, borderColor: T.border, paddingTop: 12, gap: 8}}>
              <Text style={{fontSize: 11, fontWeight: "700", color: T.muted, letterSpacing: 1}}>DOCUMENT ACTIONS</Text>
              <AnimatedButton variant="download" label={downloading ? "Preparing download?" : "Download certificate & transcript"} onPress={handleDownload} busy={downloading} />
              {downloadError ? <Text accessibilityRole="alert" style={{fontSize: 12, lineHeight: 18, color: T.red}}>{downloadError}</Text> : null}
              <AnimatedButton label="Share employer access" onPress={() => navigation.navigate("Dashboard", {shareCertificate: cert})} />
              <TouchableOpacity accessibilityRole="button" style={{minHeight: 44, justifyContent: "center", alignItems: "center", padding: 10}} onPress={() => navigation.navigate("Verify", {certificateId: cert.certificate_id})}><Text style={{fontSize: 13, fontWeight: "600", color: T.navy}}>Check credential record</Text></TouchableOpacity>
            </View>
          </View>
        </Section>}

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = createStyles({
  safe:   { flex: 1, backgroundColor: T.cream },
  scroll: { paddingBottom: 48, width: "100%", maxWidth: 760, alignSelf: "center" },

  // Hero
  hero: { backgroundColor: T.navy, padding: 24, margin: 18, marginBottom: 4, borderRadius: 18 },
  heroEyebrow: { fontSize: 11, fontWeight: "600", color: "#B0C8DC", textTransform: "uppercase", letterSpacing: 0.8 },
  heroDegree: { fontSize: 27, fontWeight: "600", color: T.cream, lineHeight: 35, marginVertical: 12, letterSpacing: -0.6 },
  heroStudent: { fontSize: 13, color: "#B0C8DC" },

  // Anchor badge
  anchorBadge: {
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 8,
  },
  anchorGreen: { backgroundColor: T.greenLight },
  anchorAmber: { backgroundColor: T.amberLight },
  anchorText:  { fontWeight: "700", fontSize: 12 },
  anchorDate:  { fontSize: 10, color: T.muted, marginTop: 1 },

  // Section
  section: { backgroundColor: T.surface, marginHorizontal: 18, marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: T.border, overflow: "hidden", ...cardShadow },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: T.faint,
    textTransform: "uppercase",
    letterSpacing: 0.9,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },

  // Metadata row
  metaRow: { gap: 6, paddingHorizontal: 18, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: T.border },
  metaLabel: { fontSize: 11, color: T.muted },
  metaValue: { fontSize: 14, color: T.navy, fontWeight: "500", lineHeight: 22 },
  mono:      { fontFamily: "monospace", fontSize: 11 },
  link:      { color: "#1A73E8", textDecorationLine: "underline" },

  // Verify banner
  banner:      { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14 },
  bannerGreen: { backgroundColor: T.greenLight },
  bannerRed:   { backgroundColor: T.redLight },
  bannerAmber: { backgroundColor: T.amberLight },
  bannerIcon:  { fontSize: 18 },
  bannerTitle: { fontWeight: "700", fontSize: 13 },
  bannerSub:   { fontSize: 12, color: T.muted, marginTop: 2, lineHeight: 17 },

  // Verifying indicator
  verifyingRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  verifyingText:{ fontSize: 13, color: T.muted },

  // Action buttons
  actionBtn: {
    backgroundColor: T.navy,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  actionBtnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: T.navy,
  },
  actionBtnBusy:   { opacity: 0.6 },
  actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // Inline notice (e.g. where a downloaded file landed)
  notice: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: T.amberLight,
    borderWidth: 1,
    borderColor: T.amberBdr,
  },
  noticeText: { fontSize: 12, color: T.muted, lineHeight: 17 },
});
