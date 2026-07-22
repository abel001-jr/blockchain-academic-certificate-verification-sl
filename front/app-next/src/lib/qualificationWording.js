/** Formal certificate award wording — mirrors institutions/qualification_wording.py */

export const QUALIFICATION_TYPES = [
  { value: "bachelors", label: "Bachelor's Degree" },
  { value: "masters", label: "Master's Degree" },
  { value: "postgrad_diploma", label: "Postgraduate Diploma" },
  { value: "diploma", label: "Diploma" },
  { value: "certificate", label: "Certificate" },
  { value: "associate", label: "Associate Degree" },
];

export function qualificationLabel(value) {
  return QUALIFICATION_TYPES.find((q) => q.value === value)?.label || value;
}

/**
 * @returns {{ studyLine, awardIntro, awardPhrase }}
 */
export function awardParts(qualificationType, degreeTitle) {
  const q = qualificationType || "bachelors";
  const title = (degreeTitle || "").trim() || "—";

  let kind = "degree";
  let prep = "of";

  if (q === "diploma" || q === "postgrad_diploma") {
    kind = "diploma";
    prep = "of";
  } else if (q === "certificate") {
    kind = "certificate";
    prep = "in";
  } else if (q === "bachelors" || q === "masters" || q === "associate") {
    kind = "degree";
    prep = "of";
  }

  return {
    studyLine: "has successfully completed the programme of study and",
    awardIntro: "has been awarded the",
    awardPhrase: `${kind} ${prep} ${title}`,
  };
}
