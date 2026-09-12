"use client";

/**
 * La barre d'état — le pont entre ce qu'elle offre et le front.
 *
 * Deux surfaces s'y branchent désormais, et une seule est décrite ici parce
 * qu'elles parlent le MÊME langage : le menu natif (clic droit) et le popover
 * de `app/tray/page.tsx` (clic gauche) émettent exactement les mêmes
 * événements. Ce fichier n'a donc pas à savoir laquelle des deux a cliqué —
 * c'est ce qui a permis d'ajouter le popover sans y toucher, sauf pour le
 * journal, que seul un panneau dessiné pouvait offrir.
 *
 * Monté dans la coquille (`DashboardNew`) et non dans la page Discipline, pour
 * la raison qui vaut déjà pour `FocusSentinel` : seule la page courante est
 * montée, or le menu doit rester juste quand on est ailleurs dans l'app — et
 * surtout quand la fenêtre est cachée, c'est-à-dire au moment précis où le
 * menu sert.
 *
 * Il ne rend rien. Quatre fils, tous nécessaires :
 *
 *   • IL POUSSE. Règles et coches partent vers `tray_set_checklist` à chaque
 *     changement ; le Rust reconstruit le menu.
 *   • IL ÉCOUTE le menu (`tray-checklist-toggle`) et écrit la coche là où la
 *     page Discipline la lit.
 *   • IL ÉCOUTE la page Discipline, via le relais de `lib/routineChecklist`,
 *     pour que cocher dans l'app se voie dans le menu sans rechargement.
 *   • IL CAPTURE sur demande du menu (`tray-capture-request`). Le Rust ne prend
 *     pas l'image lui-même : il ne connaît ni la date locale, ni l'application
 *     au premier plan qu'on veut inscrire à côté de la prise.
 *   • IL ENREGISTRE, même bascule (`tray-record-toggle`). La vidéo part dans le
 *     dossier choisi par l'utilisateur, hors de l'app ; seule la fiche revient
 *     dans le journal du jour.
 *   • IL JOURNALE (`tray-journal-append`). Une note écrite dans le popover
 *     s'AJOUTE à celle du jour, horodatée ; elle ne la remplace pas. C'est la
 *     même entrée que la page Journal — une par date — et l'écraser effacerait
 *     ce que la séance du matin y avait mis.
 *
 * En navigateur (et en PWA), `isTauri()` est faux : le composant se réduit à
 * lire deux clés et ne pousse rien. Aucune garde supplémentaire à prévoir chez
 * l'appelant.
 */

import { useEffect, useRef, useState } from "react";
import { isTauri, notify } from "@/lib/notify";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { getLocalDateString } from "@/lib/dateUtils";
import { captureScreen, recordStart, recordStatus, recordStop } from "@/lib/capture/native";
import { appendCapture, newCaptureId } from "@/lib/captureLog";
import { readRecordSettings, recordFileName } from "@/lib/capture/settings";
import { snapshot } from "@/lib/activity/native";
import { appendDailyNote } from "@/lib/journal/quickNote";
import {
  ROUTINE_RULES_CLOUD_KEY,
  ROUTINE_RULES_KEY,
  activeList,
  normalizeRoutineStore,
  onRoutineChecksChange,
  readRoutineChecks,
  setActiveList,
  toggleRoutineCheck,
} from "@/lib/routineChecklist";

/* Une app de barre d'état vit des jours sans être rechargée : la date du jour
   ne peut pas être figée au montage, sinon le menu propose encore, jeudi, les
   coches de mercredi. Une minute suffit largement pour un changement de date. */
const DAY_POLL_MS = 60_000;

