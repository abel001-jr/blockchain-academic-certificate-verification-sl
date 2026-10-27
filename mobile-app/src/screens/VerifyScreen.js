import { useToast } from "../components/ToastProvider";
import { parseVerificationInput } from "../utils/parseCertificateScan";
import { Camera, ImagePlus, Flashlight, FlashlightOff, ScanLine } from "lucide-react-native";
import FormField from "../components/FormField";
import { colors as T, createStyles, fonts, cardShadow } from "../theme";
import AnimatedButton from "../components/AnimatedButton";
/**
 * VerifyScreen — public certificate verification.
 *
 * Design mirrors the web VerifySection:
 *   • Dark navy header strip
 *   • Gold-bordered QR scanner frame with corner marks
 *   • Result card matches the web ResultPanel exactly
 */
import { verificationUrl } from "../config";
import { verificationFailure } from "../utils/verification";
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, scanFromURLAsync } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { verifyCertificate, validateEmployerAccess, verifyEmployerDocuments } from "../services/certificates";
import { parseCertificateIdFromScan } from "../utils/parseCertificateScan";


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

  if (outcome === "unavailable" || !["valid", "revoked", "not_found", "not_verified", "tampered"].includes(outcome)) {
    return <View style={[r.card, { backgroundColor: T.amberLight, borderColor: T.amberBdr }]}><Text style={[r.title, { color: T.amber }]}>Verification unavailable</Text><Text style={r.msg}>{result.message || result.error || "Please try again."}</Text></View>;
  }
  if (outcome === "tampered") {
    return <View style={[r.card, { backgroundColor: T.redLight, borderColor: T.redBdr }]}><Text style={[r.title, { color: T.red }]}>Integrity mismatch</Text><Text style={r.msg}>{result.message || "Credential contents do not match the blockchain commitment."}</Text></View>;
  }
  if (result.found === false || outcome === "not_found") {
    return (
      <View style={[r.card, { backgroundColor: T.redLight, borderColor: T.redBdr }]}>
        <Text style={r.icon}>✗</Text>
        <Text style={[r.title, { color: T.red }]}>Certificate not found</Text>
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
        <Text style={r.msg}>This credential has no issued record on the configured blockchain.</Text>
      </View>
    );
  }

  // valid
  return (
    <View style={[r.card, { backgroundColor: T.greenLight, borderColor: T.greenBdr }]}>
      {/* Outcome label */}
      <View style={r.outcomeBadge}>
        <Text style={r.outcomeBadgeText}>{result.verification_scope === "full" ? "Student-authorized verification" : "Public registry verified"}</Text>
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
          <Text style={r.rowValue}>{value}</Text>
        </View>
      ))}
      <Text style={r.msg}>The blockchain record and structured data match. See the individual document checks below.</Text>
    </View>
  );
}

// ── Scanner overlay ────────────────────────────────────────────────────────
const CORNER = 22;
const THICK  = 3;

