"use client";

import React, { useState } from "react";
import { Link2, SquarePlay, LineChart, ChevronRight } from "lucide-react";
import { T, FIELD_BG, HAIRLINE } from "@/lib/ui/tokens";
import { TYPE, TABULAR } from "@/lib/ui/type";
import { PillButton } from "@/components/ui/form";
import { parseYouTube, studyWeek, fmtMinutes } from "@/lib/study/model";
import NoteRows from "@/components/study/NoteRows";
import TradePicker from "@/components/study/TradePicker";
import { SourceTab } from "@/components/study/StudyNoteView";

/* Objectif hebdomadaire de l'anneau. Fixe pour l'instant : dix heures, deux par
   jour de marché — l'anneau bouge dès la première séance sans se remplir dès
   le mardi. */
const WEEK_GOAL_MIN = 600;
const RECENT = 8;

/**
 * Accueil de la page Étude : d'où part-on (une vidéo, un trade), où en est-on
 * cette semaine, et ce qu'on a touché récemment.
 *
 * Partir d'une SOURCE plutôt que d'une page blanche : on étudie presque
 * toujours quelque chose — un cours YouTube, un trade qu'on veut comprendre.
 * Coller le lien crée la note avec la vidéo déjà dedans.
 */
export default function StudyHome({ store, now, trades, folderOf, onOpen, onFromVideo, onFromTrades }) {
  const [source, setSource] = useState("video");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false);
  const [insights, setInsights] = useState(false);
  const week = studyWeek(store, now);
  const recent = [...store.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, RECENT);

  const submit = () => {
    const yt = parseYouTube(draft);
    if (!yt) { setError("Ce n'est pas un lien YouTube."); return; }
    onFromVideo(yt);
    setDraft(""); setError("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <SourceTab active={source === "video"} onClick={() => setSource("video")}>
            <SquarePlay size={14} strokeWidth={1.75} /> Vidéo YouTube
          </SourceTab>
          <SourceTab active={source === "trade"} onClick={() => setSource("trade")}>
            <LineChart size={14} strokeWidth={1.75} /> Mon trade
          </SourceTab>
          <span style={{ ...TYPE.label, color: T.textMut, marginLeft: 6 }}>
            Étudie à partir d&apos;une vidéo, de ton propre trade, ou des deux.
          </span>
        </div>
        {source === "video" ? (
          <form onSubmit={(e) => { e.preventDefault(); submit(); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px", minHeight: 44, borderRadius: 12, background: FIELD_BG }}>
            <Link2 size={15} strokeWidth={1.75} color={T.textMut} style={{ flexShrink: 0 }} />
            <input
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setError(""); }}
              placeholder="De quelle vidéo viennent ces notes ? Colle un lien YouTube"
              aria-label="Lien de la vidéo YouTube"
              style={{ ...TYPE.callout, fontWeight: 400, flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: T.text, fontFamily: "inherit" }}
            />
            {draft.trim() && <PillButton compact variant="primary" type="submit">Commencer</PillButton>}
          </form>
        ) : (
          <button type="button" onClick={() => setPicking(true)}
                  style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, padding: "0 14px", minHeight: 44, borderRadius: 12, background: FIELD_BG, ...TYPE.callout, fontWeight: 400, color: T.textMut }}>
            <LineChart size={15} strokeWidth={1.75} style={{ flexShrink: 0 }} />
            Quel trade veux-tu comprendre ? Choisis-le dans ton journal
          </button>
        )}
        {error && <div role="alert" style={{ ...TYPE.label, color: T.red }}>{error}</div>}
      </section>

      <section style={{ borderRadius: 14, background: FIELD_BG, padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Ring ratio={week.week / WEEK_GOAL_MIN} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TYPE.caption2, letterSpacing: "0.08em", textTransform: "uppercase", color: T.textSub }}>Cette semaine</div>
            <div style={{ ...TYPE.title3, ...TABULAR, color: T.text, marginTop: 4 }}>{fmtMinutes(week.week)} <span style={{ ...TYPE.body, color: T.textMut }}>sur {fmtMinutes(WEEK_GOAL_MIN)}</span></div>
            <div style={{ ...TYPE.label, ...TABULAR, color: T.textSub, marginTop: 2 }}>
              Aujourd&apos;hui {fmtMinutes(week.today)} · Série de {week.streak} jour{week.streak > 1 ? "s" : ""}
            </div>
          </div>
          <button type="button" onClick={() => setInsights(v => !v)} aria-expanded={insights}
                  style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, ...TYPE.body, color: T.textSub }}>
            Détail <ChevronRight size={14} strokeWidth={1.75} style={{ transform: insights ? "rotate(90deg)" : "none", transition: "transform 140ms var(--ease-out, ease)" }} />
          </button>
        </div>
        {insights && <WeekBars days={week.days} />}
      </section>

      <section style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 8px 10px", borderBottom: `1px solid ${HAIRLINE}` }}>
          <span style={{ ...TYPE.callout, color: T.text }}>Récents</span>
          <span style={{ ...TYPE.label, ...TABULAR, color: T.textMut }}>{store.notes.length} note{store.notes.length > 1 ? "s" : ""}</span>
        </div>
        {recent.length === 0 ? (
          <div style={{ ...TYPE.body, color: T.textMut, padding: "16px 8px" }}>
            Aucune note pour l&apos;instant. Colle une vidéo ci-dessus, ou crée un dossier dans les onglets.
          </div>
        ) : (
          <NoteRows notes={recent} folderOf={folderOf} onOpen={onOpen} />
        )}
      </section>

      {picking && (
        <TradePicker
          trades={trades}
          taken={new Set()}
          onClose={() => setPicking(false)}
          onAdd={(ids) => { setPicking(false); onFromTrades(ids); }}
        />
      )}
    </div>
  );
}


function Ring({ ratio }) {
  const r = 22, c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, ratio));
  return (
    <svg width={52} height={52} viewBox="0 0 52 52" role="img" aria-label={`${Math.round(filled * 100)} % de l'objectif hebdomadaire`} style={{ flexShrink: 0 }}>
      <circle cx={26} cy={26} r={r} fill="none" stroke={HAIRLINE} strokeWidth={4} />
      <circle cx={26} cy={26} r={r} fill="none" stroke={T.green} strokeWidth={4} strokeLinecap="round"
              strokeDasharray={`${filled * c} ${c}`} transform="rotate(-90 26 26)"
              style={{ transition: "stroke-dasharray 400ms var(--ease-out, ease)" }} />
    </svg>
  );
}

function WeekBars({ days }) {
  const max = Math.max(30, ...days.map(d => d.minutes));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, alignItems: "end" }}>
      {days.map((d, i) => {
        const label = new Date(`${d.day}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" });
        return (
          <div key={d.day} title={`${label} : ${fmtMinutes(d.minutes)}`}
               style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ height: 64, width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
              <div style={{ width: "60%", maxWidth: 24, minHeight: 2, height: `${(d.minutes / max) * 100}%`, borderRadius: 4,
                            background: i === days.length - 1 ? T.green : T.textMut, opacity: d.minutes > 0 ? 1 : 0.25 }} />
            </div>
            <span style={{ ...TYPE.caption2, color: T.textMut }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
