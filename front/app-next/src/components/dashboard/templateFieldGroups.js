export const FIELD_GROUPS = [
  {name: "Required · Graduate details", keys: [["student_name", "Graduate full name"], ["degree_title", "Degree / award title"], ["graduation_year", "Graduation year"]]},
  {name: "Required · Officer signatures (images)", keys: [["registrar_signature", "Registrar signature"], ["vc_signature", "Vice-Chancellor signature"], ["chancellor_signature", "Chancellor signature"]]},
  {name: "Institutional details", keys: [["institution_name", "Institution name"], ["department", "Department"]]},
  {name: "Graduate details · Optional", keys: [["grade", "Classification / honours"]]},
  {name: "Institutional images", keys: [["logo", "Crest / logo"], ["seal", "Seal"]]},
  {name: "Verification", keys: [["certificate_id", "Certificate ID"], ["qr", "Verification QR code"]]},
  {name: "Other content", keys: [["static_text", "Fixed wording"]]},
];
export const fieldLabel = key => FIELD_GROUPS.flatMap(group => group.keys).find(([value]) => value === key)?.[1] || key.replaceAll("_", " ");
