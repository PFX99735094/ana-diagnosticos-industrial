function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdown(text) {
  if (!text) return "";
  let html = escapeHtml(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  const lines = html.split("\n").filter((l) => l.trim());
  return lines.map((l) => `<p>${l}</p>`).join("");
}

export default function ChatMessage({ role, content }) {
  const label = role === "user" ? "Técnico" : "ANA";
  const avatar = role === "user" ? "T" : "A";

  const text = Array.isArray(content)
    ? content.filter((item) => item.type === "text").map((item) => item.text).join("\n")
    : content;

  return (
    <div className={`chat-message ${role}`}>
      <div className="chat-message-header">
        <div className="avatar">{avatar}</div>
        <span className="tag-label">{label}</span>
        <span className="msg-led" />
      </div>
      <div
        className="chat-message-content"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
      />
    </div>
  );
}
