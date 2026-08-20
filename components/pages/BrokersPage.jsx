"use client";

import React, { useRef, useState } from "react";
import { Upload, Link as LinkIcon, ExternalLink, Check, AlertTriangle } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { listBrokers } from "@/lib/brokers/registry";
import { mergeUnique } from "@/lib/utils/tradeDedup";

/**
 * BrokersPage — page de gestion des intégrations broker.
 *
 * Pour chaque broker du registry :
 *  - Logo / nom / description
 *  - Bouton "Importer un fichier" (toujours dispo si parseFile)
 *  - Bouton "Connecter" (OAuth) — affiché seulement si features.apiSync
 *  - Documentation broker (liens externes)
 *
 * L'import déclenche `tr4de:trades-imported` event que les pages écoutent
 * déjà pour rafraîchir l'affichage.
 */

export default function BrokersPage() {
  const brokers = listBrokers();
  const [busy, setBusy] = useState(/** @type {string|null} */(null));
  const [feedback, setFeedback] = useState(/** @type {Record<string,{ok:boolean,msg:string}>} */({}));
  const fileInputRefs = useRef(/** @type {Record<string, HTMLInputElement|null>} */({}));

  const setRef = (id) => (el) => { fileInputRefs.current[id] = el; };

  const onFileSelected = async (broker, event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // reset
    if (!file) return;
    setBusy(broker.meta.id);
    setFeedback(prev => ({ ...prev, [broker.meta.id]: undefined }));
    try {
      const content = await file.text();
      const trades = broker.parseFile ? broker.parseFile(content) : [];
      if (!trades || trades.length === 0) {
        throw new Error("Aucun trade trouvé dans ce fichier.");
      }
      const existing = JSON.parse(localStorage.getItem("tr4de_trades") || "[]");
      const { merged, report } = mergeUnique(existing, trades);
      localStorage.setItem("tr4de_trades", JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent("tr4de:trades-imported", { detail: { count: report.added.length } }));
      const skipped = report.skipped.length;
      setFeedback(prev => ({
        ...prev,
        [broker.meta.id]: {
          ok: true,
          msg: skipped > 0
            ? `${report.added.length} nouveaux trades importés (${skipped} doublons ignorés)`
            : `${report.added.length} trades importés`,
        },
      }));
    } catch (err) {
      setFeedback(prev => ({
        ...prev,
        [broker.meta.id]: { ok: false, msg: err instanceof Error ? err.message : String(err) },
      }));
    } finally {
      setBusy(null);
    }
  };

  // Tradovate API n'est utilisable que si l'app a un client ID configuré.
  const tradovateConfigured = !!process.env.NEXT_PUBLIC_TRADOVATE_CLIENT_ID;

  const onConnect = (broker) => {
    if (broker.meta.id !== "tradovate") {
      setFeedback(prev => ({ ...prev, [broker.meta.id]: { ok: false, msg: "Sync API pas encore disponible pour ce broker" } }));
      return;
    }
    if (!tradovateConfigured) {
      setFeedback(prev => ({ ...prev, [broker.meta.id]: { ok: false, msg: "Connexion API Tradovate non configurée — utilise l'import CSV." } }));
      return;
    }
    window.location.href = "/api/brokers/tradovate/oauth?action=start";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="anim-1">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div id="tr4de-page-header-slot" style={{ marginLeft: "auto" }} />
      </div>

      <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, fontSize: 12, color: T.textSub, lineHeight: 1.5 }}>
        Importe ton historique broker via fichier (CSV/HTML) ou connecte-toi via API
        pour synchroniser automatiquement (Tradovate uniquement pour l&apos;instant).
        Les trades sont fusionnés à ta liste existante — pas de doublons gérés
        automatiquement, vérifie avant import.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {brokers.map(b => {
          const m = b.meta;
          const fb = feedback[m.id];
          return (
            <div key={m.id} style={{
              background: T.white,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              padding: 16,
              display: "flex", flexDirection: "column", gap: 12,
            }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 8,
                  background: m.logoPath ? T.white : m.color, color: "#fff",
                  border: m.logoPath ? `1px solid ${T.border}` : "none",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, fontWeight: 700, flexShrink: 0, overflow: "hidden",
                }}>
                  {m.logoPath
                    ? <img src={m.logoPath} alt={m.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    : m.initial}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{m.name}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    {m.features.fileImport && <Pill color={T.green}>Fichier</Pill>}
                    {m.features.apiSync && <Pill color={T.blue}>API</Pill>}
                    {!m.features.fileImport && !m.features.apiSync && <Pill color={T.textMut}>Bientôt</Pill>}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.5, minHeight: 36 }}>
                {m.description}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {m.features.fileImport && (
                  <>
                    <button
                      type="button"
                      disabled={busy === m.id || !b.parseFile}
                      onClick={() => fileInputRefs.current[m.id]?.click()}
                      style={btnStyle(busy === m.id || !b.parseFile, "primary")}
                    >
                      <Upload size={13} strokeWidth={1.75} />
                      {busy === m.id ? "Import..." : "Importer"}
                    </button>
                    <input
                      ref={setRef(m.id)}
                      type="file"
                      accept=".csv,.html,.htm,.txt"
                      onChange={e => onFileSelected(b, e)}
                      style={{ display: "none" }}
                      aria-label={`Sélectionner un fichier ${m.name}`}
                    />
                  </>
                )}
                {m.features.apiSync && (m.id !== "tradovate" || tradovateConfigured) && (
                  <button
                    type="button"
                    onClick={() => onConnect(b)}
                    style={btnStyle(false, "secondary")}
                  >
                    <LinkIcon size={13} strokeWidth={1.75} /> Connecter
                  </button>
                )}
                {m.docsUrl && (
                  <a
                    href={m.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...btnStyle(false, "ghost"), textDecoration: "none" }}
                  >
                    <ExternalLink size={13} strokeWidth={1.75} /> Doc
                  </a>
                )}
              </div>

              {/* Feedback */}
              {fb && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 10px", borderRadius: 6,
                  background: fb.ok ? "#F0FDF4" : "#FEF2F2",
                  color: fb.ok ? T.green : T.red,
                  fontSize: 12, fontWeight: 500,
                }}>
                  {fb.ok ? <Check size={13} strokeWidth={2} /> : <AlertTriangle size={13} strokeWidth={2} />}
                  {fb.msg}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 12, padding: 14, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 12, color: T.textMut, lineHeight: 1.5 }}>
        <strong style={{ color: T.text }}>Note technique</strong> — Pour activer la
        connexion API Tradovate, configure les variables d&apos;environnement
        <code style={codeStyle()}>NEXT_PUBLIC_TRADOVATE_CLIENT_ID</code> et
        <code style={codeStyle()}>TRADOVATE_CLIENT_SECRET</code> sur Vercel,
        puis ajoute la table Supabase <code style={codeStyle()}>user_broker_connections</code>.
      </div>
    </div>
  );
}

function Pill({ children, color }) {
  return (
    <span style={{
      fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4,
      padding: "2px 7px", borderRadius: 999,
      color, background: color + "18",
    }}>
      {children}
    </span>
  );
}

function btnStyle(disabled, variant) {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 6,
    minHeight: 28, padding: "5px 12px", borderRadius: 999,
    fontSize: 12, fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
    opacity: disabled ? 0.5 : 1,
  };
  if (variant === "primary") {
    return { ...base, background: T.white, color: T.text, border: `1px solid ${T.text}` };
  }
  if (variant === "secondary") {
    return { ...base, background: T.white, color: T.text, border: `1px solid ${T.border}` };
  }
  return { ...base, background: "transparent", color: T.textSub, border: "1px solid transparent" };
}

function codeStyle() {
  return {
    fontSize: 11,
    padding: "1px 5px",
    margin: "0 2px",
    background: T.white,
    borderRadius: 4,
    fontFamily: "var(--font-mono)",
  };
}
