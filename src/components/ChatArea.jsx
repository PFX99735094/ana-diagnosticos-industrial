import { useEffect, useRef } from "react";
import ChatMessage from "./ChatMessage.jsx";
import ChatInput from "./ChatInput.jsx";

function renderMarkdown(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  let html = div.innerHTML;
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html.split("\n").filter((l) => l.trim()).map((l) => `<p>${l}</p>`).join("");
}

export default function ChatArea({
  messages,
  streamingText,
  onSend,
  disabled,
  error,
  hasImages,
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  const showStreaming = streamingText && messages[messages.length - 1]?.role === "user";

  return (
    <div className="chat-section">
      <div className="chat-messages">
        {messages.map((m, i) => (
          <ChatMessage key={i} role={m.role} content={m.content} />
        ))}

        {showStreaming && (
          <div className="chat-message assistant">
            <div className="chat-message-header">
              <div className="avatar">A</div>
              <span>ANA</span>
            </div>
            <div
              className="chat-message-content"
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(streamingText) + '<span class="cursor">▌</span>',
              }}
            />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <ChatInput onSend={onSend} disabled={disabled} />

      {error && <div className="api-error">{error}</div>}
    </div>
  );
}
