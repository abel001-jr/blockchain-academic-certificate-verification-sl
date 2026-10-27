# Dissertation documents

The latest chapter drafts are kept here in editable Markdown and Word format:

- [Chapter One](Chap1_enhanced.docx) · [Markdown](Chap1_enhanced.md)
- [Chapter Two](Chap2_draft.docx) · [Markdown](Chap2_draft.md)
- [Chapter Three](Chap3_enhanced.docx) · [Markdown](Chap3_enhanced.md)

Supporting folders:

- `guidance/` — original supervisor handbook and the Chapter Three requirements companion.
- `workflows/` — chapter planning documents. The standalone Chapter Three workflow replaces the earlier twelve-section plan in the combined workflow.
- `research-notes/` — source checks, revision records and the Chapter Three requirements register.
- `originals/` — preserved original Chapter One and Chapter Three Word files.
- `tools/` — Word-document builder.

Supporting documents may mention other documents by filename. Resolve handbook and requirements-guide filenames in `guidance/`, workflow filenames in `workflows/`, and evidence/revision filenames in `research-notes/`. Project code paths are relative to the repository root.

After editing a Markdown source, regenerate the Word copies from the repository root:

```powershell
python -B dissert/tools/build_enhanced_docs.py
```

This rebuilds the three current chapters and four guidance/workflow documents beside their Markdown sources. It does not alter the originals or supervisor PDF. Review pagination and table layout in Word before submission. The drafts still contain explicitly provisional research or evaluation items; consult the revision notes for outstanding evidence.
