"use client";

/**
 * Connecter une banque — agrégation DSP2 en lecture seule.
 *
 * Portée de `app/bank/page.tsx` de l'app patrimoine, et complétée : l'original
 * ne montrait que le sélecteur de banque. Comme un consentement DSP2 expire (90
 * jours au plus, souvent moins), cette page liste aussi les connexions en cours
 * avec leur échéance — sans quoi l'agrégation devient muette un matin sans que
 * rien ne l'ait annoncé.
 *
 * Trois états distincts, à ne pas confondre :
 *   — non configuré : le déploiement n'a pas d'identifiants Enable Banking ;
 *   — configuré mais sans connexion : il n'y a plus qu'à choisir sa banque ;
 *   — connecté : les comptes remontent et alimentent la synthèse.
 */

import React from "react";
import { Check, Plus, RefreshCw, Unlink, X } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { CARD, SectionTitle } from "@/components/ui/da";
import { RoundLogo } from "@/components/ui/accountRows";
import { fmt } from "@/lib/ui/format";
import { useBankAccounts } from "@/lib/bank/useBankAccounts";
import { BankFormModal } from "@/components/modals/PatrimoineModals";

/** Jours restants avant expiration du consentement — négatif s'il est expiré. */
function daysLeft(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

function formatDate(iso) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
  } catch {
    return null;
  }
}

