import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  screenshot?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

interface AppContextValue {
  conversations: Conversation[];
  activeConversationId: string | null;
  apiKey: string;
  setApiKey: (key: string) => void;
  setActiveConversationId: (id: string | null) => void;
  createConversation: () => string;
  addMessage: (conversationId: string, message: Omit<Message, "id">) => void;
  activeConversation: Conversation | null;
}

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEY = "heyta_conversations";
const API_KEY_STORAGE = "heyta_api_key";

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConversations(convos: Conversation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(convos));
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>(
    loadConversations,
  );
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [apiKey, setApiKeyState] = useState(
    () => localStorage.getItem(API_KEY_STORAGE) ?? "",
  );

  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  function setApiKey(key: string) {
    setApiKeyState(key);
    localStorage.setItem(API_KEY_STORAGE, key);
  }

  function createConversation(): string {
    const id = crypto.randomUUID();
    const newConvo: Conversation = {
      id,
      title: "New conversation",
      messages: [],
      createdAt: Date.now(),
    };
    setConversations((prev) => [newConvo, ...prev]);
    setActiveConversationId(id);
    return id;
  }

  function addMessage(
    conversationId: string,
    message: Omit<Message, "id">,
  ) {
    const newMsg: Message = { ...message, id: crypto.randomUUID() };
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== conversationId) return c;
        const updatedMessages = [...c.messages, newMsg];
        const title =
          c.messages.length === 0 && message.role === "user"
            ? message.content.slice(0, 40) +
              (message.content.length > 40 ? "…" : "")
            : c.title;
        return { ...c, messages: updatedMessages, title };
      }),
    );
  }

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) ?? null;

  return (
    <AppContext.Provider
      value={{
        conversations,
        activeConversationId,
        apiKey,
        setApiKey,
        setActiveConversationId,
        createConversation,
        addMessage,
        activeConversation,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
