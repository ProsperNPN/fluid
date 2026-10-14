"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { LockKeyhole, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { usePortalQuery } from "@/hooks/use-portal-query";
import {
  listConversations,
  readConversation,
  sendPrivateMessage,
  type PrivateMessage,
} from "@/services/messages-service";
import { getApiErrorMessage } from "@/lib/api";
import { PortalEmpty, PortalSkeleton } from "./portal-ui";

export function MessagesPage() {
  const loader = useCallback(() => listConversations(), []);
  const conversations = usePortalQuery(loader, 10000);
  const [active, setActive] = useState<string | null>(null);
  const [older, setOlder] = useState<PrivateMessage[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const messagesLoader = useCallback(
    async () => (active ? readConversation(active) : []),
    [active],
  );
  const messages = usePortalQuery(messagesLoader, 8000);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("conversation");
    if (id) setActive(id);
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [messages.data?.length]);
  const combined = [...older, ...(messages.data || [])].filter(
    (message, index, array) =>
      array.findIndex((m) => m.id === message.id) === index,
  );
  async function loadOlder() {
    if (!active || !combined.length) return;
    setHistoryBusy(true);
    try {
      const rows = await readConversation(active, combined[0].id);
      setOlder((current) => [...rows, ...current]);
      if (!rows.length)
        toast.info("You have reached the start of this conversation.");
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to load older messages."));
    } finally {
      setHistoryBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!active || !text.trim() || sending) return;
    setSending(true);
    try {
      await sendPrivateMessage(active, text.trim());
      setText("");
      await Promise.all([messages.refresh(), conversations.refresh()]);
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Unable to send your message."));
    } finally {
      setSending(false);
    }
  }
  if (conversations.loading) return <PortalSkeleton />;
  if (conversations.error && !conversations.data)
    return (
      <PortalEmpty
        title="Messages unavailable"
        description={conversations.error}
      />
    );
  return (
    <div className="portal-stack">
      <div className="portal-policy-note">
        <LockKeyhole size={17} />
        <span>
          Private coordination between a donor and an approved hospital. Please
          avoid sharing unnecessary medical details.
        </span>
      </div>
      <div className="portal-messaging">
        <aside>
          <h1>
            <Mail size={18} />
            Messages
          </h1>
          {conversations.data?.items.length ? (
            conversations.data.items.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActive(item.id);
                  setOlder([]);
                  setText("");
                  void conversations.refresh();
                }}
                aria-pressed={active === item.id}
              >
                <span className="portal-avatar">{item.name[0]}</span>
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.lastMessage}</small>
                </span>
                {item.unreadCount > 0 && <b>{item.unreadCount}</b>}
              </button>
            ))
          ) : (
            <PortalEmpty
              title="No conversations yet"
              description="Start a conversation from an invitation, donor response, or request you’ve responded to."
            />
          )}
        </aside>
        <section className="portal-thread" aria-label="Conversation">
          {active ? (
            <>
              <header>
                <strong>
                  {conversations.data?.items.find((c) => c.id === active)
                    ?.name || "Private conversation"}
                </strong>
                <span>
                  <LockKeyhole size={13} />
                  Private
                </span>
              </header>
              {messages.error ? (
                <div role="alert" className="portal-error">
                  {messages.error}
                </div>
              ) : null}
              <button
                className="portal-text-link mx-5"
                disabled={historyBusy || !combined.length}
                onClick={() => void loadOlder()}
              >
                {historyBusy ? "Loading…" : "Load Earlier Messages"}
              </button>
              <div
                className="portal-thread__messages"
                role="log"
                aria-live="polite"
                aria-label="Conversation history"
              >
                {messages.loading ? (
                  <p>Loading conversation…</p>
                ) : combined.length ? (
                  combined.map((message) => (
                    <article
                      className={message.mine ? "is-mine" : ""}
                      key={message.id}
                    >
                      <p>{message.body}</p>
                      <time dateTime={message.createdAt}>
                        {new Date(message.createdAt).toLocaleString()}
                      </time>
                    </article>
                  ))
                ) : (
                  <p className="portal-small-note">
                    Begin the conversation with a coordination message.
                  </p>
                )}
                <div ref={end} />
              </div>
              <form onSubmit={submit}>
                <label className="sr-only" htmlFor="portal-message">
                  Message
                </label>
                <textarea
                  id="portal-message"
                  maxLength={2000}
                  required
                  rows={2}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Write a message…"
                />
                <button
                  className="portal-button"
                  type="submit"
                  disabled={sending || !text.trim() || !!messages.error}
                  aria-label="Send message"
                >
                  <Send size={18} />
                  {sending ? "Sending…" : "Send"}
                </button>
              </form>
            </>
          ) : (
            <PortalEmpty
              title="Choose a conversation"
              description="Your messages stay connected to the relevant blood request."
            />
          )}
        </section>
      </div>
    </div>
  );
}
