"""Award profiles guide recommendations without inventing official award data."""
PROFILES = {
    "bsc": "Bachelor of Science", "ba": "Bachelor of Arts",
    "beng": "Bachelor of Engineering", "msc": "Master of Science",
    "ma": "Master of Arts", "phd": "Doctor of Philosophy", "diploma": "Diploma",
}
CORE = ["institution_name", "student_name", "degree_title", "graduation_year", "certificate_id"]


def selected_profile(value="bsc"):
    if not isinstance(value, str) or value not in PROFILES:
        raise ValueError("Choose a supported certificate type.")
    return {"id": value, "title": PROFILES[value], "required_fields": list(CORE),
        "optional_fields": ["department", "grade", "logo", "seal", "registrar_signature", "vc_signature", "chancellor_signature", "qr"],
        "guidance": "Use the selected award family for wording and degree-title placement. The exact programme, classification, graduate name and year are institution-supplied inputs. Do not invent a programme or change existing award wording."}


def annotate_profile(result, profile, analysis):
    result["certificate_profile"] = profile
    found = {item["field"]["key"] for item in result["items"]}
    result["missing_required_fields"] = [key for key in profile["required_fields"] if key not in found]
    for item in result["items"]:
        if item["field"]["key"] in CORE:
            item["field"]["required"] = True
        if item["field"]["key"] == "degree_title":
            item["note"] += " Selected award family: " + profile["title"] + ". Exact programme remains editable."
    text = " ".join(p.get("text", "") or " ".join(l.get("text", "") for l in p.get("lines", [])) for p in analysis.get("pages", [])).casefold()
    for key, title in PROFILES.items():
        if key != profile["id"] and title.casefold() in text:
            result["warnings"].append("The master mentions " + title + ", but you selected " + profile["title"] + ". Verify the award type; embedded text has not been changed.")
            break
    return result
