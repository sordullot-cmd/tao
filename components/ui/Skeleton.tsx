"use client";

import React from "react";
import { T } from "@/lib/ui/tokens";
import { CARD } from "@/components/ui/da";
import { t } from "@/lib/i18n";

/**
 * Squelettes de chargement — la forme du contenu à venir, pas un sablier.
 *
 * Le balayage lui-même vit dans `app/globals.css` (`.anim-shimmer`), et non
 * dans une feuille injectée par ce fichier. Deux raisons :
 *
 * 1. La règle CSS anime un pseudo-élément en `transform`, donc composité ; la
 *    version injectée ici animait `background-position`, ce qui repeint chaque
 *    barre à chaque frame — sur une liste entière de placeholders, pendant que
 *    le fil principal termine justement de charger la page.
 * 2. `prefers-reduced-motion` est déjà traité là-bas. Un second jeu de
 *    keyframes hors de la feuille échappait à cette exclusion : les squelettes
 *    scintillaient chez les gens qui ont demandé qu'on arrête.
 *
 * Règle d'emploi : un squelette doit occuper la MÊME place que ce qu'il
 * remplace. S'il est plus court, le contenu saute à l'arrivée et on a échangé
 * une attente contre un sursaut. D'où les variantes composées plus bas, qui
 * reprennent les gabarits réels du site (carte, tuiles de statistiques,
 * tableau, graphique) au lieu de laisser chaque page réinventer trois barres.
 */

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  style?: React.CSSProperties;
  className?: string;
}

export function Skeleton({
  width = "100%",
  height = 14,
  radius = 6,
  style,
  className,
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`anim-shimmer${className ? ` ${className}` : ""}`}
      style={{ width, height, borderRadius: radius, flexShrink: 0, ...style }}
    />
  );
}

/** Pastille ronde : avatar, icône de catégorie, logo de courtier. */
export function SkeletonCircle({ size = 32, style }: { size?: number; style?: React.CSSProperties }) {
  return <Skeleton width={size} height={size} radius="50%" style={style} />;
}

/**
 * SkeletonText — bloc de plusieurs lignes (ex. 3 lignes de paragraphe).
 * La dernière ligne est plus courte : c'est ce qui le fait lire comme du texte
 * plutôt que comme un tableau.
 */
export function SkeletonText({ lines = 3, lineHeight = 14, gap = 8, lastWidth = "60%" }: {
  lines?: number;
  lineHeight?: number;
  gap?: number;
  lastWidth?: string | number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={lineHeight}
          width={i === lines - 1 ? lastWidth : "100%"}
        />
      ))}
    </div>
  );
}

/** SkeletonRows — pile de barres, gabarit d'une liste ou d'un tableau simple. */
export function SkeletonRows({ rows = 5, height = 36, gap = 6 }: {
  rows?: number;
  height?: number;
  gap?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={height} width="100%" radius={8} />
      ))}
    </div>
  );
}

/**
 * SkeletonCard — le cadre de `CARD` avec son contenu en attente. Le cadre est
 * rendu POUR DE VRAI (fond, ombre, rayon) : c'est lui qui tient la place, et
 * il n'a aucune raison de scintiller puisqu'il ne changera pas au chargement.
 */
export function SkeletonCard({
  height,
  children,
  style,
}: {
  height?: number;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ ...CARD, ...(height ? { height } : null), ...style }}>
      {children ?? <SkeletonText lines={3} />}
    </div>
  );
}

/**
 * SkeletonStats — la rangée de tuiles chiffrées en tête de la plupart des
 * pages. `minWidth` reprend la grille auto-fit du site pour se replier pareil
 * en mobile.
 */
