import { Bell, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getContactEmail } from "@/lib/customer-identity";
import { unreadInboxCount, visibleInboxMessages } from "@/lib/inbox-messages";
import refillsImage from "@/assets/refills.png.asset.json";
import emailImage from "@/assets/email.png.asset.json";

// App inbox: Bird in-app inbox messages (last 3), each = image + short text + deep link.
// Shown one at a time; white arrows on the image page between messages.
// Subscription stays available; only the email prompt is hidden after email entry.
export type InboxMessage = { id: string; image: string; title: string; text: string; link: string };

const GUEST_ID = "guest-subscribe";
const GUEST_EMAIL_ID = "guest-email";
const SUBSCRIBE_URL = "https://brume.me/collections/single-notes-collection";
const EMAIL_LINK = "/";

type BirdInboxLike = {
  inbox?: Record<string, unknown>;
};

function normalize(raw: unknown): InboxMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as any;
  const c: any = r.content ?? r.message ?? r;
  const text = c.text ?? c.body ?? c.subtitle;
  if (!text) return null;
  return {
    id: String(r.id ?? r.messageId ?? text),
    image: c.image ?? c.imageUrl ?? c.media?.url ?? c.icon ?? "",
    title: String(c.title ?? c.heading ?? ""),
    text: String(text),
    link: c.link ?? c.deepLink ?? c.url ?? c.action?.url ?? c.actions?.[0]?.url ?? "/",
  };
}

async function fetchBirdInbox(): Promise<InboxMessage[]> {
  const bird = (window as unknown as { Bird?: BirdInboxLike }).Bird;
  const inbox: any = bird?.inbox;
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
  const [index, setIndex] = useState(0);
  const [seen, setSeen] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { setSeen(JSON.parse(localStorage.getItem("brume-inbox-seen") ?? "[]")); } catch { /* ignore */ }
    let alive = true;
    const load = async () => {
      const bird = await fetchBirdInbox();
      const guest: InboxMessage[] = [
            { id: GUEST_ID, image: refillsImage.url, title: "Save on refills", text: "Subscribe to scent refills and get extra savings.", link: SUBSCRIBE_URL },
             { id: GUEST_EMAIL_ID, image: emailImage.url, title: "Add your email", text: "Add your email to get an experience tailored to you.", link: EMAIL_LINK },
          ];
      if (alive) setMessages(visibleInboxMessages([...guest, ...bird], Boolean(getContactEmail())));
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

  const unread = unreadInboxCount(messages, seen);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    setIndex(0);
    if (next) {
      // Opening counts as an impression: clear the unread badge.
      const ids = Array.from(new Set([...seen, ...messages.map((m) => m.id)]));
      setSeen(ids);
      try { localStorage.setItem("brume-inbox-seen", JSON.stringify(ids)); } catch { /* ignore */ }
    }
  };

  const go = (m: InboxMessage) => {
    setOpen(false);
    if (m.id === GUEST_EMAIL_ID) {
      window.dispatchEvent(new CustomEvent("brume-open-email", { detail: { source: "inbox" } }));
      return;
    }
    window.location.href = m.link;
  };

  const safeIndex = Math.min(index, Math.max(messages.length - 1, 0));
  const current = messages[safeIndex];

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
        <div className="absolute right-0 top-14 z-50 w-72 border border-black bg-white shadow-lg">
          {messages.length === 0 ? (
            <p className="p-3 text-center text-sm text-black/60">No messages yet.</p>
          ) : (
            current && (
              <div className="relative">
                {current.image ? (
                  <div className="relative">
                    <img src={current.image} alt="" className="block h-36 w-full object-cover object-top bg-black/5" />
                    {messages.length > 1 && (
                      <>
                        <button
                          type="button"
                          aria-label="Previous message"
                          onClick={(e) => { e.stopPropagation(); setIndex((i) => (i <= 0 ? messages.length - 1 : i - 1)); }}
                          className="absolute left-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                        >
                          <ChevronLeft className="h-6 w-6" />
                        </button>
                        <button
                          type="button"
                          aria-label="Next message"
                          onClick={(e) => { e.stopPropagation(); setIndex((i) => (i >= messages.length - 1 ? 0 : i + 1)); }}
                          className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                        >
                          <ChevronRight className="h-6 w-6" />
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="relative flex h-36 items-center justify-center bg-black/5">
                    {messages.length > 1 && (
                      <>
                        <button
                          type="button"
                          aria-label="Previous message"
                          onClick={() => setIndex((i) => (i <= 0 ? messages.length - 1 : i - 1))}
                          className="absolute left-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                        >
                          <ChevronLeft className="h-6 w-6" />
                        </button>
                        <button
                          type="button"
                          aria-label="Next message"
                          onClick={() => setIndex((i) => (i >= messages.length - 1 ? 0 : i + 1))}
                          className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                        >
                          <ChevronRight className="h-6 w-6" />
                        </button>
                      </>
                    )}
                  </div>
                )}
                <button type="button" onClick={() => go(current)} className={`flex w-full items-center justify-between gap-3 text-left text-sm leading-normal tracking-normal text-black ${current.image ? "px-3 py-3" : "p-3"}`}>
                  <span>{current.text}</span>
                  <span className="shrink-0 border border-black bg-transparent px-3 py-1.5 text-xs font-medium uppercase tracking-normal text-black">
                    {current.id === GUEST_ID ? "Learn more" : current.id === GUEST_EMAIL_ID ? "Add email" : "Open"}
                  </span>
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
