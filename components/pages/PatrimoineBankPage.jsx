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
import { Check, Loader2, Plus, RefreshCw, Star, Unlink, X } from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { CARD, SectionTitle } from "@/components/ui/da";
import { RoundLogo } from "@/components/ui/accountRows";
import { fmt } from "@/lib/ui/format";
import { bankLogo, bankMatchKey } from "@/lib/bank/bankLogos";
import { useBankAccounts } from "@/lib/bank/useBankAccounts";
import { useFavoriteBanks } from "@/lib/bank/useFavoriteBanks";
import { startBankConnection } from "@/lib/bank/startConnection";
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
  /* Favoris : les banques qu'on reconnecte régulièrement (un consentement DSP2
     expire). Ils s'offrent ici en connexion directe, sans passer par le
     sélecteur de quelques centaines d'établissements. */
  const { favorites, toggle: toggleFavorite } = useFavoriteBanks();
  const [connectingFav, setConnectingFav] = React.useState(null);
  const [favError, setFavError] = React.useState(null);

  const connectFavorite = async (fav) => {
    setFavError(null);
    setConnectingFav(fav.id);
    try {
      // Ne rend la main qu'en cas d'échec : sinon la page part chez la banque.
      await startBankConnection(fav.id);
    } catch (err) {
      setConnectingFav(null);
      setFavError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  };

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

        {/* Banques favorites — connexion en un geste. Elles sont AU-DESSUS des
            comptes agrégés : c'est une action de départ, pas une donnée à lire.
            Rien ne s'affiche sans favori : une section vide n'apprendrait rien,
            l'étoile se découvre dans le sélecteur. */}
        {configured && favorites.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SectionTitle size="sm">{t("patrimoine.bank.favorites")}</SectionTitle>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {favorites.map((fav) => (
                <FavoriteBankChip
                  key={fav.id}
                  fav={fav}
                  connecting={connectingFav === fav.id}
                  busy={connectingFav !== null}
                  /* Comparaison sur la clé du nom, pas sur l'égalité stricte :
                     le favori a pu être mémorisé sous une graphie voisine de
                     celle que la connexion a enregistrée. */
                  connected={connections.some((c) => bankMatchKey(c.aspsp_name) === bankMatchKey(fav.id))}
                  onConnect={() => connectFavorite(fav)}
                  onRemove={() => toggleFavorite(fav)}
                />
              ))}
            </div>
            {favError && (
              <div role="alert" style={{ fontSize: 13, color: T.pnlNeg }}>{favError}</div>
            )}
          </div>
        )}

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
                    <RoundLogo src={bankLogo(a.institution, a.logo)} size={36} name={a.institution} />
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
 * Raccourci vers une banque favorite : la connecter (ou renouveler son
 * consentement) en un geste.
 *
 * Les deux actions sont des boutons FRÈRES dans une pastille, jamais imbriqués :
 * le `scale` d'appui de globals.css rétrécit le bouton parent sous le curseur et
 * le relâchement tombe alors à côté de l'enfant — le retrait du favori ne
 * répondrait qu'aux extrémités de l'étoile.
 */
function FavoriteBankChip({ fav, connecting, busy, connected, onConnect, onRemove }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 2,
        border: `1px solid ${T.border}`, borderRadius: 999,
        padding: "3px 6px 3px 4px", background: T.white,
      }}
    >
      <button
        type="button"
        onClick={onConnect}
        // Pendant une redirection, tout le reste doit se taire : la page part.
        disabled={busy}
        title={t("patrimoine.bank.connectFav").replace("{name}", fav.name)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8, minHeight: 30,
          padding: "0 6px", border: "none", borderRadius: 999,
          background: "transparent", color: T.text, fontSize: 13, fontWeight: 500,
          cursor: busy ? "default" : "pointer", fontFamily: "inherit",
          opacity: busy && !connecting ? 0.5 : 1,
        }}
      >
        {connecting
          ? <Loader2 size={20} strokeWidth={1.75} className="anim-spin" />
          : <RoundLogo src={bankLogo(fav.name, fav.logo)} size={20} name={fav.name} />}
        <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {fav.name}
        </span>
        {/* Déjà connectée : le geste reste offert (un consentement se renouvelle),
            mais il ne doit pas se faire à l'aveugle — sans ce repère, un clic de
            plus ajoute une seconde connexion à la même banque. */}
        {connected && !connecting && (
          <span style={{ fontSize: 11, color: T.textMut }}>{t("patrimoine.bank.favConnected")}</span>
        )}
      </button>

      <button
        type="button"
        data-no-press
        onClick={onRemove}
        aria-label={t("patrimoine.bank.removeFav")}
        title={t("patrimoine.bank.removeFav")}
        style={{
          width: 24, height: 24, borderRadius: 999, border: "none", flexShrink: 0,
          background: "transparent", cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          transition: "background 120ms ease",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <Star size={13} strokeWidth={1.75} color={T.amber} fill={T.amber} />
      </button>
    </span>
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
