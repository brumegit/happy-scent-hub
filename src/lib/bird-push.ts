// Bird remote push registration for the installed apps.
//
// Bird can only reach a phone through its native SDKs (BirdKit on iOS, the
// Bird Android SDK with Firebase). The native "BirdPush" plugin owns the push
// token; this module asks it for permission and links the native Bird contact
// to the same per-install id the web Bird SDK uses, so web events (pairing,
// errors) and the phone's push address land on one Bird contact.
//
// Old store builds don't ship the plugin: every call fails silently and the
// app falls back to the previous local-notification permission prompt.

import { Capacitor, registerPlugin } from "@capacitor/core";
import { isBirdPlatformAllowed } from "./bird-policy";

export type PushPermission = "granted" | "denied" | "prompt" | "unknown";
export type BirdPushStatus = {
  permission: PushPermission;
  /** True once the OS handed a push token to the Bird SDK this session. */
  registered: boolean;
  /** False when the Bird SDK failed to start (missing application key...). */
  birdReady: boolean;
  error?: string;
};

type BirdPushPlugin = {
  status(): Promise<BirdPushStatus>;
  request(): Promise<BirdPushStatus>;
  sync(options: { externalId: string }): Promise<BirdPushStatus>;
};

const BirdPush = registerPlugin<BirdPushPlugin>("BirdPush");
const INSTALL_KEY = "brume-install-id";

/** Returns the existing install id or creates one; never changes once stored. */
export function resolveInstallId(existing: string | null, makeId: () => string): string {
  return existing && existing.length >= 8 ? existing : `brume-${makeId()}`;
}

export function getInstallId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = resolveInstallId(localStorage.getItem(INSTALL_KEY), () => crypto.randomUUID());
    localStorage.setItem(INSTALL_KEY, id);
    return id;
  } catch {
    return null;
  }
}

function pushPlatform(): boolean {
  return typeof window !== "undefined" && isBirdPlatformAllowed(Capacitor.getPlatform());
}

/** True only in a store build that contains the native BirdPush plugin. */
export function hasBirdPush(): boolean {
  return pushPlatform() && Capacitor.isPluginAvailable("BirdPush");
}

/** Silent at launch: links the native contact and refreshes an already granted token. */
export async function syncBirdPush(): Promise<BirdPushStatus | null> {
  const externalId = getInstallId();
  if (!hasBirdPush() || !externalId) return null;
  try {
    return await BirdPush.sync({ externalId });
  } catch {
    return null;
  }
}

/** Shows the system notification prompt through Bird. Null when unavailable. */
export async function requestBirdPush(): Promise<BirdPushStatus | null> {
  if (!hasBirdPush()) return null;
  try {
    await syncBirdPush();
    return await BirdPush.request();
  } catch {
    return null;
  }
}

export async function birdPushStatus(): Promise<BirdPushStatus | null> {
  if (!hasBirdPush()) return null;
  try {
    return await BirdPush.status();
  } catch {
    return null;
  }
}
