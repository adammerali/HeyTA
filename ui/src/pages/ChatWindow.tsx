import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Plus,
  Send,
  Settings,
  MessageSquare,
  X,
  ChevronRight,
} from "lucide-react";
import { AppProvider, useApp, Message } from "../context/AppContext";
import { useWebSocket, WsMessage } from "@/hooks/useWebSocket";

const SYSTEM_PROMPT = `You are TA, an intelligent teaching assistant helping students understand course material in real time.

When a student asks for help, you must:
1. Identify exactly what they are struggling with or what they got wrong
2. Explain the mistake or gap in understanding clearly but without being condescending
3. Walk them toward the correct approach — guide, do not just give the answer
4. Be warm, patient, and encouraging, the way a great human TA would be

You will receive the student's spoken question. You may also receive notes or work extracted from their whiteboard — if so, use both together to give precise, targeted feedback.

Keep your response conversational and concise. This is a live, real-time interaction.`;

function groupByDate(conversations: { id: string; title: string; createdAt: number }[]) {
  const now = Date.now();
  const oneDayMs = 86400000;
  const groups: Record<string, typeof conversations> = {
    Today: [],
    Yesterday: [],
    "Previous 7 days": [],
    Older: [],
  };
  for (const c of conversations) {
    const diff = now - c.createdAt;
    if (diff < oneDayMs) groups["Today"].push(c);
    else if (diff < 2 * oneDayMs) groups["Yesterday"].push(c);
    else if (diff < 7 * oneDayMs) groups["Previous 7 days"].push(c);
    else groups["Older"].push(c);
  }
  return groups;
}

