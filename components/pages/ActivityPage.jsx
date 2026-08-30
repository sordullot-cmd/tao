"use client";

/* ============================================================================
   « Activité » — la journée mesurée.

   ── Ce que la page raconte, dans l'ordre ──────────────────────────────────
     1. LA JOURNÉE : une phrase, quatre mesures, et le bandeau des heures. Tout
        ce qu'on vient chercher en ouvrant la page tient dans cette carte.
     2. OÙ EST PASSÉ LE TEMPS : une seule zone, trois lectures au choix
        (catégories, applications, rythme). C'est le même temps regardé sous
        trois angles — pas trois blocs à empiler. À l'échelle de la SEMAINE
        affichée : dans quoi passe le temps est une habitude, et une journée
        seule ne dit que ce qu'on a fait ce jour-là.
     3. LE DÉTAIL : sessions de focus et pauses de la journée, replié par
        défaut.

   ── Pourquoi ce n'est plus dix blocs ──────────────────────────────────────
   La page alignait six tuiles de mesure, un bandeau, un anneau, un cadran, deux
   listes et un graphe d'heures, chacun dans sa carte. Onze objets de même poids
   visuel : aucun ne dit ce qu'il faut regarder en premier, et l'anneau demandait
   170 px pour comparer des angles là où une barre suffit. On a donc gardé les
   MÊMES mesures — rien n'a été retiré du calcul — en les hiérarchisant : une
   carte qu'on lit, une carte qu'on fouille, un tiroir qu'on ouvre rarement.

   ── Corriger un classement se fait ICI ────────────────────────────────────
   Chaque ligne d'application porte sa catégorie, et cette pastille se change en
   deux clics : la règle correspondante est écrite pour l'utilisateur, sur le bon
   champ (le titre pour un site, le nom pour une application). Tout l'historique
   se reclasse aussitôt (cf. `recategorize` dans lib/activity/stats).

   Les mesures viennent de lib/activity : la page ne calcule rien elle-même, elle
   ne fait que choisir ce qu'on lit et dans quel ordre.
   ========================================================================== */

import React, { useMemo, useState } from "react";
import { Activity, ArrowRight, RefreshCw } from "lucide-react";
import { AllocationChart, CARD, HAIRLINE, PeriodPills, StepperPill, PillButton } from "@/components/ui/da";
import { EmptyState } from "@/components/ui/EmptyState";
import { T } from "@/lib/ui/tokens";
import { getLocalDateString } from "@/lib/dateUtils";
import { dayStats, fmtClock, fmtDur, ranked, rangeStats } from "@/lib/activity/stats";
import { daySources, loadRange } from "@/lib/activity/engine";
import {
  categoryLabel, isBrowser, PRODUCTIVITY_COLOR, resolveProductivity, rootDomain,
} from "@/lib/activity/categories";
import { useActivityLive, useActivitySettings, useDayLog } from "@/lib/hooks/useActivityTracker";
import {
  ActivityHeader, AppRows, BlockDetail, CategoryDrilldown, CategoryRows, CrumbNote, DayColumn,
  Disclosure, HourBars, ScreenTimeBars, SessionRows, SourceNotice, StackedBar, TrackingPill,
  useChartTip,
} from "@/components/activity/ActivityChrome";

const TODAY = () => getLocalDateString();

const VIEWS = [
  { id: "cats", label: "Catégories" },
  { id: "apps", label: "Applications" },
  { id: "rhythm", label: "Rythme" },
];

function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return getLocalDateString(d);
}

/** Le lundi de la semaine d'une date. `getDay()` comptant du dimanche, lundi = 0. */
function mondayOf(date) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return getLocalDateString(d);
}

function dateLabel(date) {
  if (date === TODAY()) return "Aujourd'hui";
  if (date === shiftDate(TODAY(), -1)) return "Hier";
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long",
  });
}

