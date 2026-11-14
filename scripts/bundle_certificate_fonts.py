"""Build bundled certificate fonts. Requires requests and fonttools (build only)."""
from io import BytesIO
from pathlib import Path
import shutil
import requests
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
BACK = ROOT / "back/cred/institutions/fonts/certificate"
FRONT = ROOT / "front/app-next/public/fonts/certificate"
SOURCES = [
    ("cormorantgaramond", "CormorantGaramond[wght].ttf", [("CormorantGaramond", 400), ("CormorantGaramond-Bold", 700)]),
    ("cormorantgaramond", "CormorantGaramond-Italic[wght].ttf", [("CormorantGaramond-Italic", 400), ("CormorantGaramond-BoldItalic", 700)]),
    ("cinzel", "Cinzel[wght].ttf", [("Cinzel", 400), ("Cinzel-Bold", 700)]),
    ("greatvibes", "GreatVibes-Regular.ttf", [("GreatVibes", None)]),
]

def fetch(url):
    response = requests.get(url, timeout=45)
    response.raise_for_status()
    return response.content

def main():
    from urllib.parse import quote
    commit = requests.get("https://api.github.com/repos/google/fonts/commits/main", timeout=30)
    commit.raise_for_status()
    sha = commit.json()["sha"]
    BACK.mkdir(parents=True, exist_ok=True)
    FRONT.mkdir(parents=True, exist_ok=True)
    for folder, filename, instances in SOURCES:
        base = f"https://raw.githubusercontent.com/google/fonts/{sha}/ofl/{folder}/"
        data = fetch(base + quote(filename))
        for name, weight in instances:
            target = BACK / (name + ".ttf")
            if weight is None:
                target.write_bytes(data)
            else:
                font = TTFont(BytesIO(data))
                font = instantiateVariableFont(font, {"wght": weight}, inplace=True)
                for record in list(font["name"].names):
                    if record.nameID == 6:
                        font["name"].setName(name, 6, record.platformID, record.platEncID, record.langID)
                font.save(target)
            shutil.copyfile(target, FRONT / target.name)
        license_path = BACK / (folder + "-OFL.txt")
        license_path.write_bytes(fetch(base + "OFL.txt"))
        shutil.copyfile(license_path, FRONT / license_path.name)
    provenance = f"Fonts sourced from https://github.com/google/fonts at commit {sha}.\nStatic instances use weights 400 and 700. Licenses accompany these files.\nRebuild: python scripts/bundle_certificate_fonts.py (requires requests and fonttools).\n"
    (BACK / "README.txt").write_text(provenance)
    (FRONT / "README.txt").write_text(provenance)
    print("Bundled seven certificate font styles with licenses.")

if __name__ == "__main__":
    main()