export default function PatrimoineBankPage({ setPage }) {
  useLang();
  const { configured, connections, accounts, error, reload } = useBankAccounts();
  /* Le choix de l'établissement et la redirection DSP2 vivent dans la modale
     (components/modals/PatrimoineModals.jsx) : la page n'a plus qu'à l'ouvrir. */
  const [addingBank, setAddingBank] = React.useState(false);
  /* Déconnexion : l'id de la CONNEXION en attente de confirmation. Elle porte
     sur la banque, pas sur le compte — d'où l'avertissement quand plusieurs
     comptes en dépendent. */
  const [confirmingId, setConfirmingId] = React.useState(null);

  const total = accounts.reduce((s, a) => s + a.balance, 0);

  /* Un compte appartient à la connexion dont la session couvre son `uid`.
     C'est ce lien qui permet de déconnecter la bonne banque depuis la carte
     d'un compte, alors que la liste des connexions n'est plus affichée. */
  const connectionOfAccount = React.useCallback(
    (account) =>
      connections.find((c) => Array.isArray(c.account_uids) && c.account_uids.includes(account.uid)) || null,
    [connections],
  );

  const disconnect = async (id) => {
    setConfirmingId(null);
    await fetch(`/api/bank/accounts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    reload();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingTop: 14, fontFamily: "var(--font-sans)" }} className="anim-1">
      <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
        {/* Le choix de la banque n'occupe plus un bloc de la page : on ne
            connecte un établissement qu'une fois, l'action vit donc en haut à
            droite et le formulaire dans la modale qu'elle ouvre. */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <SectionTitle>{t("patrimoine.bank.title")}</SectionTitle>
          </div>
          {configured && (
            <button
              type="button"
              onClick={() => setAddingBank(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36,
                padding: "0 14px", borderRadius: 999, border: "none", flexShrink: 0,
                background: T.text, color: T.textInverted, fontSize: 13, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <Plus size={14} strokeWidth={1.75} /> {t("patrimoine.bank.addBank")}
            </button>
          )}
        </div>

        {/* Déploiement sans identifiants : inutile de proposer un formulaire qui
            échouera — on dit ce qui manque. */}
        {!configured && connections.length === 0 && (
          <section style={{ ...CARD, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: T.text }}>
              {t("patrimoine.bank.notConfigured")}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: T.textSub }}>
              {t("patrimoine.bank.notConfiguredHint")}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: T.textSub }}>
              <li><code>ENABLEBANKING_APP_ID</code></li>
              <li><code>ENABLEBANKING_PRIVATE_KEY_BASE64</code></li>
              <li><code>ENABLEBANKING_COUNTRY</code> ({t("patrimoine.bank.optional")})</li>
            </ul>
          </section>
        )}

        {/* Comptes agrégés — une CARTE PAR COMPTE, portant le logo de sa banque.
            Chaque compte est une entité à part entière : la liste unique les
            faisait lire comme les lignes d'un même relevé. */}
        {accounts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SectionTitle
              size="sm"
              action={
                <button
                  type="button"
                  onClick={reload}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, minHeight: 34,
                    padding: "0 12px", borderRadius: 999, border: "none",
                    background: "transparent", color: T.textSub, fontSize: 13,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <RefreshCw size={14} strokeWidth={1.75} /> {t("patrimoine.bank.refresh")}
                </button>
              }
            >
              {t("patrimoine.bank.accounts")}
            </SectionTitle>

            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {accounts.map((a) => {
                const conn = connectionOfAccount(a);
                const left = conn ? daysLeft(conn.valid_until) : null;
                /* L'échéance ne se dit QUE quand elle approche : un consentement
                   valable trois mois n'a rien à annoncer, et l'afficher en
                   permanence ferait du bruit sur chaque carte. */
                const expired = left !== null && left <= 0;
                const expiring = left !== null && left > 0 && left <= 7;
                const confirming = conn && confirmingId === conn.id;
                // Déconnecter la banque emporte TOUS ses comptes, pas seulement celui-ci.
                const siblings = conn
                  ? accounts.filter((x) => connectionOfAccount(x)?.id === conn.id).length
                  : 1;

                return (
                  <li key={a.id} data-card style={{ ...CARD, padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
                    <RoundLogo src={a.logo} size={36} name={a.institution} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.name}
                      </span>
                      <span style={{ display: "block", fontSize: 12, color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.institution} · {t(`patrimoine.type.${a.type}`)}
                      </span>
                      {(expired || expiring) && (
                        <span style={{ display: "block", marginTop: 2, fontSize: 12, color: expired ? T.pnlNeg : T.amber }}>
                          {expired
                            ? t("patrimoine.bank.expired")
                            : t("patrimoine.bank.expiresIn")
                                .replace("{days}", String(left))
                                .replace("{date}", formatDate(conn.valid_until) || "—")}
                        </span>
                      )}
                    </span>

                    <span style={{ fontSize: 15, fontWeight: 600, color: T.text, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                      {fmt(a.balance)}
                    </span>

                    {/* Déconnexion : discrète au repos, elle ne se colore qu'au
                        survol. La confirmation est demandée SUR PLACE — l'action
                        retire la banque entière et ne s'annule pas. */}
                    {conn && (
                      confirming ? (
                        <span style={{ display: "inline-flex", gap: 2, flexShrink: 0 }}>
                          <IconButton
                            danger
                            label={
                              siblings > 1
                                ? t("patrimoine.bank.confirmDisconnectAll")
                                    .replace("{name}", conn.aspsp_name)
                                    .replace("{n}", String(siblings))
                                : t("patrimoine.bank.confirmDisconnect")
                            }
                            onClick={() => disconnect(conn.id)}
                            onBlur={() => setConfirmingId(null)}
                          >
                            <Check size={15} strokeWidth={2} />
                          </IconButton>
                          <IconButton label={t("common.cancel")} onClick={() => setConfirmingId(null)}>
                            <X size={15} strokeWidth={2} />
                          </IconButton>
                        </span>
                      ) : (
                        <IconButton
                          label={t("patrimoine.bank.disconnect").replace("{name}", conn.aspsp_name)}
                          onClick={() => setConfirmingId(conn.id)}
                        >
                          <Unlink size={15} strokeWidth={1.75} />
                        </IconButton>
                      )
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Le total reste hors carte : c'est une somme, pas un compte de plus. */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0 20px", fontSize: 14, color: T.textSub,
            }}>
              <span>{t("patrimoine.bank.total")}</span>
              <span style={{ fontWeight: 600, color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmt(total)}</span>
            </div>

            {error && (
              <div role="alert" style={{ fontSize: 13, color: T.pnlNeg }}>
                {t("patrimoine.bank.balancesError")} {error}
              </div>
            )}
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={() => setPage?.("patrimoine")}
            style={{
              minHeight: 36, padding: "0 14px", borderRadius: 999, border: "none",
              background: "transparent", color: T.textSub, fontSize: 13, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {t("patrimoine.bank.backToSummary")}
          </button>
        </div>
      </div>

      {addingBank && <BankFormModal onClose={() => setAddingBank(false)} />}
    </div>
  );
}

/**
 * Bouton icône discret de la carte d'un compte.
 *
 * Au repos il est atténué et sans fond : il ne doit pas concurrencer le solde,
 * qui est ce qu'on vient lire. Il ne prend sa couleur qu'au survol. Il reste
 * visible en permanence plutôt que révélé au survol — sur écran tactile, un
 * contrôle qui n'apparaît qu'au survol n'existe pas.
 */
function IconButton({ children, label, onClick, onBlur, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onBlur={onBlur}
      aria-label={label}
      title={label}
      style={{
        width: 32, height: 32, borderRadius: 999, border: "none", flexShrink: 0,
        background: "transparent", color: T.textMut, cursor: "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        opacity: 0.65,
        transition: "background 120ms ease, color 120ms ease, opacity 120ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = 1;
        e.currentTarget.style.background = danger ? T.redBg : T.accentBg;
        e.currentTarget.style.color = danger ? T.red : T.text;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = 0.65;
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = T.textMut;
      }}
    >
      {children}
    </button>
  );
}
