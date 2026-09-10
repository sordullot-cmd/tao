"use client";

/**
 * notify — envoi de notifications système unifié.
 *
 * Dans l'app desktop (Tauri), on passe par le plugin natif
 * `@tauri-apps/plugin-notification` : c'est la SEULE voie fiable pour obtenir de
 * vraies notifications OS, notamment sur macOS où la WebView (WKWebView) ne
 * supporte pas l'API Web `Notification` (l'utilisateur ne voyait donc rien).
 *
 * Dans un navigateur classique, on retombe sur l'API Web `Notification`.
 *
 * ⚠️ Une notification ne part que si l'app TOURNE : elle est posée par un
 * `setTimeout` côté client, jamais par un serveur. Machine éteinte, app quittée,
 * ou simple navigateur mobile fermé — le rappel n'existe pas. C'est la limite à
 * garder en tête avant de chercher un bug ailleurs.
 */

/** Vrai si on tourne dans la WebView Tauri (desktop). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Import paresseux du plugin : évite de charger le bundle Tauri dans le
// navigateur et de casser le SSR.
async function tauriPlugin() {
  return import("@tauri-apps/plugin-notification");
}

/**
 * Demande (si besoin) l'autorisation d'émettre des notifications.
 * Retourne `true` si l'autorisation est accordée.
 */
export async function ensureNotifyPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (isTauri()) {
    try {
      const { isPermissionGranted, requestPermission } = await tauriPlugin();
      if (await isPermissionGranted()) return true;
      const perm = await requestPermission();
      return perm === "granted";
    } catch (e) {
      warnNotify("ensureNotifyPermission (Tauri)", e);
      return false;
    }
  }

  if (!("Notification" in window)) return false;
  try {
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const perm = await Notification.requestPermission();
    return perm === "granted";
  } catch (e) {
    warnNotify("Notification.requestPermission", e);
    return false;
  }
}

/**
 * Journalise au lieu d'avaler. Un no-op muet est ici indiscernable d'une absence
 * de rappel programmé : sans cette trace, diagnostiquer demande de relire tout
 * le chemin depuis l'agenda. L'inspecteur est compilé dans la build de release
 * (feature `devtools`) exprès pour la lire.
 */
function warnNotify(step: string, err: unknown): void {
  console.warn(`[notify] ${step} a échoué`, err);
}

/** Vrai si l'autorisation est déjà accordée (sans la demander). */
export async function isNotifyGranted(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (isTauri()) {
    try {
      const { isPermissionGranted } = await tauriPlugin();
      return await isPermissionGranted();
    } catch (e) {
      warnNotify("isNotifyGranted (Tauri)", e);
      return false;
    }
  }
  return "Notification" in window && Notification.permission === "granted";
}

/**
 * Nom de son réclamé par défaut sur le bureau.
 *
 * Le plugin natif ne joue RIEN tant qu'aucun son n'est nommé : `sendNotification`
 * sans champ `sound` laisse `soundName` vide côté macOS, et la notification
 * arrive muette. Une alerte muette derrière une fenêtre plein écran est une
 * alerte manquée — c'est justement le cas qu'on cherche à couvrir.
 *
 * Cette constante est la valeur littérale de `NSUserNotificationDefaultSoundName`,
 * donc le son que l'utilisateur a choisi dans ses réglages, pas un son imposé.
 * La remplacer par un nom de `/System/Library/Sounds` (« Ping », « Glass »…)
 * force un son précis.
 */
const DESKTOP_SOUND = "NSUserNotificationDefaultSoundName";

export interface NotifyOptions {
  /** Corps du message. */
  body?: string;
  /** Icône (chemin web) — utilisée uniquement par le repli navigateur. */
  icon?: string;
  /**
   * Son à jouer. `false` pour une notification muette ; une chaîne pour un son
   * système nommé. Sans valeur, `DESKTOP_SOUND`.
   *
   * Le repli navigateur n'a pas de choix de son à offrir : l'API Web ne connaît
   * que `silent`, le son lui-même appartient au navigateur. Seul `false` y
   * change donc quelque chose.
   */
  sound?: string | false;
}

/**
 * Émet une notification système native. No-op silencieux si l'autorisation
 * n'est pas accordée ou en cas d'erreur.
 */
export async function notify(title: string, options: NotifyOptions = {}): Promise<void> {
  if (typeof window === "undefined") return;
  const { body, icon = "/web-app-manifest-192x192.png", sound = DESKTOP_SOUND } = options;

  if (isTauri()) {
    try {
      const { isPermissionGranted, requestPermission, sendNotification } = await tauriPlugin();
      let granted = await isPermissionGranted();
      if (!granted) granted = (await requestPermission()) === "granted";
      if (!granted) return;
      sendNotification({ title, body, sound: sound === false ? undefined : sound });
    } catch (e) {
      warnNotify("sendNotification (Tauri)", e);
    }
    return;
  }

  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon, silent: sound === false });
  } catch (e) {
    warnNotify("new Notification", e);
  }
}
