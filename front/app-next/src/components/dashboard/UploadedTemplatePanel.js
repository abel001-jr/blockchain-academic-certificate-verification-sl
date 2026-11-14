"use client";
import { ActionButton } from "@/components/ui/AnimatedControls";
import NavigationButton from "@/components/ui/NavigationButton";


import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import TemplateCanvas from "./TemplateCanvas";
import BrandingConsentDialog from "./BrandingConsentDialog";
import BrandingStartGuide from "./BrandingStartGuide";
import { RotateCcw, RefreshCw, CheckCircle2, Save, X, FileUp, ScanText, Sparkles } from "lucide-react";
import { addSuggestedFields, suggestionIsAdded } from "@/lib/templateSuggestions.mjs";
import { nextFieldArea } from "@/lib/templateGeometry.mjs";
import styles from "./UploadedTemplatePanel.module.css";
import { TEMPLATE_FONT_GROUPS, templateFontStyle, templateFontGroup, changeTemplateFontFamily } from "@/lib/templateFonts";
import { FIELD_GROUPS, fieldLabel } from "./templateFieldGroups";
import TemplatePreviewChecks from "./TemplatePreviewChecks";

const BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";
const LIMITS = {student_name: 200, degree_title: 255, institution_name: 255, department: 255, grade: 50, certificate_id: 50, static_text: 1000};
const REQUIRED_TEMPLATE_FIELDS = ["student_name", "degree_title", "graduation_year", "registrar_signature", "vc_signature", "chancellor_signature"];
const label = fieldLabel;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("access_token")}` });

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, { ...options, headers: { ...headers(), ...options.headers } });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.detail || "The template request failed.");
    if (response.status === 429) {
      const seconds = Number(response.headers.get("Retry-After"));
      error.retryAfter = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60;
      error.message = `AI request limit reached. Try again in ${error.retryAfter} seconds.`;
    }
    throw error;
  }
  return response;
}

export default function UploadedTemplatePanel({ editorRevisionId = null }) {
  const router = useRouter();
  const [revisions, setRevisions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [guideSeenKey, setGuideSeenKey] = useState("credence:branding-guide-seen");
  const [revision, setRevision] = useState(null);
  const [fields, setFieldsState] = useState([]);
  const fieldsRef = useRef([]);
  const historyRef = useRef({ past: [], future: [] });
  const [historyStatus, setHistoryStatus] = useState({ canUndo: false, canRedo: false });
  const contentRef = useRef(null);
  const wordingRef = useRef(null);
  const versionNameRef = useRef(null);
  const editorRef = useRef(null);
  const setFields = useCallback(next => {
    const value = typeof next === "function" ? next(fieldsRef.current) : next;
    if (JSON.stringify(value) === JSON.stringify(fieldsRef.current)) return;
    historyRef.current.past = [...historyRef.current.past.slice(-49), fieldsRef.current];
    historyRef.current.future = [];
    setHistoryStatus({canUndo: true, canRedo: false});
    fieldsRef.current = value;
    setFieldsState(value);
  }, []);
  const [selected, setSelected] = useState(0);
  const [inspectorTab, setInspectorTab] = useState("details");
  const [workspaceMode, setWorkspaceMode] = useState("edit");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageUrl, setPageUrl] = useState("");
  const [sampleUrl, setSampleUrl] = useState("");
  const [master, setMaster] = useState(null);
  const [uploadIntent, setUploadIntent] = useState(null);
  const [uploadDesignMode, setUploadDesignMode] = useState("auto");
  const [designMode, setDesignMode] = useState("existing");
  const [certificateType, setCertificateType] = useState("bsc");
  const [name, setName] = useState("Institutional certificate");
  const [rotation, setRotation] = useState(0);
  const [logo, setLogo] = useState(null);
  const [seal, setSeal] = useState(null);
  const [assetProposals, setAssetProposals] = useState([]);
  const [suggestedAssets, setSuggestedAssets] = useState({});
  const [assetSuggesting, setAssetSuggesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [suggestionMode, setSuggestionMode] = useState(null);
  const [aiRetrySeconds, setAiRetrySeconds] = useState(0);
  useEffect(() => {
    if (!aiRetrySeconds) return;
    const timer = window.setTimeout(() => setAiRetrySeconds(seconds => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [aiRetrySeconds]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(null);
  const [uploadKey, setUploadKey] = useState(0);
  const [suggestions, setSuggestions] = useState(null);
  const [editing, setEditing] = useState(Boolean(editorRevisionId));
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const unsavedChanges = JSON.stringify(fields) !== JSON.stringify(revision?.fields || []) || Boolean(logo || seal) || Boolean(revision && certificateType !== (revision.analysis?.certificate_type || "bsc")) || Boolean(revision && designMode !== (revision.analysis?.design_mode || "existing"));
  const revisionId = revision?.id;
  useEffect(() => {
    if (!editing || !revisionId) return;
    const frame = requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({behavior: "smooth", block: "start"});
      editorRef.current?.focus({preventScroll: true});
    });
    return () => cancelAnimationFrame(frame);
  }, [editing, revisionId]);
  const locked = Boolean(revision?.approved_at);
  const templateLimitReached = revisions.length >= 2;
  const canReplace = Boolean(revision?.can_replace);
  const approvedRevisions = revisions.filter(item => item.approved_at);
  const enableRevision = (revision?.approved_at && revision) || approvedRevisions[0];

  const choose = useCallback((item, brandingActive = false) => {
    setEditing(Boolean(editorRevisionId && item && !item.approved_at && !brandingActive)); setPreviewError(""); setPreviewLoading(false);
    setInspectorTab("details"); setWorkspaceMode("edit"); setSuggestionsOpen(false);
    setSuggestions(item?.analysis?.suggestions || null);
    setDesignMode(item?.analysis?.design_mode || "existing");
    setCertificateType(item?.analysis?.certificate_type || "bsc");
    setPageUrl(""); setRevision(item || null); fieldsRef.current = item?.fields || []; historyRef.current = {past: [], future: []}; setHistoryStatus({canUndo: false, canRedo: false}); setFieldsState(fieldsRef.current); setSelected(0); setPage(1);
    setLogo(null); setSeal(null); setAssetProposals([]); setSuggestedAssets({}); setSampleUrl(""); setMessage("");
  }, [editorRevisionId]);

  const load = useCallback(async () => {
    try {
      const data = await (await request("/certificate-templates/")).json();
      setRevisions(data.revisions); setActiveId(data.active_id);
      setGuideSeenKey(`credence:branding-guide-seen:${data.institution_id}`);
      const requestedId = editorRevisionId || new URLSearchParams(window.location.search).get("template");
      const requested = data.revisions.find(item => item.id === requestedId);
      if (requested?.can_replace && new URLSearchParams(window.location.search).get("replace") === "true") setUploadIntent("replace");
      if (editorRevisionId && !requested) { setError("This draft is not available to your institution."); choose(null); }
      else choose(requested || data.revisions.find(item => !item.approved_at && item.fields?.length) || data.revisions.find(item => !item.approved_at) || data.revisions.find(item => item.id === data.active_id) || null, Boolean(data.active_id));
    } catch (err) { setError(err.message); } finally { setTemplatesLoading(false); }
  }, [choose, editorRevisionId]);

  useEffect(() => { Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    let alive = true, url;
    if (revision?.id) request(`/certificate-templates/${revision.id}/page/?page=${page}`)
      .then(response => response.blob()).then(blob => {
        url = URL.createObjectURL(blob);
        if (alive) setPageUrl(url); else URL.revokeObjectURL(url);
      }).catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [revision?.id, revision?.analysis, page]);
  useEffect(() => () => { if (sampleUrl) URL.revokeObjectURL(sampleUrl); }, [sampleUrl]);
  useEffect(() => {
    if (!revision?.id) return;
    let alive = true, url;
    Promise.resolve().then(() => { if (alive) { setPreviewLoading(true); setPreviewError(""); } });
    request(`/certificate-templates/${revision.id}/sample/`).then(response => response.blob()).then(blob => {
      url = URL.createObjectURL(blob);
      if (alive) setSampleUrl(url); else URL.revokeObjectURL(url);
    }).catch(err => { if (alive) setPreviewError(err.message); }).finally(() => { if (alive) setPreviewLoading(false); });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [revision]);

  async function upload(event, confirmed = false) {
    event?.preventDefault();
    const replacing = uploadIntent === "replace";
    if (replacing && canReplace && !confirmed) {
      setConsent({title: "Replace selected draft?", description: "Replace this design and remove its saved fields, logo and seal. This cannot be undone.", label: "Replace draft", danger: true, action: () => upload(null, true)});
      return;
    }
    if ((replacing && !canReplace) || (!replacing && templateLimitReached)) { setError("Select an unused draft to replace. Approved templates and templates used by credentials are protected."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const fd = new FormData(); fd.append("master", master); fd.append("name", name); fd.append("rotation", rotation); fd.append("design_mode", uploadDesignMode);
      if (replacing) fd.append("replace_id", revision.id);
      const item = await (await request("/certificate-templates/", { method: "POST", body: fd })).json();
      setRevisions(previous => previous.some(r => r.id === item.id) ? previous.map(r => r.id === item.id ? item : r) : [item, ...previous]); choose(item);
      setMessage(replacing ? "Draft replaced. Add details to your new design." : "Design uploaded. Add your certificate details.");
      router.push(`/dashboard/settings/certificate-branding/${item.id}`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function save(approve = false, extractAsset = null) {
    if (activeId || locked) { setError("Disable branding using Edit template before changing this version."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const fd = new FormData(); fd.append("fields", JSON.stringify(fields)); fd.append("design_mode", designMode); fd.append("certificate_type", certificateType);
      if (logo) fd.append("logo", logo); if (seal) fd.append("seal", seal);
      if (approve) fd.append("approve", "true");
      if (extractAsset) fd.append("extract_asset", JSON.stringify(extractAsset));
      const item = await (await request(`/certificate-templates/${revision.id}/`, { method: "PATCH", body: fd })).json();
      setRevision(item); setRevisions(previous => previous.map(r => r.id === item.id ? item : r));
      setLogo(null); setSeal(null);
      if (approve) setActiveId(item.id);
      setSampleUrl("");
      setEditing(Boolean(editorRevisionId && !approve));
      if (!approve) { setWorkspaceMode("preview"); setInspectorTab("review"); }
      setMessage(approve ? "Template enabled for new certificates." : "Draft saved. Review the preview.");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  function edit(key, value) {
    setSampleUrl("");
    setFields(previous => previous.map((field, index) => index === selected ? { ...field, [key]: value } : field));
  }

  async function detectFields(useAI = false, confirmed = false, fullDesign = false) {
    if (busy || locked || activeId || (useAI && aiRetrySeconds)) return;
    if (useAI && !confirmed) {
      setConsent({title: fullDesign ? "Create a certificate layout?" : "Suggest field positions?", description: fullDesign ? "AI will suggest wording and a layout for this design. You choose what to add." : "AI will suggest positions for your certificate details. You choose what to add.", note: "Shares this page, extracted text and uploaded artwork with Groq or Gemini.", label: fullDesign ? "Create layout" : "Get suggestions", action: () => detectFields(true, true, fullDesign)});
      return;
    }
    setBusy(true); setSuggestionMode(useAI ? "ai" : "rules"); setError(""); setMessage("");
    try {
      let body;
      {
        body = new FormData();
        body.append("visual", String(useAI));
        body.append("certificate_type", certificateType);
        if (fullDesign) body.append("full_design", "true");
        body.append("page", String(page));
        body.append("fields", JSON.stringify(fields));
        if (logo) body.append("logo", logo);
        if (seal) body.append("seal", seal);
      }
      const result = await (await request(`/certificate-templates/${revision.id}/${useAI ? "ai-suggestions" : "suggestions"}/`, {method: "POST", ...(body ? {body} : {})})).json();
      setSuggestions(result); setSuggestionsOpen(true); setInspectorTab("details");
      setMessage(useAI && result.ai_status === "unavailable" ? "AI is unavailable. Showing local suggestions instead." : result.items.length ? `${result.items.length} suggestions found. Choose which to add.` : "No suggestions found. Use Add field to place details manually.");
    } catch (err) { setError(err.message); if (useAI && err.retryAfter) setAiRetrySeconds(err.retryAfter); } finally { setBusy(false); setSuggestionMode(null); }
  }
  function requestAssetSize(keys) {
    const resuggest = keys.some(key => suggestedAssets[key]);
    const actionLabel = `${resuggest ? "Resuggest" : "Suggest"}${keys.length === 2 ? " both" : " size"}`;
    setConsent({title: `${actionLabel}?`, description: "AI will suggest a size and position. Review before applying.", note: "Only image and page dimensions are shared with Groq or Gemini.", label: actionLabel, action: async () => {
      setBusy(true); setAssetSuggesting(true); setError("");
      setAssetProposals(previous => previous.filter(item => !keys.includes(item.field.key)));
      let occupied = fieldsRef.current;
      try {
        for (const key of keys) {
          const body = new FormData();
          body.append("key", key); body.append("page", String(page)); body.append("fields", JSON.stringify(occupied));
          const image = key === "logo" ? logo : seal;
          if (image) body.append("image", image);
          const proposal = await (await request(`/certificate-templates/${revision.id}/asset-suggestions/`, {method: "POST", body})).json();
          setAssetProposals(previous => [...previous.filter(item => item.field.key !== key), proposal]);
          setSuggestedAssets(previous => ({...previous, [key]: true}));
          if (!proposal.placement_required) occupied = [...occupied.filter(item => !(item.key === key && item.page === proposal.field.page)), proposal.field];
        }
      } catch (err) { setError(err.message); if (err.retryAfter) setAiRetrySeconds(err.retryAfter); }
      finally { setBusy(false); setAssetSuggesting(false); }
    }});
  }
  function applyAssetSize(proposal) {
    if (!proposal || locked || busy) return;
    const candidate = proposal.field;
    const index = fields.findIndex(item => item.key === candidate.key && item.page === candidate.page);
    if (index < 0 && fields.length >= 60) { setError("Configure at most 60 labelled fields."); return; }
    if (!proposal.placement_required && fields.some((item, i) => i !== index && item.page === candidate.page && item.x < candidate.x + candidate.width && item.x + item.width > candidate.x && item.y < candidate.y + candidate.height && item.y + item.height > candidate.y)) {
      setError("This image area overlaps a detail. Resuggest its position."); return;
    }
    setFields(index < 0 ? [...fields, candidate] : fields.map((item, i) => i === index ? {...item, ...candidate} : item));
    setSelected(index < 0 ? fields.length : index); setPage(candidate.page); setSampleUrl("");
    setAssetProposals(previous => previous.filter(item => item !== proposal));
    if (proposal.placement_required) { setInspectorTab("details"); setWorkspaceMode("edit"); setSuggestionsOpen(false); }
    setMessage(proposal.placement_required ? "Move the selected image area to your preferred position, then save." : "Image resized. Check its position, then save.");
  }
  function addAllSuggestions() {
    if (busy || locked || activeId) return;
    const result = addSuggestedFields(fields, suggestions?.items || []);
    if (result.added) {
      setSelected(fields.length); setPage(result.fields[fields.length].page);
      setFields(result.fields); setSampleUrl("");
    }
    setError("");
    setMessage(`${result.added} fields added.${result.skipped ? ` ${result.skipped} could not be added. Check for overlaps or the 60-field limit.` : " Check their positions, then save."}`);
  }
  function addSuggestion(item) {
    if (busy || locked || activeId || suggestionIsAdded(fields, item)) return;
    const next = item.field;
    if (fields.length >= 60) { setError("Configure at most 60 labelled fields."); return; }
    if (fields.some(f => f.page === next.page && f.x < next.x + next.width && f.x + f.width > next.x && f.y < next.y + next.height && f.y + f.height > next.y)) {
      setError("This suggestion overlaps an existing field. Move or remove that field before adding the suggestion."); return;
    }
    setSelected(fields.length); setPage(next.page); setFields([...fields, {...next}]); setSampleUrl("");
    setMessage("Field added. Check its position, then save.");
  }
  function performRemoveField(index) {
    if (locked || busy) return;
    const removed = fieldsRef.current[index];
    setFields(previous => previous.filter((_, i) => i !== index));
    setMessage(`${label(removed.key)} removed. Use Undo to restore it.`);
    setSelected(previous => Math.max(0, Math.min(previous > index ? previous - 1 : previous, fieldsRef.current.length - 1)));
    setSampleUrl("");
  }
  function editField(index) {
    setInspectorTab("details"); setWorkspaceMode("edit"); setSuggestionsOpen(false);
    setSelected(index);
    setTimeout(() => {
      const settings = contentRef.current?.closest("details");
      if (settings) settings.open = true;
      contentRef.current?.scrollIntoView({block: "nearest", behavior: "smooth"}); (fieldsRef.current[index]?.key === "static_text" ? wordingRef.current : contentRef.current)?.focus();
    }, 0);
  }
  function addDetail(key = "student_name") {
    if (locked || busy || fieldsRef.current.length >= 60) return;
    setSelected(fieldsRef.current.length); setInspectorTab("details"); setWorkspaceMode("edit");
    setFields([...fieldsRef.current, {key, ...nextFieldArea(fieldsRef.current, page), font: "Times-Roman", font_size: 18, align: "center", clear: false, ...(key === "static_text" ? {text: "", required: false} : {})}]);
    setSampleUrl("");
  }
  function editDetectedText(item) {
    if (locked || busy || fieldsRef.current.length >= 60) return;
    const info = revision.analysis.pages[page - 1];
    const [x0, y0, x1, y1] = item.bbox;
    const x = Math.max(0, x0 / info.width), y = Math.max(0, y0 / info.height);
    const width = Math.min(1 - x, (x1 - x0) / info.width);
    const height = Math.min(1 - y, (y1 - y0) / info.height);
    if (width <= 0 || height <= 0) return;
    const existing = fieldsRef.current.findIndex(f => f.key === "static_text" && f.page === page && Math.abs(f.x - x) < .001 && Math.abs(f.y - y) < .001);
    if (existing >= 0) { editField(existing); return; }
    const index = fieldsRef.current.length;
    setFields([...fieldsRef.current, {key: "static_text", page, x, y, width, height,
      text: item.text.slice(0, 1000), font: /helvetica|arial/i.test(item.font || "") ? (/bold/i.test(item.font) ? "Helvetica-Bold" : "Helvetica") : /bold/i.test(item.font || "") ? "Times-Bold" : /italic/i.test(item.font || "") ? "Times-Italic" : "Times-Roman",
      color: item.color || "#000000", font_size: Math.max(6, Math.min(72, item.font_size || height * info.height / 1.2)),
      align: "left", clear: true}]);
    setSampleUrl("");
    editField(index);
  }
  function undo() {
    const previous = historyRef.current.past.pop();
    if (!previous) return;
    historyRef.current.future.push(fieldsRef.current);
    setHistoryStatus({canUndo: historyRef.current.past.length > 0, canRedo: true});
    fieldsRef.current = previous; setFieldsState(previous); setSelected(i => Math.max(0, Math.min(i, previous.length - 1))); setSampleUrl("");
  }
  function redo() {
    const next = historyRef.current.future.pop();
    if (!next) return;
    historyRef.current.past.push(fieldsRef.current);
    setHistoryStatus({canUndo: true, canRedo: historyRef.current.future.length > 0});
    fieldsRef.current = next; setFieldsState(next); setSelected(i => Math.max(0, Math.min(i, next.length - 1))); setSampleUrl("");
  }
  function restartConfiguration() {
    if (locked || busy) return;
    setFields([]);
    setSelected(0);
    setLogo(null);
    setSeal(null);
    setSampleUrl("");
    setError("");
    setMessage("Fields cleared. Save to keep this change, or Undo to restore them.");
  }
  async function restartBranding() {
    if (locked || busy) return;
    setBusy(true); setError("");
    try {
      const fd = new FormData();
      fd.append("fields", "[]"); fd.append("clear_assets", "true");
      const item = await (await request(`/certificate-templates/${revision.id}/`, {method: "PATCH", body: fd})).json();
      setRevisions(previous => previous.map(r => r.id === item.id ? item : r));
      choose(item);
      setMessage("Draft reset. Your uploaded design and officer signatures are kept.");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  function removeField(index) {
    if (locked || busy) return;
    setConsent({title: "Remove labelled field?", description: `Remove ${label(fields[index].key)} from this draft's configuration? You can undo this change before switching templates.`, label: "Remove field", danger: true, action: () => performRemoveField(index)});
  }
  function requestConfigurationReset() {
    setConsent({title: "Clear field configuration?", description: "Clear all currently labelled fields and unsaved asset choices. The uploaded master and saved crest/seal remain. Save the draft to persist this change; Undo can restore fields.", label: "Clear fields", action: restartConfiguration});
  }
  function requestBrandingReset() {
    setConsent({title: "Reset this draft's branding?", description: "Clear and save this draft's fields, crest and seal. Its uploaded master remains. This saved reset cannot be undone.", label: "Reset draft branding", danger: true, action: restartBranding});
  }
  function requestFullRestart() {
    const drafts = revisions.filter(item => item.can_replace);
    setConsent({title: "Start branding from scratch?", description: `Remove ${drafts.length} unused branding draft${drafts.length === 1 ? "" : "s"}, including uploaded masters, labelled fields, crest and seal assets, and discard unsaved changes. Return to initial master upload. Approved templates, issued credentials and officer signature configuration remain protected. Removed drafts cannot be recovered.`, label: "Start from scratch", danger: true, action: async () => {
      setBusy(true); setError("");
      try {
        if (drafts.length) await request("/certificate-templates/restart/", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({draft_ids: drafts.map(item => item.id)})});
        setRevisions(previous => previous.filter(item => !drafts.some(d => d.id === item.id)));
        choose(null); setMaster(null); setName("Institutional certificate"); setRotation(0); setUploadKey(value => value + 1);
        setMessage("Drafts removed. Upload a design to start again.");
      } catch (err) { setError(err.message); } finally { setBusy(false); }
    }});
  }
  function requestApproval() {
    setConsent({title: "Enable this template?", description: "Use this template for new certificates. Check the preview before continuing.", label: "Enable template", action: () => save(true)});
  }
  function requestEditTemplate() {
    setConsent({title: "Edit this template?", description: "The template will be paused while you edit. Review and enable it again when finished.", label: "Disable & edit", action: async () => {
      setBusy(true); setError("");
      try {
        const item = await (await request(`/certificate-templates/${revision.id}/edit/`, {method: "POST"})).json();
        setActiveId(null);
        setRevisions(previous => previous.map(saved => saved.id === item.id ? item : saved));
        choose(item);
        setEditing(true);
        router.push(`/dashboard/settings/certificate-branding/${item.id}`);
      } catch (err) { setError(err.message); } finally { setBusy(false); }
    }});
  }
  async function confirmAction() {
    const action = consent?.action;
    setConsent(null);
    if (action) await action();
  }

  function requestDisableBranding() {
    setConsent({title: "Disable certificate branding?", description: "Stop using the active institutional template for new issuance. Saved templates and existing credentials remain. The upload workflow will become available again.", label: "Disable branding", danger: true, action: async () => {
      setBusy(true); setError("");
      try {
        const data = await (await request("/certificate-templates/disable/", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({confirm: true})})).json();
        setRevisions(previous => previous.map(item => ({...item, resumeBranding: item.id === activeId})));
        setActiveId(null);
        setMessage(data.detail);
      } catch (err) { setError(err.message); } finally { setBusy(false); }
    }});
  }
  async function enableBranding() {
    const target = approvedRevisions.find(item => item.resumeBranding) || enableRevision;
    if (!target) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await (await request("/certificate-templates/enable/", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({revision_id: target.id})})).json();
      setActiveId(data.active_id); setMessage(data.detail);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  useEffect(() => {
    if (!message && !error) return;
    const timer = setTimeout(() => { setMessage(""); setError(""); }, 15000);
    return () => clearTimeout(timer);
  }, [message, error]);
  const field = fields[selected];
  const availableAssets = ["logo", "seal"].filter(key => key === "logo" ? logo || revision?.has_logo : seal || revision?.has_seal);
  const resuggestAssets = availableAssets.some(key => suggestedAssets[key]);
  const missingRequiredFields = REQUIRED_TEMPLATE_FIELDS.filter(key => !fields.some(item => item.key === key));
  return (
    <div className={`${styles.panel} flex flex-col gap-5`}>
      <div className={styles.managementHeading}><div className={styles.pageHeading}><span className={styles.eyebrow}>INSTITUTION / CERTIFICATE BRANDING</span><h3 className="text-xl font-semibold text-[#08283F]">{editorRevisionId ? "Certificate template editor" : "Certificate branding"}</h3>
        <p className="mt-2 text-sm text-[#4A5A68]">{editorRevisionId ? "Place details on your certificate, preview it, then enable it for use." : "Manage your designs and the template used for new certificates."}</p>

      </div>{!editorRevisionId && <button type="button" disabled={busy || templatesLoading || templateLimitReached} title={templateLimitReached ? "Both slots are in use. Replace an unused draft." : undefined} onClick={() => { setUploadIntent("new"); setMaster(null); setName("Institutional certificate"); setRotation(0); setUploadDesignMode("auto"); }} className="cred-btn cred-btn-primary">+ New template</button>}</div>

      <BrandingConsentDialog consent={consent} onCancel={() => setConsent(null)} onConfirm={confirmAction} />

      {(message || error) && <div role={error ? "alert" : "status"} style={{position: "fixed", top: 20, right: 24, zIndex: 10000, width: "min(520px, calc(100vw - 32px))", padding: 16, borderRadius: 12, boxShadow: "0 8px 30px rgba(8,40,63,.18)", border: `1px solid ${error ? "#EDB9B4" : "#B6D9C4"}`, background: error ? "#FFF1EF" : "#EFFAF3", color: error ? "#92251E" : "#245C3E"}} className="flex items-start gap-3 text-sm">
        {!error && <CheckCircle2 size={20} className="shrink-0" />}<p className="flex-1">{error || message}</p><button type="button" aria-label="Dismiss message" onClick={() => {setMessage(""); setError("");}}><X size={18} /></button>
      </div>}
      {!editorRevisionId && <>
      <div className={styles.activationBanner} role="status"><div><strong>{activeId ? `Enabled: ${revisions.find(item => item.id === activeId)?.name || "Certificate template"}` : "No template is enabled"}</strong><p>{activeId ? "Used for new certificates." : "Prepare and approve a template before using it for new certificates."}</p></div><div className={styles.detailActions}>{activeId ? <button type="button" disabled={busy} onClick={requestDisableBranding} className="cred-btn cred-btn-secondary">Pause template</button> : enableRevision ? <button type="button" disabled={busy} onClick={enableBranding} className="cred-btn cred-btn-secondary">Enable approved template</button> : null}<BrandingStartGuide seenKey={guideSeenKey} initiallyOpen={false} onContinue={() => versionNameRef.current?.focus()} /></div></div>
      {uploadIntent && <>
      <div className={styles.steps} aria-label="Certificate setup"><span aria-current="step">1. Upload design</span><span>2. Prepare certificate</span><span>3. Review &amp; enable</span></div>
      <form key={`branding-upload-${uploadKey}`} onSubmit={upload} className={styles.uploadCard}>
        <div className={styles.managementHeading}><div><h4>{uploadIntent === "replace" ? "Replace design" : "Upload certificate design"}</h4><p>Use a blank copy without student details or signatures.</p></div><button type="button" disabled={busy} onClick={() => setUploadIntent(null)} aria-label="Cancel upload">Cancel</button></div>
        <label className={styles.uploadFile}>
          <span className={styles.uploadTarget}>
            <FileUp size={32} aria-hidden="true" />
            <span className="min-w-0"><strong>{master ? master.name : "Choose certificate file"}</strong><span>{master ? "Click to choose a different file" : "PDF, JPG or PNG ? up to 20 MB"}</span></span>
            <input aria-label="Choose certificate file" required disabled={busy} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setMaster(e.target.files?.[0] || null)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait" />
          </span>
        </label>
        <label className={styles.uploadName}>Design contents<select disabled={busy} value={uploadDesignMode} onChange={e => setUploadDesignMode(e.target.value)}><option value="auto">Detect automatically</option><option value="blank">Blank background ? add wording and details</option><option value="existing">Wording already included ? add details</option></select></label>
        <label className={styles.uploadName}>Template name<input ref={versionNameRef} required disabled={busy} maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label>
        <details className={styles.advanced}><summary>Rotate design</summary><div><label>Rotation<select disabled={busy} value={rotation} onChange={e => setRotation(Number(e.target.value))}>{[0, 90, 180, 270].map(n => <option key={n} value={n}>{n === 0 ? "Keep original orientation" : `${n}? clockwise`}</option>)}</select></label></div></details>
        {uploadIntent === "replace" && <p role="status" className="text-sm text-amber-800">{canReplace ? "Replacing this draft clears its fields, logo and seal." : "This template is protected. Select an unused draft to replace."}</p>}
        <div className={styles.uploadFooter}><span>{master ? "Ready to prepare your certificate." : "Choose a file to continue."}</span><ActionButton type="submit" disabled={busy || !master || (uploadIntent === "replace" ? !canReplace : templateLimitReached)} className="cred-btn cred-btn-primary">{busy ? "Uploading..." : uploadIntent === "replace" ? "Replace & prepare" : "Continue to prepare"}</ActionButton></div>
      </form>
      </>}
      {templatesLoading && <p role="status">Loading templates...</p>}
      {!templatesLoading && revisions.length === 0 && !uploadIntent && <div className={styles.emptyTemplates}><h4>No certificate designs yet</h4><p>Upload your institution?s design to prepare your first template.</p><button type="button" onClick={() => setUploadIntent("new")} className="cred-btn cred-btn-primary">Upload design</button></div>}
      </>}
      {revision && <>
        {!editing && <section className={styles.templateManager}>
          <nav className={styles.versionList} aria-label="Template versions"><h4>Template versions</h4><p>{revisions.length} of 2 slots used</p>{revisions.map(item => <button key={item.id} type="button" disabled={busy} aria-pressed={revision.id === item.id} onClick={() => { setUploadIntent(null); choose(item); }}><strong>{item.name}</strong><span className={styles.versionStatus}>{item.id === activeId ? "Enabled" : item.approved_at ? "Approved" : "Draft"}</span><small>{item.fields.length} configured details</small></button>)}{templateLimitReached && <p>Both slots are in use. Replace an unused draft to upload a different design.</p>}</nav>
          <div className={styles.managedTemplate}>
            <header className={styles.managedHeader}><div><h4>{revision.name}</h4><p>{revision.id === activeId ? "Enabled" : locked ? "Approved" : "Saved draft"} ? {revision.fields.length} configured details</p></div><button type="button" disabled={busy || !canReplace} title={!canReplace ? "Approved templates and templates used by credentials are protected." : undefined} onClick={() => { setUploadIntent("replace"); setMaster(null); setName(revision.name); setRotation(0); setUploadDesignMode("auto"); window.scrollTo({top: 0, behavior: "smooth"}); }} className="cred-btn cred-btn-secondary">Replace design</button></header>
            <div className={styles.managerPreview}>{revision.fields.length === 0 ? pageUrl ? <Image src={pageUrl} alt="Uploaded certificate design" unoptimized width={revision.analysis.pages[0]?.width || 1000} height={revision.analysis.pages[0]?.height || 707} /> : <p role="status">Loading design...</p> : previewLoading ? <p role="status">Loading preview...</p> : previewError ? <p role="alert">Preview unavailable. Open Prepare template to correct the layout.</p> : sampleUrl ? <iframe title="Saved template preview" src={sampleUrl} /> : <p>Prepare this template to generate a preview.</p>}</div>
            <div className={styles.previewCaption}><span>{revision.fields.length ? "Saved sample ? unsigned review copy" : "Uploaded design ? no details placed"}</span>{sampleUrl && revision.fields.length > 0 && <a href={sampleUrl} target="_blank" rel="noopener noreferrer">Expand preview ?</a>}</div>
            <footer className={styles.managerFooter}><div><strong>{missingRequiredFields.length ? "This draft needs certificate details" : locked ? "This template is approved" : "Review this template before enabling"}</strong><p>{missingRequiredFields.length ? `${missingRequiredFields.length} required details need placement.` : "Check the saved preview, wording and artwork."}</p></div><div className={styles.detailActions}><button type="button" disabled={busy} onClick={() => { if (activeId || locked) { requestEditTemplate(); return; } setEditing(true); router.push(`/dashboard/settings/certificate-branding/${revision.id}`); }} className="cred-btn cred-btn-primary">{locked ? "Edit template" : missingRequiredFields.length ? "Prepare template" : "Review template"}</button>{!locked && <button type="button" disabled={busy || Boolean(activeId) || previewLoading || !sampleUrl || !!previewError || missingRequiredFields.length > 0} onClick={requestApproval} className="cred-btn cred-btn-secondary">Approve &amp; enable</button>}</div></footer>
            {!!revision.validation_warnings?.length && <details className={styles.advanced}><summary>Preview checks</summary><TemplatePreviewChecks warnings={revision.validation_warnings} /></details>}
          </div>
        </section>}
        {editing && <section ref={editorRef} tabIndex={-1} className={`${styles.editor} w-full scroll-mt-24 space-y-5 outline-none`}>
        <div className={styles.editorHeading}><div><h4>{revision.name}</h4><span className={styles.draftBadge}>{unsavedChanges ? "Unsaved changes" : "Draft saved"} | {fields.length} fields</span></div><NavigationButton direction="back" type="button" disabled={busy} className="cred-btn cred-btn-secondary" onClick={() => {
          const restore = () => router.push(`/dashboard/settings?tab=Certificate%20Branding&template=${revision.id}`);
          if (unsavedChanges) setConsent({title: "Return to saved preview?", description: "Unsaved changes will be lost.", label: "Discard changes", danger: true, action: restore});
          else restore();
        }}>Back to preview</NavigationButton></div>
        <div className={styles.steps} aria-label="Template progress"><span aria-current={workspaceMode === "edit" ? "step" : undefined}>1. Edit details</span><span aria-current={workspaceMode === "preview" ? "step" : undefined}>2. Review preview</span><span>3. Enable template</span></div>
        <div className={styles.workspace}>
          <aside className={styles.inspector} aria-label="Certificate settings">
            <nav className={styles.inspectorTabs} aria-label="Editor panels">{["details", "branding", "review"].map(tab => <button key={tab} type="button" aria-pressed={inspectorTab === tab} aria-controls={`certificate-${tab}-panel`} onClick={() => setInspectorTab(tab)}>{tab === "details" ? "Details" : tab === "branding" ? "Branding" : "Review"}</button>)}</nav>
            <div id="certificate-details-panel" hidden={inspectorTab !== "details"} className={styles.inspectorPanel}>
            <div className={styles.fieldList} aria-label="Certificate details">{fields.length ? fields.map((item, index) => <button key={index} type="button" aria-pressed={selected === index} onClick={() => { setSelected(index); setPage(item.page); setWorkspaceMode("edit"); setSuggestionsOpen(false); }}><span>{item.key === "static_text" ? item.text || "Fixed wording" : label(item.key)}</span><small>Page {item.page}</small></button>) : <p>No details yet. Add a detail or create a layout.</p>}</div>
            {!locked && <div className={styles.detailActions}><button type="button" disabled={busy || fields.length >= 60} className="cred-btn cred-btn-secondary" onClick={() => addDetail()}>Add detail</button><button type="button" disabled={busy || fields.length >= 60} className="cred-btn cred-btn-secondary" onClick={() => addDetail("static_text")}>Add wording</button></div>}
        {!locked && designMode === "blank" && <div className={styles.blankStart}><div><h4 className={styles.sectionTitle}>Prepare your blank design</h4><p>Add wording and certificate details, or create a layout with AI.</p></div><button type="button" disabled={busy || aiRetrySeconds > 0} onClick={() => detectFields(true, false, true)} className="cred-btn cred-btn-primary"><Sparkles size={15} aria-hidden="true" />{aiRetrySeconds ? `Retry in ${aiRetrySeconds}s` : suggestionMode === "ai" ? "Creating layout..." : "Create layout with AI"}</button></div>}
        {!locked && <details className={styles.suggestions} open={suggestionsOpen} onToggle={event => setSuggestionsOpen(event.currentTarget.open)}><summary>{suggestions?.items?.length ? `Review suggestions (${suggestions.items.filter(item => !suggestionIsAdded(fields, item)).length})` : "Find fields automatically"} <span>Optional</span></summary><div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className={styles.sectionTitle}><ScanText size={18} aria-hidden="true" /> Find certificate details</h4><p className="mt-1 text-xs">Find names, award details and signature areas, then review their positions.</p></div><button type="button" disabled={busy} onClick={() => detectFields()} aria-busy={suggestionMode === "rules"} className="cred-btn cred-btn-secondary">{suggestionMode === "rules" ? "Reading PDF / OCR..." : "Find fields"}</button><button type="button" disabled={busy || aiRetrySeconds > 0} onClick={() => detectFields(true)} className="cred-btn cred-btn-secondary" aria-busy={suggestionMode === "ai"}><Sparkles size={15} aria-hidden="true" />{aiRetrySeconds ? `Retry AI in ${aiRetrySeconds}s` : suggestionMode === "ai" ? "Asking AI..." : "Suggest with AI"}</button></div>
          {suggestions && <>
            {suggestions.missing_required_fields?.length > 0 && <p className="mt-3 text-xs text-amber-800">Core fields still needing placement: {suggestions.missing_required_fields.filter(key => !fields.some(field => field.key === key)).map(label).join(", ")}. Add these manually where the design has room.</p>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#08283F]">{suggestions.items.filter(item => !suggestionIsAdded(fields, item)).length} suggestions to add</p>
              <button type="button" disabled={busy || locked || !suggestions.items.some(item => !suggestionIsAdded(fields, item))} onClick={addAllSuggestions} className="cred-btn cred-btn-primary">Add all suggestions</button>
            </div>
            <div className="mt-3 grid items-start gap-3 ">{suggestions.items.filter(item => !suggestionIsAdded(fields, item)).map((item, index) => <details key={`${item.field.key}-${item.field.page}-${index}`} className="min-w-0 rounded-lg border border-[#8A9BAA] bg-white p-3 text-sm shadow-sm"><summary className="cursor-pointer font-semibold">{item.field.key === "static_text" ? `Wording: ${(item.field.text || "").slice(0, 55)}` : label(item.field.key)} | page {item.field.page}</summary><div className="mt-3 break-words"><p className="mt-1 text-xs">{item.source_text} | {item.method === "matched_value" ? "Matched institution data" : item.method === "layout" ? "Estimated blank area" : item.method === "vision" ? "Visual AI suggestion" : item.method === "ai" ? "AI suggestion" : item.method === "ocr" ? `OCR ${Math.round(item.confidence)}%` : "Live text"}</p><p className="mt-1 text-xs">{item.note}</p><button type="button" disabled={busy} onClick={() => addSuggestion(item)} className="cred-btn cred-btn-primary mt-3">Add this suggestion</button></div></details>)}</div>
            {suggestions.items.some(item => suggestionIsAdded(fields, item)) && <details className="mt-3 rounded-lg border border-[#D8DEE6] bg-white/50 p-3"><summary className="cursor-pointer text-xs font-medium text-[#4A5A68]">Added suggestions ({suggestions.items.filter(item => suggestionIsAdded(fields, item)).length})</summary><div className="mt-2 flex flex-wrap gap-2">{suggestions.items.filter(item => suggestionIsAdded(fields, item)).map((item, index) => <span key={index} className="inline-flex items-center gap-1 rounded-full border border-[#B6D9C4] bg-[#EFFAF3] px-2 py-1 text-xs text-[#245C3E]"><CheckCircle2 size={12} aria-hidden="true" />{label(item.field.key)} | page {item.field.page}</span>)}</div></details>}
            {suggestions.warnings.map((warning, index) => <p key={index} className="mt-2 text-xs text-amber-800">{warning}</p>)}
          </>}

        </div></details>}

            {field && <fieldset disabled={locked || busy} className={styles.fieldGroup}><legend>Certificate detail</legend>
              <label className="text-sm">Detail type<select ref={contentRef} value={field.key} onChange={e => { const key = e.target.value; setFields(previous => previous.map((f, i) => i === selected ? { ...f, key, input_type: key === "graduation_year" ? "number" : "text", min_length: key === "student_name" ? 2 : 0, max_length: LIMITS[key] || 200, min_value: 1900, max_value: new Date().getFullYear() } : f)); setSampleUrl(""); }} className="block w-full border rounded p-2">{FIELD_GROUPS.map(group => <optgroup key={group.name} label={group.name}>{group.keys.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</optgroup>)}</select></label>
              {field.key === "static_text" && <textarea ref={wordingRef} rows={4} aria-label="Editable certificate wording" maxLength={1000} value={field.text || ""} onChange={e => edit("text", e.target.value)} className="border rounded p-2" />}
              <details className={styles.advanced}><summary>Input rules</summary><div>
              <label className="text-xs">Input type<select value={field.key === "graduation_year" ? "number" : "text"} disabled className="ml-2 border rounded"><option value="text">Text</option><option value="number">Number</option></select></label>
              {field.key === "degree_title" && <p className="text-xs">Value comes from the configured program dropdown. Update the catalog rather than typing an award at issuance.</p>}
              {LIMITS[field.key] && <div className="grid grid-cols-2 gap-2">{["min_length", "max_length"].map(key => <label key={key} className="text-xs">{key === "min_length" ? "Minimum characters" : "Maximum characters"}<input type="number" min="0" max={LIMITS[field.key]} value={field[key] ?? (key === "min_length" ? (field.key === "student_name" ? 2 : 0) : LIMITS[field.key])} onChange={e => edit(key, Number(e.target.value))} className="w-full border rounded" /></label>)}</div>}
              {field.key === "graduation_year" && <div className="grid grid-cols-2 gap-2">{["min_value", "max_value"].map(key => <label key={key} className="text-xs">{key === "min_value" ? "Earliest year" : "Latest year"}<input type="number" step="1" min="1900" max={new Date().getFullYear()} value={field[key] ?? (key === "min_value" ? 1900 : new Date().getFullYear())} onChange={e => edit(key, Number(e.target.value))} className="w-full border rounded" /></label>)}</div>}
              {LIMITS[field.key] && <label className="text-xs"><input type="checkbox" checked={field.required ?? ["student_name", "degree_title", "institution_name", "certificate_id"].includes(field.key)} onChange={e => edit("required", e.target.checked)} /> Required value</label>}
              <label className="text-xs">Minimum readable font size<input type="number" min="6" max={field.font_size || 18} step="0.5" value={field.min_font_size ?? 6} onChange={e => edit("min_font_size", Number(e.target.value))} className="ml-2 w-16 border rounded" /></label>
              <p className="text-xs text-amber-800">For long names or awards, widen the field or adjust font size. Do not shorten official data to fit the template.</p>
              </div></details>
              <details className={styles.advanced}><summary>Precise position</summary><div><h5 className={styles.controlHeading}>Position &amp; size</h5><p className="text-xs">Drag the box on the certificate, or adjust its proportions below (0 to 1).</p>
              <div className="grid grid-cols-2 gap-2">{["x", "y", "width", "height"].map(key => <label key={key} className="text-xs">{{x: "Left", y: "Top", width: "Width", height: "Height"}[key]}<input className="block w-full border rounded p-1" type="number" min="0" max="1" step="0.001" value={field[key]} onChange={e => edit(key, Number(e.target.value))} /></label>)}</div>
              </div></details>
              <h5 className={styles.controlHeading}>Text style</h5>
              <label className="text-xs">Font family<select style={templateFontStyle(field.font)} value={templateFontGroup(field.font).id} onChange={event => edit("font", changeTemplateFontFamily(field.font || "Times-Roman", event.target.value))}>{[...new Set(TEMPLATE_FONT_GROUPS.map(group => group.category))].map(category => <optgroup key={category} label={category}>{TEMPLATE_FONT_GROUPS.filter(group => group.category === category).map(group => <option key={group.id} value={group.id}>{group.label}</option>)}</optgroup>)}</select></label>
              <label className="text-xs">Style<select value={field.font || "Times-Roman"} onChange={event => edit("font", event.target.value)}>{templateFontGroup(field.font).fonts.map(([key, style]) => <option key={key} value={key}>{style}</option>)}</select></label>
              <p className={styles.fontSample} style={templateFontStyle(field.font)} aria-label="Font preview">{field.key === "student_name" ? "Amina Kamara" : field.key === "static_text" ? field.text || "Certificate of Achievement" : "Academic Excellence"}</p>

              <label className="text-xs">Text color<input type="color" value={field.color || "#000000"} onChange={e => edit("color", e.target.value)} className="ml-2" /></label>
              <label className="text-xs">Font size<input className="ml-2 w-16 border rounded" type="number" min="6" max="72" value={field.font_size || 18} onChange={e => edit("font_size", Number(e.target.value))} /></label>
              <label className="text-xs">Alignment<select value={field.align || "center"} onChange={e => edit("align", e.target.value)} className="ml-2 border rounded">{["left", "center", "right"].map(align => <option key={align}>{align}</option>)}</select></label>
              <label className="text-xs"><input type="checkbox" checked={Boolean(field.clear)} onChange={e => edit("clear", e.target.checked)} /> Clear existing content in this area</label>
              {["logo", "seal"].includes(field.key) && <button type="button" disabled={busy} onClick={() => save(false, field)} className="cred-btn cred-btn-secondary">Extract boxed artwork as {field.key}</button>}
              <button type="button" className={styles.removeField} onClick={() => removeField(selected)}>Remove detail</button>
            </fieldset>}
            <details className="mt-3"><summary className="text-sm cursor-pointer">Extracted text ({revision.analysis.ocr_used ? "OCR" : "text layer"})</summary><p className="text-xs mt-2">Reading evidence only; label field roles and positions yourself.</p>{!locked && field && <div className="flex flex-wrap gap-1 my-2">{(revision.analysis.pages[page - 1]?.items || []).slice(0, 500).map((item, index) => <button key={index} type="button" className="border rounded px-1 text-xs hover:bg-blue-50" onClick={() => {
                const info = revision.analysis.pages[page - 1];
                const [x0, y0, x1, y1] = item.bbox;
                setFields(previous => previous.map((f, i) => i === selected ? { ...f, page, x: x0 / info.width, y: y0 / info.height, width: (x1 - x0) / info.width, height: (y1 - y0) / info.height } : f));
                setSampleUrl("");
              }}>{item.text}</button>)}</div>}
              <pre className="whitespace-pre-wrap text-xs max-h-60 overflow-auto mt-2">{revision.analysis.pages[page - 1]?.text || "No readable text. Label fields manually."}</pre></details>
            </div>
            <div id="certificate-branding-panel" hidden={inspectorTab !== "branding"} className={styles.inspectorPanel}>
            <div><fieldset disabled={locked || busy} className={styles.fieldGroup}><legend>Institution artwork</legend>
              <div className={styles.artworkUploads}>
                {["logo", "seal"].map(key => <label key={key} className={styles.artworkUpload}>{key === "logo" ? "Crest / logo" : "Seal"}{(key === "logo" ? revision.has_logo : revision.has_seal) && " (saved)"}<input type="file" accept="image/png,image/jpeg" onChange={event => {
                  const image = event.target.files?.[0] || null;
                  if (key === "logo") setLogo(image); else setSeal(image);
                  setSuggestedAssets(previous => ({...previous, [key]: false}));
                  setAssetProposals(previous => previous.filter(item => item.field.key !== key)); setSampleUrl("");
                }} /></label>)}
                {!locked && <button type="button" disabled={busy || aiRetrySeconds > 0 || !availableAssets.length} onClick={() => requestAssetSize(availableAssets)} className="cred-btn cred-btn-secondary">{assetSuggesting ? "Suggesting..." : aiRetrySeconds ? `Retry in ${aiRetrySeconds}s` : `${resuggestAssets ? "Resuggest" : "Suggest"}${availableAssets.length === 2 ? " both" : " size"}`}</button>}
              </div>
            </fieldset>
            {assetProposals.map(proposal => <div key={proposal.field.key} className={styles.advanced}><strong>{label(proposal.field.key)}</strong><p className="mt-1 text-xs">{proposal.width_points} x {proposal.height_points} pt | Page {proposal.field.page}</p><p className="mt-1 text-xs">{proposal.note}</p><button type="button" disabled={busy} onClick={() => applyAssetSize(proposal)} className="cred-btn cred-btn-secondary mt-2">{proposal.placement_required ? "Choose position" : "Apply suggestion"}</button></div>)}
            </div><h4 className={styles.sectionTitle}>Officer signatures</h4><p className="text-xs">Place signature areas using Add detail. Approved signatures are supplied during issuance.</p><p className="text-xs"><Link href="/dashboard/settings" className="underline">Manage officer signatures</Link></p>
        <details className={styles.advanced}><summary>Template management</summary><div className="space-y-4"><button type="button" disabled={busy || !canReplace} className="cred-btn cred-btn-secondary" onClick={() => {
            const replace = () => router.push(`/dashboard/settings?tab=Certificate%20Branding&template=${revision.id}&replace=true`);
            if (unsavedChanges) setConsent({title: "Replace design?", description: "Unsaved changes will be lost. Choose a replacement file on the upload page.", label: "Continue", danger: true, action: replace});
            else replace();
          }}>Replace design</button>        {!locked && <div className="rounded-lg border p-4">
          <label className="text-sm font-semibold">Editing mode<select value={designMode} onChange={e => setDesignMode(e.target.value)} className="ml-3 rounded border p-2"><option value="blank">Blank background</option><option value="existing">Existing certificate</option></select></label>

        </div>}
        {locked && <p className="text-sm text-[#2F6F4E]">This version is approved. Return to certificate branding and select Edit template to disable branding and edit this version.</p>}
        {!locked && <div className="rounded-lg border p-4">
          <label className="block text-sm font-semibold">Certificate type
            <select value={certificateType} disabled={busy} onChange={e => { setCertificateType(e.target.value); setSuggestions(null); }} className="mt-2 block w-full rounded border p-2">
              <option value="bsc">Bachelor of Science (BSc)</option><option value="ba">Bachelor of Arts (BA)</option><option value="beng">Bachelor of Engineering (BEng)</option><option value="msc">Master of Science (MSc)</option><option value="ma">Master of Arts (MA)</option><option value="phd">Doctor of Philosophy (PhD)</option><option value="diploma">Diploma</option>
            </select>
          </label>

        </div>}
        {!locked && <details className={styles.resetOptions}><summary>Reset options</summary><div className={styles.resetActions}><button type="button" disabled={busy} onClick={requestConfigurationReset} className="inline-flex items-center gap-2 self-start rounded-lg border border-amber-700 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 disabled:opacity-50"><RotateCcw size={16} /> Clear field configuration</button>
        <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={busy} onClick={requestBrandingReset} className="inline-flex items-center gap-2 rounded-lg border border-amber-700 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 disabled:opacity-50"><RotateCcw size={16} /> Reset draft branding</button><span className="text-xs text-[#687B8E]">Clears and saves this draft&apos;s fields, crest and seal; keeps the master.</span></div></div></details>}
        {revision.analysis.warning && <p className="text-sm text-amber-800">Reading unavailable: {revision.analysis.warning} You can still label fields manually.</p>}
</div></details>
            </div>
            <div id="certificate-review-panel" hidden={inspectorTab !== "review"} className={styles.inspectorPanel}>
              <h4 className={styles.sectionTitle}>Placement checks</h4>
              <ul className={styles.checkList}>{[...missingRequiredFields, ...REQUIRED_TEMPLATE_FIELDS.filter(key => !missingRequiredFields.includes(key))].map(key => <li key={key}><span>{label(key)}</span><strong className={fields.some(item => item.key === key) ? styles.checkPlaced : styles.checkMissing}>{fields.some(item => item.key === key) ? "Placed" : "Missing"}</strong></li>)}</ul>
              {unsavedChanges ? <p className="text-xs text-amber-800">Save to check text fit and preview your changes.</p> : <><TemplatePreviewChecks warnings={revision.validation_warnings} />{!revision.validation_warnings?.length && fields.length > 0 && <p className="text-xs text-green-800">Saved sample text fits.</p>}</>}
              {previewError && <p role="alert" className="text-xs text-red-700">{previewError}</p>}
              <details className={styles.advanced}><summary>Preview sample values</summary><div><p>The saved preview uses example data, not a student record.</p><dl><dt>Graduate</dt><dd>Sample Graduate</dd><dt>Award</dt><dd>Bachelor of Science in Computer Science</dd><dt>Year</dt><dd>2026</dd><dt>Classification</dt><dd>First Class</dd></dl></div></details>
              {sampleUrl && !unsavedChanges && <a href={sampleUrl} target="_blank" rel="noopener noreferrer" className="cred-btn cred-btn-secondary">Open preview PDF</a>}
            </div>
          </aside>
          <div className={styles.canvasCard}>
            <div className={styles.documentToolbar}><div><button type="button" aria-pressed={workspaceMode === "edit"} onClick={() => setWorkspaceMode("edit")}>Edit</button><button type="button" aria-pressed={workspaceMode === "preview"} onClick={() => { setWorkspaceMode("preview"); setInspectorTab("review"); }}>Preview</button></div>
            <label className="text-sm">Page<select className="ml-2 border rounded p-2" value={page} onChange={e => { setPageUrl(""); setPage(Number(e.target.value)); }}>{revision.analysis.pages.map(p => <option key={p.page} value={p.page}>{p.page}</option>)}</select></label></div>
            <div hidden={workspaceMode !== "edit"}>
            <TemplateCanvas fields={fields} selected={selected} page={page} pageUrl={pageUrl} pageInfo={revision.analysis.pages[page - 1]} onEditText={editDetectedText} disabled={locked || busy}
              onSelect={index => { setSelected(index); setInspectorTab("details"); setSuggestionsOpen(false); }} onChange={value => { setFields(value); setSampleUrl(""); }} onEdit={editField} onRemove={removeField}
              onUndo={undo} onRedo={redo} canUndo={historyStatus.canUndo} canRedo={historyStatus.canRedo} />
            </div>
            {workspaceMode === "preview" && <div className={styles.documentPreview}>{unsavedChanges ? <p>Save &amp; preview to review your latest changes.</p> : previewLoading ? <p role="status">Loading preview...</p> : previewError ? <p role="alert">{previewError}</p> : sampleUrl ? <iframe title="Certificate preview" src={sampleUrl} /> : <p>Add your details, then choose Save &amp; preview.</p>}</div>}

          </div>
        </div>
        {!locked && <div className={styles.saveBar}><p className={styles.nextAction}>{unsavedChanges || !sampleUrl ? "Next: save your changes and review the preview." : missingRequiredFields.length ? `${missingRequiredFields.length} required details missing. Open Review to check.` : "Preview ready. Check the certificate before enabling."}</p><ActionButton type="button" disabled={busy} onClick={() => save(false)} className="cred-btn cred-btn-primary gap-2 self-start"><Save size={16} /> Save & preview</ActionButton><ActionButton type="button" disabled={busy || previewLoading || !sampleUrl || !!previewError || unsavedChanges || missingRequiredFields.length > 0} onClick={requestApproval} className="cred-btn cred-btn-primary gap-2 self-start" title={missingRequiredFields.length ? "Place the missing details listed in Review" : unsavedChanges ? "Save and review your changes first" : !sampleUrl ? "Save a preview first" : undefined}><CheckCircle2 size={16} /> Enable template</ActionButton></div>}
        </section>}

      </>}
      {!editorRevisionId && <div className={styles.uploadSupport}>
        <details className={styles.advanced}><summary>Help &amp; template management</summary><div>
          <p className="text-xs text-[#687B8E]">{revisions.length} of 2 template slots used. Approved templates and templates used by credentials are protected.</p>
          <ActionButton type="button" disabled={busy} onClick={requestFullRestart} className="cred-btn cred-btn-secondary gap-2 self-start"><RefreshCw size={16} /> Start over</ActionButton>
        </div></details>
      </div>}
    </div>
  );
}
