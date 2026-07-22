"use client";
/**
 * Academic Structure catalog — Departments, Programs, Grade Classifications.
 * Registrar only; off-chain session auth (no MetaMask).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2, Plus, Pencil, EyeOff, Eye, Check, X, GripVertical, ChevronUp, ChevronDown,
} from "lucide-react";
import { api } from "@/lib/api";
import Link from "next/link";
import { QUALIFICATION_TYPES, qualificationLabel } from "@/lib/qualificationWording";

const SUBTABS = ["Departments", "Programs", "Grade Classifications"];
const inp = "w-full bg-[#eef4ff] border border-transparent focus:border-[#022448] rounded-[10px] px-4 py-3 text-sm outline-none";
const lbl = "text-[#022448] text-xs font-semibold uppercase tracking-widest block mb-1.5";

export default function AcademicStructurePanel() {
  const [sub, setSub] = useState("Departments");
  const [showInactive, setShowInactive] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const [deptForm, setDeptForm] = useState({ name: "" });
  const [progForm, setProgForm] = useState({
    department: "",
    title: "",
    qualification_type: "bachelors",
  });
  const [gradeForm, setGradeForm] = useState({ label: "" });
  const [editing, setEditing] = useState(null); // { type, id, ...fields }

  const q = showInactive ? "?include_inactive=1" : "";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [d, p, g] = await Promise.all([
        api.get(`/catalog/departments/${q}`),
        api.get(`/catalog/programs/${q}`),
        api.get(`/catalog/grades/${q}`),
      ]);
      setDepartments(d.results ?? d);
      setPrograms(p.results ?? p);
      setGrades(g.results ?? g);
    } catch (e) {
      setError(e?.detail || "Failed to load academic catalog.");
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => { load(); }, [load]);

  const programsByDept = useMemo(() => {
    const map = {};
    for (const p of programs) {
      const key = p.department_name || p.department;
      if (!map[key]) map[key] = [];
      map[key].push(p);
    }
    return map;
  }, [programs]);

  async function addDepartment(e) {
    e.preventDefault();
    setBusy(true); setError(""); setSuccess("");
    try {
      await api.post("/catalog/departments/", { name: deptForm.name.trim() });
      setDeptForm({ name: "" });
      setSuccess("Department added.");
      load();
    } catch (err) {
      setError(err?.name?.[0] || err?.detail || JSON.stringify(err));
    } finally {
      setBusy(false);
    }
  }

  async function addProgram(e) {
    e.preventDefault();
    setBusy(true); setError(""); setSuccess("");
    try {
      await api.post("/catalog/programs/", {
        department: progForm.department,
        title: progForm.title.trim(),
        qualification_type: progForm.qualification_type,
      });
      setProgForm({ department: progForm.department, title: "", qualification_type: "bachelors" });
      setSuccess("Program added.");
      load();
    } catch (err) {
      setError(err?.title?.[0] || err?.department?.[0] || err?.detail || JSON.stringify(err));
    } finally {
      setBusy(false);
    }
  }

  async function addGrade(e) {
    e.preventDefault();
    setBusy(true); setError(""); setSuccess("");
    try {
      await api.post("/catalog/grades/", { label: gradeForm.label.trim() });
      setGradeForm({ label: "" });
      setSuccess("Grade classification added.");
      load();
    } catch (err) {
      setError(err?.label?.[0] || err?.detail || JSON.stringify(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      if (editing.type === "department") {
        await api.patch(`/catalog/departments/${editing.id}/`, { name: editing.name.trim() });
      } else if (editing.type === "program") {
        await api.patch(`/catalog/programs/${editing.id}/`, {
          title: editing.title.trim(),
          department: editing.department,
          qualification_type: editing.qualification_type,
        });
      } else if (editing.type === "grade") {
        await api.patch(`/catalog/grades/${editing.id}/`, { label: editing.label.trim() });
      }
      setEditing(null);
      setSuccess("Saved.");
      load();
    } catch (err) {
      setError(err?.detail || JSON.stringify(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(type, id, active) {
    setBusy(true); setError(""); setSuccess("");
    try {
      const path =
        type === "department" ? `/catalog/departments/${id}/` :
        type === "program" ? `/catalog/programs/${id}/` :
        `/catalog/grades/${id}/`;
      await api.patch(path, { active: !active });
      setSuccess(active ? "Deactivated." : "Reactivated.");
      load();
    } catch (err) {
      setError(err?.detail || JSON.stringify(err));
    } finally {
      setBusy(false);
    }
  }

  async function moveGrade(index, dir) {
    const next = [...grades];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setGrades(next);
    setBusy(true); setError("");
    try {
      const data = await api.post("/catalog/grades/reorder/", {
        order: next.map((g) => g.id),
      });
      setGrades(data.results ?? data);
      setSuccess("Order updated.");
    } catch (err) {
      setError(err?.detail || JSON.stringify(err));
      load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-[#022448]" size={24} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-[#022448] font-semibold text-sm">Academic Structure</h3>
          <p className="text-[#74777f] text-xs mt-0.5">
            Catalog for certificate issuance. Soft-deactivate only — never hard-delete.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowInactive((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#43474e] hover:text-[#022448]"
        >
          {showInactive ? <Eye size={14} /> : <EyeOff size={14} />}
          {showInactive ? "Hide inactive" : "Show inactive"}
        </button>
      </div>

      <div className="flex gap-1 bg-[#FAF7F2] p-1 rounded-[10px] self-start flex-wrap">
        {SUBTABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setSub(t); setEditing(null); setSuccess(""); setError(""); }}
            className={`px-3 py-1.5 rounded-[8px] text-xs font-medium transition-all ${
              sub === t ? "bg-white text-[#022448] font-semibold shadow-sm" : "text-[#43474e]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {success && (
        <div className="bg-[#2E7D32]/10 text-[#2E7D32] text-sm px-4 py-3 rounded-lg flex items-center gap-2">
          <Check size={14} /> {success}
        </div>
      )}
      {error && (
        <div className="bg-[#ffdad6] text-[#93000a] text-sm px-4 py-3 rounded-lg break-all">⚠ {error}</div>
      )}

      {/* Departments */}
      {sub === "Departments" && (
        <div className="flex flex-col gap-4">
          <form onSubmit={addDepartment} className="flex flex-col sm:flex-row gap-2">
            <input
              required
              className={inp}
              placeholder="Department name"
              value={deptForm.name}
              onChange={(e) => setDeptForm({ name: e.target.value })}
            />
            <button disabled={busy} type="submit"
              className="flex items-center gap-1.5 bg-[#022448] text-white px-4 py-3 rounded-[10px] text-xs font-semibold disabled:opacity-50 shrink-0">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
            </button>
          </form>
          <div className="divide-y divide-[#c4c6cf]/15 border border-[#c4c6cf]/15 rounded-[12px] overflow-hidden">
            {departments.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-[#74777f]">No departments yet.</p>
            )}
            {departments.map((d) => (
              <div key={d.id} className={`px-4 py-3 flex items-center justify-between gap-3 ${!d.active ? "opacity-50" : ""}`}>
                {editing?.type === "department" && editing.id === d.id ? (
                  <form onSubmit={saveEdit} className="flex-1 flex gap-2">
                    <input className={inp} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                    <button type="submit" className="text-[#2E7D32]"><Check size={16} /></button>
                    <button type="button" onClick={() => setEditing(null)} className="text-[#74777f]"><X size={16} /></button>
                  </form>
                ) : (
                  <>
                    <div>
                      <p className="text-[#022448] text-sm font-medium">{d.name}</p>
                      <p className="text-[#74777f] text-[11px]">{d.program_count ?? 0} active programs · {d.active ? "Active" : "Inactive"}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditing({ type: "department", id: d.id, name: d.name })} className="text-[#43474e] hover:text-[#022448]"><Pencil size={14} /></button>
                      <button type="button" onClick={() => toggleActive("department", d.id, d.active)} className="text-xs font-semibold text-[#7b5900]">
                        {d.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Programs */}
      {sub === "Programs" && (
        <div className="flex flex-col gap-4">
          {departments.filter((d) => d.active).length === 0 ? (
            <p className="text-sm text-[#74777f] bg-[#eef4ff] rounded-[10px] px-4 py-3">
              Add a department first on the Departments tab.
            </p>
          ) : (
            <form onSubmit={addProgram} className="flex flex-col gap-2">
              <select required className={inp} value={progForm.department}
                onChange={(e) => setProgForm({ ...progForm, department: e.target.value })}>
                <option value="">Select department…</option>
                {departments.filter((d) => d.active).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <select required className={inp} value={progForm.qualification_type}
                onChange={(e) => setProgForm({ ...progForm, qualification_type: e.target.value })}>
                {QUALIFICATION_TYPES.map((q) => (
                  <option key={q.value} value={q.value}>{q.label}</option>
                ))}
              </select>
              <div className="flex flex-col sm:flex-row gap-2">
                <input required className={inp} placeholder="Full formal title (e.g. Bachelor of Science in Nursing)"
                  value={progForm.title} onChange={(e) => setProgForm({ ...progForm, title: e.target.value })} />
                <button disabled={busy} type="submit"
                  className="flex items-center gap-1.5 bg-[#022448] text-white px-4 py-3 rounded-[10px] text-xs font-semibold disabled:opacity-50 shrink-0">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
                </button>
              </div>
            </form>
          )}
          {Object.keys(programsByDept).length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-[#74777f] border border-[#c4c6cf]/15 rounded-[12px]">No programs yet.</p>
          )}
          {Object.entries(programsByDept).map(([deptName, list]) => (
            <div key={deptName} className="border border-[#c4c6cf]/15 rounded-[12px] overflow-hidden">
              <p className="px-4 py-2 bg-[#FAF7F2] text-[#7b5900] text-xs font-bold uppercase tracking-wide">{deptName}</p>
              <div className="divide-y divide-[#c4c6cf]/10">
                {list.map((p) => (
                  <div key={p.id} className={`px-4 py-3 flex items-center justify-between gap-3 ${!p.active ? "opacity-50" : ""}`}>
                    {editing?.type === "program" && editing.id === p.id ? (
                      <form onSubmit={saveEdit} className="flex-1 flex flex-col gap-2">
                        <select className={inp} value={editing.department}
                          onChange={(e) => setEditing({ ...editing, department: e.target.value })}>
                          {departments.filter((d) => d.active).map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                        <select className={inp} value={editing.qualification_type || "bachelors"}
                          onChange={(e) => setEditing({ ...editing, qualification_type: e.target.value })}>
                          {QUALIFICATION_TYPES.map((q) => (
                            <option key={q.value} value={q.value}>{q.label}</option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <input className={inp} value={editing.title}
                            onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                          <button type="submit" className="text-[#2E7D32]"><Check size={16} /></button>
                          <button type="button" onClick={() => setEditing(null)} className="text-[#74777f]"><X size={16} /></button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div>
                          <p className="text-[#022448] text-sm font-medium">{p.title}</p>
                          <p className="text-[#74777f] text-[11px]">
                            {qualificationLabel(p.qualification_type || "bachelors")}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button type="button" onClick={() => setEditing({
                            type: "program",
                            id: p.id,
                            title: p.title,
                            department: p.department,
                            qualification_type: p.qualification_type || "bachelors",
                          })} className="text-[#43474e] hover:text-[#022448]"><Pencil size={14} /></button>
                          <button type="button" onClick={() => toggleActive("program", p.id, p.active)}
                            className="text-xs font-semibold text-[#7b5900]">
                            {p.active ? "Deactivate" : "Reactivate"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grades */}
      {sub === "Grade Classifications" && (
        <div className="flex flex-col gap-4">
          <form onSubmit={addGrade} className="flex flex-col sm:flex-row gap-2">
            <input required className={inp} placeholder="Classification label"
              value={gradeForm.label} onChange={(e) => setGradeForm({ label: e.target.value })} />
            <button disabled={busy} type="submit"
              className="flex items-center gap-1.5 bg-[#022448] text-white px-4 py-3 rounded-[10px] text-xs font-semibold disabled:opacity-50 shrink-0">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
            </button>
          </form>
          <div className="divide-y divide-[#c4c6cf]/15 border border-[#c4c6cf]/15 rounded-[12px] overflow-hidden">
            {grades.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-[#74777f]">No classifications yet.</p>
            )}
            {grades.map((g, index) => (
              <div key={g.id} className={`px-4 py-3 flex items-center gap-3 ${!g.active ? "opacity-50" : ""}`}>
                <div className="flex flex-col gap-0.5 text-[#c4c6cf]">
                  <button type="button" disabled={busy || index === 0} onClick={() => moveGrade(index, -1)}
                    className="disabled:opacity-30 hover:text-[#022448]"><ChevronUp size={14} /></button>
                  <button type="button" disabled={busy || index === grades.length - 1} onClick={() => moveGrade(index, 1)}
                    className="disabled:opacity-30 hover:text-[#022448]"><ChevronDown size={14} /></button>
                </div>
                <GripVertical size={14} className="text-[#c4c6cf] shrink-0" />
                {editing?.type === "grade" && editing.id === g.id ? (
                  <form onSubmit={saveEdit} className="flex-1 flex gap-2">
                    <input className={inp} value={editing.label}
                      onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
                    <button type="submit" className="text-[#2E7D32]"><Check size={16} /></button>
                    <button type="button" onClick={() => setEditing(null)} className="text-[#74777f]"><X size={16} /></button>
                  </form>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#022448] text-sm font-medium">{g.label}</p>
                      <p className="text-[#74777f] text-[11px]">Order {g.sort_order} · {g.active ? "Active" : "Inactive"}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditing({ type: "grade", id: g.id, label: g.label })}
                        className="text-[#43474e] hover:text-[#022448]"><Pencil size={14} /></button>
                      <button type="button" onClick={() => toggleActive("grade", g.id, g.active)}
                        className="text-xs font-semibold text-[#7b5900]">
                        {g.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          <p className="text-[#74777f] text-[11px]">
            Use the arrows to reorder. Issuance form shows active grades by this order.
          </p>
        </div>
      )}

      <p className="text-[#74777f] text-[11px]">
        Need these for issuance? Open{" "}
        <Link href="/dashboard/certificates/new" className="text-[#7b5900] font-semibold hover:underline">
          Issue Certificate
        </Link>
        .
      </p>
    </div>
  );
}
