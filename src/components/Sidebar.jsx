export default function Sidebar({ apiKey, setApiKey, model, setModel, detail, setDetail, hasApiKey }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">ANA</div>
        <div className="sidebar-sub">Painel de Controle</div>
      </div>

      <div className="sidebar-body">
        <div className="field-group">
          <label className="field-label">
            <span className="label-dot" />
            OpenAI API Key
          </label>
          <input
            type="password"
            className="text-input"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="field-group">
          <label className="field-label">
            <span className="label-dot" />
            Modelo
          </label>
          <input
            type="text"
            className="text-input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </div>

        <div className="field-group">
          <label className="field-label">
            <span className="label-dot" />
            Detalhamento da Visão
          </label>
          <select className="text-input" value={detail} onChange={(e) => setDetail(e.target.value)}>
            <option value="high">high (alta — melhor leitura)</option>
            <option value="low">low (baixa — economiza tokens)</option>
          </select>
        </div>
      </div>

      <div className="sidebar-footer">
        <span className={`status-led${hasApiKey ? " active" : ""}`} />
        <span>{hasApiKey ? "API conectada" : "API aguardando chave"}</span>
      </div>
    </aside>
  );
}
