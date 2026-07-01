/**
 * usePWAHeartbeat — pings the backend every time the PWA opens in
 * display-mode:standalone (Android + iOS Home Screen). Powers the
 * "Installazioni attive" KPIs and — implicitly — uninstall detection:
 * a device that stops heartbeating for 30gg drops out of the "attive 30d"
 * counter, giving the admin a real-time picture of the installed base.
 *
 * NOT called in web-scan mode (browser tab) — those visits are captured
 * by the existing analytics events and shouldn't inflate the install
 * count.
 *
 * Fires on:
 *   • Mount (if already standalone at page load)
 *   • The Android `appinstalled` window event (first-time install)
 *   • Notification permission change (silenced/unsilenced) — so the
 *     "installato ma push off" KPI updates without waiting a day.
 *
 * The `device_id` is a random uuid generated once per browser and cached
 * in localStorage under `qrhub_device_id`. Survives across sessions so
 * subsequent heartbeats update the same row instead of creating dupes.
 */
import { useEffect } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const DEVICE_KEY = 'qrhub_device_id';

const getOrCreateDeviceId = () => {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      // Crypto-strong random when available; otherwise timestamp+math for
      // ancient browsers (still unique enough for our purposes).
      id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    // localStorage disabled (Safari private mode) → use a per-session id.
    // Heartbeats will still work but won't be de-duped across sessions.
    return `ephemeral-${Date.now().toString(36)}`;
  }
};

const detectOS = () => {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios'; // iPadOS
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
};

const isStandalone = () => {
  if (typeof window === 'undefined') return false;
  return window.navigator.standalone === true
    || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
};

const getCurrentPushEndpoint = async () => {
  try {
    if (!('serviceWorker' in navigator)) return null;
    const reg = await navigator.serviceWorker.getRegistration('/qrhub-sw.js');
    const sub = reg && await reg.pushManager.getSubscription();
    return sub ? sub.endpoint : null;
  } catch {
    return null;
  }
};

export const usePWAHeartbeat = (vendorId) => {
  useEffect(() => {
    if (!vendorId) return undefined;

    const sendHeartbeat = async () => {
      if (!isStandalone()) return;  // web scan → never heartbeat
      try {
        const device_id = getOrCreateDeviceId();
        const os = detectOS();
        const notification_permission = typeof Notification !== 'undefined'
          ? Notification.permission : 'default';
        const push_endpoint = await getCurrentPushEndpoint();
        await axios.post(`${API}/push/heartbeat`, {
          device_id, vendor_id: vendorId, os,
          notification_permission, push_endpoint,
        });
      } catch {
        // Fire-and-forget: never surface heartbeat failures to the user.
      }
    };

    // First fire on mount (covers "user opens app from Home icon").
    sendHeartbeat();

    // Android install completion event — customer just tapped "Install"
    // on the native prompt. Fire an immediate heartbeat so the KPI
    // ticker doesn't wait for the next app-open. On iOS this event
    // never fires (Apple doesn't dispatch it), but the fallback mount
    // heartbeat catches it when the user reopens from Home.
    const onInstalled = () => { sendHeartbeat(); };
    window.addEventListener('appinstalled', onInstalled);

    // Re-heartbeat when the user changes notification permission (both
    // grant AND deny). Uses the modern Permissions API where available.
    let permStatus = null;
    if (typeof navigator !== 'undefined' && navigator.permissions
        && typeof navigator.permissions.query === 'function') {
      navigator.permissions.query({ name: 'notifications' })
        .then((status) => {
          permStatus = status;
          status.onchange = () => { sendHeartbeat(); };
        })
        .catch(() => { /* older browsers — silently skip */ });
    }

    // ── Explicit sync trigger from PushSubscribe.js ────────────────────
    // Safari does NOT fire `permissions.query` onchange when the user
    // grants/denies via Notification.requestPermission() — so we ALSO
    // listen to our internal 'qrhub:push-state-changed' event which
    // PushSubscribe dispatches after every subscribe / unsubscribe.
    // Without this, the pwa_devices row keeps the stale permission and
    // the "installazioni con notifiche disattivate" callout stays lit
    // even after the user activates. Root cause of the "notifiche
    // dice disattivate anche se attive" bug.
    const onPushStateChanged = () => { sendHeartbeat(); };
    window.addEventListener('qrhub:push-state-changed', onPushStateChanged);

    // Also refresh on visibilitychange (user returns to the app) — cheap
    // and helps mark long-idle devices as still active on their next open.
    const onVis = () => {
      if (document.visibilityState === 'visible') sendHeartbeat();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      window.removeEventListener('appinstalled', onInstalled);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('qrhub:push-state-changed', onPushStateChanged);
      if (permStatus) permStatus.onchange = null;
    };
  }, [vendorId]);
};

export default usePWAHeartbeat;