function ScannerView({ onScan, onCancel, onError }) {
  const scanned = useRef(false);
  const [torch, setTorch] = useState(false);
  return (
    <View style={sc.root}>
      <CameraView
        onMountError={onError}
        style={StyleSheet.absoluteFillObject}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        enableTorch={torch}
        onBarcodeScanned={({ data }) => { if (!scanned.current && data) { scanned.current = true; onScan(data); } }}
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
      <Text style={sc.hint}>Point at an Intelligent Academic Credentialing QR code</Text>
      <TouchableOpacity style={[sc.cancelBtn, { bottom: "20%" }]} onPress={() => setTorch(value => !value)}><Text style={sc.cancelText}>{torch ? "Turn torch off" : "Turn torch on"}</Text></TouchableOpacity>
      <TouchableOpacity style={sc.cancelBtn} onPress={onCancel}>
        <Text style={sc.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────
export default function VerifyScreen({ route }) {
  const { showToast } = useToast();
  const verifyLock = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning,  setScanning]  = useState(false);
  const [query,     setQuery]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState(null);
  const [uploading, setUploading] = useState(false);
  const [employerMode, setEmployerMode] = useState(false);
  const [employerAccess, setEmployerAccess] = useState(null);
  const [employerFiles, setEmployerFiles] = useState({});
  const [employerError, setEmployerError] = useState("");

  const handledLink = useRef("");
  const linkedId = route?.params?.certificateId;
  const linkedCode = route?.params?.code;
  useEffect(() => {
    if (!linkedId || loading) return;
    const key = JSON.stringify([linkedId, linkedCode]);
    if (handledLink.current === key) return;
    handledLink.current = key;
    const payload = linkedCode
      ? `credence://verify/${encodeURIComponent(linkedId)}?code=${encodeURIComponent(linkedCode)}`
      : linkedId;
    verify(payload);
  }, [linkedId, linkedCode, loading]);

  function openEmployerVerification() {
    setEmployerMode(true); setEmployerAccess(null); setEmployerFiles({}); setEmployerError(""); setResult(null);
  }

  async function checkEmployerAccess(raw = query) {
    if (verifyLock.current) return;
    verifyLock.current = true; setLoading(true); setEmployerError(""); setEmployerAccess(null); setResult(null);
    try { setEmployerAccess(await validateEmployerAccess(raw)); }
    catch (error) { setEmployerError(error.response?.data?.detail || error.message || "Access validation failed."); }
    finally { verifyLock.current = false; setLoading(false); }
  }

  async function pickVerificationPdf(kind) {
    try {
      const picked = await DocumentPicker.getDocumentAsync({type: "application/pdf", copyToCacheDirectory: true, multiple: false});
      if (picked.canceled) return;
      const file = picked.assets[0];
      if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("Choose a nonempty PDF no larger than 20 MB.");
      setEmployerFiles(previous => ({...previous, [kind]: file}));
      setEmployerError(""); setResult(null);
    } catch (error) { setEmployerError(error.message || "Could not select this PDF."); }
  }

  async function submitEmployerDocuments() {
    if (verifyLock.current || !employerAccess || !employerFiles.certificate) return;
    verifyLock.current = true; setLoading(true); setEmployerError(""); setResult(null);
    try {
      const report = await verifyEmployerDocuments(employerAccess, employerFiles);
      setResult(report);
      if (report.access_consumed) setEmployerAccess(null);
    } catch (error) {
      setEmployerError(error.response?.data?.detail || error.message || "Verification failed. If the connection was lost after submission, ask the student for a new link if this one has been consumed.");
      if (error.response?.status === 403) setEmployerAccess(null);
    } finally { verifyLock.current = false; setLoading(false); }
  }

  async function verify(raw) {
    if (verifyLock.current) return;
    const input = parseVerificationInput(raw ?? query);
    if (input.code || employerMode) {
      setEmployerMode(true); setQuery(String(raw ?? query).trim());
      await checkEmployerAccess(raw ?? query); return;
    }
    const id = parseCertificateIdFromScan(raw ?? query);
    if (!id.trim()) {
      showToast("Enter a certificate ID or scan a QR code.", { title: "Credential ID required", tone: "warning" });
      return;
    }
    verifyLock.current = true;
    setQuery(String(raw ?? query).trim());
    setLoading(true); setResult(null);
    try {
      const data = await verifyCertificate(raw ?? query);
      setResult(data);
    } catch (err) {
      const failure = verificationFailure(err);
      setResult(failure);
      showToast(failure.error, { title: failure.requires_web ? "Security check required" : "Verification unavailable", tone: "warning" });
    } finally {
      verifyLock.current = false;
      setLoading(false);
    }
  }

  async function openScanner() {
    if (verifyLock.current || uploading) return;
    try {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert("Camera access required", "You can enter a certificate ID manually or allow camera access in device settings.", [{ text: "Enter ID", style: "cancel" }, ...(Platform.OS !== "web" ? [{ text: "Open settings", onPress: () => Linking.openSettings() }] : [])]);
        return;
      }
    }
    setScanning(true);
    } catch {
      showToast("Could not open the camera. Upload a QR image or enter the credential ID.", { title: "Camera unavailable" });
    }
  }

  async function pickImage() {
    if (verifyLock.current || uploading) return;
    try {
      setUploading(true);
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        showToast("Allow access to your photos in device settings, or enter the credential ID.", { title: "Photo access required", tone: "warning" });
        setUploading(false);
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
        base64: Platform.OS === "web",
      });

      if (pickerResult.canceled) {
        setUploading(false);
        return;
      }

      const uri = pickerResult.assets?.[0]?.uri;
      if (!uri) throw new Error("No image selected.");
      
      // Process QR code from image
      await processQRFromImage(uri);
      
    } catch (err) {
      console.error("Image picker error:", err);
      showToast("Failed to process the image. Try another image or use the camera scanner.", { title: "Image unavailable" });
    } finally {
      setUploading(false);
    }
  }

  async function processQRFromImage(uri) {
    try {
      if (Platform.OS === "web") {
        // Web: use jsQR with canvas
        const jsQR = require("jsqr");
        
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = uri;
        });
        
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        
        if (code?.data) {
          const certId = parseCertificateIdFromScan(code.data);
          setQuery(certId);
          await verify(code.data);
        } else {
          showToast("The selected image has no readable QR code. Try the camera or enter the credential ID.", { title: "No QR code found", tone: "warning" });
        }
      } else {
        const codes = await scanFromURLAsync(uri, ["qr"]);
        if (codes[0]?.data) await verify(codes[0].data);
        else showToast("Try another image or enter the certificate ID.", { title: "No QR code found", tone: "warning" });
      }
    } catch (error) {
      console.error("QR processing error:", error);
      Alert.alert(
        "Processing Failed",
        "Could not read QR code from image. Please use the camera scanner for best results.",
        [
          { text: "Open Camera", onPress: openScanner },
          { text: "Cancel", style: "cancel" }
        ]
      );
    }
  }

  if (scanning) {
    return (
      <ScannerView
        onError={() => { setScanning(false); showToast("Could not start the camera. Upload a QR image or enter the credential ID.", { title: "Camera unavailable" }); }}
        onScan={payload => { setScanning(false); verify(payload); }}
        onCancel={() => setScanning(false)}
      />
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      {/* Dark header strip — matches web VerifySection */}
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{gap: 6}}><Text style={{fontSize: 24, fontWeight: "700", color: T.navy}}>Verify a credential</Text><Text style={{fontSize: 13, lineHeight: 19, color: T.muted}}>Check a credential ID or student share link. Results open in a separate panel.</Text></View>
        <View style={s.verifyPanel}>
        <TouchableOpacity accessibilityRole="link" disabled={loading} onPress={() => openEmployerVerification()} style={{backgroundColor: T.navy, borderRadius: 12, padding: 14, gap: 5}}>
          <Text style={{fontSize: 14, fontWeight: "700", color: T.cream}}>Verifying as an employer? ?</Text>
          <Text style={{fontSize: 12, lineHeight: 18, color: T.cream}}>Compare original files or use a student share link for authorized access.</Text>
        </TouchableOpacity>
        {/* QR options - Camera and Upload */}
        <View style={s.qrOptions}>
          <TouchableOpacity 
            style={[s.qrBtn, s.qrBtnPrimary]} 
            onPress={openScanner}
            disabled={loading || uploading}
            activeOpacity={0.8}
          >
            <Camera size={24} color={T.cream} strokeWidth={1.6} />
            <Text style={s.qrBtnText}>Scan with Camera</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[s.qrBtn, s.qrBtnSecondary, uploading && s.qrBtnDisabled]} 
            onPress={pickImage}
            disabled={uploading || loading}
            activeOpacity={0.8}
          >
            {uploading ? (
              <ActivityIndicator color={T.navy} size="small" />
            ) : (
              <>
                <ImagePlus size={24} color={T.navy} strokeWidth={1.6} />
                <Text style={[s.qrBtnText, { color: T.navy }]}>Upload QR Image</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={s.divider}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>or enter manually</Text>
          <View style={s.dividerLine} />
        </View>

        {/* Input */}
        <FormField
          label="Credential ID or verification link"
          placeholder="e.g. CR-2026-CUSL-A3F92C01"
          placeholderTextColor={T.faint}
          value={query}
          onChangeText={value => {setQuery(value); setEmployerAccess(null); setEmployerFiles({}); setEmployerError("");}}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => verify(query)}
        />

        {/* Verify button */}
        <AnimatedButton label={loading ? "Checking?" : employerMode ? "Validate student access" : "Verify"} onPress={() => verify(query)} busy={loading} />

        </View>
        {employerMode && <View style={s.verifyPanel}>
          <Text style={s.panelTitle}>Employer document verification</Text>
          <Text style={{fontSize: 13, lineHeight: 19, color: T.muted}}>1. Paste the student?s full share link above and validate access. 2. Select PDFs. 3. Verify once to receive the report.</Text>
          {employerAccess && <>
            <Text style={{color: T.green, fontSize: 13}}>Access validated, not consumed. Expires {new Date(employerAccess.expires_at).toLocaleString()}.</Text>
            {[['certificate', 'Certificate PDF (required)'], ['transcript', 'Transcript PDF (optional)']].map(([kind, label]) => <View key={kind} style={{gap: 6}}>
              <AnimatedButton label={employerFiles[kind] ? `Replace ${label}` : `Choose ${label}`} disabled={loading} onPress={() => pickVerificationPdf(kind)} />
              {employerFiles[kind] && <Text style={{fontSize: 12, color: T.navy}}>{employerFiles[kind].name}</Text>}
              {kind === 'transcript' && employerFiles.transcript && <TouchableOpacity accessibilityRole="button" disabled={loading} onPress={() => setEmployerFiles(previous => ({...previous, transcript: null}))}><Text style={{color: T.red, padding: 8}}>Remove transcript</Text></TouchableOpacity>}
            </View>)}
            <Text style={{fontSize: 12, lineHeight: 18, color: T.muted}}>Original PDFs only, maximum 20 MB each. Scans or re-saved copies can have different hashes. An omitted transcript is not checked. Uploads are not saved on the server.</Text>
            <AnimatedButton label={loading ? "Verifying documents?" : "Verify documents"} disabled={loading || !employerFiles.certificate} onPress={submitEmployerDocuments} />
          </>}
          {employerError ? <Text accessibilityRole="alert" style={{color: T.red}}>{employerError}</Text> : null}
          <AnimatedButton label="Return to public verification" disabled={loading} onPress={() => {setEmployerMode(false); setEmployerAccess(null); setEmployerFiles({}); setQuery(""); setResult(null);}} />
        </View>}
      </ScrollView>
      <Modal visible={Boolean(result)} transparent animationType="fade" onRequestClose={() => setResult(null)}>
        <View style={{flex: 1, backgroundColor: "rgba(4,19,31,.7)", justifyContent: "center", padding: 16}}>
          <SafeAreaView accessibilityViewIsModal style={{maxHeight: "88%", width: "100%", maxWidth: 620, alignSelf: "center", backgroundColor: T.cream, borderRadius: 18, overflow: "hidden"}}>
            <View style={{flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderColor: T.border}}>
              <Text accessibilityRole="header" style={{fontSize: 18, fontWeight: "700", color: T.navy}}>Verification result</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close verification result" onPress={() => setResult(null)} style={{minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center"}}><Text style={{fontSize: 22, color: T.navy}}>?</Text></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{padding: 14, gap: 12}} keyboardShouldPersistTaps="handled">
        {/* Result */}
        {result?.access_consumed && <Text style={{fontWeight: "700", color: T.navy}}>Single-use access consumed. Keep this report open; another verification requires a new link.</Text>}
        {result && <ResultPanel result={result} />}
        {result?.checks && <View style={r.card}>
          <Text style={r.title}>Detailed verification checks</Text>
          {Object.entries(result.checks).map(([kind, check]) => <View key={kind} style={{paddingVertical: 12, borderBottomWidth: 1, borderColor: T.border, gap: 6}}>
            <Text style={{fontWeight: "700", color: T.navy}}>{({blockchain: "Blockchain record", data: "Credential data", certificate: "Certificate PDF", transcript: "Transcript PDF"})[kind] || kind}: {({matched: "Matches", mismatch: "Mismatch", not_checked: "Not checked", unavailable: "Unavailable", not_found: "Not found", not_applicable: "Not applicable"})[check.status] || check.status}</Text>
            {check.source && <Text style={{fontSize: 12, color: T.muted}}>Source: {check.source === "uploaded_file" ? "Your uploaded PDF" : "Stored document"}</Text>}
            {check.explanation && <Text style={{fontSize: 13, lineHeight: 19, color: T.muted}}>{check.explanation}</Text>}
            {check.status !== "matched" && check.next_step && <Text style={{fontSize: 12, lineHeight: 18, color: T.navy}}>Next step: {check.next_step}</Text>}
          </View>)}
          {result.recommendation && <Text style={r.msg}>{result.recommendation}</Text>}
          {result.verified_at && <Text style={r.msg}>Checked: {new Date(result.verified_at).toLocaleString()}</Text>}
          {result.blockchain?.block_number !== undefined && <Text style={r.msg}>Network {result.blockchain.chain_id} | Block {result.blockchain.block_number}</Text>}
        </View>}

        {result?.verification_outcome === "unavailable" && <AnimatedButton
          label="Continue verification on the web"
          onPress={async () => {
            const input = parseVerificationInput(query);
            const url = verificationUrl(input.certificateId) + (input.code ? `?code=${encodeURIComponent(input.code)}` : "");
            try { await Linking.openURL(url); } catch { showToast("Could not open the verification website. Try again.", { title: "Browser unavailable" }); }
          }}
        />}

              <AnimatedButton label="Employer verification ? more access" disabled={loading} onPress={() => openEmployerVerification()} />
              <AnimatedButton label="Close result" onPress={() => setResult(null)} />
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Main styles ────────────────────────────────────────────────────────────
const s = createStyles({
  verifyPanel: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 12, padding: 20, gap: 16 },
  panelTitle: { color: T.navy, fontSize: 18, fontWeight: "600" },
  safe:   { flex: 1, backgroundColor: T.cream },

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
  scroll: { backgroundColor: T.cream, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 48, flexGrow: 1, gap: 20, width: "100%", maxWidth: 760, alignSelf: "center" },

  // QR options container
  qrOptions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

  // QR buttons
  qrBtn: { flex: 1, minWidth: 110, alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, padding: 12, borderWidth: 1, minHeight: 68 },
  qrBtnPrimary: { backgroundColor: T.navy, borderColor: T.navy },
  qrBtnSecondary: { backgroundColor: T.input, borderColor: T.blueLine },
  qrBtnDisabled: {
    opacity: 0.6,
  },
  qrBtnIcon: { fontSize: 28 },
  qrBtnText: { 
    color: "#fff", 
    fontWeight: "700", 
    fontSize: 13,
    textAlign: "center",
  },

  // Divider
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 2 },
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
const r = createStyles({
  card: { borderRadius: 12, borderWidth: 1, padding: 20, gap: 10 },
  icon:  { fontSize: 28, marginBottom: 4 },
  title: { fontSize: 18, fontWeight: "600", marginBottom: 6 },
  msg:   { fontSize: 13, color: T.muted, textAlign: "center", lineHeight: 19 },
  outcomeBadge: { alignSelf: "flex-start", backgroundColor: T.green, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10 },
  outcomeBadgeText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  row: { gap: 8, width: "100%", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border },
  rowLabel: { fontSize: 11, color: T.muted, fontWeight: "500" },
  rowValue: { fontSize: 14, color: T.navy, fontWeight: "600", lineHeight: 22 },
  checks:   { alignSelf: "flex-start", marginTop: 10, gap: 4 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  checkMark:{ color: T.gold, fontWeight: "800", fontSize: 13 },
  checkText:{ color: T.muted, fontSize: 12 },
});

// ── Scanner styles ─────────────────────────────────────────────────────────
const sc = createStyles({
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
