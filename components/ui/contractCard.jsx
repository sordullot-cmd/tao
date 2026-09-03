"use client";

/* ============================================================================
   Carte « contrat » d'un compte de prop firm — à DEUX VISAGES.

   Un même emplacement, sous la courbe de la page d'un compte, qui répond à la
   question du moment :

     • compte d'évaluation → ce qu'il reste à faire pour le passer financé,
       objectif par objectif ;
     • compte financé      → ce qu'on en a déjà retiré, ce qu'on peut retirer
       maintenant, et ce qui bloque quand rien n'est retirable.

   Pourquoi une carte et pas deux : un compte n'est jamais dans les deux états
   à la fois. Deux blocs auraient laissé un vide permanent sous chaque compte,
   et un vide sur une page se lit comme une donnée manquante.

   Les chiffres viennent tous des trades déjà enregistrés (lib/accountContracts)
   sauf deux, que rien ne peut deviner : le barème exact du compte et les
   retraits reçus. Les premiers ont un défaut par firme (lib/propFirmRules),
   les seconds se saisissent ici.
   ========================================================================== */

import React from "react";
import { Plus, Settings2, Trash2, Check } from "lucide-react";
import { T, HAIRLINE, FIELD_BG } from "@/lib/ui/tokens";
import { TYPE, TABULAR } from "@/lib/ui/type";
import { fmt, fmtDay } from "@/lib/ui/format";
import { CARD } from "@/components/ui/da";
import { accountAxis } from "@/lib/accountContracts";
import { PillButton, IconButton, Modal, Field, Input, CheckChip } from "@/components/ui/form";
import { getLocalDateString } from "@/lib/dateUtils";

/* ─── Le squelette commun aux deux visages ────────────────────────────────

   Les deux faces racontent la même chose dans le même ordre, et c'est ce qui
   fait qu'on n'a pas l'impression de changer de carte quand un compte passe
   financé :

     1. UN chiffre, celui sur lequel on agit — ce qui reste à faire avant,
        ce qu'on peut retirer après — et l'action à côté de lui ;
     2. une phrase qui le replace (le pourcentage, la date, ce qui bloque) ;
     3. les JAUGES, une par course en cours ;
     4. le détail, en lignes.

   Le premier jet mettait le chiffre en petit, à droite d'un libellé, et
   alignait trois lignes à pastille comme une liste à cocher. Deux d'entre
   elles ne pouvaient jamais l'être : un drawdown et une perte maximale ne
   s'atteignent pas, ils se consomment. Une case vide en face d'un budget se
   lit comme un retard, alors qu'elle dit exactement l'inverse.
   ------------------------------------------------------------------------ */

function Face({ hero, heroTone, sub, action, gauges, children }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ ...TYPE.title2, ...TABULAR, color: heroTone || T.text }}>{hero}</span>
          <span style={{ ...TYPE.body, color: T.textSub }}>{sub}</span>
        </div>
        {action}
      </div>

      {gauges?.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
          {gauges}
        </div>
      )}

      {children}
    </>
  );
}

/**
 * Une course en cours : son nom à gauche, sa barre au milieu, son compte à
 * droite. Le libellé et la valeur sont sur la MÊME ligne que la barre — empilés,
 * trois jauges prenaient la hauteur d'une demi-page pour trois informations.
 *
 * La barre se remplit DEPUIS LE BORD GAUCHE. Elle est partie un temps de la
 * valeur de départ, quelque part au milieu de la piste : le début restait gris,
 * la couleur n'apparaissait qu'ensuite, et ça se lisait comme un affichage
 * cassé plutôt que comme une échelle.
 *
 * `spent` retourne la lecture : la barre ne montre plus ce qui est acquis mais
 * ce qui est CONSOMMÉ, et sa couleur monte avec le danger. C'est la seule façon
 * de mettre un drawdown et une cible de profit sur la même grille sans que le
 * premier se lise comme un retard sur la seconde.
 *
 * `marker` pose un POINT sur la barre, à l'endroit où l'on est, avec le montant
 * juste au-dessus. Le remplissage dit « combien de chemin », le point dit « où,
 * exactement, et combien ça fait » — c'est le chiffre qu'on vient chercher.
 */
