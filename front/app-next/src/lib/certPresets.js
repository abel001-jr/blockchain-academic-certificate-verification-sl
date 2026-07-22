/** Certificate branding presets — mirrors back/cred/institutions/branding.py */

export const CERT_PRESETS = {
  classic_navy: {
    id: "classic_navy",
    label: "Classic Navy",
    primary: "#022448",
    accent: "#7b5900",
    bg: "#FAF7F2",
    surface: "#ffffff",
    muted: "#43474e",
  },
  forest_green: {
    id: "forest_green",
    label: "Forest Green",
    primary: "#1B4332",
    accent: "#B08968",
    bg: "#F5F7F4",
    surface: "#ffffff",
    muted: "#495057",
  },
  deep_burgundy: {
    id: "deep_burgundy",
    label: "Deep Burgundy",
    primary: "#4A0E1F",
    accent: "#C9A227",
    bg: "#FBF6F4",
    surface: "#ffffff",
    muted: "#5C4A4A",
  },
  slate_blue: {
    id: "slate_blue",
    label: "Slate Blue",
    primary: "#1E3A5F",
    accent: "#5B8DEF",
    bg: "#F4F7FB",
    surface: "#ffffff",
    muted: "#4A5568",
  },
  warm_charcoal: {
    id: "warm_charcoal",
    label: "Warm Charcoal",
    primary: "#2D2A26",
    accent: "#C4784A",
    bg: "#F7F5F2",
    surface: "#ffffff",
    muted: "#5C574F",
  },
};

export const PRESET_LIST = Object.values(CERT_PRESETS);

export function getPreset(id) {
  return CERT_PRESETS[id] || CERT_PRESETS.classic_navy;
}

/** Sample data for Settings → Certificate Branding live preview */
export const SAMPLE_CERT = {
  institution_name: "Central University of Sierra Leone",
  student_name: "Student Test",
  degree_title: "Bachelor of Science in Nursing",
  qualification_type: "bachelors",
  department: "Faculty of Engineering & Technology",
  grade: "First Class Honours",
  graduation_year: 2026,
  certificate_id: "CR-2026-CUSL-0000",
  registrar_signer_name: "Jane Registrar",
  registrar_signed_at: null,
  vc_approver_name: "",
  chancellor_approver_name: "",
  vc_approved_at: null,
  chancellor_approved_at: null,
};
