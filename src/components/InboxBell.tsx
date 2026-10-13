import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getContactEmail } from "@/lib/customer-identity";
import scentImage from "@/assets/diffuser-hero.jpg";

// App inbox: Bird in-app inbox messages (last 3), each = image + short text + deep link.
// Guests always get an "add your email" message so the red (1) shows.
export type InboxMessage = { id: string; image: string; text: string; link: string };

const GUEST_ID = "guest-add-email";

type BirdInboxLike = {
  inbox?: Record<string, unknown>;
};

function normalize(raw: unknown): InboxMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, any>;
  const c = (r.content ?? r.message ?? r) as Record<string, any>;
  const text = c.text ?? c.body ?? c.title ?? c.subtitle;
  if (!text) return null;
  return {
    id: String(r.id ?? r.messageId ?? text),
    image: c.image ?? c.imageUrl ?? c.media?.url ?? c.icon ?? "",
    text: String(text),
    link: c.link ?? c.deepLink ?? c.url ?? c.action?.url ?? c.actions?.[0]?.url ?? "/",
  };
}

async function fetchBirdInbox(): Promise<InboxMessage[]> {
  const bird = (window as unknown as { Bird?: BirdInboxLike }).Bird;
  const inbox = bird?.inbox as Record<string, any> | undefined;
  if (!inbox) return [];
  for (const fn of ["getMessages", "list", "fetchMessages", "getInboxMessages"]) {
    if (typeof inbox[fn] === "function") {
      try {
        const res = await inbox[fn]();
        const arr = Array.isArray(res) ? res : res?.messages ?? res?.results ?? res?.items ?? [];
        return arr.map(normalize).filter(Boolean) as InboxMessage[];
      } catch {
        return [];
      }
    }
  }
  return [];
}

export function InboxBell() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { setSeen(JSON.parse(localStorage.getItem("brume-inbox-seen") ?? "[]")); } catch { /* ignore */ }
    let alive = true;
    const load = async () => {
      const bird = await fetchBirdInbox();
      const guest: InboxMessage[] = getContactEmail()
        ? []
        : [{ id: GUEST_ID, image: scentImage, text: "Add your email to get tips and refill reminders.", link: "#add-email" }];
      if (alive) setMessages([...guest, ...bird].slice(0, 3));
    };
    load();
    const t = setTimeout(load, 4000); // Bird SDK loads deferred
    window.addEventListener("brume-email-saved", load);
    return () => { alive = false; clearTimeout(t); window.removeEventListener("brume-email-saved", load); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const unread = messages.filter((m) => m.id === GUEST_ID || !seen.includes(m.id)).length;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      const ids = Array.from(new Set([...seen, ...messages.map((m) => m.id)]));
      setSeen(ids);
      try { localStorage.setItem("brume-inbox-seen", JSON.stringify(ids)); } catch { /* ignore */ }
    }
  };

  const go = (m: InboxMessage) => {
    setOpen(false);
    if (m.link === "#add-email") {
      (document.querySelector("[data-add-email]") as HTMLButtonElement | null)?.click();
      return;
    }
    window.location.href = m.link;
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label="Notifications" onClick={toggle} className="relative flex items-center text-foreground">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 w-72 rounded-md border border-border bg-background p-2 shadow-lg">
          {messages.length === 0 ? (
            <p className="p-3 text-center text-sm text-muted-foreground">No messages yet.</p>
          ) : (
            messages.map((m) => (
              <button key={m.id} type="button" onClick={() => go(m)} className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-muted">
                {m.image ? (
                  <img src={m.image} alt="" className="h-12 w-12 shrink-0 rounded object-cover bg-muted" />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded bg-muted" />
                )}
                <span className="text-sm leading-snug text-foreground">{m.text}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