function Gauge({ label, ratio, value, spent = false, marker = null }) {
  const pct = Math.max(0, Math.min(1, Number(ratio) || 0));
  const color = spent
    ? (pct >= 1 ? T.red : pct >= 0.75 ? T.amber : T.textMut)
    : (pct >= 1 ? T.pnlPos : T.text);
  const at = marker ? Math.max(0, Math.min(1, Number(marker.ratio) || 0)) * 100 : 0;

  return (
    /* Le montant du marqueur monte DANS le rembourrage du haut : il est hors du
       flux, donc l'alignement vertical de la ligne reste celui de la barre — le
       libellé et la valeur ne se décalent pas parce qu'un chiffre est apparu. */
    <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: marker ? 20 : 0 }}>
      <span style={{ ...TYPE.body, color: T.textSub, width: 132, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, minWidth: 60, position: "relative" }}>
        {marker && (
          /* `translateX(-at%)` au lieu de -50 % : le montant reste dans la piste
             à ses deux extrémités (collé à gauche à 0 %, à droite à 100 %) au
             lieu de déborder sur le libellé ou sur la valeur. */
          <div style={{
            position: "absolute", bottom: "100%", left: `${at}%`,
            transform: `translateX(-${at}%)`, marginBottom: 6,
            whiteSpace: "nowrap", transition: "left .35s ease",
            ...TYPE.label, ...TABULAR, color: marker.tone || T.text, fontWeight: 600,
          }}>
            {marker.label}
          </div>
        )}
        <div style={{ height: 6, borderRadius: 999, background: FIELD_BG, overflow: "hidden" }}>
          {/* Largeur minimale dès qu'il y a quelque chose : à 0,4 %, un filet d'un
              demi-pixel ne se voit pas et la barre se lit comme « rien fait ». */}
          <div style={{
            width: pct > 0 ? `max(3px, ${pct * 100}%)` : 0,
            height: "100%", borderRadius: 999, background: color,
            transition: "width .35s ease",
          }} />
        </div>
        {marker && (
          <div style={{
            position: "absolute", top: "50%", left: `${at}%`,
            transform: "translate(-50%, -50%)",
            width: 12, height: 12, borderRadius: 999,
            background: marker.tone || color, border: `2px solid ${T.white}`,
            boxShadow: T.elevPill, transition: "left .35s ease",
          }} />
        )}
      </div>
      <span style={{ ...TYPE.callout, ...TABULAR, color: T.text, textAlign: "right", minWidth: 148 }}>
        {value}
      </span>
    </div>
  );
}

/**
 * Une ligne de détail.
 *
 * La pastille n'apparaît QUE pour ce qui se remplit (`done` fourni). Une marge
 * avant le plancher n'est pas une case à cocher — elle se consomme, et une case
 * vide en face d'elle se lirait comme un retard alors qu'elle dit l'inverse.
 * Sans pastille, la ligne garde le retrait des autres pour rester alignée.
 */
function Condition({ label, value, done = undefined }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
      <span style={{
        width: 16, height: 16, borderRadius: 999, flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: done === undefined ? "transparent" : done ? T.pnlPos : FIELD_BG,
        color: done ? T.onSolid : T.textMut,
        border: done === undefined ? "none" : `1px solid ${done ? T.pnlPos : T.border}`,
      }}>
        {done ? <Check size={10} strokeWidth={3} /> : null}
      </span>
      <span style={{ ...TYPE.body, color: T.textSub, flex: 1 }}>{label}</span>
      <span style={{ ...TYPE.callout, ...TABULAR, color: T.text }}>{value}</span>
    </div>
  );
}

/** Trait de séparation interne. */
const Rule = () => <div style={{ height: 1, background: HAIRLINE, margin: "16px 0 2px" }} />;

/* ─── Réglage des objectifs ───────────────────────────────────────────────── */

/** Champ de montant : vide = « suivre le barème de la firme ». */
function RuleField({ label, hint, value, fallback, onChange }) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        inputMode="decimal"
        value={value == null ? "" : String(value)}
        placeholder={String(Math.round(fallback || 0))}
        onChange={(e) => {
          const raw = e.target.value.trim();
          onChange(raw === "" ? null : Number(raw));
        }}
      />
    </Field>
  );
}

