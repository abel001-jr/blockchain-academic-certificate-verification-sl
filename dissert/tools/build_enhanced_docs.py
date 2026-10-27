"""Build the three editable Word drafts using only Python's standard library."""

from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile
import re


ROOT = Path(__file__).resolve().parents[1]
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
ET.register_namespace("w", W)
ET.register_namespace("r", R)


def element(parent, tag, attrs=None, text=None):
    node = ET.SubElement(parent, f"{{{W}}}{tag}", {
        f"{{{W}}}{key}": str(value) for key, value in (attrs or {}).items()
    })
    if text is not None:
        node.text = text
    return node


def paragraph(parent, text, style="Normal"):
    p = element(parent, "p")
    pp = element(p, "pPr")
    element(pp, "pStyle", {"val": style})
    if style == "TableText":
        element(pp, "spacing", {"after": 60, "line": 240, "lineRule": "auto"})
    run = element(p, "r")
    t = element(run, "t", text=text)
    t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    return p


def table(parent, lines):
    rows = [[c.strip() for c in line.strip().strip("|").split("|")] for line in lines]
    rows = [row for row in rows if not all(re.fullmatch(r":?-+:?", c) for c in row)]
    cols = len(rows[0])
    width = 9026 // cols
    tbl = element(parent, "tbl")
    props = element(tbl, "tblPr")
    element(props, "tblW", {"w": 9026, "type": "dxa"})
    element(props, "tblLayout", {"type": "fixed"})
    borders = element(props, "tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        element(borders, edge, {"val": "single", "sz": 4, "color": "B7B7B7"})
    margins = element(props, "tblCellMar")
    for edge in ("top", "left", "bottom", "right"):
        element(margins, edge, {"w": 80, "type": "dxa"})
    grid = element(tbl, "tblGrid")
    for _ in range(cols):
        element(grid, "gridCol", {"w": width})
    for index, row in enumerate(rows):
        tr = element(tbl, "tr")
        trprops = element(tr, "trPr")
        if index == 0:
            element(trprops, "tblHeader")
        for cell in row:
            tc = element(tr, "tc")
            tcp = element(tc, "tcPr")
            element(tcp, "tcW", {"w": width, "type": "dxa"})
            if index == 0:
                element(tcp, "shd", {"fill": "EAEAEA", "val": "clear"})
            p = paragraph(tc, cell, "TableText")
            if index == 0:
                run = p.find(f"{{{W}}}r")
                rp = ET.Element(f"{{{W}}}rPr")
                element(rp, "b")
                run.insert(0, rp)
    paragraph(parent, "")


def styles_xml():
    root = ET.Element(f"{{{W}}}styles")
    defaults = element(root, "docDefaults")
    rdefault = element(defaults, "rPrDefault")
    rp = element(rdefault, "rPr")
    element(rp, "rFonts", {"ascii": "Times New Roman", "hAnsi": "Times New Roman", "cs": "Times New Roman"})
    element(rp, "sz", {"val": 24})
    element(rp, "lang", {"val": "en-GB"})
    pd = element(defaults, "pPrDefault")
    pp = element(pd, "pPr")
    element(pp, "spacing", {"after": 120, "line": 360, "lineRule": "auto"})
    element(pp, "jc", {"val": "both"})
    element(pp, "widowControl")
    definitions = [
        ("Normal", "Normal", None, None),
        ("Title", "Title", None, None),
        ("Heading1", "heading 1", 0, 28),
        ("Heading2", "heading 2", 1, 28),
        ("Heading3", "heading 3", 2, 28),
        ("TableText", "Table Text", None, 24),
        ("Caption", "Caption", None, 24),
    ]
    for sid, name, level, size in definitions:
        s = element(root, "style", {"type": "paragraph", "styleId": sid})
        if sid == "Normal":
            s.set(f"{{{W}}}default", "1")
        element(s, "name", {"val": name})
        if sid != "Normal":
            element(s, "basedOn", {"val": "Normal"})
        pp = element(s, "pPr")
        if level is not None or sid == "Title":
            element(pp, "keepNext")
            element(pp, "keepLines")
            element(pp, "spacing", {"before": 240, "after": 120})
            element(pp, "jc", {"val": "center" if sid == "Title" else "left"})
            if level is not None:
                element(pp, "outlineLvl", {"val": level})
        elif sid in ("Caption", "TableText"):
            element(pp, "jc", {"val": "left"})
            if sid == "Caption":
                element(pp, "keepNext")
        rp = element(s, "rPr")
        if level is not None or sid in ("Title", "Caption"):
            element(rp, "b")
        if size or sid == "Title":
            element(rp, "sz", {"val": size or 28})
    return root


def xml_bytes(root):
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def build(source):
    doc = ET.Element(f"{{{W}}}document")
    body = element(doc, "body")
    lines = source.read_text(encoding="utf-8").splitlines()
    i = 0
    first_heading = True
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line.startswith("|"):
            group = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                group.append(lines[i])
                i += 1
            table(body, group)
            continue
        match = re.match(r"^(#{1,3})\s+(.+)$", line)
        if match:
            level, text = len(match[1]), match[2]
            style = "Title" if level == 1 else f"Heading{level - 1}"
            if level == 1 and not first_heading:
                style = "Title"
            first_heading = False
            paragraph(body, text, style)
        else:
            style = "Caption" if re.match(r"Table \d+\.\d+:", line) else "Normal"
            paragraph(body, line, style)
        i += 1
    sect = element(body, "sectPr")
    footer = element(sect, "footerReference", {"type": "default"})
    footer.set(f"{{{R}}}id", "rId2")
    element(sect, "pgSz", {"w": 11906, "h": 16838})
    element(sect, "pgMar", {"top": 1440, "right": 1440, "bottom": 1440, "left": 1440, "header": 720, "footer": 720, "gutter": 0})
    foot = ET.Element(f"{{{W}}}ftr")
    p = element(foot, "p")
    pp = element(p, "pPr")
    element(pp, "jc", {"val": "center"})
    field = element(p, "fldSimple", {"instr": "PAGE"})
    element(element(field, "r"), "t", text="1")
    types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>'''
    rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'''
    docrels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>'''
    target = source.with_suffix(".docx")
    with ZipFile(target, "w", ZIP_DEFLATED) as archive:
        for name, data in {
            "[Content_Types].xml": types,
            "_rels/.rels": rels,
            "word/document.xml": xml_bytes(doc),
            "word/styles.xml": xml_bytes(styles_xml()),
            "word/footer1.xml": xml_bytes(foot),
            "word/_rels/document.xml.rels": docrels,
        }.items():
            archive.writestr(name, data)
    validate(source, target)


def validate(source, target):
    with ZipFile(target) as archive:
        assert archive.testzip() is None
        for name in archive.namelist():
            ET.fromstring(archive.read(name))
        doc = ET.fromstring(archive.read("word/document.xml"))
        texts = ["".join(p.itertext()) for p in doc.findall(f".//{{{W}}}p")]
        for line in source.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("|"):
                expected = re.sub(r"^#{1,3}\s+", "", line)
                assert expected in texts, f"Missing paragraph: {expected[:80]}"
        section = doc.find(f".//{{{W}}}sectPr")
        assert section.find(f"{{{W}}}pgSz").get(f"{{{W}}}w") == "11906"
        print(f"Validated {target.name}: {len(texts)} paragraphs; {len(doc.findall(f'.//{{{W}}}tbl'))} tables")


if __name__ == "__main__":
    for filename in (
        "Chap1_enhanced.md",
        "Chap2_draft.md",
        "Chap3_enhanced.md",
        "guidance/Chap3_Requirements_Guide.md",
        "workflows/Enhancement_Workflow.md",
        "workflows/Chap2_Workflow.md",
        "workflows/Chap3_Workflow.md",
    ):
        build(ROOT / filename)
