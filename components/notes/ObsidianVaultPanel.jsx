"use client";

/**
 * Panneau de liaison au vault Obsidian, posé dans l'en-tête de la page Notes.
 *
 * Le déclencheur est une pastille d'état (liée / à reconnecter / en erreur) qui
 * ouvre le détail : dossier choisi, dernière passe, réglage de la synchro
 * automatique, conflits éventuels. Le travail réel est dans
 * lib/hooks/useObsidianVault.ts — ce fichier n'est que sa surface.
 */

import React, { useRef, useState } from "react";
import { FolderSync, RefreshCw, Check, TriangleAlert, Unlink, FolderOpen, X } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { HAIRLINE, FIELD_BG } from "@/components/ui/da";
import Popover from "@/components/ui/Popover";

function relativeTime(ms) {
  if (!ms) return null;
  const diff = Date.now() - ms;
  if (diff < 45_000) return "à l'instant";
  const min = Math.round(diff / 60_000);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return new Date(ms).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Pastille verte / orange / rouge de l'état courant. */
function StateDot({ tone }) {
  const color = tone === "ok" ? T.green : tone === "warn" ? T.amber : T.red;
  return <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />;
}

function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      style={{
        display: "inline-flex", alignItems: "center", gap: 10,
        background: "transparent", border: "none", cursor: "pointer",
        padding: 0, fontFamily: "inherit", textAlign: "left",
      }}
    >
      <span style={{
        width: 36, height: 20, borderRadius: 999,
        background: checked ? T.green : T.border,
        position: "relative", transition: "background 150ms", flexShrink: 0,
      }}>
        <span style={{
          position: "absolute", top: 2, left: checked ? 18 : 2,
          width: 16, height: 16, borderRadius: "50%", background: T.white,
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)", transition: "left 150ms",
        }} />
      </span>
      <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{label}</span>
    </button>
  );
}

const ACTION = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  padding: "8px 16px", minHeight: 34, borderRadius: 999,
  fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
};

