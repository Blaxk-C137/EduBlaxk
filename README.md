# EduBLAXK — Local AI Tutor & Assessment Engine

EduBLAXK converts course syllabi, lecture slides, and textbook chapters into diagnostic MCQs and rubric-evaluated essay assignments. All student data (attempts, answers, question bank) stays in browser localStorage — API keys never enter the browser.

## Supported providers

- **Google Gemini** — free tier, default (`google:gemini-2.5-flash`)
- **Anthropic Claude**
- **OpenAI**

If a model is overloaded or rate-limited, the server retries with backoff and falls back to a same-or-cheaper model — never to a pricier tier.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. (Optional) Seed a Gemini key by setting `GEMINI_API_KEY` in `.env` — or just paste a key in the app's setup wizard
3. Run the app:
   `npm run dev`

## API keys & privacy

API keys are configured in the setup wizard or Settings and stored **on the local machine in `.edublaxk/keys.json`** (gitignored, mode 0600) — never in the browser, never in localStorage, and never sent back to the client. The optional `GEMINI_API_KEY` env var only seeds the key on first boot.

API usage and estimated cost for the day and month are visible in **Settings → API Usage**, including a warning when the Gemini free-tier daily request limit is approaching.
