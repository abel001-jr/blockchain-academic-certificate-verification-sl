"use client";
import { ActionButton } from "@/components/ui/AnimatedControls";
import NavigationButton from "@/components/ui/NavigationButton";


import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TemplateCanvas from "./TemplateCanvas";
import BrandingConsentDialog from "./BrandingConsentDialog";
import BrandingStartGuide from "./BrandingStartGuide";
import { RotateCcw, RefreshCw, CheckCircle2, Save, X, FileUp } from "lucide-react";
import { nextFieldArea } from "@/lib/templateGeometry.mjs";
import styles from "./UploadedTemplatePanel.module.css";
import { FIELD_GROUPS, fieldLabel } from "./templateFieldGroups";
import TemplatePreviewChecks from "./TemplatePreviewChecks";

const BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000/api";
const LIMITS = {student_name: 200, degree_title: 255, institution_name: 255, department: 255, grade: 50, certificate_id: 50, static_text: 1000};
const label = fieldLabel;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("access_token")}` });

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, { ...options, headers: { ...headers(), ...options.headers } });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail || "The template request failed.");
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
  const [page, setPage] = useState(1);
  const [pageUrl, setPageUrl] = useState("");
  const [sampleUrl, setSampleUrl] = useState("");
  const [master, setMaster] = useState(null);
  const [name, setName] = useState("Institutional certificate");
  const [rotation, setRotation] = useState(0);
  const [logo, setLogo] = useState(null);
  const [seal, setSeal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(null);
  const [uploadKey, setUploadKey] = useState(0);
  const [suggestions, setSuggestions] = useState(null);
  const [editing, setEditing] = useState(Boolean(editorRevisionId));
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const unsavedChanges = JSON.stringify(fields) !== JSON.stringify(revision?.fields || []) || Boolean(logo || seal);
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

  const choose = useCallback(item => {
    setEditing(Boolean(editorRevisionId && item && !item.approved_at)); setPreviewError(""); setPreviewLoading(false);
    setSuggestions(item?.analysis?.suggestions || null);
    setPageUrl(""); setRevision(item || null); fieldsRef.current = item?.fields || []; historyRef.current = {past: [], future: []}; setHistoryStatus({canUndo: false, canRedo: false}); setFieldsState(fieldsRef.current); setSelected(0); setPage(1);
    setLogo(null); setSeal(null); setSampleUrl(""); setMessage("");
  }, [editorRevisionId]);

  const load = useCallback(async () => {
    try {
      const data = await (await request("/certificate-templates/")).json();
      setRevisions(data.revisions); setActiveId(data.active_id);
      setGuideSeenKey(`credence:branding-guide-seen:${data.institution_id}`);
      const requestedId = editorRevisionId || new URLSearchParams(window.location.search).get("template");
      const requested = data.revisions.find(item => item.id === requestedId);
      if (editorRevisionId && !requested) { setError("This draft is not available to your institution."); choose(null); }
      else choose(requested || data.revisions.find(item => !item.approved_at && item.fields?.length) || data.revisions.find(item => !item.approved_at) || data.revisions.find(item => item.id === data.active_id) || null);
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
    if (templateLimitReached && canReplace && !confirmed) {
      setConsent({title: "Replace selected draft?", description: "Replace this draft's uploaded master and clear its labelled fields, crest and seal. The previous draft content will be removed.", label: "Replace draft", danger: true, action: () => upload(null, true)});
      return;
    }
    if (templateLimitReached && !canReplace) { setError("Select an unused draft to replace. Approved templates and templates used by credentials are protected."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const fd = new FormData(); fd.append("master", master); fd.append("name", name); fd.append("rotation", rotation);
      if (templateLimitReached) fd.append("replace_id", revision.id);
      const item = await (await request("/certificate-templates/", { method: "POST", body: fd })).json();
      setRevisions(previous => previous.some(r => r.id === item.id) ? previous.map(r => r.id === item.id ? item : r) : [item, ...previous]); choose(item);
      setMessage(templateLimitReached ? "Selected draft replaced. Its old fields and assets were cleared; label the new master and configure its assets." : "Master uploaded. Label its fields and configure assets, then save a sample preview.");
      router.push(`/dashboard/settings/certificate-branding/${item.id}`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function save(approve = false, extractAsset = null) {
    setBusy(true); setError(""); setMessage("");
    try {
      const fd = new FormData(); fd.append("fields", JSON.stringify(fields));
      if (logo) fd.append("logo", logo); if (seal) fd.append("seal", seal);
      if (approve) fd.append("approve", "true");
      if (extractAsset) fd.append("extract_asset", JSON.stringify(extractAsset));
      const item = await (await request(`/certificate-templates/${revision.id}/`, { method: "PATCH", body: fd })).json();
      setRevision(item); setRevisions(previous => previous.map(r => r.id === item.id ? item : r));
      setLogo(null); setSeal(null);
      if (approve) setActiveId(item.id);
      setSampleUrl("");
      setEditing(Boolean(editorRevisionId && !approve));
      setMessage(approve ? "Template approved and active for new credentials." : "Draft saved. Review the preview and layout checks below.");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  function edit(key, value) {
    setSampleUrl("");
    setFields(previous => previous.map((field, index) => index === selected ? { ...field, [key]: value } : field));
  }

  async function detectFields(useAI = false, confirmed = false) {
    if (useAI && !confirmed) {
      setConsent({title: "Request AI suggestions?", description: "Send this draft's extracted text to Groq for field suggestions. The PDF, images and signature assets are not sent. Review each suggestion before adding it; nothing is saved automatically.", label: "Request suggestions", action: () => detectFields(true, true)});
      return;
    }
    setBusy(true); setError("");
    try {
      setSuggestions(await (await request(`/certificate-templates/${revision.id}/${useAI ? "ai-suggestions" : "suggestions"}/`, {method: "POST"})).json());
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  function addSuggestion(item) {
    const next = item.field;
    if (fields.length >= 60) { setError("Configure at most 60 labelled fields."); return; }
    if (fields.some(f => f.page === next.page && f.x < next.x + next.width && f.x + f.width > next.x && f.y < next.y + next.height && f.y + f.height > next.y)) {
      setError("This suggestion overlaps an existing field. Move or remove that field before adding the suggestion."); return;
    }
    setSelected(fields.length); setPage(next.page); setFields([...fields, {...next}]); setSampleUrl("");
    setMessage("Suggestion added. Check its position, clear-area setting, font and input limits, then Save draft & preview.");
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
    setSelected(index);
    setTimeout(() => {
      const settings = contentRef.current?.closest("details");
      if (settings) settings.open = true;
      contentRef.current?.scrollIntoView({block: "nearest", behavior: "smooth"}); contentRef.current?.focus();
    }, 0);
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
    setMessage("Configuration restarted. The uploaded master and previously saved assets are kept. Add new fields, then Save draft & preview to save the reset. Undo restores your previous fields.");
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
      setMessage("Branding restarted and saved. Fields, crest and seal have been cleared. The uploaded master remains; use Replace selected draft to change it. Configured officer signatures are kept.");
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
        setMessage("Branding restarted from the beginning. Choose a new institutional master to start configuration.");
      } catch (err) { setError(err.message); } finally { setBusy(false); }
    }});
  }
  function requestApproval() {
    setConsent({title: "Finish editing and enable this template?", description: "Save this version as approved and activate it for new generated credentials. Confirm that you have reviewed its generated sample, fields and assets.", label: "Finish editing & enable", action: () => save(true)});
  }
  function requestEditTemplate() {
    setConsent({title: "Disable branding and edit template?", description: "Branding will be disabled while you edit this template version. Changes are saved to this same version. Review and approve your changes to enable it again.", label: "Disable & edit", action: async () => {
      setBusy(true); setError("");
      try {
        const item = await (await request(`/certificate-templates/${revision.id}/edit/`, {method: "POST"})).json();
        setActiveId(null);
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
  return (
    <div className={`${styles.panel} flex flex-col gap-5`}>
      <div><h3 className="text-xl font-semibold text-[#08283F]">{editorRevisionId ? "Certificate template editor" : "Institutional certificate template"}</h3>
        <p className="mt-2 text-sm text-[#4A5A68]">{editorRevisionId ? "Edit this template's fields, crest, seal and officer signature positions. Save and review the preview, then finish editing to enable the updated template." : "Upload your institution's blank master, label the variable fields, and configure crest, seal and officer signature positions. Embedded text is read directly; scans use OCR. Field placement is manually confirmed."}</p>
        <p className="mt-2 text-xs text-[#687B8E]">Use a clean master without previous student details or signatures. “Clear area” permanently removes content inside the labelled box in generated copies; inspect the sample carefully. Fixed wording, borders and artwork are preserved.</p>
      </div>
      <BrandingConsentDialog consent={consent} onCancel={() => setConsent(null)} onConfirm={confirmAction} />
      {!editorRevisionId && <div className="flex flex-col gap-2 self-start">
        <button type="button" role="switch" aria-checked={Boolean(activeId)} aria-label="Certificate branding" disabled={busy || templatesLoading || (!activeId && !enableRevision)} onClick={activeId ? requestDisableBranding : enableBranding} className="inline-flex items-center gap-3 rounded-lg border px-4 py-2 text-sm font-semibold text-[#08283F] disabled:opacity-50 disabled:cursor-not-allowed">
          <span aria-hidden="true" className={styles.switchTrack} style={{background: activeId ? "#2F6F4E" : "#687B8E"}}><span className={styles.switchThumb} style={{transform: activeId ? "translateX(20px)" : "translateX(0)"}} /></span>
          Certificate branding: {activeId ? "Enabled" : "Disabled"}
        </button>
        {!templatesLoading && !activeId && <p className="text-xs text-[#687B8E]">{enableRevision ? "Turn on to use your saved approved template for new certificates." : "Approve a template to enable certificate branding."}</p>}
      </div>}
      {(message || error) && <div role={error ? "alert" : "status"} style={{position: "fixed", top: 20, right: 24, zIndex: 10000, width: "min(520px, calc(100vw - 32px))", padding: 16, borderRadius: 12, boxShadow: "0 8px 30px rgba(8,40,63,.18)", border: `1px solid ${error ? "#EDB9B4" : "#B6D9C4"}`, background: error ? "#FFF1EF" : "#EFFAF3", color: error ? "#92251E" : "#245C3E"}} className="flex items-start gap-3 text-sm">
        {!error && <CheckCircle2 size={20} className="shrink-0" />}<p className="flex-1">{error || message}</p><button type="button" aria-label="Dismiss message" onClick={() => {setMessage(""); setError("");}}><X size={18} /></button>
      </div>}
      {!editorRevisionId && <>
      <ActionButton type="button" disabled={busy} onClick={requestFullRestart} className="cred-btn cred-btn-primary gap-2 self-start"><RefreshCw size={16} /> Start branding from scratch</ActionButton>
      {!templatesLoading && <BrandingStartGuide key={`branding-guide-${uploadKey}`} seenKey={guideSeenKey} initiallyOpen={!activeId && !revisions.some(item => item.fields?.length)} onContinue={() => versionNameRef.current?.focus()} />}
      <form key={`branding-upload-${uploadKey}`} onSubmit={upload} className="flex flex-wrap items-end gap-5 rounded-xl border p-5">
        <label className="text-sm">Version name<input ref={versionNameRef} required maxLength={120} value={name} onChange={e => setName(e.target.value)} className="block border rounded p-2" /></label>
        <label className="text-sm flex flex-col gap-2">Master PDF or scan
          <span className={`relative flex cursor-pointer items-center gap-3 rounded-lg border-2 px-4 py-3 transition-colors hover:border-[#B98A28] hover:bg-[#F5EBDB] focus-within:border-[#B98A28] focus-within:ring-2 focus-within:ring-[#B98A28]/30 ${master ? "border-[#08283F] bg-[#EAF2FB]" : "border-[#8A9BAA] bg-white"}`}>
            <FileUp size={22} className="shrink-0 text-[#08283F]" />
            <span className="min-w-0"><span className="block max-w-[280px] truncate font-semibold text-[#08283F]">{master ? master.name : "Choose certificate master"}</span><span className="block text-xs text-[#687B8E]">{master ? "Click to change file" : "PDF, JPEG or PNG · up to 20 MB"}</span></span>
            <input aria-label="Choose certificate master PDF or scan" required disabled={busy} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setMaster(e.target.files?.[0] || null)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait" />
          </span>
        </label>
        <label className="text-sm">Rotate clockwise<select value={rotation} onChange={e => setRotation(Number(e.target.value))} className="block border rounded p-2">{[0, 90, 180, 270].map(n => <option key={n} value={n}>{n} degrees</option>)}</select></label>
        <ActionButton type="submit" disabled={busy || (templateLimitReached && !canReplace)}  className="cred-btn cred-btn-primary gap-2 self-start">{busy ? "Working..." : templateLimitReached ? "Replace selected draft" : "Upload new draft"}</ActionButton>
      </form>
      <p className={`text-sm ${templateLimitReached ? "text-amber-800" : "text-[#687B8E]"}`}>{revisions.length} template versions configured (limit: 2). {templateLimitReached ? "Limit reached. Select an unused draft, choose a new master above, and click Replace selected draft. Replacement clears its old fields and assets." : "You can upload up to two template versions."}</p>
      {revisions.length > 0 && <label className="text-sm">Template version<select value={revision?.id || ""} onChange={e => choose(revisions.find(r => r.id === e.target.value))} className="ml-3 border rounded p-2"><option value="">Choose an existing template</option>{revisions.map((item, index) => <option key={item.id} value={item.id}>{item.name} — {item.id === activeId ? "Active" : item.approved_at ? "Approved" : "Draft"}</option>)}</select></label>}
      </>}
      {revision && <>
        {!editing && <section className="overflow-hidden rounded-xl border border-[#D8DEE6] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h4 className="font-semibold text-[#08283F]">{revision.name} · {locked ? "Approved template" : "Saved draft preview"}</h4><p className="mt-1 text-xs text-[#687B8E]">Sample data · unsigned review copy · {revision.fields.length} saved fields</p></div><button type="button" disabled={busy} onClick={() => locked ? requestEditTemplate() : router.push(`/dashboard/settings/certificate-branding/${revision.id}`)} className="cred-btn cred-btn-secondary">{locked ? "Edit template" : "Edit draft"}</button>{sampleUrl && <a href={sampleUrl} target="_blank" rel="noopener noreferrer" className="cred-btn cred-btn-secondary">Open preview PDF</a>}</div>
          <div className="grid items-start lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="min-w-0 lg:border-r">
          {previewLoading ? <p role="status" className="p-5 text-sm">Loading saved preview...</p> : previewError ? <p role="alert" className="p-5 text-sm text-red-700">Preview needs attention: {previewError} Use Edit draft to correct the layout, then save again.</p> : sampleUrl ? <iframe title="Saved template sample preview" src={sampleUrl} className="h-[650px] w-full" /> : <p className="p-5 text-sm text-[#687B8E]">Configure fields and select Save draft & preview to see the sample here.</p>}
          </div><aside className="min-w-0"><div className="p-4"><h5 className="font-semibold">Review your saved draft</h5><p className="mt-2 text-sm text-[#4A5A68]">Check text fit, placement and artwork before approval. Use Edit draft to adjust fields.</p></div><TemplatePreviewChecks warnings={revision.validation_warnings} />{!revision.validation_warnings?.length && <p className="px-4 pb-4 text-sm text-[#2F6F4E]">Sample text fits the saved field configuration.</p>}</aside></div>
        </section>}
        {editing && <section ref={editorRef} tabIndex={-1} className="w-full scroll-mt-24 space-y-5 rounded-xl border-2 border-[#8A9BAA] bg-white p-4 outline-none md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-xl font-semibold text-[#08283F]">Editing {revision.name}</h4><p className="mt-1 text-sm text-[#4A5A68]">Configure fields on the left; move and resize their boxes on the document at the right.</p></div><NavigationButton direction="back" type="button" disabled={busy} className="cred-btn cred-btn-secondary" onClick={() => {
          const restore = () => router.push(`/dashboard/settings?tab=Certificate%20Branding&template=${revision.id}`);
          if (unsavedChanges) setConsent({title: "Return to saved preview?", description: "Discard unsaved field and asset changes and reopen the saved draft preview.", label: "Discard changes", danger: true, action: restore});
          else restore();
        }}>Return to saved preview</NavigationButton></div>
        {locked && <p className="text-sm text-[#2F6F4E]">This version is approved. Return to certificate branding and select Edit template to disable branding and edit this version.</p>}
        {!locked && <section className="rounded-xl border border-[#CFE1F2] bg-[#EAF2FB] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-semibold">Suggested fields from PDF text / OCR</h4><p className="mt-1 text-xs">Rules match supported printed placeholders. Review each suggestion; nothing is saved or approved automatically.</p></div><button type="button" disabled={busy} onClick={() => detectFields()} className="cred-btn cred-btn-secondary">{busy ? "Reading..." : "Read and suggest fields"}</button><button type="button" disabled={busy} onClick={() => detectFields(true)} className="cred-btn cred-btn-secondary">Ask AI for suggestions</button></div>
          {suggestions && <><div className="mt-3 grid gap-2 sm:grid-cols-2">{suggestions.items.map((item, index) => <div key={index} className="rounded-lg border bg-white p-3 text-sm"><p className="font-semibold">{label(item.field.key)} · page {item.field.page}</p><p className="mt-1 text-xs">{item.source_text} · {item.method === "ai" ? "AI suggestion" : item.method === "ocr" ? `OCR ${Math.round(item.confidence)}%` : "Live text"}</p><p className="mt-1 text-xs">{item.note}</p><button type="button" disabled={busy} onClick={() => addSuggestion(item)} className="mt-2 rounded border px-3 py-1 font-semibold">Add this suggestion</button></div>)}</div>{suggestions.warnings.map((warning, index) => <p key={index} className="mt-2 text-xs text-amber-800">{warning}</p>)}</>}
        </section>}
        {!locked && <button type="button" disabled={busy} onClick={requestConfigurationReset} className="inline-flex items-center gap-2 self-start rounded-lg border border-amber-700 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 disabled:opacity-50"><RotateCcw size={16} /> Clear field configuration</button>}
        {!locked && <div className="flex items-center gap-3"><button type="button" disabled={busy} onClick={requestBrandingReset} className="inline-flex items-center gap-2 rounded-lg border border-amber-700 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 disabled:opacity-50"><RotateCcw size={16} /> Reset draft branding</button><span className="text-xs text-[#687B8E]">Clears and saves this draft&apos;s fields, crest and seal; keeps the master.</span></div>}
        {revision.analysis.warning && <p className="text-sm text-amber-800">Reading unavailable: {revision.analysis.warning} You can still label fields manually.</p>}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-[#D8DEE6] p-4 lg:max-h-[85vh] lg:overflow-y-auto">
            <label className="text-sm">Page<select className="ml-2 border rounded p-2" value={page} onChange={e => { setPageUrl(""); setPage(Number(e.target.value)); }}>{revision.analysis.pages.map(p => <option key={p.page} value={p.page}>{p.page}</option>)}</select></label>
            <label className="text-sm">Labelled field ({fields.length})<select disabled={!fields.length} className="cd-input block w-full min-w-0 bg-white text-[#08283F] disabled:opacity-70" value={fields.length ? selected : ""} onChange={e => setSelected(Number(e.target.value))}>{!fields.length && <option value="">No fields yet - click Add field</option>}{FIELD_GROUPS.map(group => {
              const members = fields.map((f, i) => ({f, i})).filter(({f}) => group.keys.some(([key]) => key === f.key));
              return members.length ? <optgroup key={group.name} label={group.name}>{members.map(({f, i}) => <option className="bg-white text-[#08283F]" key={i} value={i}>{label(f.key)} (page {f.page})</option>)}</optgroup> : null;
            })}</select></label>
            {!locked && <button type="button" className="cred-btn cred-btn-secondary" onClick={() => { setSelected(fields.length); setFields([...fields, { key: "student_name", ...nextFieldArea(fields, page), font: "Times-Roman", font_size: 18, align: "center", clear: false }]); setSampleUrl(""); }}>Add field</button>}
            {field && <fieldset disabled={locked || busy} className="flex flex-col gap-2">
              <label className="text-sm">Field content<select ref={contentRef} value={field.key} onChange={e => { const key = e.target.value; setFields(previous => previous.map((f, i) => i === selected ? { ...f, key, input_type: key === "graduation_year" ? "number" : "text", min_length: key === "student_name" ? 2 : 0, max_length: LIMITS[key] || 200, min_value: 1900, max_value: new Date().getFullYear() } : f)); setSampleUrl(""); }} className="block w-full border rounded p-2">{FIELD_GROUPS.map(group => <optgroup key={group.name} label={group.name}>{group.keys.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</optgroup>)}</select></label>
              {field.key === "static_text" && <input aria-label="Fixed text" value={field.text || ""} onChange={e => edit("text", e.target.value)} className="border rounded p-2" />}
              <label className="text-xs">Input type<select value={field.key === "graduation_year" ? "number" : "text"} disabled className="ml-2 border rounded"><option value="text">Text</option><option value="number">Number</option></select></label>
              {field.key === "degree_title" && <p className="text-xs">Value comes from the configured program dropdown. Update the catalog rather than typing an award at issuance.</p>}
              {LIMITS[field.key] && <div className="grid grid-cols-2 gap-2">{["min_length", "max_length"].map(key => <label key={key} className="text-xs">{key === "min_length" ? "Minimum characters" : "Maximum characters"}<input type="number" min="0" max={LIMITS[field.key]} value={field[key] ?? (key === "min_length" ? (field.key === "student_name" ? 2 : 0) : LIMITS[field.key])} onChange={e => edit(key, Number(e.target.value))} className="w-full border rounded" /></label>)}</div>}
              {field.key === "graduation_year" && <div className="grid grid-cols-2 gap-2">{["min_value", "max_value"].map(key => <label key={key} className="text-xs">{key === "min_value" ? "Earliest year" : "Latest year"}<input type="number" step="1" min="1900" max={new Date().getFullYear()} value={field[key] ?? (key === "min_value" ? 1900 : new Date().getFullYear())} onChange={e => edit(key, Number(e.target.value))} className="w-full border rounded" /></label>)}</div>}
              {LIMITS[field.key] && <label className="text-xs"><input type="checkbox" checked={field.required ?? ["student_name", "degree_title", "institution_name", "certificate_id"].includes(field.key)} onChange={e => edit("required", e.target.checked)} /> Required value</label>}
              <label className="text-xs">Minimum readable font size<input type="number" min="6" max={field.font_size || 18} step="0.5" value={field.min_font_size ?? 6} onChange={e => edit("min_font_size", Number(e.target.value))} className="ml-2 w-16 border rounded" /></label>
              <p className="text-xs text-amber-800">For long names or awards, widen the field or adjust font size. Do not shorten official data to fit the template.</p>
              <p className="text-xs">Draw a box on the page or enter proportions from 0 to 1.</p>
              <div className="grid grid-cols-2 gap-2">{["x", "y", "width", "height"].map(key => <label key={key} className="text-xs">{key}<input className="block w-full border rounded p-1" type="number" min="0" max="1" step="0.001" value={field[key]} onChange={e => edit(key, Number(e.target.value))} /></label>)}</div>
              <label className="text-xs">Font<select value={field.font || "Times-Roman"} onChange={e => edit("font", e.target.value)} className="ml-2 border rounded">{["Times-Roman", "Times-Bold", "Times-Italic", "Helvetica", "Helvetica-Bold"].map(font => <option key={font}>{font}</option>)}</select></label>
              <label className="text-xs">Text color<input type="color" value={field.color || "#000000"} onChange={e => edit("color", e.target.value)} className="ml-2" /></label>
              <label className="text-xs">Font size<input className="ml-2 w-16 border rounded" type="number" min="6" max="72" value={field.font_size || 18} onChange={e => edit("font_size", Number(e.target.value))} /></label>
              <label className="text-xs">Alignment<select value={field.align || "center"} onChange={e => edit("align", e.target.value)} className="ml-2 border rounded">{["left", "center", "right"].map(align => <option key={align}>{align}</option>)}</select></label>
              <label className="text-xs"><input type="checkbox" checked={Boolean(field.clear)} onChange={e => edit("clear", e.target.checked)} /> Clear existing content in this area</label>
              {["logo", "seal"].includes(field.key) && <button type="button" disabled={busy} onClick={() => save(false, field)} className="cred-btn cred-btn-secondary">Extract boxed artwork as {field.key}</button>}
              <button type="button" className="text-xs text-red-700" onClick={() => removeField(selected)}>Remove field</button>
            </fieldset>}
            <fieldset disabled={locked || busy} className="flex flex-col gap-3">
              <label className="text-sm">Crest / logo {revision.has_logo && "(configured)"}<input type="file" accept="image/png,image/jpeg" onChange={e => { setLogo(e.target.files?.[0] || null); setSampleUrl(""); }} className="block text-xs mt-1" /></label>
              <label className="text-sm">Seal {revision.has_seal && "(configured)"}<input type="file" accept="image/png,image/jpeg" onChange={e => { setSeal(e.target.files?.[0] || null); setSampleUrl(""); }} className="block text-xs mt-1" /></label>
            </fieldset>
            <p className="text-xs">Signature fields use the officer assets captured during approval. <Link href="/dashboard/settings" className="underline">Configure officer signatures in Settings.</Link></p>
          </div>
          <div className="min-w-0">
            <p className="text-xs mb-2">Select a field to move or resize it. Use Draw area to set a new rectangle.</p>
            <TemplateCanvas fields={fields} selected={selected} page={page} pageUrl={pageUrl} disabled={locked || busy}
              onSelect={setSelected} onChange={value => { setFields(value); setSampleUrl(""); }} onEdit={editField} onRemove={removeField}
              onUndo={undo} onRedo={redo} canUndo={historyStatus.canUndo} canRedo={historyStatus.canRedo} />
            <details className="mt-3"><summary className="text-sm cursor-pointer">Extracted text ({revision.analysis.ocr_used ? "OCR" : "text layer"})</summary><p className="text-xs mt-2">Reading evidence only; label field roles and positions yourself.</p>{!locked && field && <div className="flex flex-wrap gap-1 my-2">{(revision.analysis.pages[page - 1]?.items || []).slice(0, 500).map((item, index) => <button key={index} type="button" className="border rounded px-1 text-xs hover:bg-blue-50" onClick={() => {
                const info = revision.analysis.pages[page - 1];
                const [x0, y0, x1, y1] = item.bbox;
                setFields(previous => previous.map((f, i) => i === selected ? { ...f, page, x: x0 / info.width, y: y0 / info.height, width: (x1 - x0) / info.width, height: (y1 - y0) / info.height } : f));
                setSampleUrl("");
              }}>{item.text}</button>)}</div>}
              <pre className="whitespace-pre-wrap text-xs max-h-60 overflow-auto mt-2">{revision.analysis.pages[page - 1]?.text || "No readable text. Label fields manually."}</pre></details>
          </div>
        </div>
        {!locked && <div className="flex flex-wrap items-center gap-5 border-t border-[#E4E1D6] pt-6 px-2 pb-2"><ActionButton type="button" disabled={busy} onClick={() => save(false)} className="cred-btn cred-btn-primary gap-2 self-start"><Save size={16} /> Save draft & preview</ActionButton><ActionButton type="button" disabled={busy || previewLoading || !sampleUrl || !!previewError || unsavedChanges} onClick={requestApproval} className="cred-btn cred-btn-primary gap-2 self-start"><CheckCircle2 size={16} /> Finish editing & enable</ActionButton></div>}
        </section>}
        {!editing && !locked && <ActionButton type="button" disabled={busy || previewLoading || !sampleUrl || !!previewError || unsavedChanges} onClick={requestApproval} className="cred-btn cred-btn-primary gap-2 self-start">Approve reviewed template</ActionButton>}
      </>}
    </div>
  );
}
