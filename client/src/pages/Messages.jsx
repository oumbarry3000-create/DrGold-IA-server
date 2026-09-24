// src/pages/Messages.jsx
// Centre de messages : notifications du bot (categories, marquer lu),
// conversation avec le support et annonces de Tradify.
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Megaphone, Bell, LifeBuoy } from "lucide-react";
import { api } from "../lib/api";
import Chat, { Attachment } from "../components/Chat";
import PageHeader from "../components/PageHeader";
import MessageList from "../components/messages/MessageList";
import { useAppData } from "../context/AppData";

const TABS = [
  ["notifications", "Notifications", Bell],
  ["support", "Support", LifeBuoy],
  ["annonces", "Annonces", Megaphone],
];

export default function Messages() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get("tab")) ? params.get("tab") : "notifications";
  const { inbox, loadInbox } = useAppData();
  const [messages, setMessages] = useState([]);
  const [annonces, setAnnonces] = useState(null);
  const [error, setError]       = useState(null);

  const loadMessages = useCallback(async () => {
    try {
      const { messages } = await api.messages();
      setMessages(messages);
      setError(null);
      loadInbox();
    } catch (err) {
      setError(err.message);
    }
  }, [loadInbox]);

  useEffect(() => {
    if (tab !== "support") return;
    loadMessages();
    const t = setInterval(() => { if (!document.hidden) loadMessages(); }, 10000);
    return () => clearInterval(t);
  }, [tab, loadMessages]);

  useEffect(() => {
    if (tab === "annonces") {
      api.announcements().then((r) => { setAnnonces(r.announcements); loadInbox(); }).catch((err) => setError(err.message));
    }
  }, [tab, loadInbox]);

  async function send(body, attachment) {
    await api.sendMessage(body, attachment);
    await loadMessages();
  }

  const counts = { notifications: inbox.unreadNotifications, support: inbox.unread, annonces: inbox.newAnnouncements };

  return (
    <div className="tf-stack" style={{ maxWidth: 900 }}>
      <PageHeader title="Messages" subtitle="Notifications du bot, support et annonces" />
      <div className="tf-tabs" role="tablist" aria-label="Rubriques">
        {TABS.map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tf-chip${tab === k ? " is-active" : ""}`}
            onClick={() => setParams({ tab: k }, { replace: true })}>
            <Icon size={15} aria-hidden="true" /> {label}
            {counts[k] > 0 && <span className="tf-nav__badge">{counts[k]}</span>}
          </button>
        ))}
      </div>
      {error && <div className="tf-alert tf-alert--danger">{error}</div>}

      {tab === "notifications" && <MessageList />}

      {tab === "support" && (
        <section className="tf-card">
          <p className="tf-muted" style={{ fontSize: 14, marginTop: 0 }}>Une question sur le bot, votre abonnement ou votre compte Deriv ? Écrivez-nous, nous répondons ici (et par email).</p>
          <Chat messages={messages} mySide="client" onSend={send} uploads={inbox.uploads}
            canEdit={(m) => m.sender === "client"} canDelete={(m) => m.sender === "client"}
            onEdit={async (id, body) => { await api.editMessage(id, body); await loadMessages(); }}
            onDelete={async (id) => { await api.deleteMessage(id); await loadMessages(); }}
            emptyText="Aucun message pour l'instant. Écrivez-nous !" />
        </section>
      )}

      {tab === "annonces" && (
        annonces === null ? <div className="tf-skeleton" style={{ height: 140 }} aria-label="Chargement" />
          : annonces.length === 0 ? <section className="tf-card"><div className="tf-empty"><Megaphone size={32} aria-hidden="true" />Aucune annonce pour le moment</div></section>
          : annonces.map((a) => (
            <article key={a.id} className="tf-card">
              <p className="tf-muted" style={{ fontSize: 11, margin: "0 0 6px" }}>
                {new Date(a.created_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}{a.updated_at ? " · mise à jour" : ""}
              </p>
              <h2 style={{ color: "var(--gold)", fontSize: 16, fontWeight: 800, margin: "0 0 8px" }}>📢 {a.title}</h2>
              {a.attachment_url && <Attachment m={a} />}
              <p style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{a.body}</p>
            </article>
          ))
      )}
    </div>
  );
}
