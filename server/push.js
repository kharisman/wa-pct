import webpush from 'web-push';
import { getSetting, setSetting, initPush as initPushTable, savePushSub, deletePushSub, listPushSubs } from './db.js';

export { savePushSub, deletePushSub };

let vapidPublic;

export async function initPush() {
  await initPushTable();
  vapidPublic = await getSetting('VAPID_PUBLIC');
  let vapidPrivate = await getSetting('VAPID_PRIVATE');
  if (!vapidPublic || !vapidPrivate) {
    const keys = webpush.generateVAPIDKeys();
    vapidPublic = keys.publicKey;
    vapidPrivate = keys.privateKey;
    await setSetting('VAPID_PUBLIC', vapidPublic);
    await setSetting('VAPID_PRIVATE', vapidPrivate);
  }
  webpush.setVapidDetails('mailto:admin@palcomtech.ac.id', vapidPublic, vapidPrivate);
}

export const getVapidPublic = () => vapidPublic;

// Kirim ke semua staff yang subscribe (kecuali excludeEmail, biasanya pengirim sendiri)
export async function sendPushToAll(payload, excludeEmail) {
  const subs = await listPushSubs();
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (s) => {
    if (excludeEmail && s.email === excludeEmail) return;
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body);
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await deletePushSub(s.endpoint); // subscription mati, buang
      else console.error('push gagal', e.message);
    }
  }));
}
