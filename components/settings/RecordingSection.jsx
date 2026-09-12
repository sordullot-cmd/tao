"use client";

/**
 * Réglages d'enregistrement d'écran.
 *
 * Trois choses à régler avant que la bascule du menu serve à quelque chose : OÙ
 * poser le fichier, QUEL écran filmer, et AVEC QUEL SON.
 *
 * ── LE DOSSIER ────────────────────────────────────────────────────────────
 * Il n'a pas de valeur par défaut, et c'est volontaire. Une vidéo de séance pèse
 * des centaines de mégaoctets ; les déposer d'office quelque part reviendrait à
 * remplir un disque à l'insu de son propriétaire. Tant qu'aucun dossier n'est
 * choisi, l'enregistrement refuse de démarrer et le dit.
 *
 * ── LE SON, ET POURQUOI C'EST LE POINT DÉLICAT ────────────────────────────
 * macOS ne sait capter que l'ENTRÉE audio par défaut, c'est-à-dire un micro.
 * Le son que la machine JOUE — l'alerte de la plateforme, une vidéo — n'est
 * accessible à aucune API sans un pilote de bouclage (BlackHole, Loopback…),
 * qui se présente au système comme une entrée. D'où la liste des périphériques
 * plutôt qu'une simple case à cocher : une fois un tel pilote installé, il
 * apparaît ici et devient sélectionnable. Le dire à l'écran évite la seule
 * conclusion que l'utilisateur tirerait sinon — que l'app est cassée.
 */

import React, { useEffect, useState } from "react";
import { FolderOpen, Video } from "lucide-react";
import { T, HAIRLINE } from "@/lib/ui/tokens";
import { Field, Input, Select, PillButton } from "@/components/ui/form";
import { isTauri } from "@/lib/notify";
import { AUDIO_DEFAULT, recordAudioDevices, recordStatus } from "@/lib/capture/native";
import {
  onRecordSettingsChange,
  readRecordSettings,
  writeRecordSettings,
} from "@/lib/capture/settings";

export default function RecordingSection() {
  const [settings, setSettings] = useState(() => readRecordSettings());
  const [devices, setDevices] = useState([]);
  const [status, setStatus] = useState({ recording: false, supported: false });
  const desktop = isTauri();

  useEffect(() => onRecordSettingsChange(setSettings), []);

  useEffect(() => {
    if (!desktop) return;
    let alive = true;
    recordAudioDevices().then(d => { if (alive) setDevices(d); }).catch(() => {});
    recordStatus().then(s => { if (alive) setStatus(s); }).catch(() => {});
    return () => { alive = false; };
  }, [desktop]);

  const patch = (next) => setSettings(writeRecordSettings({ ...settings, ...next }));

  const chooseDir = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({ directory: true, multiple: false, title: "Dossier des enregistrements" });
      if (typeof picked === "string" && picked) patch({ dir: picked });
    } catch (e) {
      console.warn("[record] choix du dossier impossible", e);
    }
  };

  if (!desktop) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Heading />
        <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6, margin: 0 }}>
          L&apos;enregistrement d&apos;écran demande l&apos;app de bureau : un navigateur
          ne peut filmer l&apos;écran qu&apos;en redemandant l&apos;autorisation à chaque
          prise, et ne peut rien écrire sur le disque.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Heading />

      {status.recording && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 12px", borderRadius: 12,
          background: T.redBg, color: T.red, fontSize: 12, fontWeight: 600,
        }}>
          <Video size={14} strokeWidth={2} />
          Enregistrement en cours — arrête-le depuis le menu de la barre d&apos;état.
        </div>
      )}

      <Field
        label="Dossier des enregistrements"
        hint="Sur ce poste seulement. Rien n'est téléversé : l'app ne retient que le chemin du fichier."
      >
        <div style={{ display: "flex", gap: 8 }}>
          <Input
            readOnly
            value={settings.dir}
            placeholder="Aucun dossier choisi"
            style={{ flex: 1, minWidth: 0 }}
          />
          <PillButton variant="secondary" onClick={chooseDir}>
            <FolderOpen size={13} strokeWidth={1.75} />
            <span>Choisir</span>
          </PillButton>
        </div>
      </Field>

      <Field label="Écran" hint="1 = écran principal. Utile si tu trades sur un second moniteur.">
        <Select
          value={String(settings.display)}
          onChange={e => patch({ display: Number(e.target.value) || 1 })}
        >
          <option value="1">Écran principal</option>
          <option value="2">Deuxième écran</option>
          <option value="3">Troisième écran</option>
        </Select>
      </Field>

      <Field
        label="Son"
        hint="macOS n'enregistre que l'entrée audio. Pour capter le son que joue ton Mac, il faut un pilote de bouclage (BlackHole, Loopback…), qui apparaîtra alors dans cette liste."
      >
        <Select
          value={settings.audio || ""}
          onChange={e => patch({ audio: e.target.value || null })}
        >
          <option value="">Aucun son</option>
          <option value={AUDIO_DEFAULT}>Entrée par défaut (micro)</option>
          {devices.filter(d => !d.defaultInput).map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
      </Field>

      <label style={{
        display: "flex", alignItems: "center", gap: 10,
        fontSize: 13, color: T.text, cursor: "pointer",
      }}>
        <input
          type="checkbox"
          checked={settings.showClicks}
          onChange={e => patch({ showClicks: e.target.checked })}
          style={{ width: 14, height: 14, accentColor: T.text, margin: 0 }}
        />
        <span>Marquer les clics dans la vidéo</span>
      </label>

      <div style={{ borderTop: HAIRLINE, paddingTop: 14 }}>
        <p style={{ fontSize: 12, color: T.textMut, lineHeight: 1.6, margin: 0 }}>
          L&apos;enregistrement demande l&apos;autorisation <strong>Enregistrement de
          l&apos;écran</strong>, et le son l&apos;autorisation <strong>Micro</strong> —
          macOS ne les propose qu&apos;une fois chacune. Si tu les as refusées, il
          faut passer par Réglages Système → Confidentialité et sécurité.
        </p>
      </div>
    </div>
  );
}

function Heading() {
  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: T.text, margin: 0 }}>
        Enregistrement d&apos;écran
      </h2>
      <p style={{ fontSize: 13, color: T.textSub, margin: "4px 0 0", lineHeight: 1.6 }}>
        Filme ta séance et garde la vidéo sur ton poste. Lancement et arrêt depuis
        le menu de la barre d&apos;état.
      </p>
    </div>
  );
}
