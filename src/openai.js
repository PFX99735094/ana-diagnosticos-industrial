import OpenAI from "openai";
import { ANA_BASE, SCHEMATIC_ANALYSIS_PROMPT, buildSchematicSummary } from "./prompts.js";
import { splitIntoTiles, cropDataUrl } from "./extractor.js";

function createClient(apiKey) {
  return new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
}

export async function streamChat(apiKey, model, messages, onChunk) {
  const client = createClient(apiKey);
  const stream = await client.chat.completions.create({
    model,
    messages,
    stream: true,
    temperature: 0.2,
  });

  let full = "";
  for await (const chunk of stream) {
    full += chunk.choices?.[0]?.delta?.content || "";
    onChunk(full);
  }
  return full;
}

/** Build content items: full image + 9 zoomed tiles for each page. */
async function buildImageContent(images) {
  const items = [];
  for (let i = 0; i < images.length; i++) {
    items.push({
      type: "text",
      text: `--- Página ${i + 1} (visão geral) ---`,
    });
    items.push({
      type: "image_url",
      image_url: { url: images[i], detail: "high" },
    });
    const tiles = await splitIntoTiles(images[i]);
    items.push({
      type: "text",
      text: `--- Página ${i + 1} (detalhes ampliados: grade 3×3) ---`,
    });
    for (const tile of tiles) {
      items.push({
        type: "image_url",
        image_url: { url: tile, detail: "low" },
      });
    }
  }
  return items;
}

export async function analyzeSchematic(apiKey, model, images, _detail) {
  const client = createClient(apiKey);
  const imgContent = await buildImageContent(images);
  const content = [
    { type: "text", text: `${SCHEMATIC_ANALYSIS_PROMPT}\n\nATENÇÃO: Para cada página, você receberá 1 imagem geral + 9 ampliações (grade 3×3, sobreposição de 10%). CADA ampliação cobre uma região diferente — você precisa examinar TODAS para não perder componentes pequenos ou textos.` },
    ...imgContent,
  ];

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content }],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 8192,
  });

  const text = response.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{.*\}/s);
    return match ? JSON.parse(match[0]) : {};
  }
}

export function buildChatMessages(images, schematicSummary, extractedText, messages) {
  let systemContent = ANA_BASE;

  if (schematicSummary) {
    systemContent += `\n\n--- RESUMO ESTRUTURAL DO ESQUEMA (auxiliar) ---\n${schematicSummary}`;
  }

  if (extractedText && extractedText.trim()) {
    systemContent += `\n\n---!! TEXTO EXTRAÍDO DO DOCUMENTO POR OCR (use como REFERÊNCIA PRIMÁRIA para encontrar componentes) !!---\n${extractedText}\n---!! FIM DO TEXTO OCR !!---`;
  }

  systemContent += `\n\nIMPORTANTE: O texto OCR acima contém TODOS os textos que o software conseguiu ler do documento PDF/imagem. Se o técnico perguntar por um componente, PRIMEIRO procure no texto OCR acima, DEPOIS na imagem. Muitas vezes o componente está no texto OCR mesmo que esteja pouco visível na imagem.`;

  return [
    { role: "system", content: systemContent },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
}

// (first buildUserMessage removed in favor of enhanced version below)

// Normalize string for robust matching (letters+digits only, uppercase)
function normalizeRef(s) {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const COMPONENT_KEYWORDS = [
  "CONTATOR", "DISJUNTOR", "RELE", "RELÉ", "TERMICO", "TÉRMICO",
  "MOTOR", "FUSIVEL", "FUSÍVEL", "BOTAO", "BOTÃO", "SIRENE",
  "SENSOR", "VALVULA", "VÁLVULA", "SOLENOIDE", "SOLENÓIDE",
  "FONTE", "TRANSFORMADOR", "INVERSOR", "SOFTSTARTER", "SOFT-STARTER",
  "BORNE", "CLP", "PLC", "RELÉ", "CONTATO", "BOBINA",
  "LAMPADA", "LÂMPADA", "SINAL", "ALARME", "EMERGENCIA", "EMERGÊNCIA",
  "CHAVE", "SELECTOR", "SELETOR", "FIMDECURSO", "FIM DE CURSO",
];

function extractCandidateRefs(prompt) {
  const out = new Set();
  const upper = prompt.toUpperCase();

  // Extract alphanumeric refs like K1, Q2, M1, F1, KM1, KA2, FT1, etc.
  const re = /[-]?[A-Za-z0-9][A-Za-z0-9\-]{2,}/g;
  const m = prompt.match(re) || [];
  for (const t of m) {
    const n = normalizeRef(t);
    if (/[A-Z]/.test(n) && /[0-9]/.test(n)) out.add(n);
  }

  // Extract component type keywords for fuzzy scanning
  for (const kw of COMPONENT_KEYWORDS) {
    if (upper.includes(kw)) {
      out.add(kw);
    }
  }

  return Array.from(out);
}

async function buildFocusCrops(prompt, images, ocrIndex) {
  try {
    if (!ocrIndex || ocrIndex.length === 0) return [];
    const refs = extractCandidateRefs(prompt);
    if (refs.length === 0) return [];
    const crops = [];
    // Helper: find merged word spans that match any ref
    function findSpanMatches(words, refs) {
      const out = [];
      if (!words || words.length === 0) return out;
      // Sort words top-to-bottom then left-to-right
      const ws = [...words].sort((a, b) => (a.y0 - b.y0) || (a.x0 - b.x0));
      const N = ws.length;
      const R = refs.map(normalizeRef);
      const MAX_SPAN = 6;
      for (let i = 0; i < N; i++) {
        let concat = "";
        let x0 = ws[i].x0, y0 = ws[i].y0, x1 = ws[i].x1, y1 = ws[i].y1;
        for (let k = 0; k < MAX_SPAN && i + k < N; k++) {
          const w = ws[i + k];
          const t = normalizeRef(w.text || "");
          if (!t) continue;
          concat += t;
          x0 = Math.min(x0, w.x0);
          y0 = Math.min(y0, w.y0);
          x1 = Math.max(x1, w.x1);
          y1 = Math.max(y1, w.y1);
          for (const r of R) {
            if (r && (concat.includes(r) || r.includes(concat))) {
              out.push({ text: concat, x0, y0, x1, y1, match: r });
            }
          }
        }
      }
      return out;
    }

    for (const page of ocrIndex) {
      const full = images[page.page - 1];
      if (!full) continue;
      // Load image to get original dimensions
      const im = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = full;
      });
      const fullW = im.width || 1;
      const fullH = im.height || 1;
      const oW = page.ocrWidth || fullW;
      const oH = page.ocrHeight || fullH;
      const scaleX = fullW / oW;
      const scaleY = fullH / oH;

      const spans = findSpanMatches(page.words, refs);
      for (const s of spans) {
        const x = (s.x0 || 0) * scaleX;
        const y = (s.y0 || 0) * scaleY;
        const bw = Math.max(10, ((s.x1 || 0) - (s.x0 || 0)) * scaleX);
        const bh = Math.max(10, ((s.y1 || 0) - (s.y0 || 0)) * scaleY);
        const margin = Math.max(180, Math.max(bw, bh));
        const rect = { x: x - margin, y: y - margin, w: bw + 2 * margin, h: bh + 2 * margin };
        const cropped = await cropDataUrl(full, rect);
        crops.push({ page: page.page, ref: s.match, text: s.text, image: cropped });
      }
    }
    return crops.slice(0, 12); // limit
  } catch {
    return [];
  }
}

