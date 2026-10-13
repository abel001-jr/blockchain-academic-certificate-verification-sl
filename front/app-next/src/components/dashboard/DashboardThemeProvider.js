"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import "./dashboardTheme.css";

export const THEMES = [
  { id: "navy", name: "Credence Navy", primary: "#08283F", accent: "#780110", tint: "#F2EFE7", paper: "#F8F7F2", line: "#E4E1D6" },
  { id: "maroon", name: "Maroon", primary: "#70283F", accent: "#946321", tint: "#F8EDF1", paper: "#FCF8F9", line: "#E8CDD7" },
  { id: "blue", name: "Ocean Blue", primary: "#174A8B", accent: "#315EB0", tint: "#EDF4FF", paper: "#F7FAFF", line: "#CCDDF5" },
  { id: "forest", name: "Forest Green", primary: "#205C49", accent: "#76601F", tint: "#EAF5EF", paper: "#F7FAF8", line: "#CCE4D6" },
  { id: "purple", name: "Plum", primary: "#593877", accent: "#785399", tint: "#F3EDF9", paper: "#FBF8FD", line: "#DFD0ED" },
];
const KEY = "credence.dashboard-theme";
const EVENT = "credence:dashboard-theme";
const ThemeContext = createContext(null);
let fallback = null;
function snapshot() {
  let id = fallback;
  if (id === null) {
    try { id = localStorage.getItem(KEY); } catch { /* In-memory preference remains available. */ }
  }
  return THEMES.some(theme => theme.id === id) ? id : "navy";
}
function subscribe(callback) {
  const storage = event => { if (event.key === KEY || event.key === null) { fallback = null; callback(); } };
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", storage);
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener("storage", storage); };
}
export default function DashboardThemeProvider({ children }) {
  const id = useSyncExternalStore(subscribe, snapshot, () => "navy");
  const theme = THEMES.find(item => item.id === id);
  function chooseTheme(next) {
    if (!THEMES.some(item => item.id === next)) return false;
    fallback = next;
    let persisted = true;
    try { localStorage.setItem(KEY, next); } catch { persisted = false; }
    window.dispatchEvent(new Event(EVENT));
    return persisted;
  }
  return <ThemeContext.Provider value={{ theme, chooseTheme }}>
    <div className="cd-themed-dashboard" data-theme={id} style={{"--cd-primary": theme.primary, "--cd-accent": theme.accent, "--cd-tint": theme.tint, "--cd-paper": theme.paper, "--cd-line": theme.line}}>{children}</div>
  </ThemeContext.Provider>;
}
export const useDashboardTheme = () => useContext(ThemeContext);
