# AGENTS.md

Single-page React SPA (Vite 6 + React 18) implementing **ANA** — an industrial
electrical-diagnostic engineer who reads schematics via GPT-4o Vision.

## Layout

- **`ana-vite/`** — the only application. Entrypoint `src/main.jsx` → `App.jsx`.
  - `src/openai.js` — OpenAI streaming chat + schematic analysis via vision API.
    `dangerouslyAllowBrowser: true` (API key sent from browser).
  - `src/extractor.js` — PDF→images (`pdfjs-dist`), photo→DataURL, OCR
    (`tesseract.js`, Portuguese `"por"`), tile splitting for detail crops.
  - `src/prompts.js` — ANA system prompt + structural analysis JSON prompt.
  - `src/hooks/useAna.js` — all state + side effects (file upload, chat, localStorage).
  - `src/components/` — `Sidebar`, `FileUpload`, `ChatArea`, `ChatMessage`, `ChatInput`.
- **`.opencode/skill/ana.md`** — shared ANA persona skill. Load via `skill` tool
  when user asks for industrial/electrical/automation diagnostics.
- **No Python/Streamlit files** exist anymore. Only the Vite app.

## Commands

```bash
# dev server at http://localhost:3000 (auto-opens)
cd ana-vite && npm run dev

# production build → dist/
cd ana-vite && npm run build
```

No tests, lint, or typecheck configured.

## API key

Set via sidebar input (saved to `localStorage`) or `VITE_OPENAI_API_KEY` env var
(loaded via `import.meta.env`). Model defaults to `gpt-4o` (configurable).

## Quirks

- `Vite` config pre-bundles `pdfjs-dist` via `optimizeDeps.include`.
- First user message is multimodal (text + images). Chat history items may be
  arrays, not strings — the render loop in `ChatArea.jsx` calls
  `ChatMessage` which only renders text. Do not pass content arrays to
  `dangerouslySetInnerHTML`.
- PDF rendering at scale 3.0, images capped at 4096px, JPEG quality 95.
- Each page split into 9 tiles (3×3 grid, 10% overlap) for detail analysis.
  Tiles use `detail: "low"` (85 tokens each); overview images use `detail: "high"`
  to stay within 128k limit.
- Image enhancement: unsharp masking + contrast stretch (not global threshold).
- Tesseract.js downloads language data on first OCR run (network required once).
- API errors are mapped in `useAna.js` (`Authentication`/`NotFound`/`RateLimit`/`APIConnection`)
  and surfaced as Portuguese messages.
- Inline markdown renderer in `ChatArea.jsx` — basic code blocks, bold, paragraphs.
- No `fitz`/PyMuPDF anywhere (it's a JS app).
