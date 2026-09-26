/**
 * CertificateDetailScreen — full certificate detail.
 *
 * Design mirrors the web certificate detail page:
 *   • Navy hero card with degree title + anchor badge
 *   • Live verification result banner (re-runs /api/verify on mount)
 *   • Metadata table (student, institution, grade, year…)
 *   • Blockchain record section (tx hash, IPFS CIDs as tappable links)
 *   • Action buttons: View PDF, open verification link
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { verifyCertificate } from "../services/certificates";

const T = {
  navy:       "#08283F",
  gold:       "#B98A28",
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
  amber:      "#B98A28",
  amberLight: "#FFF8E7",
  amberBdr:   "#F0D080",
};

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

function MetaRow({ label, value, mono, link }) {
  const textStyle = [s.metaValue, mono && s.mono];
  return (
    <View style={s.metaRow}>
      <Text style={s.metaLabel}>{label}</Text>
      {link && value && value !== "—"
        ? (
          <TouchableOpacity onPress={() => Linking.openURL(link)}>
            <Text style={[...textStyle, s.link]}>{value}</Text>
          </TouchableOpacity>
        )
        : <Text style={textStyle}>{value || "—"}</Text>
      }
    </View>
  );
}

function AnchorBadge({ txHash, chainIssuedAt }) {
  const anchored = Boolean(txHash);
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

  if (!result.found || o === "not_found") {
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
        <View>
          <Text style={[s.bannerTitle, { color: T.amber }]}>Pending on-chain</Text>
          <Text style={s.bannerSub}>Not yet anchored to the blockchain.</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[s.banner, s.bannerGreen]}>
      <Text style={s.bannerIcon}>✓</Text>
      <View>
        <Text style={[s.bannerTitle, { color: T.green }]}>Certificate verified</Text>
        <Text style={s.bannerSub}>Anchored · Integrity confirmed · Institution confirmed</Text>
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────
export default function CertificateDetailScreen({ route }) {
  const cert = route.params?.cert ?? {};

  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyLoading, setVerifyLoading] = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);

  const runVerify = useCallback(async () => {
    if (!cert.certificate_id) return;
    try {
      const data = await verifyCertificate(cert.certificate_id);
      setVerifyResult(data);
    } catch (err) {
      const detail = err?.response?.data?.message ?? "Verification failed.";
      setVerifyResult({ found: false, verification_outcome: "not_found", error: detail });
    } finally {
      setVerifyLoading(false);
      setRefreshing(false);
    }
  }, [cert.certificate_id]);

  useEffect(() => { runVerify(); }, [runVerify]);

  const live       = verifyResult?.certificate ?? {};
  const txHash     = live.tx_hash      || cert.tx_hash      || "";
  const issuedAt   = live.chain_issued_at || cert.chain_issued_at || "";
  const pinataBase = "https://gateway.pinata.cloud/ipfs/";
  const pdfUrl     = live.ipfs_url_pdf ||
    (live.ipfs_cid_pdf ? `${pinataBase}${live.ipfs_cid_pdf}` : null);

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
        <Section>
          {verifyLoading
            ? (
              <View style={s.verifyingRow}>
                <ActivityIndicator color={T.navy} size="small" />
                <Text style={s.verifyingText}>Verifying against blockchain…</Text>
              </View>
            )
            : <VerifyBanner result={verifyResult} />
          }
        </Section>

        {/* ── Academic details ── */}
        <Section title="Academic Details">
          <MetaRow label="Student"     value={live.student_name    || cert.student_name} />
          <MetaRow label="Degree"      value={live.degree_title    || cert.degree_title} />
          <MetaRow label="Department"  value={live.department      || cert.department || "—"} />
          <MetaRow label="Institution" value={live.institution_name || cert.institution_name} />
          <MetaRow label="Year"        value={String(live.graduation_year || cert.graduation_year || "—")} />
          <MetaRow label="Grade"       value={live.grade           || cert.grade || "—"} />
          <MetaRow label="Issued by"   value={live.issued_by       || cert.issued_by_name || "—"} />
        </Section>

        {/* ── Certificate identity ── */}
        <Section title="Certificate Identity">
          <MetaRow label="Certificate ID" value={live.certificate_id || cert.certificate_id} mono />
          {live.cert_hash
            ? <MetaRow label="Data Hash" value={shortHash(live.cert_hash)} mono />
            : null}
        </Section>

        {/* ── Blockchain record ── */}
        <Section title="Blockchain Record">
          <MetaRow
            label="Transaction"
            value={txHash ? shortHash(txHash) : "Not yet anchored"}
            mono
          />
          <MetaRow label="Anchored" value={fmtDate(issuedAt)} />
          {live.ipfs_cid_json
            ? (
              <MetaRow
                label="IPFS Metadata"
                value={shortHash(live.ipfs_cid_json)}
                mono
                link={`${pinataBase}${live.ipfs_cid_json}`}
              />
            ) : null}
          {live.ipfs_cid_pdf
            ? (
              <MetaRow
                label="IPFS PDF"
                value={shortHash(live.ipfs_cid_pdf)}
                mono
                link={pdfUrl}
              />
            ) : null}
        </Section>

        {/* ── Actions ── */}
        {pdfUrl
          ? (
            <TouchableOpacity
              style={s.actionBtn}
              onPress={() => Linking.openURL(pdfUrl)}
              activeOpacity={0.85}
            >
              <Text style={s.actionBtnText}>📄  View PDF Certificate</Text>
            </TouchableOpacity>
          ) : null}

        {live.certificate_id
          ? (
            <TouchableOpacity
              style={[s.actionBtn, s.actionBtnGhost]}
              onPress={() => {
                const base = "http://localhost:3000";
                Linking.openURL(`${base}/verify/${live.certificate_id}`);
              }}
              activeOpacity={0.85}
            >
              <Text style={[s.actionBtnText, { color: T.navy }]}>🔗  Open Verification Link</Text>
            </TouchableOpacity>
          ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: T.cream },
  scroll: { paddingBottom: 48 },

  // Hero
  hero: {
    backgroundColor: T.navy,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 6,
  },
  heroEyebrow: { fontSize: 11, fontWeight: "600", color: "#B0C8DC", textTransform: "uppercase", letterSpacing: 0.8 },
  heroDegree:  { fontSize: 20, fontWeight: "700", color: "#fff", lineHeight: 27 },
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
  section: {
    backgroundColor: T.surface,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    overflow: "hidden",
    ...Platform.select({
      native: { shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 6, elevation: 1 },
      web:    { boxShadow: "0 1px 4px rgba(0,0,0,0.04)" },
    }),
  },
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
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  metaLabel: { fontSize: 12, color: T.faint, flex: 1 },
  metaValue: { fontSize: 12, color: T.navy, fontWeight: "600", flex: 2, textAlign: "right" },
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
  actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
