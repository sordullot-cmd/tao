"use client";

import React from "react";
import { T } from "@/lib/ui/tokens";
import { CARD } from "@/components/ui/da";
import { t } from "@/lib/i18n";

/* Réexporté ici pour que les pages n'aient qu'un import à faire : le drapeau
   lui-même vit dans une feuille sans dépendance (cf. le fichier). */
export { showSkeleton } from "@/lib/ui/skeletonPreview";

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
export function SkeletonStats({
  count = 4,
  minWidth = 160,
  flat = false,
}: { count?: number; minWidth?: number; flat?: boolean }) {
  const cell = (i: number) => (
    <div
      key={i}
      style={flat
        ? { background: T.white, padding: 16, display: "flex", flexDirection: "column", gap: 10 }
        : { ...CARD, display: "flex", flexDirection: "column", gap: 10 }}
    >
      <Skeleton width="55%" height={11} />
      <Skeleton width="75%" height={24} radius={8} />
    </div>
  );
  /* `flat` : la variante « bandeau », où les tuiles sont collées dans un seul
     cadre et séparées par un filet obtenu au `gap` de 1 px sur fond bordure
     (page Minuteur). Quatre cartes détachées à sa place décaleraient tout ce
     qui suit de la hauteur de leurs ombres. */
  if (flat) {
    return (
      <div style={{
        display: "grid", gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`, gap: 1,
        background: T.border, border: `1px solid ${T.border}`,
        borderRadius: "var(--radius-card)", overflow: "hidden",
      }}>
        {Array.from({ length: count }).map((_, i) => cell(i))}
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`, gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => cell(i))}
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

/**
 * SkeletonPill — un contrôle de la rangée de commandes.
 *
 * 34 px, rayon 999 : la hauteur unique de tous les boutons et pastilles du site
 * (`PillButton`, `StepperPill`, `PeriodPills`). Un squelette qui pose un
 * rectangle de 26 px à leur place fait sauter la ligne entière à l'arrivée.
 */
export function SkeletonPill({ width = 120, height = 34 }: { width?: number | string; height?: number }) {
  return <Skeleton width={width} height={height} radius={999} />;
}

/** Groupe d'onglets `PeriodPills` : même gouttière de 4 px que la vraie brique. */
export function SkeletonPills({ widths = [72, 72, 72] }: { widths?: number[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {widths.map((w, i) => <SkeletonPill key={i} width={w} />)}
    </div>
  );
}

/**
 * SkeletonToolbar — la rangée de tête, celle que TOUTES les pages du site
 * portent à la place d'un titre.
 *
 * C'est le point où les premiers squelettes se trompaient : ils dessinaient un
 * titre de 26 px suivi d'un sous-titre, alors qu'aucune page n'en a — la barre
 * latérale dit déjà où l'on est. Ce que la page pose en tête, ce sont des
 * commandes de 34 px, le plus souvent poussées à droite.
 */
export function SkeletonToolbar({
  left = [],
  right = [],
  gap = 12,
}: {
  left?: number[];
  right?: number[];
  gap?: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap, flexWrap: "wrap" }}>
      {left.map((w, i) => <SkeletonPill key={`l${i}`} width={w} />)}
      {right.length > 0 && (
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {right.map((w, i) => <SkeletonPill key={`r${i}`} width={w} />)}
        </div>
      )}
    </div>
  );
}

/**
 * SkeletonHero — le bloc « libellé + grand nombre » des pages qui en portent un
 * (Calendrier, Objectifs de l'année, Éloquence). `size` est la taille du
 * chiffre : sa boîte fait environ 0,775 fois cette valeur, comme `HeroAmount`.
 */
export function SkeletonHero({
  label = 132,
  value = 216,
  size = 40,
}: { label?: number; value?: number; size?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <Skeleton width={label} height={18} />
      <Skeleton width={value} height={Math.round(size * 0.775)} radius={8} />
    </div>
  );
}

/** Titre de SECTION (`SectionTitle`, 24 px) et son éventuel chapô. */
export function SkeletonSectionTitle({ subtitle = false }: { subtitle?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Skeleton width={220} height={26} radius={8} />
      {subtitle && <Skeleton width="min(620px, 90%)" height={18} />}
    </div>
  );
}

/**
 * SkeletonBackLink — le lien de remontée en tête des pages de détail.
 * Cible de 32 px, ramenée dans la gouttière par la même marge négative que
 * `BackLink` : sans elle, tout ce qui suit descend de sept pixels à l'arrivée.
 */
export function SkeletonBackLink() {
  return (
    <div style={{ display: "flex", alignItems: "center", minWidth: 0, margin: "-7px -8px" }}>
      <Skeleton width={104} height={32} radius={999} />
    </div>
  );
}

/**
 * PageSkeleton — écran complet prêt à l'emploi, pour une page dont le gabarit
 * est l'un des quatre du site. Une page à l'ossature particulière (le
 * calendrier et sa grille de sept colonnes, les notes et leurs deux colonnes)
 * compose le sien : le but est de tenir la MÊME place, pas d'être générique.
 *
 * - `stats` : commandes + tuiles chiffrées + graphique
 * - `table` : commandes + tableau
 * - `list`   : commandes + liste de lignes
 * - `grid`   : commandes + grille de cartes
 * - `detail` : lien de retour + montant héros + cartes (fiche compte, actif…)
 */
export function PageSkeleton({
  variant = "stats",
  label,
  stats = 4,
  gap = 16,
  toolbarLeft,
  toolbarRight = [148],
}: {
  variant?: "stats" | "table" | "list" | "grid" | "detail";
  label?: string;
  stats?: number;
  gap?: number;
  toolbarLeft?: number[];
  toolbarRight?: number[];
}) {
  return (
    <SkeletonScreen label={label} gap={gap}>
      {variant === "detail"
        ? <SkeletonBackLink />
        : <SkeletonToolbar left={toolbarLeft} right={toolbarRight} />}
      {variant === "stats" && (
        <>
          <SkeletonStats count={stats} />
          <SkeletonCard><SkeletonChart /></SkeletonCard>
        </>
      )}
      {variant === "detail" && (
        <>
          <SkeletonHero label={112} value={188} size={32} />
          <SkeletonStats count={stats} />
          <SkeletonCard><SkeletonList rows={5} /></SkeletonCard>
        </>
      )}
      {variant === "table" && <SkeletonCard><SkeletonTable /></SkeletonCard>}
      {variant === "list" && <SkeletonCard><SkeletonList /></SkeletonCard>}
      {variant === "grid" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))", gap: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Skeleton width="65%" height={16} />
                <SkeletonText lines={2} lineHeight={12} />
                <Skeleton height={6} radius={999} />
              </div>
            </SkeletonCard>
          ))}
        </div>
      )}
    </SkeletonScreen>
  );
}