export default function TrayBridge() {
  const [saved, setSaved] = useCloudState(ROUTINE_RULES_KEY, ROUTINE_RULES_CLOUD_KEY, null);
  const [day, setDay] = useState(() => getLocalDateString());
  const [checks, setChecks] = useState(() => readRoutineChecks());
  /* Normalisé à chaque rendu plutôt que mémoïsé : la fonction est un parcours de
     quelques dizaines d'entrées, et un mémo sur une valeur qui vient du cloud
     rendrait le magasin périmé le temps d'un rafraîchissement. */
  const store = normalizeRoutineStore(saved);
  const current = activeList(store);

  /* Minuit : nouveau jour, nouvelles coches. Le `day` en état sert aussi à
     relancer la poussée — sans lui, le menu garderait l'entête de la veille. */
  useEffect(() => {
    const id = setInterval(() => {
      const today = getLocalDateString();
      setDay(prev => {
        if (prev === today) return prev;
        setChecks(readRoutineChecks(today));
        return today;
      });
    }, DAY_POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Écritures venues d'ailleurs (page Discipline).
  useEffect(() => onRoutineChecksChange((next, date) => {
    if (date === getLocalDateString()) setChecks(next);
  }), []);

  // Changement de liste depuis le sous-menu.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten = null;
    let dropped = false;
    import("@tauri-apps/api/event")
      .then(({ listen }) => listen("tray-routine-select", e => {
        const id = String(e?.payload ?? "");
        if (id) setSaved(prev => setActiveList(normalizeRoutineStore(prev), id));
      }))
      .then(fn => { if (dropped) fn(); else unlisten = fn; })
      .catch(e => console.warn("[tray] écoute du choix de liste impossible", e));
    return () => { dropped = true; if (unlisten) unlisten(); };
  }, [setSaved]);

  // Clic sur une règle dans le menu natif.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten = null;
    let dropped = false;
    import("@tauri-apps/api/event")
      .then(({ listen }) => listen("tray-checklist-toggle", e => {
        const id = String(e?.payload ?? "");
        if (id) setChecks(toggleRoutineCheck(id));
      }))
      .then(fn => {
        // Démontage arrivé avant l'abonnement : on le défait aussitôt posé.
        if (dropped) fn();
        else unlisten = fn;
      })
      .catch(e => console.warn("[tray] écoute de la checklist impossible", e));
    return () => { dropped = true; if (unlisten) unlisten(); };
  }, []);

  /* Capture demandée depuis le menu.

     Le relevé d'activité accompagne l'image : une capture sans son contexte
     oblige à l'ouvrir pour savoir ce qu'elle montre, alors que le titre de la
     fenêtre porte presque toujours l'instrument et l'unité de temps. Il est lu
     AVANT la prise — `screencapture` met quelques centaines de millisecondes,
     assez pour changer de fenêtre entre-temps.

     L'échec est notifié comme le succès : une capture ratée en silence, c'est
     un journal qu'on croit tenu et qui ne l'est pas. */
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten = null;
    let dropped = false;
    const take = async () => {
      const at = Date.now();
      const day = getLocalDateString(new Date(at));
      const id = newCaptureId(at);
      let app = "";
      let title = "";
      try {
        const snap = await snapshot();
        if (snap?.ok) { app = snap.app || ""; title = snap.title || ""; }
      } catch { /* le contexte est un bonus, jamais une condition */ }

      /* Copiée dans le presse-papiers : une capture prise depuis la barre
         d'état l'est presque toujours pour être collée tout de suite dans la
         fiche du trade en cours. Passer par le dossier du jour pour retrouver
         le fichier annulerait l'intérêt de l'avoir sous la main. */
      const res = await captureScreen(day, id, 1, true);
      appendCapture(
        { id, at, path: res.path, bytes: res.bytes, app, title, source: "tray", error: res.error },
        day
      );
      /* Le libellé dit ce qui est VRAI : promettre le presse-papiers quand la
         copie a échoué ferait coller autre chose, sans rien pour l'expliquer. */
      if (res.ok) {
        notify(
          res.copied ? "Capture copiée — ⌘V" : "Capture enregistrée",
          { body: title || app || "Écran capturé" }
        );
      }
      else notify("Capture impossible", { body: res.error || "cause inconnue" });
    };
    import("@tauri-apps/api/event")
      .then(({ listen }) => listen("tray-capture-request", () => { take(); }))
      .then(fn => { if (dropped) fn(); else unlisten = fn; })
      .catch(e => console.warn("[tray] écoute de la capture impossible", e));
    return () => { dropped = true; if (unlisten) unlisten(); };
  }, []);

  /* Enregistrement vidéo, démarré et arrêté depuis le menu.

     L'état de vérité est celui du RUST (`recordStatus`), pas un booléen tenu
     ici : le processus d'enregistrement lui survit à un rechargement de la
     WebView, et un état local se serait alors cru à l'arrêt pendant que la
     caméra tournait toujours.

     La référence `busy` couvre l'aller-retour : `screencapture` met un instant à
     démarrer comme à refermer son conteneur, et deux clics rapprochés sur
     l'entrée du menu lanceraient sinon deux appels concurrents. */
  const [recording, setRecording] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    recordStatus().then(st => { if (alive) setRecording(st.recording); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten = null;
    let dropped = false;
    const toggle = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const st = await recordStatus();
        if (st.recording) {
          const res = await recordStop();
          setRecording(false);
          const at = res.startedAt || Date.now();
          const day = getLocalDateString(new Date(at));
          appendCapture({
            id: newCaptureId(at),
            at,
            path: res.path,
            bytes: res.bytes,
            kind: "video",
            durationMs: res.startedAt ? Date.now() - res.startedAt : 0,
            audio: !!readRecordSettings().audio,
            source: "tray",
            external: true,
            error: res.error,
          }, day);
          if (res.ok) notify("Enregistrement terminé", { body: res.path || "" });
          else notify("Enregistrement interrompu", { body: res.error || "cause inconnue" });
          return;
        }

        const settings = readRecordSettings();
        if (!settings.dir) {
          /* Pas de dossier choisi : on ne devine pas où poser un fichier qui
             peut peser des gigaoctets. Réglages → Enregistrement. */
          notify("Où enregistrer ?", { body: "Choisis d'abord un dossier dans les réglages." });
          return;
        }
        const res = await recordStart(settings.dir, recordFileName(), {
          display: settings.display,
          audio: settings.audio,
          showClicks: settings.showClicks,
        });
        if (res.ok) {
          setRecording(true);
          notify("Enregistrement lancé", { body: res.path || "" });
        } else {
          notify("Enregistrement impossible", { body: res.error || "cause inconnue" });
        }
      } finally {
        busy.current = false;
      }
    };
    import("@tauri-apps/api/event")
      .then(({ listen }) => listen("tray-record-toggle", () => { toggle(); }))
      .then(fn => { if (dropped) fn(); else unlisten = fn; })
      .catch(e => console.warn("[tray] écoute de l'enregistrement impossible", e));
    return () => { dropped = true; if (unlisten) unlisten(); };
  }, []);

  /* Note écrite dans le popover.

     L'écriture ne passe PAS par `useDailySessionNotes` : ce hook tient un état
     React, et ce composant n'est pas celui qui l'affiche. Monter une seconde
     instance ici donnerait deux copies de la même note, dont l'une périmée dès
     que l'autre écrit — exactement la divergence que le relais de
     `useCloudState` existe pour éviter ailleurs. `appendDailyNote` relit donc le
     magasin au moment d'écrire, et la page Journal le relit à son tour. */
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten = null;
    let dropped = false;
    import("@tauri-apps/api/event")
      .then(({ listen }) => listen("tray-journal-append", async e => {
        const text = String(e?.payload ?? "").trim();
        if (!text) return;
        const res = await appendDailyNote(text);
        if (!res.ok) notify("Note non enregistrée", { body: res.error || "cause inconnue" });
      }))
      .then(fn => { if (dropped) fn(); else unlisten = fn; })
      .catch(e => console.warn("[tray] écoute du journal impossible", e));
    return () => { dropped = true; if (unlisten) unlisten(); };
  }, []);

  /* Poussée vers le menu. La référence garde la dernière charge envoyée : ce
     composant re-rend à chaque changement de règle OU de coche, et repousser
     une liste identique ferait reconstruire le menu pour rien — visible sur
     macOS, où un menu ouvert au même instant se referme. */
  const lastPush = useRef(null);
  useEffect(() => {
    if (!isTauri()) return;
    const args = {
      title: current.name,
      items: current.items.map(it => ({ id: it.id, label: it.label || "—", done: !!checks[it.id] })),
      lists: store.lists.map(l => ({ id: l.id, name: l.name, active: l.id === store.activeId })),
      recording,
    };
    const payload = JSON.stringify(args);
    if (payload === lastPush.current) return;
    lastPush.current = payload;
    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("tray_set_checklist", args))
      .catch(e => console.warn("[tray] mise à jour de la checklist impossible", e));
  }, [store, current, checks, day, recording]);

  return null;
}
