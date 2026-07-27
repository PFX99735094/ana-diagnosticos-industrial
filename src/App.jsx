import Sidebar from "./components/Sidebar.jsx";
import FileUpload from "./components/FileUpload.jsx";
import ChatArea from "./components/ChatArea.jsx";
import { useAna } from "./hooks/useAna.js";
import "./App.css";

function Oscilloscope({ className }) {
  return (
    <div className={`oscilloscope ${className || ""}`}>
      <svg viewBox="0 0 360 48" preserveAspectRatio="none" className="oscilloscope-svg">
        <defs>
          <clipPath id="oscope-clip">
            <rect width="360" height="48" />
          </clipPath>
        </defs>
        <g clipPath="url(#oscope-clip)">
          <path
            className="waveform-path"
            d="M0,24 Q15,8 30,24 T60,24 T90,24 T120,24 T150,24 T180,24 T210,24 T240,24 T270,24 T300,24 T330,24 T360,24 M360,24 Q375,8 390,24 T420,24 T450,24 T480,24 T510,24 T540,24 T570,24 T600,24 T630,24 T660,24 T690,24 T720,24"
          />
          <path
            className="waveform-path-2"
            d="M0,28 Q20,36 40,28 T80,28 T120,28 T160,28 T200,28 T240,28 T280,28 T320,28 T360,28 M360,28 Q380,36 400,28 T440,28 T480,28 T520,28 T560,28 T600,28 T640,28 T680,28 T720,28"
          />
        </g>
      </svg>
    </div>
  );
}

export default function App() {
  const {
    apiKey, handleApiKey,
    model, handleModel,
    detail, handleDetail,
    images, extractedText, schematicSummary,
    messages, streamingText,
    uploadedName, processing, error,
    handleFile, sendMessage,
    setError,
  } = useAna();

  const showChat = images.length > 0;

  return (
    <>
      <Sidebar
        apiKey={apiKey}
        setApiKey={handleApiKey}
        model={model}
        setModel={handleModel}
        detail={detail}
        setDetail={handleDetail}
        hasApiKey={!!(apiKey || import.meta.env.VITE_OPENAI_API_KEY)}
      />

      <main className="main">
        <div className="main-content">
          <header className="header">
            <div className="header-brand">
              <div className="logo">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="7" width="14" height="12" rx="3" />
                  <circle cx="10" cy="11" r="1" fill="currentColor" stroke="none" />
                  <circle cx="14" cy="11" r="1" fill="currentColor" stroke="none" />
                  <line x1="8" y1="16" x2="16" y2="16" />
                  <line x1="12" y1="4" x2="12" y2="7" />
                  <circle cx="12" cy="3" r="1.5" fill="currentColor" stroke="none" />
                </svg>
                <span className="logo-active" />
              </div>
              <div className="header-text">
                <h1>ANA <span className="accent">—</span> Diagnóstico Industrial</h1>
                <p className="subtitle">Engenheira de manutenção · Análise inteligente de esquemas elétricos</p>
              </div>
            </div>
            <Oscilloscope className="header-oscope" />
          </header>

          <hr className="divider" />

          <section>
            <div className="section-header">
              <span className="section-tag">01</span>
              <h2>Esquema elétrico</h2>
            </div>
            <FileUpload
              onFile={handleFile}
              processing={processing}
              uploadedName={uploadedName}
              error={!showChat ? error : ""}
            />

            {extractedText && (
              <details>
                <summary>Ver texto extraído (suplementar)</summary>
                <textarea className="text-area" readOnly value={extractedText} />
              </details>
            )}

            {schematicSummary && (
              <details>
                <summary>Ver resumo estrutural do esquema (análise automática)</summary>
                <textarea className="text-area" readOnly value={schematicSummary} />
              </details>
            )}
          </section>

          {showChat && (
            <>
              <hr className="divider" />
              <section>
                <div className="section-header">
                  <span className="section-tag">02</span>
                  <h2>Pergunta / sintoma</h2>
                </div>
                <ChatArea
                  messages={messages}
                  streamingText={streamingText}
                  onSend={sendMessage}
                  disabled={processing}
                  error={error}
                  hasImages={images.length > 0}
                />
              </section>
            </>
          )}
        </div>
      </main>
    </>
  );
}
