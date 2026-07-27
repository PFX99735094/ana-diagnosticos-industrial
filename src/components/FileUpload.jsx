import { useRef, useState, useCallback } from "react";

export default function FileUpload({ onFile, processing, uploadedName, error }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleChange = useCallback((e) => {
    if (e.target.files[0]) onFile(e.target.files[0]);
  }, [onFile]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
  }, [onFile]);

  const ext = uploadedName ? uploadedName.split(".").pop().toUpperCase() : "";

  return (
    <>
      <div
        className={`upload-zone${dragOver ? " drag-over" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <svg className="upload-icon" viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p>Arraste o PDF ou foto do esquema / painel</p>
        <p className="upload-hint">ou clique para selecionar (PDF, JPG, PNG, TIFF)</p>
      </div>
      <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff" onChange={handleChange} hidden />

      {uploadedName && (
        <div className="file-info">
          <span className="file-led" />
          <span className="file-name">{uploadedName}</span>
          <span className="file-badge">{ext}</span>
        </div>
      )}

      {processing && (
        <div className="spinner">
          <div className="spinner-icon" />
          <span>Processando o esquema...</span>
        </div>
      )}

      {error && (
        <div className="api-error" style={{ marginTop: "0.75rem" }}>{error}</div>
      )}
    </>
  );
}