function SettingsModal({
  apiKey,
  onSave,
  onClose,
}: {
  apiKey: string;
  onSave: (key: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(apiKey);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div
        className="rounded-2xl p-6 w-full max-w-md shadow-2xl"
        style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-base">Settings</h2>
          <button onClick={onClose} style={{ color: "var(--text-secondary)" }}>
            <X size={18} />
          </button>
        </div>
        <label className="block text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
          Anthropic API Key
        </label>
        <input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="sk-ant-..."
          className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none mb-4"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
        />
        <button
          onClick={() => { onSave(draft); onClose(); }}
          className="w-full py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--accent)" }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex w-full mb-6 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mr-3 mt-0.5"
          style={{ background: "var(--accent)" }}
        >
          TA
        </div>
      )}
      <div className={`max-w-[75%] ${isUser ? "order-first" : ""}`}>
        {message.screenshot && (
          <img
            src={message.screenshot}
            alt="Whiteboard screenshot"
            className="rounded-lg mb-2 max-w-full border"
            style={{ borderColor: "var(--border)" }}
          />
        )}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser ? "rounded-br-sm" : "rounded-bl-sm"
          }`}
          style={{
            background: isUser ? "var(--bg-message-user)" : "transparent",
            color: "var(--text-primary)",
          }}
        >
          {message.content}
        </div>
        <div
          className="text-xs mt-1 px-1"
          style={{
            color: "var(--text-muted)",
            textAlign: isUser ? "right" : "left",
          }}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}

function ChatContent() {
  const {
    conversations,
    activeConversation,
    activeConversationId,
    apiKey,
    setApiKey,
    setActiveConversationId,
    createConversation,
    addMessage,
    updateMessage,
  } = useApp();

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Track the active speech conversation and streaming assistant message
  const speechConvoRef = useRef<string | null>(null);
  const pendingAssistantIdRef = useRef<string | null>(null);

  const handleWsMessage = useCallback((msg: WsMessage) => {
    if (msg.type === "user_message") {
      // Start or reuse a conversation for this speech session
      const convoId = createConversation();
      speechConvoRef.current = convoId;
      pendingAssistantIdRef.current = null;

      const msgData: Omit<Message, "id"> = {
        role: "user",
        content: msg.content,
        timestamp: Date.now(),
      };
      if (msg.image_b64) {
        msgData.screenshot = `data:image/jpeg;base64,${msg.image_b64}`;
      }
      addMessage(convoId, msgData);

    } else if (msg.type === "assistant_chunk") {
      const convoId = speechConvoRef.current;
      if (!convoId) return;

      if (!pendingAssistantIdRef.current) {
        // First chunk — add a new assistant message
        const id = addMessage(convoId, {
          role: "assistant",
          content: msg.content,
          timestamp: Date.now(),
        });
        pendingAssistantIdRef.current = id;
      } else {
        // Subsequent chunks — append with a space
        updateMessage(convoId, pendingAssistantIdRef.current, " " + msg.content);
      }

    } else if (msg.type === "assistant_done") {
      pendingAssistantIdRef.current = null;
    }
  }, [createConversation, addMessage, updateMessage]);

  useWebSocket(handleWsMessage);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation?.messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;

    if (!apiKey) {
      setShowSettings(true);
      return;
    }

    let convoId = activeConversationId;
    if (!convoId) convoId = createConversation();

    addMessage(convoId, { role: "user", content: text, timestamp: Date.now() });
    setInput("");
    setIsLoading(true);

    try {
      const history = [
        ...(activeConversation?.messages ?? []).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "user" as const, content: text },
      ];

      const reply: string = await invoke("send_message", {
        apiKey,
        messages: history,
        systemPrompt: SYSTEM_PROMPT,
      });

      addMessage(convoId, {
        role: "assistant",
        content: reply,
        timestamp: Date.now(),
      });
    } catch (e) {
      addMessage(convoId, {
        role: "assistant",
        content: `Error: ${e}`,
        timestamp: Date.now(),
      });
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const grouped = groupByDate(conversations);

  return (
    <div
      className="flex w-screen h-screen overflow-hidden"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      {/* Sidebar */}
      {sidebarOpen && (
        <div
          className="flex flex-col w-60 shrink-0 h-full"
          style={{
            background: "var(--bg-sidebar)",
            borderRight: "1px solid var(--border)",
          }}
        >
          {/* Sidebar header */}
          <div className="flex items-center justify-between px-3 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center text-white text-xs font-bold"
                style={{ background: "var(--accent)" }}
              >
                TA
              </div>
              <span className="font-semibold text-sm text-white">Hey TA</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded-md transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* New chat */}
          <div className="px-2 py-2">
            <button
              onClick={createConversation}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors"
              style={{ color: "var(--text-secondary)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
                (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
              }}
            >
              <Plus size={15} />
              New chat
            </button>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {Object.entries(grouped).map(([group, convos]) =>
              convos.length === 0 ? null : (
                <div key={group} className="mb-3">
                  <p
                    className="text-xs px-3 py-1 font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {group}
                  </p>
                  {convos.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setActiveConversationId(c.id)}
                      className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-left truncate transition-colors"
                      style={{
                        background:
                          c.id === activeConversationId
                            ? "var(--bg-hover)"
                            : "transparent",
                        color:
                          c.id === activeConversationId
                            ? "var(--text-primary)"
                            : "var(--text-secondary)",
                      }}
                      onMouseEnter={(e) => {
                        if (c.id !== activeConversationId) {
                          (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (c.id !== activeConversationId) {
                          (e.currentTarget as HTMLElement).style.background = "transparent";
                        }
                      }}
                    >
                      <MessageSquare size={13} className="shrink-0" />
                      <span className="truncate">{c.title}</span>
                    </button>
                  ))}
                </div>
              ),
            )}
          </div>

          {/* Settings */}
          <div
            className="px-2 py-3"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors"
              style={{ color: "var(--text-secondary)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
                (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
              }}
            >
              <Settings size={14} />
              Settings
            </button>
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
        {/* Top bar */}
        <div
          className="flex items-center px-4 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-md mr-3 transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              <ChevronRight size={16} className="rotate-180" />
            </button>
          )}
          <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            {activeConversation?.title ?? "Hey TA"}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {!activeConversation || activeConversation.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold"
                style={{ background: "var(--accent)" }}
              >
                TA
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">
                  What can I help with?
                </h2>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Say <span className="text-white font-medium">"Hey TA"</span> or type your question below
                </p>
              </div>
              {!apiKey && (
                <button
                  onClick={() => setShowSettings(true)}
                  className="text-sm px-4 py-2 rounded-lg font-medium transition-opacity hover:opacity-90"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  Add API Key to get started
                </button>
              )}
            </div>
          ) : (
            <div className="max-w-2xl mx-auto w-full px-4 pt-8">
              {activeConversation.messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {isLoading && (
                <div className="flex mb-6">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mr-3"
                    style={{ background: "var(--accent)" }}
                  >
                    TA
                  </div>
                  <div className="flex items-center gap-1 pt-2">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-2 h-2 rounded-full animate-bounce"
                        style={{
                          background: "var(--text-muted)",
                          animationDelay: `${i * 0.15}s`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div
          className="shrink-0 px-4 py-4"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <div className="max-w-2xl mx-auto">
            <div
              className="flex items-end gap-3 rounded-2xl px-4 py-3"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border)",
              }}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Hey TA..."
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm outline-none leading-relaxed"
                style={{
                  color: "var(--text-primary)",
                  caretColor: "var(--text-primary)",
                  minHeight: "24px",
                  maxHeight: "160px",
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all disabled:opacity-30"
                style={{
                  background: input.trim() && !isLoading
                    ? "var(--accent)"
                    : "var(--bg-hover)",
                  color: "white",
                }}
              >
                <Send size={14} />
              </button>
            </div>
            <p
              className="text-xs text-center mt-2"
              style={{ color: "var(--text-muted)" }}
            >
              Press Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          apiKey={apiKey}
          onSave={setApiKey}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

export default function ChatWindow() {
  return (
    <AppProvider>
      <ChatContent />
    </AppProvider>
  );
}
