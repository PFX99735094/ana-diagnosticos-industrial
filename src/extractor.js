import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const MAX_DIM = 4096;
const JPEG_QUALITY = 95;
const MAX_PAGES = 20;

async function pdfToImages(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = Math.min(pdf.numPages, MAX_PAGES);
  const images = [];

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 3.0 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    await page.render({ canvasContext: ctx, viewport }).promise;

    let w = canvas.width, h = canvas.height;
    if (Math.max(w, h) > MAX_DIM) {
      const scale = MAX_DIM / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const outCanvas = document.createElement("canvas");
    outCanvas.width = w;
    outCanvas.height = h;
    outCanvas.getContext("2d").drawImage(canvas, 0, 0, w, h);
    images.push(outCanvas.toDataURL("image/jpeg", JPEG_QUALITY / 100));
  }
  return images;
}

function enhanceImage(canvas) {
  const ctx = canvas.getContext("2d");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  const w = canvas.width, h = canvas.height;
  const len = w * h;

  const gray = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
  }

  const radius = 2;
  const amount = 1.8;
  const blurred = new Float32Array(len);
  const div = (radius * 2 + 1) ** 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            sum += gray[ny * w + nx];
          }
        }
      }
      blurred[y * w + x] = sum / div;
    }
  }

  let min = 255, max = 0;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const v = gray[i] + amount * (gray[i] - blurred[i]);
    out[i] = Math.max(0, Math.min(255, v));
    if (out[i] < min) min = out[i];
    if (out[i] > max) max = out[i];
  }

  const range = max - min;
  for (let i = 0; i < len; i++) {
    const val = range > 0.1 ? ((out[i] - min) / range) * 255 : 128;
    const idx = i * 4;
    const v = Math.round(val);
    d[idx] = d[idx + 1] = d[idx + 2] = v;
  }

  ctx.putImageData(imageData, 0, 0);
}

export async function imageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (Math.max(w, h) > MAX_DIM) {
          const scale = MAX_DIM / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        enhanceImage(canvas);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY / 100));
      };
      img.onerror = () => reject(new Error("Falha ao carregar imagem"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

export async function fileToImages(file) {
  return file.name.toLowerCase().endsWith(".pdf")
    ? pdfToImages(file)
    : [await imageToDataUrl(file)];
}

export function splitIntoTiles(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ow = img.width, oh = img.height;
      const cols = 3, rows = 3;
      const overlap = 0.10;
      const tw = Math.round(ow / cols + ow * overlap / cols);
      const th = Math.round(oh / rows + oh * overlap / rows);
      const xOff = Math.round(ow / cols - ow * overlap / cols);
      const yOff = Math.round(oh / rows - oh * overlap / rows);
      const tiles = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const sx = c * xOff;
          const sy = r * yOff;
          const cw = Math.min(tw, ow - sx);
          const ch = Math.min(th, oh - sy);
          const canvas = document.createElement("canvas");
          canvas.width = cw;
          canvas.height = ch;
          canvas.getContext("2d").drawImage(img, sx, sy, cw, ch, 0, 0, cw, ch);
          tiles.push(canvas.toDataURL("image/jpeg", JPEG_QUALITY / 100));
        }
      }
      resolve(tiles);
    };
    img.src = dataUrl;
  });
}

// ─── OCR ───

function getCanvasDataUrl(canvas) {
  return canvas.toDataURL("image/jpeg", 90);
}

