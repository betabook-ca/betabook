import { detectMobilePlatform } from "@/lib/mobile-detection";
import { deletePushSubscription, savePushSubscription } from "@/spa/lib/actions-client";

export type PushSupport = "supported" | "install" | "unsupported";

/** iOS and iPadOS offer web push only to a site added to the Home Screen. */
export function pushSupport(): PushSupport {
  if ("serviceWorker" in navigator && "PushManager" in globalThis && "Notification" in globalThis)
    return "supported";
  return detectMobilePlatform() === "ios" ? "install" : "unsupported";
}

function applicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function currentPushSubscription(): Promise<PushSubscription | null> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  return (await existing?.pushManager.getSubscription()) ?? null;
}

function savable(subscription: PushSubscription) {
  const { endpoint, keys } = subscription.toJSON();
  return endpoint && keys?.p256dh && keys.auth
    ? { endpoint, p256dh: keys.p256dh, auth: keys.auth }
    : null;
}

/** Registers this browser's existing subscription to the signed-in account,
 * which may differ from the account that subscribed it. False when there is none. */
export async function claimPushSubscription(): Promise<boolean> {
  const subscription = await currentPushSubscription();
  const keys = subscription && savable(subscription);
  if (!keys) return false;
  return (await savePushSubscription(keys)).ok;
}

/** A null error means permission was denied. */
export async function enablePush(
  publicKey: string,
): Promise<{ ok: true } | { ok: false; error: string | null }> {
  const permission = await Notification.requestPermission();
  if (permission === "denied") return { ok: false, error: null };
  if (permission !== "granted") {
    return { ok: false, error: "Allow notifications when your browser asks to turn them on." };
  }
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(publicKey),
  });
  const keys = savable(subscription);
  if (!keys) {
    await subscription.unsubscribe();
    return { ok: false, error: "This browser's notifications aren't supported." };
  }
  const result = await savePushSubscription(keys);
  if (!result.ok) await subscription.unsubscribe();
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function disablePush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  try {
    await deletePushSubscription(subscription.endpoint);
  } finally {
    await subscription.unsubscribe();
  }
}