export default function ActivityPage({ setPage }) {
  const [settings, setSettings] = useActivitySettings();
  const live = useActivityLive();
  const [date, setDate] = useState(() => TODAY());
  const [view, setView] = useState("cats");
  /* Filtre posé depuis la carte « non classé » : on n'envoie pas l'utilisateur
     dans une autre page pour ranger deux applications, on lui montre les
     applications concernées, ici. */
  const [onlyPending, setOnlyPending] = useState(false);
  /* Pavé ouvert dans le panneau de droite, repéré par son heure de début. Le
     découpage en pavés se refait à chaque changement de règle : on garde donc un
     instant, pas un objet — et si le pavé a fondu dans un autre, on retombe
     simplement sur le résumé. */
  const [openBlock, setOpenBlock] = useState(null);

  const day = useDayLog(date);

  const measured = useMemo(() => dayStats(day, settings), [day, settings]);

  /* Le seuil des cinq minutes est posé ICI, une fois, sur les CLASSEMENTS que la
     page donne à lire — et nulle part ailleurs. Tout ce qui en descend en
     hérite : la liste des applications, celle des catégories, l'anneau, le
     détail d'une catégorie survolée. Le poser au fil des composants revenait à
     tenir la même règle à six endroits, dont cinq finissaient par diverger.

     Ce qui n'est PAS touché, et ne doit pas l'être : les totaux (temps actif,
     ventilation par nature), la grille horaire de la journée et les colonnes du
     temps d'écran. Ces figures disent une somme ; en retirer des miettes les
     ferait mentir sur leur propre hauteur. */
  const stats = useMemo(() => ({
    ...measured,
    byCategory: ranked(measured.byCategory),
    byApp: ranked(measured.byApp),
  }), [measured]);
  const hiddenApps = measured.byApp.length - stats.byApp.length;

  const isToday = date === TODAY();
  const workGoalMs = settings.workGoalHours * 3600_000;

  const block = openBlock == null ? null : stats.blocks.find(b => b.start === openBlock) ?? null;

  /* La SEMAINE du jour affiché, du lundi au dimanche — et non les sept derniers
     jours glissants : on compare sa semaine à ses habitudes de semaine, un
     samedi doit tomber sous la colonne du samedi. Les jours à venir restent des
     colonnes vides, ce qui montre aussi ce qu'il reste de la semaine.

     Relire sept journées à chaque échantillon (toutes les 5 s) coûterait cher
     pour des colonnes qui ne bougent pas à l'œil : le mémo ne se rouvre qu'à la
     minute. */
  const minuteTick = useMemo(() => {
    const last = day.segments[day.segments.length - 1];
    return last ? Math.floor(last.e / 60_000) : 0;
  }, [day]);

  const weekStart = useMemo(() => mondayOf(date), [date]);
  const thisWeekStart = mondayOf(TODAY());

  /* Les sept journées sont lues UNE fois et agrégées UNE fois : les colonnes du
     temps d'écran (jour par jour) et la carte « où est passé le temps » (la
     semaine entière) sortent du même `rangeStats`, sinon on relit sept journaux
     deux fois par minute pour les mêmes chiffres. */
  const weekMeasured = useMemo(() => {
    void minuteTick;
    return rangeStats(loadRange(weekStart, shiftDate(weekStart, 6)), settings);
  }, [weekStart, settings, minuteTick]);
  /* Même seuil sur la semaine, pour la même raison : une application ouverte
     trois minutes lundi n'apprend rien de la semaine non plus. Les jours
     (`days`) restent entiers — ce sont eux qui dessinent les colonnes. */
  const weekAgg = useMemo(() => ({
    ...weekMeasured,
    byCategory: ranked(weekMeasured.byCategory),
    byApp: ranked(weekMeasured.byApp),
  }), [weekMeasured]);
  const hiddenWeekApps = weekMeasured.byApp.length - weekAgg.byApp.length;
  const week = weekAgg.days;

  const weekLabel = useMemo(() => {
    if (weekStart === thisWeekStart) return "Cette semaine";
    if (weekStart === shiftDate(thisWeekStart, -7)) return "Semaine dernière";
    const a = new Date(`${weekStart}T00:00:00`);
    const b = new Date(`${shiftDate(weekStart, 6)}T00:00:00`);
    const sameMonth = a.getMonth() === b.getMonth();
    const start = a.toLocaleDateString(undefined, sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
    const end = b.toLocaleDateString(undefined, { day: "numeric", month: "long" });
    return `${start} – ${end}`;
  }, [weekStart, thisWeekStart]);

  /* Changer de semaine, c'est déplacer le jour lu de sept jours : la grille du
     haut et les colonnes parlent toujours du même jour. On ne dépasse pas
     aujourd'hui — il n'y a rien à y voir. */
  const shiftWeek = (weeks) => {
    setOpenBlock(null);
    setDate(d => {
      const next = shiftDate(d, weeks * 7);
      return next > TODAY() ? TODAY() : next;
    });
  };

  /* Usage quotidien : la MÉDIANE des journées déjà écoulées de la semaine, les
     journées vides comprises — une journée sans écran est une donnée, pas un
     trou. On prend la médiane et non la moyenne : un samedi de quinze heures
     tire une moyenne vers le haut et ferait passer une semaine calme pour une
     semaine chargée ; la médiane dit la journée ORDINAIRE. */
  const weekMedianMs = useMemo(() => {
    const past = week.filter(d => d.date <= TODAY()).map(d => d.activeMs).sort((a, b) => a - b);
    if (!past.length) return 0;
    const mid = Math.floor(past.length / 2);
    return past.length % 2 ? past[mid] : Math.round((past[mid - 1] + past[mid]) / 2);
  }, [week]);

  const parts = useMemo(
    () => stats.byCategory.map(b => ({ id: b.id, label: b.label, color: b.color, pct: b.pct, amount: b.ms })),
    [stats.byCategory]
  );

  /* Parts désignées dans les figures de la SEMAINE : la barre des catégories
     commande le même détail que l'anneau de la journée, celle des natures
     restreint la liste aux catégories comptées ainsi. Chaque figure a son
     contrôleur — survol, clic qui fige, Échap et clic ailleurs qui libèrent —
     et c'est LUI que la liste lit, pour qu'elle ne puisse jamais dire autre
     chose que la barre. */
  const catBar = useChartTip();
  const natureBar = useChartTip();
  /* Ce qui est ÉPINGLÉ l'emporte sur ce qui est survolé, quelle que soit la
     figure : sans cette règle, épingler une catégorie puis promener la souris
     sur la barre des natures effacerait la sélection qu'on venait de poser. */
  const weekLead = catBar.pinned ? "cat"
    : natureBar.pinned ? "nature"
    : catBar.key ? "cat"
    : natureBar.key ? "nature" : null;
  const barCat = weekLead === "cat" ? catBar.key : null;
  const barNature = weekLead === "nature" ? natureBar.key : null;
  const natureCats = useMemo(() => {
    const want = { p: "productive", n: "neutral", d: "distracting" }[barNature];
    if (!want) return null;
    const list = weekAgg.byCategory.filter(b => resolveProductivity(b.id, settings.productivity) === want);
    // Rien de cette nature : la liste complète reste la bonne réponse, une
    // liste vide donnerait l'impression que la semaine s'est effacée.
    return list.length ? list : null;
  }, [barNature, weekAgg.byCategory, settings.productivity]);

  /* Catégorie désignée dans l'anneau : c'est elle que la liste voisine détaille.
     Vérifiée contre la journée AFFICHÉE — changer de jour pendant qu'on survole
     ne déclenche aucun `mouseleave`, et la catégorie retenue peut n'exister
     nulle part dans le nouveau jour : la liste détaillerait alors un vide sans
     qu'on comprenne pourquoi. */
  const ring = useChartTip();
  const drillCat = ring.key && stats.byCategory.some(b => b.id === ring.key) ? ring.key : null;

  /* Les postes qui ont mesuré ce jour-là. Tant qu'il n'y en a qu'un, on ne dit
     rien : nommer la machine n'apprend rien à qui n'en a qu'une. Dès qu'il y en
     a deux, il FAUT le dire — sinon la journée paraît avoir été vécue d'un seul
     endroit, et les minutes communes (rognées à la lecture) semblent perdues. */
  const sources = useMemo(() => { void day; return daySources(date); }, [date, day]);

  /* Ce qui reste à classer se compte sur la SEMAINE, comme la carte qui le
     montre : une application ouverte lundi et jamais rouverte disparaîtrait de
     la file dès mardi si on la cherchait dans la seule journée affichée. */
  const other = weekAgg.byCategory.find(b => b.id === "other");
  const pendingApps = useMemo(() => weekAgg.byApp.filter(a => a.cat === "other"), [weekAgg.byApp]);

  /**
   * Ranger une application depuis sa ligne : on écrit la règle de l'utilisateur
   * à sa place, sur le champ qui convient. Un site ne se reconnaît qu'à son
   * titre — une règle sur « chrome » classerait tout le navigateur.
   */
  const assign = (bucket, category) => {
    /* Trois champs possibles, du plus sûr au plus approximatif :
         • le DOMAINE quand on a pu le lire — il range tout le site d'un geste,
           sous-domaines comprises, et ne peut pas se tromper de cible ;
         • le TITRE pour un site dont on ne connaît que le nom deviné ;
         • le NOM DE L'APP pour tout le reste.
       Le domaine passe en premier parce qu'il est le seul à couvrir les pages
       qu'on n'a pas encore vues : sans lui, chaque nouvelle page d'un site déjà
       rangé revenait dans la file. */
    const domain = bucket.site ? rootDomain(bucket.site) : "";
    const field = domain ? "site" : (bucket.isSite ? "title" : "app");
    const match = (domain || (bucket.isSite ? bucket.label : bucket.app || bucket.label))
      .trim().toLowerCase();
    if (!match) return;
    setSettings(s => ({
      ...s,
      rules: [
        ...s.rules,
        {
          id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          match,
          field,
          category,
        },
      ],
    }));
  };

  /* Une page de navigateur sans nom de site reconnaissable ne peut pas donner
     de règle sûre : le seul texte disponible est celui du navigateur lui-même,
     et une règle dessus classerait TOUTE la navigation. Ces lignes-là se règlent
     dans « Catégories & règles », sur un fragment du titre choisi à la main.

     Le clic y était IGNORÉ en silence : on choisissait une catégorie, rien ne
     changeait, et rien ne disait pourquoi. La ligne porte maintenant « À
     régler… » et mène à l'endroit où c'est possible. */
  /* Un site dont on connaît le domaine est toujours rangeable, même si son
     titre ne dit rien : c'est le domaine qui porte la règle. */
  const canAssign = (a) => Boolean(a.site) || !(a.isSite && isBrowser(a.label));
  const blocked = (a) => (canAssign(a)
    ? null
    : "Page sans nom de site : la règle doit porter sur un mot de son titre. Ouvre « Catégories & règles » pour le choisir.");
  const onPick = (a, c) => {
    if (c == null) { setPage?.("activity-rules"); return; }
    if (canAssign(a)) assign(a, c);
  };

  const apps = onlyPending ? pendingApps : weekAgg.byApp;
  /* La meilleure heure d'une seule journée ne dit rien : c'est l'heure où on a
     travaillé ce jour-là, pas celle où on travaille. Sur sept jours cumulés,
     elle devient un trait de caractère. */
  const bestHour = weekAgg.hourly.reduce((b, h) => (h.productiveMs > b.productiveMs ? h : b), weekAgg.hourly[0]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <ActivityHeader
        page="activity"
        setPage={setPage}
        live={isToday ? live : null}
        right={
          <>
            <TrackingPill
              enabled={settings.enabled}
              onChange={(v) => setSettings(s => ({ ...s, enabled: v }))}
              hint={`Relevé toutes les ${settings.pollSeconds} s · inactivité comptée après ${Math.round(settings.afkSeconds / 60)} min sans clavier ni souris`}
            />
            <StepperPill
              label={dateLabel(date)}
              onPrev={() => { setOpenBlock(null); setDate(d => shiftDate(d, -1)); }}
              onNext={() => { setOpenBlock(null); setDate(d => shiftDate(d, 1)); }}
              nextDisabled={isToday}
              prevLabel="Jour précédent"
              nextLabel="Jour suivant"
            />
            {!isToday && (
              <PillButton compact variant="ghost" onClick={() => { setOpenBlock(null); setDate(TODAY()); }}>
                <RefreshCw size={13} /> Aujourd’hui
              </PillButton>
            )}
          </>
        }
      />

      {isToday && <SourceNotice live={live} />}

      {stats.activeMs === 0 ? (
        <div style={CARD}>
          <EmptyState
            icon={Activity}
            title="Rien de mesuré ce jour-là"
            description={
              settings.enabled
                ? "Le suivi tourne : laisse l'app ouverte, les premières minutes apparaîtront ici dans une poignée de secondes."
                : "Le suivi est en pause. Reprends-le depuis l'en-tête pour mesurer le temps passé sur ce poste."
            }
            size="lg"
          />
        </div>
      ) : (
        <>
          {/* ═══ 1 · 2 · 3 — la journée, sa répartition, ses applications ═════
              Trois cartes et non une : elles répondent à trois questions
              différentes (« à quoi a ressemblé ma journée ? », « en quoi est-ce
              passé ? », « dans quoi précisément ? »), et une seule carte les
              donnait d'un bloc sans qu'on sache où commencer. La grille garde la
              largeur — c'est le dessin qu'on vient lire ; les deux autres
              s'empilent à sa droite, à hauteur de lecture.

              Le partage se fait en `flex-grow` sur une base nulle (3 contre 2)
              et non en pourcentages : c'est le seul réglage qui donne exactement
              60/40 une fois l'espace entre les colonnes retiré. Les `minWidth`
              gardent le repli — sous ~630 px, tout passe en une colonne. */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>

            {/* ── 1. Le calendrier ── */}
            <div style={{ ...CARD, flex: "3 1 0", minWidth: 320, display: "flex", flexDirection: "column", gap: 14 }}>
              <DayColumn
                blocks={stats.blocks}
                date={date}
                selected={openBlock}
                onPickBlock={(b) => setOpenBlock(cur => (cur === b.start ? null : b.start))}
                onClear={() => setOpenBlock(null)}
              />

              {/* Les quatre chiffres de la journée, sur une seule ligne au pied
                  de la grille. Ils tenaient la rangée de grandes tuiles qui
                  était ici : à cette taille-là ils prenaient le pas sur le
                  dessin, qui est ce qu'on vient lire. Le détail chiffré vit de
                  toute façon dans les onglets Applications et Rapports. */}
              <div style={{
                display: "flex", flexWrap: "wrap", gap: "6px 18px",
                fontSize: 13, color: T.textSub,
              }}>
                <span>Temps actif <strong style={{ color: T.text, fontWeight: 600, marginLeft: 4 }}>{fmtDur(stats.activeMs)}</strong></span>
                <span>Temps de focus <strong style={{ color: T.text, fontWeight: 600, marginLeft: 4 }}>{fmtDur(stats.focusMs)}</strong> ({stats.focusSessions.length} session{stats.focusSessions.length > 1 ? "s" : ""})</span>
                <span>Distractions <strong style={{ color: T.text, fontWeight: 600, marginLeft: 4 }}>{fmtDur(stats.distractingMs)}</strong> ({Math.round(stats.activeMs ? (stats.distractingMs / stats.activeMs) * 100 : 0)} % du temps actif)</span>
                <span>Qualité <strong style={{ color: T.text, fontWeight: 600, marginLeft: 4 }}>{stats.focusScore}</strong> / 100</span>
                {/* Tant qu'un seul poste a mesuré, on ne le nomme pas : ça
                    n'apprend rien à qui n'en a qu'un. Dès qu'il y en a deux, il
                    FAUT le dire — sinon la journée paraît avoir été vécue d'un
                    seul endroit, et les minutes communes (comptées une fois
                    seulement) semblent avoir disparu. */}
                {sources.length > 1 && (
                  <span title={sources.map(x => `${x.label} · ${fmtDur(x.ms)}`).join("\n")} style={{ color: T.textMut }}>
                    Mesurée sur {sources.length} postes
                  </span>
                )}
              </div>
            </div>

            {/* ── 2 et 3, empilées à droite. Un pavé ouvert les remplace toutes
                   les deux par son détail : c'est la même question posée à une
                   autre échelle, deux réponses côte à côte obligeraient à
                   chercher laquelle répond à quoi. ── */}
            <div style={{ flex: "2 1 0", minWidth: 288, display: "flex", flexDirection: "column", gap: 14 }}>
              {block ? (
                <div style={{ ...CARD }}>
                  <BlockDetail
                    block={block}
                    activeMs={stats.activeMs}
                    onClose={() => setOpenBlock(null)}
                    onPick={onPick}
                    blocked={blocked}
                  />
                </div>
              ) : (
                <>
                  {/* ── 2. La répartition ── */}
                  <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Le titre seul, à la casse et à la couleur des en-têtes de
                        Patrimoine — sans le chiffre ni le repère qui
                        l'accompagnent là-bas : ici la figure les dit déjà, et
                        les répéter en tête revenait à lire deux fois la même
                        chose avant d'arriver au dessin. */}
                    <span style={{ fontSize: 13, color: T.textSub }}>Répartition</span>
                    {/* L'anneau et ses catégories CÔTE À CÔTE : l'un sous
                        l'autre, la liste passait sous le pli.

                        L'anneau est la LECTURE du bloc — la liste ne fait que
                        le détailler. À 136 px il se lisait comme une vignette
                        posée à gauche du vrai contenu ; à 188 il redevient ce
                        qu'on regarde en premier, et son centre porte le total
                        sans le serrer. La liste garde sa largeur minimale, donc
                        c'est la place perdue à droite qui est reprise, pas la
                        sienne. */}
                    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                      <AllocationChart
                        kind="ring"
                        parts={parts}
                        scale={100}
                        size={188}
                        thickness={23}
                        ariaLabel="Répartition du temps par catégorie"
                        centreLabel="Temps actif"
                        centreValue={stats.activeMs}
                        formatValue={(v) => fmtDur(v, { short: true })}
                        showPct={false}
                        onHover={ring.hoverKey}
                        onSelect={ring.select}
                        /* La part épinglée reste en avant quand la souris est
                           partie ; pendant un survol, l'anneau tranche seul. */
                        highlight={ring.pinned ? ring.key : null}
                      />
                      {/* Sans la ligne « 38 % · productif » sous chaque barre :
                          l'anneau dit déjà les parts, et la nature se règle dans
                          « Catégories & règles ».

                          Survoler une part de l'anneau DESCEND cette liste d'un
                          cran : les applications et les sites de la catégorie
                          désignée, à la place des catégories. La question ne
                          change pas — « dans quoi ce temps est-il passé ? » —,
                          seule l'échelle change, et c'est la figure elle-même
                          qui la commande. */}
                      <div
                        role="group"
                        /* Nommée : son contenu CHANGE sous la souris — sans nom,
                           rien ne dit de quoi la liste est le détail. */
                        aria-label="Répartition détaillée"
                        /* Cliquer DANS le détail ne libère pas la sélection :
                           c'est ce qu'on vient d'ouvrir, pas le fond. */
                        data-chart-part
                        /* Les deux listes sont SUPERPOSÉES dans une même cellule
                           de grille, celle qu'on ne lit pas restant montée mais
                           invisible. C'est ce qui fige la hauteur du bloc.

                           Sans ça, un détail plus court que la liste des
                           catégories rétrécissait la carte ; le conteneur étant
                           centré verticalement, l'anneau REMONTAIT, sortait de
                           sous le curseur, le survol se coupait — et la liste
                           reprenait sa taille, ce qui remettait l'anneau sous la
                           souris. Le bloc clignotait entre ses deux états. */
                        style={{ flex: "1 1 190px", minWidth: 176, display: "grid" }}
                      >
                        <div style={{ gridArea: "1 / 1", visibility: drillCat ? "hidden" : "visible" }}>
                          <CategoryRows buckets={stats.byCategory} limit={6} showShare={false} apps={stats.byApp} />
                        </div>
                        {drillCat && (
                          <div style={{ gridArea: "1 / 1" }}>
                            <CategoryDrilldown
                              cat={drillCat}
                              color={stats.byCategory.find(b => b.id === drillCat)?.color}
                              apps={stats.byApp}
                              rows={Math.min(6, stats.byCategory.length)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── 3. Les applications ── */}
                  <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* Même titre nu que la carte du dessus : deux cartes
                        voisines de formes différentes obligent à réapprendre à
                        lire en passant de l'une à l'autre. */}
                    <span style={{ fontSize: 13, color: T.textSub }}>Applications &amp; sites</span>
                    <AppRows apps={stats.byApp} limit={5} />
                    <CrumbNote count={hiddenApps} />
                  </div>
                </>
              )}
            </div>
          </div>

        </>
      )}

      {/* ═══ Le temps d'écran, jour par jour ═══════════════════════════════
          Une journée seule ne dit pas si elle est longue : « 6 h 12 » ne prend
          son sens qu'à côté des autres jours de la semaine. Les colonnes sont
          cliquables — c'est le chemin le plus court vers la journée qu'on vient
          de repérer.

          Cette carte est HORS du test « la journée est-elle mesurée ? » : une
          semaine se lit même quand le jour affiché est vide, et c'est justement
          là qu'on a besoin du sélecteur pour en sortir. */}
          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Pas de titre de carte : la mesure EST le titre. « Utilisation
                quotidienne » et son chiffre disent à la fois de quoi parle le
                graphe et ce qu'il faut en retenir ; la semaine lue se choisit en
                face, comme le jour se choisit en haut de page. */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 12, color: T.textSub }}>Utilisation quotidienne</span>
                <span style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.1, letterSpacing: -0.4, color: T.text, fontVariantNumeric: "tabular-nums" }}>
                  {fmtDur(weekMedianMs)}
                </span>
              </div>
              <StepperPill
                label={weekLabel}
                onPrev={() => shiftWeek(-1)}
                onNext={() => shiftWeek(1)}
                nextDisabled={weekStart === thisWeekStart}
                prevLabel="Semaine précédente"
                nextLabel="Semaine suivante"
              />
            </div>
            <ScreenTimeBars
              days={week}
              goalMs={workGoalMs}
              medianMs={weekMedianMs}
              selected={date}
              // Un jour à venir n'a rien à montrer : sa colonne reste inerte.
              onPick={(d) => { if (d <= TODAY()) { setOpenBlock(null); setDate(d); } }}
            />
            <div style={{ display: "flex", gap: 14, fontSize: 11, color: T.textSub, flexWrap: "wrap" }}>
              <span><span style={dotStyle(PRODUCTIVITY_COLOR.productive)} />productif</span>
              <span><span style={dotStyle(PRODUCTIVITY_COLOR.neutral)} />neutre</span>
              <span><span style={dotStyle(PRODUCTIVITY_COLOR.distracting)} />distraction</span>
              {workGoalMs > 0 && <span style={{ color: T.textMut }}>le pointillé fin marque l’objectif de {fmtDur(workGoalMs)}</span>}
            </div>
          </div>

      {/* ═══ 2. Où est passé le temps ════════════════════════════════════════
          Trois lectures du même temps, dans une seule carte : on choisit
          l'angle au lieu de faire défiler trois blocs.

          Ces trois lectures parlent de la SEMAINE affichée, pas du jour. Une
          journée seule ne dit pas dans quoi passe le temps : elle dit ce qu'on a
          fait ce jour-là. « 40 min de réseaux sociaux » n'est un travers qu'une
          fois répété — et une application vue vingt minutes lundi tombait sous
          le seuil des listes tous les jours de la semaine tout en pesant deux
          heures au total. La journée garde ce qui n'a de sens qu'à sa maille :
          la grille des heures, les sessions de focus et les pauses.

          Le bloc suit donc la carte du temps d'écran (même semaine, même
          sélecteur) et vit HORS du test « la journée est-elle mesurée ? » : une
          semaine se lit même depuis un dimanche vide. */}
      {weekAgg.activeMs > 0 && (
        <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <PeriodPills value={view} onChange={(v) => { setView(v); if (v !== "apps") setOnlyPending(false); }} options={VIEWS} track size={13} />
              {/* La portée est écrite à côté des onglets, pas devinée : les
                  chiffres du dessus sont ceux du jour, ceux-ci ceux de la
                  semaine, et rien d'autre ne le distingue. */}
              <span style={{ fontSize: 12, color: T.textSub }}>{weekLabel.toLowerCase()}</span>
            </div>
            <span style={{ fontSize: 12, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
              {view === "apps"
                ? `${apps.length} application${apps.length > 1 ? "s" : ""}`
                : view === "cats"
                  ? `${weekAgg.byCategory.length} catégorie${weekAgg.byCategory.length > 1 ? "s" : ""}`
                  : bestHour?.productiveMs > 0 ? `meilleure heure : ${bestHour.hour} h` : null}
            </span>
          </div>

          {view === "cats" && (
            <>
              <StackedBar parts={weekAgg.byCategory} height={14} tip={catBar} />
              {/* Les listes sont SUPERPOSÉES et de hauteur commune (cf. l'anneau
                  de la journée) : la barre de nature vit juste en dessous, et
                  une liste qui rétrécit sous la souris la ferait sauter. */}
              <div
                role="group"
                /* Nommée comme celle de l'anneau : son contenu change sous la
                   souris, rien d'autre ne dit de quoi elle est le détail. */
                aria-label="Répartition hebdomadaire détaillée"
                data-chart-part
                style={{ display: "grid" }}
              >
                <div style={{ gridArea: "1 / 1", visibility: barCat || natureCats ? "hidden" : "visible" }}>
                  <CategoryRows buckets={weekAgg.byCategory} limit={6} productivity={settings.productivity} apps={weekAgg.byApp} />
                </div>
                {barCat && (
                  <div style={{ gridArea: "1 / 1" }}>
                    <CategoryDrilldown
                      cat={barCat}
                      color={weekAgg.byCategory.find(b => b.id === barCat)?.color}
                      apps={weekAgg.byApp}
                      rows={Math.min(6, weekAgg.byCategory.length)}
                    />
                  </div>
                )}
                {/* Sous une NATURE, le cran du dessous n'est pas l'application
                    mais la catégorie : « qu'est-ce qui est compté comme
                    productif ? » est exactement la question qu'on se pose
                    devant cette barre-là, et c'est le réglage qui y répond. */}
                {!barCat && natureCats && (
                  <div style={{ gridArea: "1 / 1" }}>
                    <CategoryRows buckets={natureCats} limit={6} productivity={settings.productivity} apps={weekAgg.byApp} />
                  </div>
                )}
              </div>

              {/* La nature du temps, sous la répartition : c'est la même
                  matière regroupée en trois, et c'est elle qui décide du
                  score. Elle n'avait pas besoin d'une carte à part. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 12, borderTop: `1px solid ${HAIRLINE}` }}>
                <StackedBar
                  height={10}
                  tip={natureBar}
                  parts={[
                    { id: "p", label: "Productif", color: PRODUCTIVITY_COLOR.productive, ms: weekAgg.productiveMs, pct: weekAgg.activeMs ? (weekAgg.productiveMs / weekAgg.activeMs) * 100 : 0 },
                    { id: "n", label: "Neutre", color: PRODUCTIVITY_COLOR.neutral, ms: weekAgg.neutralMs, pct: weekAgg.activeMs ? (weekAgg.neutralMs / weekAgg.activeMs) * 100 : 0 },
                    { id: "d", label: "Distraction", color: PRODUCTIVITY_COLOR.distracting, ms: weekAgg.distractingMs, pct: weekAgg.activeMs ? (weekAgg.distractingMs / weekAgg.activeMs) * 100 : 0 },
                  ]}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 11, color: T.textSub }}>
                  <span><span style={dotStyle(PRODUCTIVITY_COLOR.productive)} />Productif {fmtDur(weekAgg.productiveMs)}</span>
                  <span><span style={dotStyle(PRODUCTIVITY_COLOR.neutral)} />Neutre {fmtDur(weekAgg.neutralMs)}</span>
                  <span><span style={dotStyle(PRODUCTIVITY_COLOR.distracting)} />Distraction {fmtDur(weekAgg.distractingMs)}</span>
                  <span style={{ color: T.textMut }}>La nature d’une catégorie se règle dans « Catégories & règles ».</span>
                </div>
              </div>

              {other && other.pct >= 5 && (
                <button
                  type="button"
                  onClick={() => { setView("apps"); setOnlyPending(true); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10,
                    border: "none", background: T.amberBg, color: T.text, fontFamily: "inherit",
                    fontSize: 12, textAlign: "left", cursor: "pointer",
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontWeight: 600 }}>{fmtDur(other.ms)} non classés</strong>{" "}
                    sur {pendingApps.length} application{pendingApps.length > 1 ? "s" : ""} — tant qu’elles ne sont pas rangées,
                    elles ne comptent ni comme travail ni comme distraction.
                  </span>
                  <ArrowRight size={14} style={{ flexShrink: 0 }} />
                </button>
              )}
            </>
          )}

          {view === "apps" && (
            <>
              {pendingApps.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <PillButton
                    compact
                    variant={onlyPending ? "primary" : "ghost"}
                    onClick={() => setOnlyPending(v => !v)}
                  >
                    {onlyPending ? "Tout afficher" : `${pendingApps.length} à classer`}
                  </PillButton>
                  <span style={{ fontSize: 11, color: T.textSub }}>
                    Change la pastille d’une ligne : la règle est écrite pour toi et tout l’historique se reclasse.
                  </span>
                </div>
              )}
              <AppRows
                apps={apps}
                blocked={blocked}
                limit={onlyPending ? 20 : 10}
                onPick={onPick}
                empty="Tout est classé sur cette semaine."
              />
              <CrumbNote count={onlyPending ? 0 : hiddenWeekApps} />
            </>
          )}

          {view === "rhythm" && (
            <>
              <HourBars hourly={weekAgg.hourly} height={120} />
              <div style={{ display: "flex", gap: 14, fontSize: 11, color: T.textSub, flexWrap: "wrap" }}>
                <span><span style={dotStyle(PRODUCTIVITY_COLOR.productive)} />productif</span>
                <span><span style={dotStyle(PRODUCTIVITY_COLOR.neutral)} />neutre</span>
                <span><span style={dotStyle(PRODUCTIVITY_COLOR.distracting)} />distraction</span>
                <span style={{ color: T.textMut }}>
                  Les sept jours sont cumulés heure par heure — une barre haute est une habitude, pas une journée.
                  Un segment à cheval sur deux heures est réparti au prorata : une session de 11 h 50 à 12 h 40
                  ne se lit pas entièrement à 11 h.
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ 3. Le détail ══════════════════════════════════════════════════
          Le tiroir reste au JOUR : une session de focus a une heure de début et
          une durée, elle ne s'additionne pas d'un jour sur l'autre. */}
      {stats.activeMs > 0 && (
        <Disclosure
          title="Sessions de focus et pauses"
          right={`${stats.focusSessions.length} session${stats.focusSessions.length > 1 ? "s" : ""} · ${stats.breaks.length} pause${stats.breaks.length > 1 ? "s" : ""}`}
        >
          <SessionRows sessions={stats.focusSessions} />
          {stats.breaks.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 2 }}>Pauses</div>
              {stats.breaks.map(b => (
                <div key={b.start} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.textSub, padding: "4px 0" }}>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtClock(b.start)} – {fmtClock(b.end)}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtDur(b.ms)}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: T.textSub, lineHeight: 1.5 }}>
            Une session de focus est une plage productive d’au moins {settings.focusMinMinutes} min, qu’une
            interruption de moins de {settings.focusGapMinutes} min ne casse pas. Le score pèse la part du temps
            passée en session et la stabilité (bascules d’app par heure) : une journée hachée le fait tomber même
            quand le total est bon.
            {stats.focusSessions.length > 0 && ` Catégorie dominante de la plus longue : ${categoryLabel(stats.focusSessions.reduce((b, s) => (s.ms > b.ms ? s : b), stats.focusSessions[0]).cat)}.`}
          </div>
        </Disclosure>
      )}
    </div>
  );
}

/** Pastille de légende — la même dans les trois listes de la page. */
function dotStyle(color) {
  return {
    display: "inline-block", width: 8, height: 8, borderRadius: 2,
    background: color, marginRight: 6, verticalAlign: "middle",
  };
}