function RulesModal({ open, onClose, contract, objectives, rules, firmName, onPatch }) {
  if (!open) return null;
  const origin = objectives.source === "firm"
    ? `Barème ${firmName || "de la firme"} — modifiable ici, compte par compte.`
    : objectives.source === "custom"
      ? "Valeurs saisies pour ce compte. Vider un champ le rend au barème."
      : "Aucun barème connu pour cette firme : ces valeurs sont un défaut (6 % de cible, 5 % de drawdown). Corrige-les.";

  return (
    <Modal open onClose={onClose} title="Objectifs du compte" width={520} scrim>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ ...TYPE.body, color: T.textSub, margin: 0 }}>{origin}</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <RuleField
            label="Cible de profit" value={contract.target} fallback={rules.target}
            onChange={(v) => onPatch({ target: v })}
          />
          <RuleField
            label={objectives.trailing ? "Drawdown (suit le pic)" : "Drawdown maximal"}
            value={contract.maxDD} fallback={rules.maxDD}
            onChange={(v) => onPatch({ maxDD: v })}
          />
          <RuleField
            label="Jours de trading minimum" value={contract.minDays} fallback={rules.minDays}
            onChange={(v) => onPatch({ minDays: v })}
          />
          <RuleField
            label="Perte maximale par jour" hint="0 = pas de limite"
            value={contract.dailyLoss} fallback={rules.dailyLoss}
            onChange={(v) => onPatch({ dailyLoss: v })}
          />
        </div>

        <div style={{ height: 1, background: HAIRLINE }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <RuleField
            label="Minimum de retrait" value={contract.payoutMin} fallback={rules.payoutMin}
            onChange={(v) => onPatch({ payoutMin: v })}
          />
          <RuleField
            label="Jours tradés avant retrait" value={contract.payoutDays} fallback={rules.payoutDays}
            onChange={(v) => onPatch({ payoutDays: v })}
          />
          <RuleField
            label="Jours gagnants avant retrait"
            hint={rules.winDayMin > 0 ? `Une journée compte à partir de ${fmt(rules.winDayMin)}` : undefined}
            value={contract.payoutWinDays} fallback={rules.payoutWinDays}
            onChange={(v) => onPatch({ payoutWinDays: v })}
          />
          <Field label="Passage en financé" hint="Le compte financé repart de cette date">
            <Input
              type="date"
              value={contract.fundedAt || ""}
              onChange={(e) => onPatch({ fundedAt: e.target.value || null })}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Saisie d'un retrait ─────────────────────────────────────────────────── */

function PayoutModal({ open, onClose, suggested, onSubmit }) {
  const [date, setDate] = React.useState(() => getLocalDateString(new Date()));
  const [amount, setAmount] = React.useState(() => (suggested > 0 ? String(Math.round(suggested)) : ""));
  const [pending, setPending] = React.useState(false);
  const [note, setNote] = React.useState("");
  if (!open) return null;

  const value = Number(amount);
  const valid = date && Number.isFinite(value) && value > 0;

  return (
    <Modal
      open onClose={onClose} title="Enregistrer un retrait" width={440} scrim
      footer={
        <>
          <PillButton onClick={onClose}>Annuler</PillButton>
          <PillButton
            variant="primary" disabled={!valid}
            onClick={() => { onSubmit({ date, amount: value, pending, note: note.trim() || undefined }); onClose(); }}
          >
            Enregistrer
          </PillButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Montant">
            <Input
              type="number" inputMode="decimal" autoFocus
              value={amount} onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
        </div>
        {/* « En attente » compte quand même dans le retiré : la somme a quitté le
            compte au moment de la demande, pas au moment du virement. */}
        <CheckChip label="Versement en attente" checked={pending} onClick={() => setPending(v => !v)} />
        <Field label="Note" hint="Facultatif">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Split 90/10, frais…" />
        </Field>
      </div>
    </Modal>
  );
}

/* ─── Les deux visages ────────────────────────────────────────────────────── */

function EvalFace({ progress, objectives, axis, hasCapital, onPassFunded }) {
  const { pnl, target, pct, ddUsed, ddLeft, maxDD, daysTraded, minDays, worstDay, dailyLoss } = progress;
  const reste = Math.max(0, target - pnl);

  /* Le chiffre héros est ce qui RESTE, pas ce qui est fait : c'est celui sur
     lequel on agit demain matin. « $2 340 acquis » se contemple, « $660 à
     faire » se trade. */
  const hero = progress.breached
    ? fmt(pnl, true)
    : reste > 0 ? `${fmt(reste)} à faire` : `Cible atteinte`;
  const sub = progress.breached
    ? "Limite dépassée — l'évaluation est perdue chez la plupart des firmes."
    : reste > 0
      ? `${Math.round(pct * 100)} % de la cible de ${fmt(target)}`
      : !progress.passed && daysTraded < minDays
        ? `Il reste les jours de trading à faire`
        : `Le compte peut passer financé`;

  return (
    <Face
      hero={hero}
      heroTone={progress.breached ? T.red : progress.passed ? T.pnlPos : T.text}
      sub={sub}
      action={
        /* Une limite franchie n'est pas un retard : aucun bouton ne la rattrape,
           et en proposer un serait mentir sur l'état du compte. */
        progress.breached ? null : (
          <PillButton variant="primary" disabled={!progress.passed} onClick={onPassFunded}>
            Marquer comme financé
          </PillButton>
        )
      }
      gauges={[
        <Gauge
          key="target"
          label="Profit"
          ratio={pct}
          value={fmt(target)}
          /* Le point porte le gain du moment : c'est le chiffre qu'on vient
             lire, et le lire SUR la barre évite d'avoir à le rapporter soi-même
             à la cible. */
          marker={{
            ratio: pct,
            label: fmt(pnl, true),
            tone: pnl > 0 ? T.pnlPos : pnl < 0 ? T.pnlNeg : T.text,
          }}
        />,
        maxDD > 0 ? (
          <Gauge
            key="dd"
            label="Perte maximale"
            ratio={ddUsed / maxDD}
            /* Le nombre qu'on surveille en séance : la valeur du compte à ne
               jamais franchir (le capital moins le drawdown). Sans taille de
               compte renseignée, l'axe est en P&L pur et le nombre est négatif. */
            value={hasCapital ? fmt(axis.floor) : fmt(-maxDD)}
            spent
          />
        ) : null,
      ].filter(Boolean)}
    >
      <Rule />
      {maxDD > 0 && (
        <Condition
          label={objectives.trailing ? "Marge avant le plancher (il suit le pic)" : "Marge avant le plancher"}
          value={fmt(ddLeft)}
        />
      )}
      {minDays > 0 && (
        <Condition
          label="Jours de trading"
          value={`${daysTraded} / ${minDays}`}
          done={daysTraded >= minDays}
        />
      )}
      {dailyLoss > 0 && (
        <Condition
          label="Pire journée"
          value={`${fmt(worstDay)} / ${fmt(-dailyLoss)}`}
          done={-worstDay < dailyLoss}
        />
      )}
    </Face>
  );
}

function FundedFace({ state, payouts, onAdd, onRemove }) {
  /* Même squelette que l'évaluation : le montant sur lequel on agit, puis ce
     qui le replace. Ce qui bloque prend la place du pourcentage — c'est la
     phrase utile quand le chiffre, lui, ne bouge pas encore. */
  const hero = state.eligible ? `${fmt(state.available)} à retirer` : fmt(state.balance);
  const sub = state.eligible
    ? `${fmt(state.withdrawn)} déjà retirés · ${fmt(state.earned)} gagnés depuis le passage financé`
    : `${state.blocker} · ${fmt(state.withdrawn)} déjà retirés`;

  return (
    <Face
      hero={hero}
      heroTone={state.eligible ? T.pnlPos : T.text}
      sub={sub}
      action={<PillButton onClick={onAdd}><Plus size={14} strokeWidth={2} /> Enregistrer un retrait</PillButton>}
      gauges={[
        state.daysRequired > 0 ? (
          <Gauge
            key="days"
            label="Jours tradés"
            ratio={state.daysTraded / state.daysRequired}
            value={`${state.daysTraded} / ${state.daysRequired}`}
          />
        ) : null,
        state.winDaysRequired > 0 ? (
          <Gauge
            key="wins"
            label="Jours gagnants"
            ratio={state.winDays / state.winDaysRequired}
            value={`${state.winDays} / ${state.winDaysRequired}`}
          />
        ) : null,
        state.min > 0 ? (
          <Gauge
            key="min"
            label="Minimum de retrait"
            ratio={state.balance / state.min}
            value={`${fmt(state.balance)} / ${fmt(state.min)}`}
          />
        ) : null,
      ].filter(Boolean)}
    >
      <Rule />
      {payouts.length === 0 ? (
        <div style={{ ...TYPE.body, color: T.textMut, padding: "10px 0" }}>
          Aucun retrait enregistré.
        </div>
      ) : (
        payouts.map((p) => (
          <div key={p.id} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "8px 0",
            borderBottom: `1px solid ${HAIRLINE}`,
          }}>
            <span style={{ ...TYPE.body, color: T.textSub, minWidth: 104 }}>{fmtDay(p.date)}</span>
            <span style={{ ...TYPE.callout, ...TABULAR, color: T.text }}>{fmt(p.amount)}</span>
            <span style={{ ...TYPE.label, color: p.pending ? T.amber : T.textMut, flex: 1 }}>
              {p.pending ? "en attente" : "versé"}{p.note ? ` · ${p.note}` : ""}
            </span>
            <IconButton tone="danger" onClick={() => onRemove(p.id)} aria-label="Supprimer ce retrait">
              <Trash2 size={14} strokeWidth={1.75} />
            </IconButton>
          </div>
        ))
      )}
    </Face>
  );
}

