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
        <Loader2 className="animate-spin text-[#08283F]" size={24} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-[#08283F] font-semibold text-xl">Academic Structure</h3>
          <p className="text-[#4A5A68] text-base mt-1.5">
            Catalog for certificate issuance. Soft-deactivate only — never hard-delete.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowInactive((v) => !v)}
          className="flex items-center gap-1.5 text-base font-semibold text-[#4A5A68] hover:text-[#08283F]"
        >
          {showInactive ? <Eye size={16} /> : <EyeOff size={16} />}
          {showInactive ? "Hide inactive" : "Show inactive"}
        </button>
      </div>

      <div className="flex gap-1 bg-[#F8F7F2] p-1.5 rounded-xl self-start flex-wrap border border-[#E4E1D6]">
        {SUBTABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setSub(t); setEditing(null); setSuccess(""); setError(""); }}
            className={`px-4 py-2.5 rounded-lg text-base font-medium transition-all ${
              sub === t ? "bg-white text-[#08283F] font-semibold shadow-sm" : "text-[#4A5A68] hover:text-[#08283F]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {success && (
        <div className="bg-[#E7F1EB] text-[#2F6F4E] text-base px-5 py-4 rounded-xl flex items-center gap-2">
          <Check size={16} /> {success}
        </div>
      )}
      {error && (
        <div className="bg-[#F5E5E3] text-[#A23B34] text-base px-5 py-4 rounded-xl break-all">⚠ {error}</div>
      )}

      {/* Departments */}
      {sub === "Departments" && (
        <div className="flex flex-col gap-5">
          <form onSubmit={addDepartment} className="flex flex-col sm:flex-row gap-3">
            <input
              required
              className="cd-input"
              placeholder="Department name"
              value={deptForm.name}
              onChange={(e) => setDeptForm({ name: e.target.value })}
            />
            <button disabled={busy} type="submit" className="cd-btn-primary disabled:opacity-50 shrink-0">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Add
            </button>
          </form>
          <div className="divide-y divide-[#E4E1D6] border border-[#E4E1D6] rounded-xl overflow-hidden bg-white">
            {departments.length === 0 && (
              <p className="px-6 py-10 text-center text-base text-[#4A5A68]">No departments yet.</p>
            )}
            {departments.map((d) => (
              <div key={d.id} className={`px-6 py-5 flex items-center justify-between gap-3 ${!d.active ? "opacity-50" : ""}`}>
                {editing?.type === "department" && editing.id === d.id ? (
                  <form onSubmit={saveEdit} className="flex-1 flex gap-2">
                    <input className="cd-input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                    <button type="submit" className="text-[#2F6F4E]"><Check size={18} /></button>
                    <button type="button" onClick={() => setEditing(null)} className="text-[#8A929C]"><X size={18} /></button>
                  </form>
                ) : (
                  <>
                    <div>
                      <p className="text-[#08283F] text-lg font-medium">{d.name}</p>
                      <p className="text-[#4A5A68] text-sm mt-1">{d.program_count ?? 0} active programs · {d.active ? "Active" : "Inactive"}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setEditing({ type: "department", id: d.id, name: d.name })} className="text-[#4A5A68] hover:text-[#08283F]"><Pencil size={16} /></button>
                      <button type="button" onClick={() => toggleActive("department", d.id, d.active)} className="text-base font-semibold text-[#B98A28]">
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
        <div className="flex flex-col gap-5">
          {departments.filter((d) => d.active).length === 0 ? (
            <p className="text-base text-[#4A5A68] bg-[#EAF2FB] rounded-xl px-5 py-4">
              Add a department first on the Departments tab.
            </p>
          ) : (
            <form onSubmit={addProgram} className="flex flex-col gap-3">
              <select required className="cd-input" value={progForm.department}
                onChange={(e) => setProgForm({ ...progForm, department: e.target.value })}>
                <option value="">Select department…</option>
                {departments.filter((d) => d.active).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <select required className="cd-input" value={progForm.qualification_type}
                onChange={(e) => setProgForm({ ...progForm, qualification_type: e.target.value })}>
                {QUALIFICATION_TYPES.map((q) => (
                  <option key={q.value} value={q.value}>{q.label}</option>
                ))}
              </select>
              <div className="flex flex-col sm:flex-row gap-3">
                <input required className="cd-input" placeholder="Full formal title (e.g. Bachelor of Science in Nursing)"
                  value={progForm.title} onChange={(e) => setProgForm({ ...progForm, title: e.target.value })} />
                <button disabled={busy} type="submit" className="cd-btn-primary disabled:opacity-50 shrink-0">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Add
                </button>
              </div>
            </form>
          )}
          {Object.keys(programsByDept).length === 0 && (
            <p className="px-6 py-10 text-center text-base text-[#4A5A68] border border-[#E4E1D6] rounded-xl bg-white">No programs yet.</p>
          )}
          {Object.entries(programsByDept).map(([deptName, list]) => (
            <div key={deptName} className="border border-[#E4E1D6] rounded-xl overflow-hidden bg-white">
              <p className="px-6 py-3 bg-[#F8F7F2] text-[#B98A28] text-sm font-bold uppercase tracking-wide">{deptName}</p>
              <div className="divide-y divide-[#E4E1D6]">
                {list.map((p) => (
                  <div key={p.id} className={`px-6 py-5 flex items-center justify-between gap-3 ${!p.active ? "opacity-50" : ""}`}>
                    {editing?.type === "program" && editing.id === p.id ? (
                      <form onSubmit={saveEdit} className="flex-1 flex flex-col gap-3">
                        <select className="cd-input" value={editing.department}
                          onChange={(e) => setEditing({ ...editing, department: e.target.value })}>
                          {departments.filter((d) => d.active).map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                        <select className="cd-input" value={editing.qualification_type || "bachelors"}
                          onChange={(e) => setEditing({ ...editing, qualification_type: e.target.value })}>
                          {QUALIFICATION_TYPES.map((q) => (
                            <option key={q.value} value={q.value}>{q.label}</option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <input className="cd-input" value={editing.title}
                            onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                          <button type="submit" className="text-[#2F6F4E]"><Check size={18} /></button>
                          <button type="button" onClick={() => setEditing(null)} className="text-[#8A929C]"><X size={18} /></button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div>
                          <p className="text-[#08283F] text-lg font-medium">{p.title}</p>
                          <p className="text-[#4A5A68] text-sm mt-1">
                            {qualificationLabel(p.qualification_type || "bachelors")}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <button type="button" onClick={() => setEditing({
                            type: "program",
                            id: p.id,
                            title: p.title,
                            department: p.department,
                            qualification_type: p.qualification_type || "bachelors",
                          })} className="text-[#4A5A68] hover:text-[#08283F]"><Pencil size={16} /></button>
                          <button type="button" onClick={() => toggleActive("program", p.id, p.active)}
                            className="text-base font-semibold text-[#B98A28]">
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
        <div className="flex flex-col gap-5">
          <form onSubmit={addGrade} className="flex flex-col sm:flex-row gap-3">
            <input required className="cd-input" placeholder="Classification label"
              value={gradeForm.label} onChange={(e) => setGradeForm({ label: e.target.value })} />
            <button disabled={busy} type="submit" className="cd-btn-primary disabled:opacity-50 shrink-0">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Add
            </button>
          </form>
          <div className="divide-y divide-[#E4E1D6] border border-[#E4E1D6] rounded-xl overflow-hidden bg-white">
            {grades.length === 0 && (
              <p className="px-6 py-10 text-center text-base text-[#4A5A68]">No classifications yet.</p>
            )}
            {grades.map((g, index) => (
              <div key={g.id} className={`px-6 py-5 flex items-center gap-3 ${!g.active ? "opacity-50" : ""}`}>
                <div className="flex flex-col gap-0.5 text-[#8A929C]">
                  <button type="button" disabled={busy || index === 0} onClick={() => moveGrade(index, -1)}
                    className="disabled:opacity-30 hover:text-[#08283F]"><ChevronUp size={16} /></button>
                  <button type="button" disabled={busy || index === grades.length - 1} onClick={() => moveGrade(index, 1)}
                    className="disabled:opacity-30 hover:text-[#08283F]"><ChevronDown size={16} /></button>
                </div>
                <GripVertical size={16} className="text-[#8A929C] shrink-0" />
                {editing?.type === "grade" && editing.id === g.id ? (
                  <form onSubmit={saveEdit} className="flex-1 flex gap-2">
                    <input className="cd-input" value={editing.label}
                      onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
                    <button type="submit" className="text-[#2F6F4E]"><Check size={18} /></button>
                    <button type="button" onClick={() => setEditing(null)} className="text-[#8A929C]"><X size={18} /></button>
                  </form>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#08283F] text-lg font-medium">{g.label}</p>
                      <p className="text-[#4A5A68] text-sm mt-1">Order {g.sort_order} · {g.active ? "Active" : "Inactive"}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setEditing({ type: "grade", id: g.id, label: g.label })}
                        className="text-[#4A5A68] hover:text-[#08283F]"><Pencil size={16} /></button>
                      <button type="button" onClick={() => toggleActive("grade", g.id, g.active)}
                        className="text-base font-semibold text-[#B98A28]">
                        {g.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          <p className="text-[#4A5A68] text-base">
            Use the arrows to reorder. Issuance form shows active grades by this order.
          </p>
        </div>
      )}

      <p className="text-[#4A5A68] text-base">
        Need these for issuance? Open{" "}
        <Link href="/dashboard/certificates/new" className="text-[#B98A28] font-semibold hover:underline">
          Issue Certificate
        </Link>
        .
      </p>
    </div>
  );
}
