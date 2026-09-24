// src/components/assistant/MessageBubble.jsx
// Bulle de chat : rendu leger de **gras**, listes et retours a la ligne
// (le texte n'est jamais injecte en HTML).
import { memo } from "react";

function MessageBubble({ role, content }) {
  const mine = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
      <div className={`tf-bubble ${mine ? "tf-bubble--me" : "tf-bubble--bot"}`}>
        {content.split("\n").map((line, i) => (
          <div key={i} style={{ minHeight: line.trim() ? undefined : 6 }}>
            {line.replace(/^\s*[-*]\s/, "• ").split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
              part.startsWith("**") && part.endsWith("**")
                ? <strong key={j}>{part.slice(2, -2)}</strong>
                : <span key={j}>{part}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(MessageBubble);