async function ocrPage(page, pageNum) {
  const viewport = page.getViewport({ scale: 4.0 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  await page.render({ canvasContext: ctx, viewport }).promise;

  let w = canvas.width, h = canvas.height;
  if (Math.max(w, h) > 2048) {
    const scale = 2048 / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  const small = document.createElement("canvas");
  small.width = w;
  small.height = h;
  small.getContext("2d").drawImage(canvas, 0, 0, w, h);
  enhanceImage(small);

  const Tesseract = await import("tesseract.js");
  const worker = await Tesseract.createWorker("por");
  const { data } = await worker.recognize(getCanvasDataUrl(small));
  // Words with bounding boxes on the OCR canvas size
  const words = (data.words || []).map((w) => ({
    text: (w.text || "").trim(),
    conf: w.confidence ?? w.conf ?? 0,
    x0: w.bbox ? w.bbox.x0 : (w.x0 ?? w.bbox?.left ?? 0),
    y0: w.bbox ? w.bbox.y0 : (w.y0 ?? w.bbox?.top ?? 0),
    x1: w.bbox ? w.bbox.x1 : (w.x1 ?? (w.bbox ? w.bbox.left + w.bbox.width : 0)),
    y1: w.bbox ? w.bbox.y1 : (w.y1 ?? (w.bbox ? w.bbox.top + w.bbox.height : 0)),
  }));
  const result = {
    text: data.text || "",
    words,
    ocrWidth: small.width,
    ocrHeight: small.height,
  };
  await worker.terminate();
  return result;
}

export async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = Math.min(pdf.numPages, MAX_PAGES);
  const texts = [];

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    // First try native text extraction
    try {
      const content = await page.getTextContent();
      const nativeText = content.items.map((item) => item.str).join(" ").trim();
      if (nativeText.length > 50) {
        texts.push(`[PÁGINA ${i} - TEXTO NATIVO]: ${nativeText}`);
        continue;
      }
    } catch {}

    // Fallback: OCR
    try {
      const ocr = await ocrPage(page, i);
      if (ocr.text.trim().length > 0) {
        texts.push(`[PÁGINA ${i} - OCR]: ${ocr.text.trim()}`);
      } else {
        texts.push(`[PÁGINA ${i} - OCR]: (vazio)`);
      }
    } catch (err) {
      texts.push(`[PÁGINA ${i} - OCR]: (falha: ${err.message})`);
    }
  }
  return texts.join("\n\n");
}

export async function ocrImage(file) {
  const worker = await (async () => {
    const Tesseract = await import("tesseract.js");
    return Tesseract.createWorker("por");
  })();
  const { data } = await worker.recognize(file);
  await worker.terminate();
  return data.text;
}

export async function extractText(file) {
  if (file.name.toLowerCase().endsWith(".pdf")) {
    return extractPdfText(file);
  }
  return ocrImage(file);
}

// Extract both flat text and a searchable OCR index with bounding boxes
export async function extractTextAndIndex(file) {
  if (file.name.toLowerCase().endsWith(".pdf")) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = Math.min(pdf.numPages, MAX_PAGES);
    const pages = [];
    const texts = [];
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      let nativeText = "";
      try {
        const content = await page.getTextContent();
        nativeText = content.items.map((item) => item.str).join(" ").trim();
      } catch {}

      let ocr = { text: "", words: [], ocrWidth: 0, ocrHeight: 0 };
      try {
        ocr = await ocrPage(page, i);
      } catch {}

      const textBlock = nativeText && nativeText.length > 50
        ? `[PÁGINA ${i} - TEXTO NATIVO]: ${nativeText}`
        : (ocr.text
            ? `[PÁGINA ${i} - OCR]: ${ocr.text}`
            : `[PÁGINA ${i} - OCR]: (vazio)`);
      texts.push(textBlock);
      pages.push({
        page: i,
        nativeText,
        ocrText: ocr.text,
        words: ocr.words,
        ocrWidth: ocr.ocrWidth,
        ocrHeight: ocr.ocrHeight,
      });
    }
    return { text: texts.join("\n\n"), ocrIndex: pages };
  }

  // Image file: run OCR once
  const dataUrl = await imageToDataUrl(file);
  // Draw into canvas to get width/height
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext("2d").drawImage(img, 0, 0);
  enhanceImage(canvas);

  const Tesseract = await import("tesseract.js");
  const worker = await Tesseract.createWorker("por");
  const { data } = await worker.recognize(canvas.toDataURL("image/jpeg", 0.9));
  await worker.terminate();
  const words = (data.words || []).map((w) => ({
    text: (w.text || "").trim(),
    conf: w.confidence ?? w.conf ?? 0,
    x0: w.bbox ? w.bbox.x0 : (w.x0 ?? w.bbox?.left ?? 0),
    y0: w.bbox ? w.bbox.y0 : (w.y0 ?? w.bbox?.top ?? 0),
    x1: w.bbox ? w.bbox.x1 : (w.x1 ?? (w.bbox ? w.bbox.left + w.bbox.width : 0)),
    y1: w.bbox ? w.bbox.y1 : (w.y1 ?? (w.bbox ? w.bbox.top + w.bbox.height : 0)),
  }));
  return {
    text: data.text || "",
    ocrIndex: [{ page: 1, nativeText: "", ocrText: data.text || "", words, ocrWidth: canvas.width, ocrHeight: canvas.height }],
  };
}

// Crop a rectangular region from a data URL (coordinates in pixels of the source image)
export async function cropDataUrl(dataUrl, rect) {
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = dataUrl;
  });
  const sx = Math.max(0, Math.floor(rect.x));
  const sy = Math.max(0, Math.floor(rect.y));
  const sw = Math.min(img.width - sx, Math.floor(rect.w));
  const sh = Math.min(img.height - sy, Math.floor(rect.h));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.toDataURL("image/jpeg", 0.95);
}