export default function ObsidianVaultPanel({ vault }) {
  const { status, mode, label, syncing, lastSync, summary, error, conflicts, autoSync } = vault;
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);

  const tone = error ? "err" : status === "linked" ? "ok" : status === "permission" ? "warn" : null;
  const triggerLabel = status === "linked" ? "Obsidian" : status === "permission" ? "Reconnecter" : "Obsidian";

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="Synchronisation avec Obsidian"
        title={status === "linked" ? `Notes synchronisées avec ${label}` : "Lier les notes à un vault Obsidian"}
        /* Blanc, pas l'aplat gris des champs : ce bouton est posé sur le FOND
           de page, à côté de la pilule noire « Nouvelle note ». En blanc il se
           lit comme une surface à part entière et forme une paire nette avec
           elle, là où le gris se confondait avec le fond. L'ombre de pilule lui
           donne son bord — sans elle, un blanc sur gris clair flotte. */
        style={{
          ...ACTION,
          background: T.white,
          boxShadow: T.elevPill,
          border: "none",
          color: T.text,
        }}
      >
        <FolderSync
          size={13}
          strokeWidth={1.75}
          className={syncing ? "anim-spin" : undefined}
          style={{ color: T.textMut }}
        />
        <span className="tr4de-notes-newbtn-label">{triggerLabel}</span>
        {tone && <StateDot tone={tone} />}
      </button>

      <Popover
        anchorRef={anchorRef}
        open={open}
        onClose={() => setOpen(false)}
        align="end"
        minWidth={320}
        maxHeight={520}
        aria-label="Synchronisation Obsidian"
        style={{
          background: T.white,
          borderRadius: 12,
          boxShadow: "var(--elev-overlay)",
          border: "none",
          padding: 0,
          fontFamily: "var(--font-sans)",
        }}
      >
        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${HAIRLINE}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>Vault Obsidian</div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fermer"
            style={{ width: 34, height: 34, borderRadius: 999, border: "none", background: "transparent", color: T.textMut, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={12} strokeWidth={2} />
          </button>
        </div>

        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, maxWidth: 380 }}>
          {status === "unsupported" && (
            <div style={{ fontSize: 12, lineHeight: 1.55, color: T.textSub }}>
              Ce navigateur ne permet pas d&apos;écrire dans un dossier local. Ouvre l&apos;app
              depuis Chrome ou Edge, ou utilise l&apos;application de bureau — les notes
              seront alors écrites en <code style={{ background: FIELD_BG, padding: "1px 5px", borderRadius: "var(--radius-field)" }}>.md</code> directement dans ton vault.
            </div>
          )}

          {status === "unlinked" && (
            <>
              <div style={{ fontSize: 12, lineHeight: 1.55, color: T.textSub }}>
                Choisis le dossier de ton vault où déposer les notes (par exemple
                <span style={{ color: T.text }}> Vault/tr4de</span>). Chaque note y devient un
                fichier <code style={{ background: FIELD_BG, padding: "1px 5px", borderRadius: "var(--radius-field)" }}>.md</code>,
                images et schémas dans <span style={{ color: T.text }}>attachments/</span>. Tes
                modifications faites dans Obsidian reviennent dans l&apos;app.
              </div>
              <button type="button" onClick={vault.link} style={{ ...ACTION, background: T.text, color: T.textInverted, border: "none", alignSelf: "flex-start" }}>
                <FolderOpen size={13} strokeWidth={1.75} />
                Choisir le dossier…
              </button>
            </>
          )}

          {(status === "linked" || status === "permission") && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 11, color: T.textMut }}>Dossier lié</div>
                <div style={{ fontSize: 12, color: T.text, wordBreak: "break-all", lineHeight: 1.45 }}>{label}</div>
                <div style={{ fontSize: 11, color: T.textMut }}>
                  {mode === "tauri" ? "Accès natif (app de bureau)" : "Accès navigateur"}
                </div>
              </div>

              {status === "permission" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 12, background: T.amberBg, color: T.text }}>
                  <div style={{ display: "flex", gap: 8, fontSize: 12, lineHeight: 1.5 }}>
                    <TriangleAlert size={14} strokeWidth={1.75} style={{ color: T.amber, flexShrink: 0, marginTop: 1 }} />
                    Le navigateur a remis l&apos;autorisation d&apos;accès à zéro. Un clic suffit à la rendre.
                  </div>
                  <button type="button" onClick={vault.reconnect} style={{ ...ACTION, background: T.text, color: T.textInverted, border: "none", alignSelf: "flex-start" }}>
                    Reconnecter
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.textSub }}>
                  {syncing ? (
                    <>
                      <RefreshCw size={13} strokeWidth={1.75} className="anim-spin" style={{ color: T.textMut }} />
                      Synchronisation…
                    </>
                  ) : (
                    <>
                      <Check size={13} strokeWidth={2} style={{ color: T.green }} />
                      {summary || "Prêt"}
                      {lastSync && <span style={{ color: T.textMut }}>· {relativeTime(lastSync)}</span>}
                    </>
                  )}
                </div>
              )}

              <Switch checked={autoSync} onChange={vault.setAutoSync} label="Synchroniser automatiquement" />
              {!autoSync && (
                <div style={{ fontSize: 11, color: T.textMut, lineHeight: 1.5 }}>
                  Les notes ne partent plus toutes seules : utilise « Synchroniser ».
                </div>
              )}

              {conflicts.length > 0 && (
                <div style={{ padding: 10, borderRadius: 12, background: T.amberBg, fontSize: 11, lineHeight: 1.5, color: T.text }}>
                  Une note avait été modifiée des deux côtés. La version la plus récente
                  a été gardée, l&apos;autre est copiée dans <span style={{ fontWeight: 500 }}>conflicts/</span> :
                  <div style={{ marginTop: 4, color: T.textSub, wordBreak: "break-all" }}>
                    {conflicts.slice(0, 3).map(c => <div key={c}>{c}</div>)}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 2 }}>
                <button type="button" onClick={vault.syncNow} disabled={syncing}
                  style={{ ...ACTION, background: T.text, color: T.textInverted, border: "none", opacity: syncing ? 0.6 : 1, cursor: syncing ? "default" : "pointer" }}>
                  <RefreshCw size={13} strokeWidth={1.75} className={syncing ? "anim-spin" : undefined} />
                  Synchroniser
                </button>
                <button type="button" onClick={vault.link} style={{ ...ACTION, background: FIELD_BG, border: "none", color: T.text }}>
                  <FolderOpen size={13} strokeWidth={1.75} />
                  Changer de dossier
                </button>
                <button type="button" onClick={vault.unlink} style={{ ...ACTION, background: FIELD_BG, border: "none", color: T.textSub }}>
                  <Unlink size={13} strokeWidth={1.75} />
                  Délier
                </button>
              </div>

              <div style={{ fontSize: 11, color: T.textMut, lineHeight: 1.5, borderTop: `1px solid ${HAIRLINE}`, paddingTop: 10 }}>
                Le nom du fichier suit le titre de la note ; si tu le renommes dans
                Obsidian, c&apos;est ton nom qui est conservé. Les propriétés ajoutées à la
                main dans le front-matter, en revanche, sont réécrites à chaque envoi.
              </div>
            </>
          )}

          {error && (
            <div style={{ display: "flex", gap: 8, padding: 10, borderRadius: 12, background: T.redBg, fontSize: 12, lineHeight: 1.5, color: T.text }}>
              <TriangleAlert size={14} strokeWidth={1.75} style={{ color: T.red, flexShrink: 0, marginTop: 1 }} />
              {error}
            </div>
          )}
        </div>
      </Popover>
    </>
  );
}
