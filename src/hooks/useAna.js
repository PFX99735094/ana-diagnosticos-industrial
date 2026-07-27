import { useState, useCallback, useRef } from "react";
import { fileToImages, extractTextAndIndex } from "../extractor.js";
import { streamChat, analyzeSchematic, buildChatMessages, buildUserMessage } from "../openai.js";
import { buildSchematicSummary } from "../prompts.js";

const LS_MODEL = "ana_model";
const LS_DETAIL = "ana_detail";

function load(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function useAna() {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(() => load(LS_MODEL, "gpt-4o"));
  const [detail, setDetail] = useState(() => load(LS_DETAIL, "high"));

  const [images, setImages] = useState([]);
  const [extractedText, setExtractedText] = useState("");
  const [ocrIndex, setOcrIndex] = useState([]);
  const [schematicSummary, setSchematicSummary] = useState("");
  const [messages, setMessages] = useState([]);
  const [streamingText, setStreamingText] = useState("");
  const [uploadedName, setUploadedName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const handleApiKey = useCallback((val) => {
    setApiKey(val);
  }, []);

  const handleModel = useCallback((val) => {
    setModel(val || "gpt-4o");
    save(LS_MODEL, val || "gpt-4o");
  }, []);

  const handleDetail = useCallback((val) => {
    setDetail(val);
    save(LS_DETAIL, val);
  }, []);

  const getEffectiveKey = useCallback(() => {
    return (apiKey || import.meta.env.VITE_OPENAI_API_KEY || "").trim();
  }, [apiKey]);

  const handleFile = useCallback(async (file) => {
    if (!file) return;

    setUploadedName(file.name);
    setImages([]);
    setExtractedText("");
    setSchematicSummary("");
    setMessages([]);
    setStreamingText("");
    setError("");
    setProcessing(true);

    try {
      const imgs = await fileToImages(file);
      if (imgs.length === 0) throw new Error("Nenhuma imagem pôde ser extraída.");
      setImages(imgs);

      const { text, ocrIndex } = await extractTextAndIndex(file);
      setExtractedText(text);
      setOcrIndex(ocrIndex || []);

      const effectiveKey = getEffectiveKey();
      if (effectiveKey && imgs.length > 0) {
        try {
          const analysis = await analyzeSchematic(effectiveKey, model, imgs, detail);
          setSchematicSummary(buildSchematicSummary(analysis));
        } catch (err) {
          console.warn("Structural analysis failed:", err);
          setSchematicSummary(`(análise estrutural indisponível: ${err.message})`);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  }, [getEffectiveKey, model, detail]);

  const sendMessage = useCallback(async (prompt) => {
    if (!prompt.trim() || processing) return;

    const effectiveKey = getEffectiveKey();
    if (!effectiveKey) {
      setError("OPENAI_API_KEY não definida. Informe a chave na barra lateral.");
      return;
    }
    if (images.length === 0) {
      setError("Envie um esquema elétrico antes de perguntar.");
      return;
    }
    setError("");

    setProcessing(true);
    setStreamingText("");

    const currentMessages = messagesRef.current;
    const isFirst = currentMessages.length === 0;
    const userContent = await buildUserMessage(prompt, images, detail, isFirst, ocrIndex);

    const displayMessages = [...currentMessages, { role: "user", content: prompt }];
    const apiMessages = [...currentMessages, { role: "user", content: userContent }];
    setMessages(displayMessages);

    try {
      const chatMessages = buildChatMessages(images, schematicSummary, extractedText, apiMessages);

      const full = await streamChat(effectiveKey, model, chatMessages, (text) => {
        setStreamingText(text);
      });

      if (full) {
        setMessages((prev) => [...prev, { role: "assistant", content: full }]);
      }
      setStreamingText("");
    } catch (err) {
      const name = err.constructor.name;
      let hint = "";
      if (name.includes("Authentication") || err.message.includes("401")) {
        hint = " (chave inválida/expirada — verifique a OPENAI_API_KEY)";
      } else if (name.includes("NotFound") || err.message.includes("404")) {
        hint = ` (modelo '${model}' inexistente ou sem acesso)`;
      } else if (name.includes("RateLimit") || err.message.includes("429")) {
        hint = " (limite de taxa/sem créditos na conta OpenAI)";
      } else if (name.includes("APIConnection") || name.includes("Timeout") || err.message.includes("fetch")) {
        hint = " (sem rede ou proxy bloqueando a OpenAI)";
      }
      setError(`Falha na chamada à API [${name}]: ${err.message}${hint}`);
      setStreamingText("");
    } finally {
      setProcessing(false);
    }
  }, [processing, getEffectiveKey, images, detail, model, schematicSummary, extractedText]);

  return {
    apiKey, handleApiKey,
    model, handleModel,
    detail, handleDetail,
    images, extractedText, schematicSummary, ocrIndex,
    messages, streamingText,
    uploadedName, processing, error,
    handleFile, sendMessage,
    setError, setMessages,
  };
}
