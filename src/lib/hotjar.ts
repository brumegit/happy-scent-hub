// Hotjar session recording. Loads only in the browser once a Site ID is set.
// The Hotjar user id is attached to Slack alerts so the team can find the
// matching recording.

export const HOTJAR_SITE_ID = "6794730";

type HjFn = ((...args: unknown[]) => void) & {
  q?: unknown[];
  globals?: { get: (key: string) => unknown };
};

declare global {
  interface Window {
    hj?: HjFn;
    _hjSettings?: { hjid: number; hjsv: number };
  }
}

export function initHotjar(): void {
  if (typeof window === "undefined" || !HOTJAR_SITE_ID || window.hj) return;
  const hj: HjFn = (...args: unknown[]) => {
    (hj.q = hj.q || []).push(args);
  };
  window.hj = hj;
  window._hjSettings = { hjid: Number(HOTJAR_SITE_ID), hjsv: 6 };
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://static.hotjar.com/c/hotjar-${HOTJAR_SITE_ID}.js?sv=6`;
  document.head.appendChild(s);
}

export function identifyHotjar(email: string | null): void {
  if (typeof window === "undefined" || !window.hj || !email) return;
  try {
    window.hj("identify", email, { email });
  } catch {
    /* ignore */
  }
}

export function getHotjarUserId(): string | null {
  try {
    const id = window.hj?.globals?.get("userId");
    if (typeof id === "string" && id) return id;
  } catch {
    /* fall through to cookie */
  }
  // Hotjar stores the visitor id in _hjSessionUser_<siteId> (base64 JSON with "id").
  try {
    const m = document.cookie.match(new RegExp(`_hjSessionUser_${HOTJAR_SITE_ID}=([^;]+)`));
    if (!m?.[1]) return null;
    const parsed = JSON.parse(atob(decodeURIComponent(m[1]))) as { id?: unknown };
    return typeof parsed.id === "string" && parsed.id ? parsed.id : null;
  } catch {
    return null;
  }
}
