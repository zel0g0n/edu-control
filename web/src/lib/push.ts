"use client";

import type { AppNotification } from "@edunazorat/shared";

import { store } from "./data/store";
import { RemoteTransport } from "./data/transport";
import { notificationText } from "./notif";

export type PushState = "unsupported" | "default" | "granted" | "denied";

export function pushState(): PushState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as PushState;
}

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Bildirishnomalarga ruxsat so'rash. Backend rejimida brauzer Web Push'ga
 * obuna bo'ladi: ilova yopiq bo'lsa ham telefon/kompyuterga xabar keladi.
 * Demo rejimda faqat ilova (yoki uning boshqa oynasi) ochiq bo'lganda ishlaydi.
 */
export async function enablePush(): Promise<PushState> {
  if (pushState() === "unsupported") return "unsupported";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm as PushState;
  const api = store.api;
  if (api instanceof RemoteTransport && "serviceWorker" in navigator && "PushManager" in window) {
    try {
      const key = await api.vapidKey();
      if (key) {
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) }));
        await api.savePushSubscription(sub.toJSON(), store.lang);
      }
    } catch (e) {
      console.warn("Web Push obunasi bo'lmadi", e);
    }
  }
  return "granted";
}

/** Ilova ochiq, lekin boshqa oynada bo'lsa: tizim bildirishnomasi. */
export function showSystemNotification(n: AppNotification): boolean {
  if (pushState() !== "granted" || document.visibilityState === "visible") return false;
  try {
    const note = new Notification("EduNazorat", {
      body: notificationText(store.lang, n),
      icon: n.image ?? "/icon-192.png",
      tag: n.id,
    });
    note.onclick = () => {
      window.focus();
      if (n.link) window.location.assign(n.link);
    };
    return true;
  } catch {
    return false;
  }
}