export function SkeletonStats({ count = 4, minWidth = 160 }: { count?: number; minWidth?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`, gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ ...CARD, display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton width="55%" height={11} />
          <Skeleton width="75%" height={24} radius={8} />
        </div>
      ))}
    </div>
  );
}

/**
 * SkeletonChart — surface d'un graphique. Des colonnes de hauteurs variables
 * plutôt qu'un rectangle plein : un aplat de 260 px de haut se lit comme une
 * image cassée, la silhouette de barres se lit comme « un graphique arrive ».
 * Les hauteurs sont fixes, pas tirées au hasard — elles doivent être stables
 * d'un rendu à l'autre, sinon le squelette s'agite tout seul.
 */
const BAR_HEIGHTS = [42, 68, 55, 84, 60, 92, 48, 74, 63, 88, 52, 70];

export function SkeletonChart({ height = 240, bars = 12 }: { height?: number; bars?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height, width: "100%" }}>
      {Array.from({ length: bars }).map((_, i) => (
        <Skeleton
          key={i}
          height={`${BAR_HEIGHTS[i % BAR_HEIGHTS.length]}%`}
          radius={6}
          style={{ flex: 1, minWidth: 0 }}
        />
      ))}
    </div>
  );
}

/** Une ligne « pastille + deux libellés + montant », gabarit de toutes les
 *  listes du site (trades, transactions, fichiers, notes). */
export function SkeletonListRow({ avatar = true }: { avatar?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0" }}>
      {avatar && <SkeletonCircle size={32} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
        <Skeleton width="45%" height={13} />
        <Skeleton width="28%" height={11} />
      </div>
      <Skeleton width={64} height={13} />
    </div>
  );
}

export function SkeletonList({ rows = 6, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={i > 0 ? { borderTop: `1px solid ${T.border}` } : undefined}>
          <SkeletonListRow avatar={avatar} />
        </div>
      ))}
    </div>
  );
}

/**
 * SkeletonTable — en-tête + lignes, colonnes de largeurs inégales.
 *
 * Les largeurs sont des POIDS de `flex` et non des pourcentages : décalées
 * d'une ligne à l'autre pour ne pas dessiner un damier trop régulier, leur
 * somme dépasse parfois 100 %, et des pourcentages sur des éléments qui ne
 * rétrécissent pas déborderaient de la carte sur un écran étroit.
 */
const COL_WEIGHTS = [22, 16, 18, 14, 12, 18, 15];

export function SkeletonTable({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  const cells = (r: number, height: number) =>
    Array.from({ length: cols }).map((_, i) => (
      <Skeleton
        key={i}
        height={height}
        style={{ flex: `${COL_WEIGHTS[(i + r) % COL_WEIGHTS.length]} 1 0`, minWidth: 0 }}
      />
    ));
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 16, paddingBottom: 12, borderBottom: `1px solid ${T.border}` }}>
        {cells(0, 10)}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: "flex", gap: 16, padding: "14px 0", borderBottom: `1px solid ${T.border}` }}>
          {cells(r + 1, 13)}
        </div>
      ))}
    </div>
  );
}

/**
 * SkeletonScreen — l'enveloppe à utiliser pour un écran ENTIER en attente.
 *
 * Elle porte seule les attributs d'accessibilité : `aria-busy` sur la région,
 * et un `role="status"` invisible qui annonce le chargement une fois. Les
 * barres, elles, sont `aria-hidden` — un lecteur d'écran n'a rien à dire d'un
 * rectangle gris, et en énoncer quarante serait pire que le silence.
 */
export function SkeletonScreen({
  label,
  gap = 20,
  children,
  style,
}: {
  label?: string;
  gap?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  /* Le libellé par défaut passe par `t()` et non par une chaîne en dur : c'est
     la seule phrase de ce fichier, et elle est lue à voix haute. */
  return (
    <div
      aria-busy="true"
      style={{ display: "flex", flexDirection: "column", gap, fontFamily: "var(--font-sans)", ...style }}
    >
      <span role="status" aria-live="polite" style={SR_ONLY}>{label || t("common.loading")}</span>
      {children}
    </div>
  );
}

/* Masque le texte à l'œil sans le retirer de l'arbre d'accessibilité.
   `display:none` le supprimerait aussi pour le lecteur d'écran. */
const SR_ONLY: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/** Titre de page + éventuel sous-titre, gabarit commun à tous les écrans. */
export function SkeletonHeader({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Skeleton width={200} height={26} radius={8} />
      {subtitle && <Skeleton width={300} height={13} />}
    </div>
  );
}

/**
 * PageSkeleton — écran complet prêt à l'emploi, décliné selon le gabarit de la
 * page. C'est ce que doit appeler une page qui n'a rien de particulier à
 * montrer : quatre variantes couvrent tout le site, et une page n'a donc pas
 * à composer son squelette à la main pour ressembler à ses voisines.
 *
 * - `stats`  : tuiles chiffrées + graphique (tableau de bord, rapports)
 * - `table`  : tuiles + tableau (trades, transactions)
 * - `list`   : liste de lignes (notes, lecture, fichiers, agenda)
 * - `detail` : en-tête + deux colonnes de cartes (fiche compte, fiche actif)
 */
export function PageSkeleton({
  variant = "stats",
  label,
  stats = 4,
}: {
  variant?: "stats" | "table" | "list" | "detail";
  label?: string;
  stats?: number;
}) {
  return (
    <SkeletonScreen label={label}>
      <SkeletonHeader subtitle={variant !== "list"} />
      {variant === "stats" && (
        <>
          <SkeletonStats count={stats} />
          <SkeletonCard><SkeletonChart /></SkeletonCard>
        </>
      )}
      {variant === "table" && (
        <>
          <SkeletonStats count={stats} />
          <SkeletonCard><SkeletonTable /></SkeletonCard>
        </>
      )}
      {variant === "list" && (
        <SkeletonCard><SkeletonList /></SkeletonCard>
      )}
      {variant === "detail" && (
        <>
          <SkeletonStats count={3} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            <SkeletonCard><SkeletonText lines={4} /></SkeletonCard>
            <SkeletonCard><SkeletonList rows={4} avatar={false} /></SkeletonCard>
          </div>
        </>
      )}
    </SkeletonScreen>
  );
}