export async function buildUserMessage(prompt, images, _detail, isFirst, ocrIndex) {
  if (!isFirst) return prompt;

  const text = `[ESQUEMA ELÉTRICO — IMAGEM GERAL + 9 AMPLIAÇÕES (GRADE 3×3) POR PÁGINA]

PERGUNTA DO TÉCNICO: "${prompt}"

INSTRUÇÕES ABSOLUTAS PARA ENCONTRAR O COMPONENTE:
1. VOCÊ TEM ACESSO a: (a) imagens do esquema nesta mensagem, (b) TEXTO OCR completo no system prompt, (c) resumo estrutural no system prompt. USE TUDO.
2. NUNCA — REPITO: NUNCA — peça ao técnico para "procurar", "verificar", "consultar" ou "localizar" nada. VOCÊ é a engenheira, você tem as imagens e o OCR. Encontre e responda.
3. PROCEDIMENTO: (i) primeiro leia o OCR no system prompt, (ii) depois examine a imagem geral, (iii) depois examine cada uma das 9 ampliações (grade 3×3) sistematicamente.
4. CADA PÁGINA vem com: 1 imagem GERAL + 9 AMPLIAÇÕES em grade (superior-esquerdo, superior-centro, superior-direito, meio-esquerdo, centro, meio-direito, inferior-esquerdo, inferior-centro, inferior-direito). As ampliações têm sobreposição de 10% — componentes nas bordas aparecem em múltiplos tiles.
5. O TEXTO OCR está no system prompt. BUSQUE a referência ou descrição do componente lá PRIMEIRO. O OCR é sua principal ferramenta de localização.
6. Se encontrar a referência no OCR, INFORME IMEDIATAMENTE em qual página está e descreva o que vê na imagem.
7. Se o OCR não tiver a referência, examine CADA ampliação (todas as 9) em busca de símbolos ou textos correspondentes.
8. Se encontrar algo PARECIDO mas não idêntico, INFORME: "Encontrei algo similar a [X] na página Y, região [descrever], mas o texto não está 100% legível. O componente parece ser [descrição]."
9. Se MESMO ASSIM não encontrar, liste tudo que você VIU em cada página e cada ampliação, e peça UMA medição específica para confirmar.`;

  const content = [{ type: "text", text }];

  // Add focus crops near OCR hits for the asked refs (if any)
  const focus = await buildFocusCrops(prompt, images, ocrIndex || []);
  if (focus.length > 0) {
    content.push({ type: "text", text: `--- FOCO NOS ITENS SOLICITADOS (encontrados no OCR) ---` });
    for (const f of focus) {
      content.push({ type: "text", text: `Página ${f.page} · possível correspondência a "${f.ref}" (texto OCR: "${f.text}")` });
      content.push({ type: "image_url", image_url: { url: f.image, detail: "high" } });
    }
  }

  for (let i = 0; i < images.length; i++) {
    content.push({
      type: "text",
      text: `--- Página ${i + 1}: visão geral ---`,
    });
    content.push({
      type: "image_url",
      image_url: { url: images[i], detail: "high" },
    });
    const tiles = await splitIntoTiles(images[i]);
    content.push({
      type: "text",
      text: `--- Página ${i + 1}: 9 ampliações (grade 3×3 — examine TODAS) ---`,
    });
    for (const tile of tiles) {
      content.push({
        type: "image_url",
        image_url: { url: tile, detail: "low" },
      });
    }
  }

  return content;
}
