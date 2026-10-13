groq API:
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


gemini api key:

API: AQ.Ab8RN6IvqTheCktzmpS8ccfif_zxKqEUJ1N-XR6BaZZtTenL9w

name: Credence API Key

project name: projects/259323669636

project number: 259323669636


*quick start*
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent" \
  -H 'Content-Type: application/json' \
  -H 'X-goog-api-key: AQ.Ab8RN6IvqTheCktzmpS8ccfif_zxKqEUJ1N-XR6BaZZtTenL9w' \
  -X POST \
  -d '{
    "contents": [
      {
        "parts": [
          {
            "text": "Explain how AI works in a few words"
          }
        ]
      }
    ]
  }'

## Implemented Groq integration

Runtime credentials are read only from `back/cred/.env`; this document is not a runtime configuration source.

- Model: `openai/gpt-oss-20b` (configurable with `GROQ_MODEL`).
- Endpoint: `POST /api/certificate-templates/{revision_uuid}/ai-suggestions/`.
- Access: fully authenticated Registrar, own institution, unapproved draft; five requests per minute.
- Input: saved draft extraction; no client-supplied prompt or coordinates.
- Output: reviewed field candidates using local extraction coordinates. No automatic saving or approval.
- UI: Certificate Branding editor -> Ask AI for suggestions -> consent -> Add this suggestion -> Save draft & preview.
- Provider unavailable or invalid output: safe error; manual/PDF/OCR configuration remains usable.
