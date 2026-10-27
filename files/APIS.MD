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
- Input: fresh master extraction; no client-supplied prompt or coordinates.
- Output: reviewed field candidates using local extraction coordinates. No automatic saving or approval.
- UI: Certificate Branding editor -> Ask AI for suggestions -> consent -> Add this suggestion -> Save draft & preview.
- Provider unavailable or invalid output: safe error; manual/PDF/OCR configuration remains usable.


## Certificate field suggestion fallback

- Primary: Groq (`GROQ_API_KEY`, `GROQ_MODEL`).
- Fallback: Gemini (`GEMINI_API_KEY`, `GEMINI_MODEL`, default `gemini-flash-latest`).
- Each configured provider is attempted once. Provider errors, timeouts and invalid JSON trigger fallback; candidates still pass the same local field validation.
- Runtime credentials belong in `back/cred/.env`, never in frontend configuration.
- `TEMPLATE_AI_RATE` controls the application's per-user limit (default `5/min`). Restart Django after changing environment settings.
- An HTTP 429 from this application occurs before provider calls. Switching keys cannot bypass it. The editor uses `Retry-After` to show a countdown; PDF/OCR suggestions remain available.
- Consent covers sending extracted text to Groq and to Gemini when fallback is needed. PDFs, images and signature assets are not sent.
