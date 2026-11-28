import { deletePushSubscription, savePushSubscription } from "@/spa/lib/actions-client";

export type PushSupport = "supported" | "install" | "unsupported";

/** iOS and iPadOS offer web push only to a site added to the Home Screen. */
export function pushSupport(env: {
  window: Window & typeof globalThis;
  navigator: Navigator;
}): PushSupport {
  const { window: win, navigator: nav } = env;
  if ("serviceWorker" in nav && "PushManager" in win && "Notification" in win) return "supported";
  const ios =
    /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  return ios ? "install" : "unsupported";
}

function applicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** This browser's current subscription, without prompting. */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  return (await existing?.pushManager.getSubscription()) ?? null;
}

/** Asks for permission, subscribes this browser and registers it for the account. */
export async function enablePush(
  publicKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if ((await Notification.requestPermission()) !== "granted") {
    return {
      ok: false,
      error: "Notifications are blocked for Betabook in this browser's settings.",
    };
  }
  const subscription = await (
    await registration()
  ).pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(publicKey),
  });
  const { endpoint, keys } = subscription.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) {
    await subscription.unsubscribe();
    return { ok: false, error: "This browser's notifications aren't supported." };
  }
  const result = await savePushSubscription({ endpoint, p256dh: keys.p256dh, auth: keys.auth });
  if (!result.ok) await subscription.unsubscribe();
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/** Stops push on this browser. Best effort: the server also drops dead endpoints. */
export async function disablePush(): Promise<void> {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  try {
    await deletePushSubscription(subscription.endpoint);
  } finally {
    await subscription.unsubscribe();
  }
}