/* ─── La carte ────────────────────────────────────────────────────────────── */

/**
 * @param {{
 *   funded: boolean,
 *   sizeLabel?: string,
 *   firmName?: string,
 *   contract: import("@/lib/accountContracts").AccountContract,
 *   objectives: import("@/lib/accountContracts").Objectives,
 *   rules: import("@/lib/propFirmRules").AccountRules,
 *   progress: import("@/lib/accountContracts").EvalProgress,
 *   capital: number | null,
 *   payout: import("@/lib/accountContracts").PayoutState,
 *   onPatch: (patch: object) => void,
 *   onAddPayout: (payout: object) => void,
 *   onRemovePayout: (id: string) => void,
 *   onPassFunded: () => void,
 * }} props
 */
export default function ContractCard({
  funded,
  sizeLabel,
  firmName,
  capital,
  contract,
  objectives,
  rules,
  progress,
  payout,
  onPatch,
  onAddPayout,
  onRemovePayout,
  onPassFunded,
}) {
  const [rulesOpen, setRulesOpen] = React.useState(false);
  const [payoutOpen, setPayoutOpen] = React.useState(false);
  const context = [sizeLabel, firmName].filter(Boolean).join(" · ");

  return (
    <div style={{ ...CARD, padding: 20 }}>
      {/* En-tête sur une ligne : le titre dit dans quel état on est, la mention
          de droite sur quel compte — le barème appliqué se lit à son nom de
          firme, ce qui évite d'ouvrir les réglages pour savoir d'où sortent les
          chiffres. */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <span style={{ ...TYPE.headline, color: T.text, flex: 1 }}>
          {funded ? "Payouts" : "Passage en financé"}
        </span>
        {context && <span style={{ ...TYPE.label, color: T.textMut }}>{context}</span>}
        <IconButton onClick={() => setRulesOpen(true)} aria-label="Régler les objectifs">
          <Settings2 size={15} strokeWidth={1.75} />
        </IconButton>
      </div>

      {funded
        ? (
          <FundedFace
            state={payout}
            payouts={contract.payouts}
            onAdd={() => setPayoutOpen(true)}
            onRemove={onRemovePayout}
          />
        )
        : (
          <EvalFace
            progress={progress}
            objectives={objectives}
            axis={accountAxis(capital, progress, objectives)}
            hasCapital={Number(capital) > 0}
            onPassFunded={onPassFunded}
          />
        )}

      <RulesModal
        open={rulesOpen} onClose={() => setRulesOpen(false)}
        contract={contract} objectives={objectives} rules={rules}
        firmName={firmName} onPatch={onPatch}
      />
      <PayoutModal
        open={payoutOpen} onClose={() => setPayoutOpen(false)}
        suggested={payout.available}
        onSubmit={onAddPayout}
      />
    </div>
  );
}
