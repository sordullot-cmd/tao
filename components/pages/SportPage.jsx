"use client";

import React, { useState, useMemo, useEffect } from "react";
import ReactDOM from "react-dom";
import Popover from "@/components/ui/Popover";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useFirstLoad } from "@/lib/hooks/useFirstLoad";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { backdropDismiss } from "@/lib/hooks/useBackdropDismiss";
import {
  Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronUp, ChevronRight, ChevronLeft,
  Calendar, Clock,
  Dumbbell, BicepsFlexed, Bike, Footprints, Heart,
  Star, EyeOff, Save, BookOpen, GripVertical, Camera, ImagePlus,
} from "lucide-react";
import { t, useLang } from "@/lib/i18n";
import {
  CARD, SectionTitle, HAIRLINE, FIELD_BG, WRITING_BG, FieldLabel, StatRow, PeriodPills,
} from "@/components/ui/da";
import { T as BaseT } from "@/lib/ui/tokens";
import { dotRing } from "@/lib/ui/color";
import { PALETTE } from "@/lib/ui/palette";
import { FIELD_BG as DA_FIELD_BG } from "@/lib/ui/tokens";

/* ---------------------------------------------------------------------------
   Page « Sport » — portée dans la direction artistique des pages récentes
   (tableau de bord, comptes, journal, panneau « Trade info »).

   Ce qui change par rapport à la version précédente :
     • les cartes viennent de `CARD` (blanc, coins 12, ombre très douce, PAS de
       bordure) au lieu du cadre gris 1 px qui entourait chaque bloc ;
     • les titres de section passent par le `SectionTitle` partagé (18 px) et
       non plus par une copie locale à 13 px, qui ne se distinguait pas du
       contenu qu'elle annonçait ;
     • les libellés se lisent à 12 px atténué et leurs valeurs à 13 px en 600 :
       plus de capitales espacées à 10,5 px ;
     • les aplats (champs, pistes, survols) s'expriment en transparence d'encre
       (`FIELD_BG`, `WRITING_BG`) et suivent donc le thème sombre tout seuls.

   Règle du projet : aucune couleur en dur, tout passe par les tokens `T` — sauf
   les couleurs d'IDENTITÉ (disciplines, catégories d'exercice), qui sont des
   données et restent des hex.
   ------------------------------------------------------------------------- */

// Tokens partagés (câblés sur les CSS vars, dark-mode aware). `bg` est redéfini
// en surface subtile interne (les sous-cartes/hover) car BaseT.bg vaut la couleur
// de page (blanc en clair) — on garde le rendu d'origine tout en suivant le thème.
const T = { ...BaseT, bg: "var(--color-bg-subtle, #F1F2F4)" };

/* ─── Constantes ──────────────────────────────────────────────────── */

const DISCIPLINES = [
  { id: "musculation",  label: "Musculation",  Icon: Dumbbell,      color: PALETTE.orange },
  { id: "calisthenics", label: "Callisthénie", Icon: BicepsFlexed,  color: PALETTE.blue },
  { id: "cardio",       label: "Cardio",       Icon: Bike,       color: PALETTE.green },
];

const CATEGORIES = [
  { id: "push",      label: "Push",      color: PALETTE.red },
  { id: "pull",      label: "Pull",      color: PALETTE.blue },
  { id: "legs",      label: "Legs",      color: PALETTE.green },
  { id: "core",      label: "Core",      color: PALETTE.yellow },
  { id: "full_body", label: "Full body", color: PALETTE.purple },
  { id: "cardio",    label: "Cardio",    color: PALETTE.brown },
];

/* Bibliothèque d'exercices populaires avec catégorie par défaut. */
const EXERCISE_LIBRARY = [
  // Push
  { name: "Développé couché",           category: "push" },
  { name: "Développé incliné",          category: "push" },
  { name: "Développé décliné",          category: "push" },
  { name: "Développé militaire",        category: "push" },
  { name: "Développé haltères",         category: "push" },
  { name: "Développé Arnold",           category: "push" },
  { name: "Élévations latérales",       category: "push" },
  { name: "Élévations frontales",       category: "push" },
  { name: "Oiseau (rear delt)",         category: "push" },
  { name: "Dips",                       category: "push" },
  { name: "Pompes",                     category: "push" },
  { name: "Pompes diamant",             category: "push" },
  { name: "Pompes inclinées",           category: "push" },
  { name: "Écarté couché (haltères)",   category: "push" },
  { name: "Écarté à la poulie",         category: "push" },
  { name: "Extensions triceps poulie",  category: "push" },
  { name: "Triceps barre EZ",           category: "push" },
  { name: "Triceps haltère nuque",      category: "push" },
  { name: "Pull-over",                  category: "push" },
  // Pull
  { name: "Tractions",                  category: "pull" },
  { name: "Tractions pronation",        category: "pull" },
  { name: "Tractions supination",       category: "pull" },
  { name: "Tractions neutres",          category: "pull" },
  { name: "Australian pull-up",         category: "pull" },
  { name: "Rowing barre",               category: "pull" },
  { name: "Rowing T-bar",               category: "pull" },
  { name: "Rowing haltère",             category: "pull" },
  { name: "Tirage horizontal poulie",   category: "pull" },
  { name: "Tirage vertical poulie",     category: "pull" },
  { name: "Face pull",                  category: "pull" },
  { name: "Soulevé de terre",           category: "pull" },
  { name: "Soulevé de terre roumain",   category: "pull" },
  { name: "Shrugs (haussements)",       category: "pull" },
  { name: "Curl barre",                 category: "pull" },
  { name: "Curl haltères",              category: "pull" },
  { name: "Curl marteau",               category: "pull" },
  { name: "Curl pupitre",               category: "pull" },
  { name: "Curl à la poulie",           category: "pull" },
  // Legs
  { name: "Squat",                      category: "legs" },
  { name: "Squat avant (front squat)",  category: "legs" },
  { name: "Squat bulgare",              category: "legs" },
  { name: "Hack squat",                 category: "legs" },
  { name: "Presse à cuisses",           category: "legs" },
  { name: "Fentes",                     category: "legs" },
  { name: "Fentes marchées",            category: "legs" },
  { name: "Leg extension",              category: "legs" },
  { name: "Leg curl",                   category: "legs" },
  { name: "Soulevé de terre jambes tendues", category: "legs" },
  { name: "Hip thrust",                 category: "legs" },
  { name: "Good morning",               category: "legs" },
  { name: "Mollets debout",             category: "legs" },
  { name: "Mollets assis",              category: "legs" },
  { name: "Step-up",                    category: "legs" },
  { name: "Box jumps",                  category: "legs" },
  // Core
  { name: "Crunchs",                    category: "core" },
  { name: "Sit-ups",                    category: "core" },
  { name: "Relevé de jambes",           category: "core" },
  { name: "Relevé de jambes suspendu",  category: "core" },
  { name: "Planche",                    category: "core" },
  { name: "Planche latérale",           category: "core" },
  { name: "Russian twist",              category: "core" },
  { name: "Mountain climbers",          category: "core" },
  { name: "Hollow body hold",           category: "core" },
  { name: "Roue abdominale",            category: "core" },
  { name: "L-sit",                      category: "core" },
  { name: "Dragon flag",                category: "core" },
  // Full body / functional
  { name: "Burpees",                    category: "full_body" },
  { name: "Clean & jerk",               category: "full_body" },
  { name: "Snatch",                     category: "full_body" },
  { name: "Thruster",                   category: "full_body" },
  { name: "Kettlebell swing",           category: "full_body" },
  { name: "Turkish get-up",             category: "full_body" },
  { name: "Farmer walk",                category: "full_body" },
  { name: "Muscle-up",                  category: "full_body" },
  { name: "Pistol squat",               category: "legs" },
  { name: "Handstand push-up",          category: "push" },
  // Calisthénie / street workout
  { name: "Front lever",                category: "pull" },
  { name: "Front lever raises",         category: "pull" },
  { name: "Back lever",                 category: "pull" },
  { name: "Planche",                    category: "push" },
  { name: "Tuck planche",               category: "push" },
  { name: "Straddle planche",           category: "push" },
  { name: "Pseudo planche push-up",     category: "push" },
  { name: "Planche lean",               category: "push" },
  { name: "Handstand",                  category: "push" },
  { name: "Hand-to-hand",               category: "push" },
  { name: "Archer pull-up",             category: "pull" },
  { name: "Archer push-up",             category: "push" },
  { name: "One arm pull-up",            category: "pull" },
  { name: "One arm push-up",            category: "push" },
  { name: "Typewriter pull-up",         category: "pull" },
  { name: "Wide pull-up",               category: "pull" },
  { name: "Commando pull-up",           category: "pull" },
  { name: "Korean dips",                category: "push" },
  { name: "Ring dips",                  category: "push" },
  { name: "Ring muscle-up",             category: "full_body" },
  { name: "Bar muscle-up",              category: "full_body" },
  { name: "Skin the cat",               category: "full_body" },
  { name: "German hang",                category: "pull" },
  { name: "Tuck front lever",           category: "pull" },
  { name: "Pike push-up",               category: "push" },
  { name: "Hindu push-up",              category: "push" },
  { name: "Spiderman push-up",          category: "push" },
  { name: "Clap push-up",               category: "push" },
  { name: "Explosive pull-up",          category: "pull" },
  { name: "Pull-up négatif",            category: "pull" },
  { name: "Squat sauté",                category: "legs" },
  { name: "Sissy squat",                category: "legs" },
  { name: "Nordic curl",                category: "legs" },
  { name: "Shrimp squat",               category: "legs" },
  // Cardio
  { name: "Course à pied",              category: "cardio" },
  { name: "Sprint",                     category: "cardio" },
  { name: "Vélo",                       category: "cardio" },
  { name: "Vélo elliptique",            category: "cardio" },
  { name: "Rameur",                     category: "cardio" },
  { name: "Corde à sauter",             category: "cardio" },
  { name: "Natation",                   category: "cardio" },
  { name: "Marche rapide",              category: "cardio" },
  { name: "Stairmaster",                category: "cardio" },
  { name: "HIIT",                       category: "cardio" },
];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* Vitesse moyenne en km/h à partir d'une distance (km) et d'un temps (min). */
const computeSpeed = (distance, time) => {
  const d = parseFloat(distance);
  const t = parseFloat(time);
  if (!d || !t || t <= 0) return null;
  return Math.round((d / (t / 60)) * 10) / 10;
};

/* ─── Métriques de progression ────────────────────────────────────────
   Trois façons de mesurer un exercice, dans l'ordre de préférence quand
   plusieurs sont disponibles : la vitesse pour le cardio, la charge dès qu'on
   lest, les répétitions au poids du corps (tractions, pompes, dips…) où il n'y
   a justement pas de charge à saisir. */
const METRIC_ORDER = ["speed", "weight", "reps"];
const METRIC_UNIT = { speed: "km/h", weight: "kg", reps: "reps" };
const METRIC_LABEL = { speed: "km/h", weight: "kg", reps: "Reps" };

/** Valeur d'une métrique en affichage : les répétitions et les charges sont des
 *  entiers, la vitesse garde sa décimale (virgule française). */
const fmtMetricValue = (v, metric) =>
  metric === "speed" ? (Math.round(v * 10) / 10).toFixed(1).replace(".", ",") : Math.round(v);

/** Première métrique de `METRIC_ORDER` présente dans `available`, restreinte
 *  aux `allowed` quand la liste est fournie (les records ignorent la vitesse). */
function pickMetric(available, allowed = METRIC_ORDER) {
  if (!available) return null;
  return METRIC_ORDER.find(m => allowed.includes(m) && available.has(m)) ?? null;
}

/* ─── Page ────────────────────────────────────────────────────────── */

export default function SportPage() {
  useLang();
  const [sessions, setSessions, sessionsReady] = useCloudState("tr4de_sport_sessions", "sport_sessions", []);
  // Bibliothèque personnalisable :
  // - customExercises : exercices ajoutés par l'utilisateur ({ name, category })
  // - hiddenExercises : noms (de la lib intégrée OU custom) que l'utilisateur a masqués
  // - favoriteExercises : noms en favoris (affichés en haut)
  const [customExercises, setCustomExercises] = useCloudState("tr4de_sport_custom_exercises", "sport_custom_exercises", []);
  const [hiddenExercises, setHiddenExercises] = useCloudState("tr4de_sport_hidden_exercises", "sport_hidden_exercises", []);
  const [favoriteExercises, setFavoriteExercises] = useCloudState("tr4de_sport_favorite_exercises", "sport_favorite_exercises", []);
  const [customPresets, setCustomPresets] = useCloudState("tr4de_sport_custom_presets", "sport_custom_presets", []);
  // Photos de progression physique ({ id, date, dataUrl, weight?, note? }).
  const [progressPhotos, setProgressPhotos] = useCloudState("tr4de_sport_progress_photos", "sport_progress_photos", []);

  const [tab, setTab] = useState("workout"); // "workout" | "photos"
  const [filterDiscipline, setFilterDiscipline] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  /* Ajout de photos — l'input et son état vivent ICI, pas dans `PhotosTab`.
     Le bouton d'ajout est posé dans la ligne de tête, à côté des onglets, à la
     place qu'occupe « Nouvelle séance » sur l'autre onglet : les deux onglets
     ont donc leur action principale au même pixel. `PhotosTab` garde le droit
     de la déclencher (sa grande carte d'état vide), d'où `onAdd` en prop. */
  const photoInputRef = React.useRef(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const pickPhotos = () => photoInputRef.current?.click();
  const onPickPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setPhotoBusy(true);
    try {
      const added = [];
      for (const f of files) {
        if (!f.type.startsWith("image/")) continue;
        try {
          const dataUrl = await compressImage(f);
          added.push({ id: Date.now() + Math.floor(Math.random() * 1e6), date: todayISO(), dataUrl, weight: "", note: "" });
        } catch { /* ignore l'image en échec */ }
      }
      if (added.length) setProgressPhotos(prev => [...added, ...(prev || [])]);
    } finally {
      setPhotoBusy(false);
    }
  };

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const emptyForm = () => ({
    date: todayISO(),
    discipline: "musculation",
    duration: "",
    notes: "",
    exercises: [{
      id: Date.now(), name: "", category: "push",
      sets: [{ id: Date.now() + 1, reps: "", weight: "" }],
    }],
  });
  const [form, setForm] = useState(emptyForm());
  const [chartExerciseName, setChartExerciseName] = useState("");
  // Métrique choisie à la main dans le graphique (null = celle de l'exercice).
  const [chartMetricChoice, setChartMetricChoice] = useState(null);

  const openCreate = () => { setForm(emptyForm()); setEditingId(null); setShowForm(true); };
  const openEdit = (s) => { setForm({ ...s }); setEditingId(s.id); setShowForm(true); };
  const close = () => { setShowForm(false); setEditingId(null); };
  const buildData = (f) => ({
    date: f.date,
    discipline: f.discipline,
    duration: parseFloat(f.duration) || 0,
    notes: (f.notes || "").trim(),
    exercises: (f.exercises || [])
      .filter(e => (e.name || "").trim())
      .map(e => ({
        id: e.id,
        name: e.name.trim(),
        category: e.category || "full_body",
        sets: (e.sets || []).filter(set => set.reps !== "" || set.weight !== "" || set.distance !== "" || set.time !== "")
          .map(set => {
            const distance = parseFloat(set.distance) || null;
            const time = parseFloat(set.time) || null;
            return {
              id: set.id,
              reps: parseFloat(set.reps) || null,
              weight: parseFloat(set.weight) || null,
              distance,
              time,
              speed: computeSpeed(distance, time),
            };
          }),
      })),
  });
  const save = () => {
    if (!form.date) return;
    const data = buildData(form);
    if (editingId) {
      setSessions(prev => (prev || []).map(s => s.id === editingId ? { ...s, ...data } : s));
    } else {
      const id = Date.now();
      setSessions(prev => [...(prev || []), { id, createdAt: new Date(id).toISOString(), ...data }]);
    }
    close();
  };
  // Autosave en mode édition : applique chaque changement après un court delai
  // (debounce) sans fermer la modale.
  useEffect(() => {
    if (!showForm || !editingId || !form?.date) return;
    const handle = setTimeout(() => {
      const data = buildData(form);
      setSessions(prev => (prev || []).map(s => s.id === editingId ? { ...s, ...data } : s));
    }, 350);
    return () => clearTimeout(handle);
  }, [form, editingId, showForm]);
  // Autosave en création : dès qu'un exercice porte un nom et au moins une
  // série renseignée, la séance est créée pour de bon et l'on bascule en mode
  // édition — l'autosave ci-dessus prend alors le relais. Le bouton corbeille
  // de l'en-tête, qui apparaît avec `editingId`, remplace l'« Annuler » perdu.
  useEffect(() => {
    if (!showForm || editingId || !form?.date) return;
    const data = buildData(form);
    if (!data.exercises.some(e => (e.sets || []).length > 0)) return;
    const handle = setTimeout(() => {
      const id = Date.now();
      setSessions(prev => [...(prev || []), { id, createdAt: new Date(id).toISOString(), ...data }]);
      setEditingId(id);
    }, 350);
    return () => clearTimeout(handle);
  }, [form, editingId, showForm]);
  const remove = (id) => setSessions(prev => (prev || []).filter(s => s.id !== id));

  /* ─── Stats agrégées ──────────────────────────────────────────── */
  const stats = useMemo(() => {
    const all = (sessions || []);
    const total = all.length;
    const now = new Date();
    const monday = new Date(now);
    const dow = monday.getDay() || 7;
    monday.setDate(monday.getDate() - dow + 1);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    const sessionsThisWeek = all.filter(s => {
      const d = new Date(s.date + "T00:00:00");
      return d >= monday && d <= sunday;
    }).length;

    // Streak : durée (en jours) de la période d'entraînement active courante.
    // Les jours de repos comptent dans le streak tant qu'on ne dépasse pas
    // REST_TOLERANCE jours de repos consécutifs entre deux séances.
    const REST_TOLERANCE = 2;
    const sortedDates = [...new Set(all.map(s => s.date))].sort();
    let streak = 0;
    if (sortedDates.length) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const DAY = 86400000;
      const last = new Date(sortedDates[sortedDates.length - 1] + "T00:00:00");
      const daysSinceLast = Math.floor((today - last) / DAY);
      if (daysSinceLast <= REST_TOLERANCE) {
        let startIdx = sortedDates.length - 1;
        for (let i = sortedDates.length - 1; i > 0; i--) {
          const a = new Date(sortedDates[i] + "T00:00:00");
          const b = new Date(sortedDates[i - 1] + "T00:00:00");
          const gap = Math.floor((a - b) / DAY);
          if (gap <= REST_TOLERANCE + 1) startIdx = i - 1;
          else break;
        }
        const start = new Date(sortedDates[startIdx] + "T00:00:00");
        streak = Math.floor((today - start) / DAY) + 1;
      }
    }

    // Volume total cette semaine (kg × reps somme)
    let volumeWeek = 0;
    for (const s of all) {
      const d = new Date(s.date + "T00:00:00");
      if (d < monday || d > sunday) continue;
      for (const ex of (s.exercises || [])) {
        for (const set of (ex.sets || [])) {
          if (set.weight && set.reps) volumeWeek += set.weight * set.reps;
        }
      }
    }

    return { total, sessionsThisWeek, streak, volumeWeek };
  }, [sessions]);

  /* ─── Métriques suivies par exercice ─────────────────────────────
     Un exercice se suit par ce qu'on y a saisi, sans réglage à faire :
       • vitesse (km/h) pour le cardio,
       • charge (kg) dès qu'une série a été lestée,
       • répétitions dès qu'une série n'a QUE des reps — tractions, pompes,
         dips… : au poids du corps, il n'y a pas de charge à noter, et c'est le
         nombre de répétitions qui mesure la progression.
     Un même exercice peut porter les deux dernières (tractions lestées ou non) :
     `metricsByExercise` liste alors tout ce qui est disponible, et le graphique
     propose de basculer. */
  const metricsByExercise = useMemo(() => {
    const map = new Map(); // exerciseName → Set<"speed" | "weight" | "reps">
    for (const s of (sessions || [])) {
      for (const ex of (s.exercises || [])) {
        const name = ex.name?.trim();
        if (!name) continue;
        const isCardio = s.discipline === "cardio" || ex.category === "cardio";
        let found = map.get(name);
        if (!found) map.set(name, (found = new Set()));
        for (const set of (ex.sets || [])) {
          const speed = set.speed != null ? set.speed : computeSpeed(set.distance, set.time);
          if (isCardio && speed) found.add("speed");
          else if (set.weight) found.add("weight");
          else if (set.reps) found.add("reps");
        }
      }
    }
    return map;
  }, [sessions]);

  /* ─── Records personnels ─────────────────────────────────────── */
  const prs = useMemo(() => {
    const map = new Map(); // exerciseName → { metric, value, reps, date }
    for (const s of (sessions || [])) {
      for (const ex of (s.exercises || [])) {
        const name = ex.name?.trim();
        if (!name) continue;
        // Le record d'un exercice se mesure dans SA métrique : charge max s'il
        // est lesté, sinon répétitions max au poids du corps. Le cardio garde
        // sa place dans le graphique mais pas ici — une vitesse ne se compare
        // pas à une charge dans une même liste.
        const metric = pickMetric(metricsByExercise.get(name), ["weight", "reps"]);
        if (!metric) continue;
        for (const set of (ex.sets || [])) {
          const cur = map.get(name);
          if (metric === "weight") {
            if (!set.weight) continue;
            if (!cur || set.weight > cur.value || (set.weight === cur.value && (set.reps || 0) > (cur.reps || 0))) {
              map.set(name, { metric, value: set.weight, reps: set.reps || null, date: s.date });
            }
          } else {
            // Séries au poids du corps uniquement : une série lestée légère ne
            // doit pas venir gonfler le record de répétitions.
            if (set.weight || !set.reps) continue;
            if (!cur || set.reps > cur.value) {
              map.set(name, { metric, value: set.reps, reps: null, date: s.date });
            }
          }
        }
      }
    }
    const all = Array.from(map.entries()).map(([name, pr]) => ({ name, ...pr }));
    const strongest = (a, b) => b.value - a.value;
    const loaded = all.filter(p => p.metric === "weight").sort(strongest);
    const bodyweight = all.filter(p => p.metric === "reps").sort(strongest);

    // Un record de tractions (14) ne se compare pas à un développé couché (100) :
    // en les classant sur la même valeur, les kilos rafleraient toutes les
    // places et les exercices au poids du corps — tractions, pompes, dips —
    // disparaîtraient de la liste. Chaque famille garde donc sa part, et celle
    // qui n'a pas de quoi la remplir rend ses places à l'autre.
    const MAX = 6;
    const bodyweightSlots = Math.min(bodyweight.length, Math.floor(MAX / 2));
    const kept = [...loaded.slice(0, MAX - bodyweightSlots), ...bodyweight.slice(0, bodyweightSlots)];
    if (kept.length < MAX) kept.push(...bodyweight.slice(bodyweightSlots, bodyweightSlots + (MAX - kept.length)));

    // Les charges en tête (elles portent les plus gros chiffres), puis les
    // records de répétitions — chaque groupe du plus fort au plus faible.
    return kept.sort((a, b) => (a.metric === b.metric ? b.value - a.value : a.metric === "weight" ? -1 : 1));
  }, [sessions, metricsByExercise]);

  /* ─── Liste des exercices (pour le sélecteur de graphique) ──── */
  const allExerciseNames = useMemo(() => {
    const set = new Set();
    for (const s of (sessions || [])) {
      for (const ex of (s.exercises || [])) {
        if (ex.name?.trim()) set.add(ex.name.trim());
      }
    }
    return Array.from(set).sort();
  }, [sessions]);

  useEffect(() => {
    if (!chartExerciseName && allExerciseNames.length > 0) setChartExerciseName(allExerciseNames[0]);
  }, [allExerciseNames, chartExerciseName]);

  /* Options du sélecteur d'exercice du graphique : les plus travaillés d'abord
     (c'est là qu'il y a une progression à lire), avec la pastille de catégorie
     et le nombre de séances — de quoi choisir sans deviner. */
  const exerciseOptions = useMemo(() => {
    const map = new Map(); // name → { count, category, last }
    for (const s of (sessions || [])) {
      for (const ex of (s.exercises || [])) {
        const name = ex.name?.trim();
        if (!name) continue;
        const cur = map.get(name) || { count: 0, category: ex.category, last: s.date };
        cur.count += 1;
        // La catégorie retenue est celle de la séance la plus récente : c'est
        // celle que l'utilisateur a corrigée en dernier.
        if (s.date >= cur.last) { cur.last = s.date; cur.category = ex.category || cur.category; }
        map.set(name, cur);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => (b[1].count - a[1].count) || a[0].localeCompare(b[0], "fr"))
      .map(([name, info]) => {
        const cat = CATEGORIES.find(c => c.id === info.category);
        const color = cat?.color || T.textSub;
        return {
          id: name,
          label: name,
          sublabel: `${info.count} séance${info.count > 1 ? "s" : ""}`,
          iconNode: (
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: cat ? dotRing(color) : "none", display: "block", flexShrink: 0 }} />
          ),
        };
      });
  }, [sessions]);

  /* Métriques disponibles pour l'exercice affiché, et celle réellement tracée :
     le choix manuel prime, tant qu'il reste disponible sur cet exercice —
     sinon on retombe sur la métrique naturelle (vitesse, puis charge, puis
     répétitions). */
  const chartMetrics = useMemo(
    () => METRIC_ORDER.filter(m => metricsByExercise.get(chartExerciseName)?.has(m)),
    [metricsByExercise, chartExerciseName]
  );
  const chartMetric = chartMetrics.includes(chartMetricChoice) ? chartMetricChoice : (chartMetrics[0] ?? null);

  /* ─── Données du graphique d'évolution ─────────────────────── */
  const chartData = useMemo(() => {
    if (!chartExerciseName || !chartMetric) return [];
    const points = [];
    for (const s of (sessions || [])) {
      for (const ex of (s.exercises || [])) {
        if (ex.name?.trim() !== chartExerciseName) continue;
        // Un point par séance : le meilleur de la séance dans la métrique
        // suivie (vitesse, charge ou répétitions).
        let best = 0, detail = null;
        for (const set of (ex.sets || [])) {
          if (chartMetric === "speed") {
            const sp = set.speed != null ? set.speed : computeSpeed(set.distance, set.time);
            if (sp && sp > best) best = sp;
          } else if (chartMetric === "weight") {
            if (set.weight && set.weight > best) {
              best = set.weight;
              detail = set.reps || null;
            }
          } else if (!set.weight && set.reps && set.reps > best) {
            // Répétitions : seules les séries au poids du corps comptent.
            best = set.reps;
          }
        }
        if (best > 0) points.push({ date: s.date, value: best, reps: detail });
      }
    }
    return points.sort((a, b) => a.date.localeCompare(b.date));
  }, [sessions, chartExerciseName, chartMetric]);

  /* ─── Filtrage ──────────────────────────────────────────────── */
  const filteredSessions = useMemo(() => {
    let list = sessions || [];
    if (filterDiscipline !== "all") list = list.filter(s => s.discipline === filterDiscipline);
    if (filterCategory !== "all") {
      list = list.filter(s => (s.exercises || []).some(e => e.category === filterCategory));
    }
    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  }, [sessions, filterDiscipline, filterCategory]);

  const hasAnyFilter = filterDiscipline !== "all" || filterCategory !== "all";

  /* ─── Regroupement de l'historique par mois ──────────────────── */
  const monthGroups = useMemo(() => {
    const map = new Map();
    for (const s of filteredSessions) {
      const key = s.date.slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    return Array.from(map.entries()).map(([key, list]) => ({
      key,
      label: new Date(key + "-01T00:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
      sessions: list,
    }));
  }, [filteredSessions]);

  if (useFirstLoad(sessionsReady, "tr4de_sport_sessions")) {
    return <PageSkeleton variant="stats" stats={3} gap={24} toolbarLeft={[124, 88]} toolbarRight={[148]} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }} className="anim-1">
      {/* LIGNE DE TÊTE — onglets à GAUCHE, commandes à droite : une seule
          rangée au lieu de deux, comme les pages récentes qui posent leurs
          commandes sur la même ligne. Les onglets ouvrent la ligne parce qu'ils
          disent où l'on est ; le bouton la ferme parce qu'il dit ce qu'on peut
          y faire. */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        {/* Onglets : la brique commune. C'etait une copie locale de
            `PeriodPills`, avec sa propre piste et sa propre graisse. */}
        <PeriodPills
          value={tab}
          onChange={setTab}
          options={[{ id: "workout", label: "Entraînement" }, { id: "photos", label: "Photos" }]}
          track
          size={13}
        />

        <span style={{ fontSize: 12, color: T.text, opacity: 0.5 }}>
          {stats.total === 0
            ? "Suis tes séances, tes records et ta progression."
            : `${stats.total} séance${stats.total > 1 ? "s" : ""} enregistrée${stats.total > 1 ? "s" : ""}`}
        </span>

        <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
          <div id="tr4de-page-header-slot" />
          {tab === "workout" && (
            <button onClick={openCreate}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", minHeight: 34, borderRadius: 999, background: T.text, border: "none", color: T.textInverted, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
              <Plus size={14} strokeWidth={1.75} /> Nouvelle séance
            </button>
          )}
          {tab === "photos" && (
            <button type="button" onClick={pickPhotos} disabled={photoBusy}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", minHeight: 34, borderRadius: 999, background: T.text, border: "none", color: T.textInverted, fontSize: 13, fontWeight: 500, cursor: photoBusy ? "default" : "pointer", opacity: photoBusy ? 0.6 : 1, fontFamily: "inherit" }}>
              <ImagePlus size={14} strokeWidth={1.75} /> {photoBusy ? "Ajout…" : "Ajouter des photos"}
            </button>
          )}
        </div>
      </div>

      <input ref={photoInputRef} type="file" accept="image/*" multiple onChange={onPickPhotos} style={{ display: "none" }} />

      {tab === "photos" && (
        <PhotosTab photos={progressPhotos} setPhotos={setProgressPhotos} onAdd={pickPhotos} busy={photoBusy} />
      )}

      {/* Layout en 2 colonnes : timeline à gauche, panneau collant à droite */}
      {tab === "workout" && (
      <div className="tr4de-sport-layout" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.7fr) minmax(300px, 1fr)", gap: 24, alignItems: "start" }}>

        {/* Colonne gauche : filtres + timeline mensuelle */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SectionTitle
            size="sm"
            action={
              <span style={{ fontSize: 12, color: T.text, opacity: 0.5, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {filteredSessions.length}{hasAnyFilter ? ` / ${(sessions || []).length}` : ""} séance{filteredSessions.length > 1 ? "s" : ""}
              </span>
            }
          >
            Historique
          </SectionTitle>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Pas de pilule « Toutes » : c'était un bouton dont le seul rôle
                était de défaire le précédent. Le retour à la vue complète passe
                maintenant par la pilule active elle-même, qu'un second clic
                relâche — et à l'arrivée sur la page, aucune n'est prise, donc
                tout est déjà visible. */}
            <FilterPills
              value={filterDiscipline}
              onChange={setFilterDiscipline}
              options={DISCIPLINES.map(d => ({ id: d.id, label: d.label, color: d.color }))}
            />
            <FilterPills
              value={filterCategory}
              onChange={setFilterCategory}
              options={CATEGORIES.map(c => ({ id: c.id, label: c.label, color: c.color }))}
            />
          </div>

          {filteredSessions.length === 0 ? (
            /* État vide : une carte, comme partout ailleurs — le cadre en
               pointillés faisait un bloc à part au milieu de la page. */
            <div style={{ ...CARD, padding: "48px 32px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: FIELD_BG, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <Dumbbell size={22} strokeWidth={1.75} color={T.text} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 500, color: T.text, marginBottom: 6 }}>
                {hasAnyFilter ? "Aucune séance ne correspond" : "Aucune séance pour le moment"}
              </div>
              <div style={{ fontSize: 14, color: T.textSub, maxWidth: 340, lineHeight: 1.5 }}>
                {hasAnyFilter
                  ? "Élargis les filtres pour retrouver tes séances."
                  : "Crée ta première séance pour commencer à suivre ta progression."}
              </div>
            </div>
          ) : (
            <div className="anim-stagger" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {monthGroups.map(group => (
                <div key={group.key}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text, textTransform: "capitalize" }}>{group.label}</span>
                    <span style={{ fontSize: 12, color: T.text, opacity: 0.5 }}>· {group.sessions.length} séance{group.sessions.length > 1 ? "s" : ""}</span>
                  </div>
                  <div style={{ position: "relative", paddingLeft: 26 }}>
                    {/* Trait vertical de la timeline */}
                    <div style={{ position: "absolute", left: 8, top: 4, bottom: 4, width: 2, background: HAIRLINE, borderRadius: 999 }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {group.sessions.map(s => {
                        const disc = DISCIPLINES.find(d => d.id === s.discipline) || DISCIPLINES[0];
                        return (
                          <div key={s.id} style={{ position: "relative" }}>
                            {/* Nœud de la timeline */}
                            <span style={{
                              position: "absolute", left: -23, top: 21, width: 12, height: 12, borderRadius: "50%",
                              background: T.white, border: `2px solid ${disc.color}`, boxSizing: "border-box", zIndex: 1,
                            }} />
                            <SessionCard session={s} onEdit={() => openEdit(s)} onDelete={() => remove(s.id)} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Colonne droite : panneau collant (progression puis records) */}
        <div style={{ position: "sticky", top: 8, display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SectionTitle
              size="sm"
              /* Sélecteur d'exercice : plus le menu natif du système (police et
                 hauteur imposées, liste illisible passé une dizaine d'entrées),
                 mais la pastille commune du site — recherche au clavier,
                 pastille de catégorie et nombre de séances par exercice. */
              action={exerciseOptions.length > 0 ? (
                <SearchableSelect
                  small
                  width={186}
                  align="end"
                  menuMinWidth={268}
                  maxMenuHeight={300}
                  value={chartExerciseName}
                  options={exerciseOptions}
                  onChange={setChartExerciseName}
                  placeholder="Choisir un exercice"
                  searchPlaceholder="Chercher un exercice…"
                  emptyLabel="Aucun exercice"
                  triggerStyle={{
                    border: "none", background: FIELD_BG, borderRadius: 999,
                    padding: "5px 10px 5px 12px",
                  }}
                  /* Dans la pastille, le nom seul : le nombre de séances reste
                     dans la liste, où il aide à choisir. */
                  renderSelected={(opt) => (
                    <>
                      {opt?.iconNode}
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {opt?.label ?? "Choisir un exercice"}
                      </span>
                    </>
                  )}
                />
              ) : null}
            >
              Progression
            </SectionTitle>
            <ProgressChart
              allExerciseNames={allExerciseNames}
              data={chartData}
              metric={chartMetric}
              metrics={chartMetrics}
              onChangeMetric={setChartMetricChoice}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SectionTitle size="sm">Records personnels</SectionTitle>
            <PRsCard prs={prs} />
          </div>
        </div>
      </div>
      )}

      {/* Modal de création / édition */}
      {showForm && typeof document !== "undefined" && ReactDOM.createPortal(
        <SessionForm
          form={form} setForm={setForm} editingId={editingId} onClose={close} onSave={save}
          onDelete={() => { if (editingId) { remove(editingId); close(); } }}
          customExercises={customExercises} setCustomExercises={setCustomExercises}
          hiddenExercises={hiddenExercises} setHiddenExercises={setHiddenExercises}
          favoriteExercises={favoriteExercises} setFavoriteExercises={setFavoriteExercises}
          customPresets={customPresets} setCustomPresets={setCustomPresets}
        />,
        document.body
      )}
    </div>
  );
}

/* ─── Helpers de date ─────────────────────────────────────────────── */
function toISOLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* Le titre de section vient de components/ui/da.jsx (`SectionTitle`, variante
   `size="sm"` à 18 px). La copie locale rendait un titre à 13 px en 600 —
   exactement la graisse et la taille du contenu qu'il annonçait. */

/* ─── Compression d'image côté client (canvas) ──────────────────────
 * Redimensionne la photo (côté max ≈ 720px) et la ré-encode en JPEG pour
 * garder un dataURL léger, stockable dans le state cloud / localStorage. */
function compressImage(file, maxSize = 720, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        try { resolve(canvas.toDataURL("image/jpeg", quality)); }
        catch (e) { reject(e); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function photoInput() {
  return {
    width: "100%", boxSizing: "border-box", border: "none", borderRadius: 10,
    padding: "10px 12px", fontSize: 13, color: T.text, fontFamily: "inherit", outline: "none", background: FIELD_BG,
  };
}

function navArrow(side) {
  return {
    position: "absolute", [side]: 10, top: "50%", transform: "translateY(-50%)",
    width: 38, height: 38, borderRadius: "50%", border: "none",
    background: "rgba(255,255,255,0.92)", color: T.text, cursor: "pointer",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 1px 5px rgba(0,0,0,0.18)", zIndex: 2,
  };
}

/* ─── Onglet « Photos » — suivi de l'évolution physique ─────────── */
/* `onAdd` / `busy` viennent de la page : l'input de fichier et l'état d'ajout
   sont chez elle, parce que le bouton qui les déclenche est dans SA ligne de
   tête. L'onglet ne garde que les points d'appel. */
function PhotosTab({ photos, setPhotos, onAdd, busy }) {
  const [viewerId, setViewerId] = useState(null);

  const sorted = useMemo(
    () => [...(photos || [])].sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [photos]
  );

  const update = (id, patch) => setPhotos(prev => (prev || []).map(p => p.id === id ? { ...p, ...patch } : p));
  const del = (id) => { setPhotos(prev => (prev || []).filter(p => p.id !== id)); setViewerId(cur => cur === id ? null : cur); };

  // Regroupement par mois (en conservant l'ordre récent → ancien de `sorted`).
  const monthGroups = useMemo(() => {
    const map = new Map();
    for (const p of sorted) {
      const key = (p.date || "").slice(0, 7) || "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      label: key === "—" ? "Sans date" : new Date(key + "-01T00:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
      items,
    }));
  }, [sorted]);

  const viewerIndex = sorted.findIndex(p => p.id === viewerId);
  const viewer = viewerIndex >= 0 ? sorted[viewerIndex] : null;
  const go = (dir) => {
    if (viewerIndex < 0) return;
    const ni = viewerIndex + dir;
    if (ni >= 0 && ni < sorted.length) setViewerId(sorted[ni].id);
  };

  // Navigation clavier dans la visionneuse (← / → / Échap).
  useEffect(() => {
    if (viewerIndex < 0) return;
    const onKey = (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === "Escape") setViewerId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerIndex, sorted]);

  // Swipe tactile (gauche/droite).
  const touchX = React.useRef(null);
  const onTouchStart = (e) => { touchX.current = e.touches[0]?.clientX ?? null; };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touchX.current = null;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Plus de bouton en action de titre : il est monté dans la ligne de tête
          de la page, à côté des onglets. */}
      <SectionTitle size="sm">
        Évolution physique
      </SectionTitle>

      {sorted.length === 0 ? (
        <button type="button" onClick={onAdd} disabled={busy}
          style={{ ...CARD, padding: "48px 32px", textAlign: "center", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: FIELD_BG, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Camera size={22} strokeWidth={1.75} color={T.text} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 500, color: T.text, marginBottom: 6 }}>Aucune photo pour l'instant</div>
          <div style={{ fontSize: 14, color: T.textSub, maxWidth: 340, lineHeight: 1.5 }}>
            Clique pour ajouter ta première photo de progression.
          </div>
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {monthGroups.map(group => (
            <div key={group.key}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.text, textTransform: "capitalize" }}>{group.label}</span>
                <span style={{ fontSize: 12, color: T.text, opacity: 0.5 }}>· {group.items.length} photo{group.items.length > 1 ? "s" : ""}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(150px, 100%), 1fr))", gap: 12 }}>
                {group.items.map(p => (
                  /* La vignette EST la carte : coins 12 et ombre douce comme les
                     autres, plus de cadre gris autour de l'image. */
                  <button key={p.id} type="button" onClick={() => setViewerId(p.id)}
                    style={{ position: "relative", padding: 0, border: "none", borderRadius: 12, overflow: "hidden", background: FIELD_BG, boxShadow: T.elevCard, cursor: "pointer", fontFamily: "inherit", aspectRatio: "3 / 4" }}>
                    <img src={p.dataUrl} alt={fmtDate(p.date)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "18px 10px 8px", background: "linear-gradient(to top, rgba(0,0,0,0.62), transparent)", textAlign: "left" }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "#fff", textTransform: "capitalize" }}>{fmtDate(p.date)}</div>
                      {p.weight !== "" && p.weight != null && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)" }}>{p.weight} kg</div>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Visionneuse plein écran + détails éditables */}
      {viewer && typeof document !== "undefined" && ReactDOM.createPortal(
        <div {...backdropDismiss(() => setViewerId(null))} className="anim-backdrop"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.62)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="anim-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true"
            style={{ width: "min(900px, 100%)", maxHeight: "92vh", display: "flex", flexWrap: "wrap", background: T.white, borderRadius: "var(--radius-modal)", overflow: "hidden", fontFamily: "var(--font-sans)" }}>
            <div
              onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
              style={{ position: "relative", flex: "1 1 320px", minWidth: 0, display: "flex", alignItems: "stretch", justifyContent: "center", background: "#000" }}>
              <img src={viewer.dataUrl} alt={fmtDate(viewer.date)} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
              {/* Compteur */}
              {sorted.length > 1 && (
                <div style={{ position: "absolute", top: 10, left: 12, padding: "3px 9px", borderRadius: 999, background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {viewerIndex + 1} / {sorted.length}
                </div>
              )}
              {/* Flèches de navigation */}
              {viewerIndex > 0 && (
                <button type="button" onClick={() => go(-1)} aria-label="Photo précédente" style={navArrow("left")}>
                  <ChevronLeft size={20} strokeWidth={2} />
                </button>
              )}
              {viewerIndex < sorted.length - 1 && (
                <button type="button" onClick={() => go(1)} aria-label="Photo suivante" style={navArrow("right")}>
                  <ChevronRight size={20} strokeWidth={2} />
                </button>
              )}
            </div>
            <div style={{ flex: "0 0 280px", maxWidth: "100%", display: "flex", flexDirection: "column", overflowY: "auto", background: T.white }}>
              {/* En-tête : date en titre + fermeture. Plus de sur-titre en
                  capitales ni de filet — la date suffit à dire où l'on est. */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "18px 18px 0" }}>
                <div style={{ fontSize: 16, fontWeight: 500, color: T.text, textTransform: "capitalize", lineHeight: 1.2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{fmtDate(viewer.date)}</div>
                <button type="button" onClick={() => setViewerId(null)} aria-label="Fermer"
                  style={{ flex: "0 0 auto", width: 34, height: 34, borderRadius: 999, border: "none", background: "transparent", color: T.textSub, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "background var(--dur-fast) var(--ease-out)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = FIELD_BG; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                  <X size={16} strokeWidth={1.75} />
                </button>
              </div>

              {/* Poids — métrique mise en avant, posée sur un aplat plutôt que
                  dans une carte dans la carte. */}
              <div style={{ padding: "16px 18px 0" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "14px 16px", borderRadius: 12, background: FIELD_BG }}>
                  <input type="number" value={viewer.weight ?? ""} onChange={(e) => update(viewer.id, { weight: e.target.value })} placeholder="—"
                    style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 28, fontWeight: 500, letterSpacing: -0.4, color: T.text, fontFamily: "inherit", padding: 0, fontVariantNumeric: "tabular-nums" }} />
                  <span style={{ flex: "0 0 auto", fontSize: 14, fontWeight: 500, color: T.text, opacity: 0.5 }}>kg</span>
                </div>
              </div>

              {/* Champs éditables */}
              <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <FieldLabel>Date</FieldLabel>
                  <input type="date" value={viewer.date || ""} onChange={(e) => update(viewer.id, { date: e.target.value })} style={photoInput()} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <FieldLabel>Note</FieldLabel>
                  <textarea value={viewer.note ?? ""} onChange={(e) => update(viewer.id, { note: e.target.value })} rows={4} placeholder="Sensation, mensurations…"
                    style={{ ...photoInput(), background: WRITING_BG, resize: "vertical", lineHeight: 1.55 }} />
                </label>
              </div>

              {/* Suppression */}
              <button type="button" onClick={() => del(viewer.id)}
                style={{ margin: "auto 18px 18px", padding: "8px 16px", minHeight: 34, borderRadius: 999, border: "none", background: FIELD_BG, color: T.red, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Trash2 size={13} strokeWidth={1.75} /> Supprimer la photo
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}


/* ─── Filtres en pills ──────────────────────────────────────────── */
/**
 * Rangée de filtres à choix unique, RELÂCHABLE.
 *
 * Il n'y a pas d'option « Toutes » dans la liste : cliquer la pilule déjà prise
 * la relâche et rend `clearValue`, ce qui remet la vue complète. Un filtre sans
 * échappatoire obligerait à garder un bouton dont le seul rôle est d'annuler le
 * précédent, et « Toutes » ferait alors passer pour un choix ce qui est en fait
 * l'absence de choix — l'état par défaut de la page.
 */
function FilterPills({ value, onChange, options, clearValue = "all" }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map(o => {
        const active = value === o.id;
        return (
          <button key={o.id} type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? clearValue : o.id)}
            /* Actif : pastille pleine à l'encre du texte. Au repos : simple
               aplat, sans cadre — une rangée de pilules cerclées faisait autant
               de traits que de filtres. */
            style={{
              padding: "8px 16px", minHeight: 34, borderRadius: 999, border: "none",
              background: active ? T.text : FIELD_BG,
              color: active ? T.textInverted : T.textSub,
              fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", gap: 6,
              transition: "background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)",
            }}>
            {o.color && <span style={{ width: 6, height: 6, borderRadius: "50%", background: o.color, boxShadow: dotRing(o.color), flexShrink: 0 }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Carte d'une séance (résumé + dépliage exercices) ──────────── */
function SessionCard({ session: s, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const disc = DISCIPLINES.find(d => d.id === s.discipline) || DISCIPLINES[0];
  const Icon = disc.Icon;
  const totalSets = (s.exercises || []).reduce((sum, e) => sum + (e.sets || []).length, 0);
  const totalVolume = (s.exercises || []).reduce((sum, e) =>
    sum + (e.sets || []).reduce((vs, set) => vs + ((set.weight || 0) * (set.reps || 0)), 0), 0);
  // Répétitions faites sans charge : c'est le volume d'une séance au poids du
  // corps, que le tonnage en kg ne sait pas compter.
  const totalBodyweightReps = (s.exercises || []).reduce((sum, e) =>
    sum + (e.sets || []).reduce((rs, set) => rs + (!set.weight ? (set.reps || 0) : 0), 0), 0);

  // Catégorie de la séance = moyenne pondérée par le nombre de séries.
  // On somme les sets par catégorie d'exo, puis on prend la catégorie dominante.
  // Tie ou 3+ catégories à poids comparables → "Full body".
  const sessionCategory = (() => {
    const weights = {};
    for (const ex of (s.exercises || [])) {
      if (!ex.category) continue;
      const w = Math.max(1, (ex.sets || []).length);
      weights[ex.category] = (weights[ex.category] || 0) + w;
    }
    const keys = Object.keys(weights);
    if (keys.length === 0) return null;
    keys.sort((a, b) => weights[b] - weights[a]);
    const total = keys.reduce((s, k) => s + weights[k], 0);
    const top = weights[keys[0]];
    // Si la catégorie dominante représente moins de 50%, considère la séance Full body
    if (keys.length >= 3 && top / total < 0.5) return CATEGORIES.find(c => c.id === "full_body");
    return CATEGORIES.find(c => c.id === keys[0]) || null;
  })();

  return (
    <div data-card style={{ ...CARD, padding: 0 }}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          padding: "12px 14px", display: "flex", alignItems: "center", gap: 12,
          cursor: "pointer", transition: "background var(--dur-fast) var(--ease-out)",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = FIELD_BG; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: "50%",
          background: `${disc.color}1F`, color: disc.color,
          display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Icon size={16} strokeWidth={1.75} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
              {fmtDate(s.date)}
            </span>
            {sessionCategory && (
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: sessionCategory.color, background: `${sessionCategory.color}18`,
                padding: "1px 7px", borderRadius: 999, alignSelf: "center",
              }}>{sessionCategory.label}</span>
            )}
            <span style={{ fontSize: 12, color: T.textSub, textTransform: "capitalize" }}>{disc.label}</span>
            {s.duration > 0 && (
              <span style={{ fontSize: 12, color: T.text, opacity: 0.5, display: "inline-flex", alignItems: "center", gap: 3 }}>
                <Clock size={11} strokeWidth={1.75} /> {s.duration} min
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, fontSize: 12, color: T.text, opacity: 0.5, flexWrap: "wrap" }}>
            <span>{(s.exercises || []).length} exercice{(s.exercises || []).length > 1 ? "s" : ""}</span>
            <span>·</span>
            <span>{totalSets} série{totalSets > 1 ? "s" : ""}</span>
            {totalVolume > 0 && (
              <>
                <span>·</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round(totalVolume).toLocaleString("fr-FR")} kg</span>
              </>
            )}
            {totalBodyweightReps > 0 && (
              <>
                <span>·</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{totalBodyweightReps} reps</span>
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 2, alignItems: "center", flexShrink: 0 }}>
          <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} aria-label="Modifier"
            style={iconBtn()}
            onMouseEnter={(e) => { e.currentTarget.style.background = FIELD_BG; e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textSub; }}>
            <Pencil size={11} strokeWidth={1.75} />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="Supprimer"
            style={iconBtn()}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.redBg; e.currentTarget.style.color = T.red; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textSub; }}>
            <Trash2 size={11} strokeWidth={1.75} />
          </button>
          <ChevronRight size={12} strokeWidth={2} color={T.textSub}
            style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s ease", marginLeft: 2 }} />
        </div>
      </div>

      {open && (
        /* Le dépliage garde un trait — mais dilué : il sépare le résumé
           cliquable du détail, ce n'est plus un cadre de carte. */
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${HAIRLINE}` }}>
          {(s.exercises || []).map((ex, i) => {
            return (
              <div key={ex.id || i} style={{ paddingTop: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{ex.name}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {(ex.sets || []).map((set, si) => {
                    if (s.discipline === "cardio") {
                      const speed = set.speed != null ? set.speed : computeSpeed(set.distance, set.time);
                      return (
                        <div key={set.id || si} style={{ fontSize: 12, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
                          {set.distance != null && <span>{set.distance} km</span>}
                          {set.time != null && <span>{set.distance != null ? " · " : ""}{set.time} min</span>}
                          {speed != null && <span> · {speed} km/h</span>}
                        </div>
                      );
                    }
                    return (
                      <div key={set.id || si} style={{ fontSize: 12, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
                        <span style={{ color: T.text, opacity: 0.5, marginRight: 8 }}>Série {si + 1}</span>
                        {set.reps != null && <span>{set.reps} reps</span>}
                        {/* Sans charge saisie, la série est au poids du corps :
                            on l'écrit, sinon la ligne se lit comme incomplète. */}
                        {set.weight != null
                          ? <span> · {set.weight} kg</span>
                          : set.reps != null ? <span style={{ opacity: 0.6 }}> · poids du corps</span> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {s.notes && (
            <div style={{ marginTop: 12, minHeight: 34, padding: "8px 16px", background: WRITING_BG, borderRadius: 10, fontSize: 13, color: T.textSub, lineHeight: 1.55 }}>
              {s.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function iconBtn() {
  return {
    width: 26, height: 26, borderRadius: 999, border: "none",
    background: "transparent", color: T.textSub, cursor: "pointer",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    transition: "background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)",
  };
}

/* ─── Carte des records personnels ──────────────────────────────── */
function PRsCard({ prs }) {
  return (
    /* Une carte, des lignes espacées : les filets entre records reprenaient un
       tableau alors qu'il s'agit d'une liste de quatre mesures. */
    <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 12 }}>
      {prs.length === 0 ? (
        <div style={{ padding: "16px 2px", textAlign: "center", color: T.textSub, fontSize: 13, lineHeight: 1.5 }}>
          Aucun record. Enregistre tes séries — avec charge ou au poids du corps — pour les voir apparaître.
        </div>
      ) : (
        prs.map((pr) => (
          <div key={pr.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pr.name}
              </div>
              <div style={{ fontSize: 12, color: T.text, opacity: 0.5, marginTop: 1 }}>{fmtDate(pr.date)}</div>
            </div>
            {/* Deux écritures selon la métrique du record : « 100 kg × 5 » pour
                une charge, « 14 reps » au poids du corps — le détail secondaire
                reste atténué dans les deux cas. */}
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.15, color: T.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              {pr.metric === "weight" ? (
                <>
                  {pr.value} kg
                  {pr.reps ? <span style={{ fontWeight: 500, opacity: 0.5, fontSize: 12 }}> × {pr.reps}</span> : null}
                </>
              ) : (
                <>
                  {pr.value} <span style={{ fontWeight: 500, opacity: 0.5, fontSize: 12 }}>reps</span>
                </>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ─── Graphique de progression (simple SVG line) ────────────────── */
function ProgressChart({ allExerciseNames, data, metric = "weight", metrics = [], onChangeMetric }) {
  const unit = METRIC_UNIT[metric] ?? "";
  const VB_W = 600, VB_H = 200, padL = 8, padR = 12, padT = 14, padB = 20;
  const chartW = VB_W - padL - padR;
  const chartH = VB_H - padT - padB;

  const maxW = Math.max(...data.map(d => d.value), 1);
  const minW = 0;
  const span = maxW - minW || 1;

  const points = data.map((d, i) => {
    const x = padL + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW);
    const y = padT + chartH - ((d.value - minW) / span) * chartH;
    return { x, y, ...d };
  });
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  return (
    <div style={{ ...CARD, padding: 0 }}>
      {data.length === 0 ? (
        <div style={{ padding: "32px 18px", textAlign: "center", color: T.textSub, fontSize: 13, lineHeight: 1.5 }}>
          {allExerciseNames.length === 0
            ? "Enregistre des séances pour voir l'évolution."
            : "Pas encore assez de points pour cet exercice."}
        </div>
      ) : (
        <div style={{ padding: "12px 12px 12px 0", display: "flex", flexDirection: "column", gap: 6 }}>
          {/* En-tête : la métrique suivie à gauche (basculable quand l'exercice
              a été fait lesté ET au poids du corps), le meilleur relevé à
              droite — il tient lieu de graduation haute. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingLeft: 12, minHeight: 26 }}>
            {metrics.length > 1 ? (
              <PeriodPills
                value={metric}
                onChange={onChangeMetric}
                options={metrics.map(m => ({ id: m, label: METRIC_LABEL[m] }))}
                /* `rail` : ce groupe-ci est DANS la carte blanche de la courbe,
                   son actif a donc besoin de la piste grise pour se detacher. */
                track
                rail
              />
            ) : (
              <span style={{ fontSize: 12, color: T.text, opacity: 0.5 }}>
                Meilleur par séance · {unit}
              </span>
            )}
            <div style={{ fontSize: 12, color: T.text, opacity: 0.5, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              {fmtMetricValue(maxW, metric)} {unit}
            </div>
          </div>
          {/* Pas de padding à gauche : la courbe touche le bord de la carte. À
              droite la marge reste, les libellés de valeur y respirent. */}
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none"
            style={{ width: "100%", height: 160, display: "block", overflow: "visible", fontFamily: "var(--font-sans)" }}>
            {/* Rien sous la courbe : ni trame ni dégradé. Le tracé seul, à
                l'accent de marque (`T.kraken`, la couleur des courbes du site,
                qui suit le préréglage d'accent choisi dans les Réglages). */}
            <path d={pathD} fill="none" stroke={T.kraken} strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      )}
    </div>
  );
}

/* ─── Modal du formulaire de séance ─────────────────────────────── */
function SessionForm({ form, setForm, editingId, onClose, onSave, onDelete, customExercises, setCustomExercises, hiddenExercises, setHiddenExercises, favoriteExercises, setFavoriteExercises, customPresets = [], setCustomPresets }) {
  const [showPresets, setShowPresets] = useState(false);
  const [presetNamePrompt, setPresetNamePrompt] = useState(null); // null | string
  const [draggedExId, setDraggedExId] = useState(null);
  const [dragOverExId, setDragOverExId] = useState(null);

  // Déplacement de la modale : on attrape l'en-tête et on la glisse librement
  // à l'écran (comme une fenêtre), façon agenda.
  const [winPos, setWinPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = React.useRef(null);
  const startWindowDrag = (e) => {
    // Ne pas démarrer si on clique sur un bouton (ex. fermer).
    if (e.target.closest("button")) return;
    e.preventDefault();
    setDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: winPos.x, baseY: winPos.y };
    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      setWinPos({ x: d.baseX + (ev.clientX - d.startX), y: d.baseY + (ev.clientY - d.startY) });
    };
    const onUp = () => {
      dragRef.current = null;
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const allPresets = useMemo(
    () => (customPresets || []).map(p => ({ ...p, custom: true })),
    [customPresets]
  );

  const applyPreset = (preset) => {
    const baseId = Date.now();
    setForm(prev => ({
      ...prev,
      discipline: preset.discipline || prev.discipline,
      exercises: (preset.exercises || []).map((ex, i) => ({
        id: baseId + i * 1000,
        name: ex.name,
        category: ex.category || "full_body",
        sets: (ex.sets && ex.sets.length > 0)
          ? ex.sets.map((s, j) => ({ id: baseId + i * 1000 + j + 1, reps: s.reps ?? "", weight: s.weight ?? "", distance: s.distance ?? "", time: s.time ?? "" }))
          : [{ id: baseId + i * 1000 + 1, reps: "", weight: "" }],
      })),
    }));
    setShowPresets(false);
  };

  const openSaveAsPreset = () => setPresetNamePrompt("");
  const confirmSaveAsPreset = () => {
    const name = (presetNamePrompt || "").trim();
    if (!name) return;
    const preset = {
      id: `custom-${Date.now()}`,
      name,
      discipline: form.discipline,
      exercises: (form.exercises || [])
        .filter(e => (e.name || "").trim())
        .map(e => ({ name: e.name.trim(), category: e.category || "full_body" })),
    };
    if (preset.exercises.length === 0) { setPresetNamePrompt(null); return; }
    setCustomPresets?.(prev => [...(prev || []), preset]);
    setPresetNamePrompt(null);
  };

  const deleteCustomPreset = (id) => {
    setCustomPresets?.(prev => (prev || []).filter(p => p.id !== id));
  };

  const addExercise = () => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setForm(prev => ({
      ...prev,
      exercises: [...(prev.exercises || []), {
        id, name: "", category: "push",
        sets: [{ id: id + 1, reps: "", weight: "" }],
      }],
    }));
  };
  const removeExercise = (eid) => {
    setForm(prev => ({ ...prev, exercises: (prev.exercises || []).filter(e => e.id !== eid) }));
  };
  const updateExercise = (eid, patch) => {
    setForm(prev => ({
      ...prev,
      exercises: (prev.exercises || []).map(e => e.id === eid ? { ...e, ...patch } : e),
    }));
  };
  const moveExercise = (fromId, toId) => {
    if (fromId === toId) return;
    setForm(prev => {
      const list = [...(prev.exercises || [])];
      const from = list.findIndex(e => e.id === fromId);
      const to = list.findIndex(e => e.id === toId);
      if (from < 0 || to < 0) return prev;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      return { ...prev, exercises: list };
    });
  };
  const addSet = (eid) => {
    setForm(prev => ({
      ...prev,
      exercises: (prev.exercises || []).map(e => {
        if (e.id !== eid) return e;
        const sets = e.sets || [];
        const last = sets[sets.length - 1];
        // Pré-remplit la nouvelle série avec les valeurs de la précédente
        // (kilos, distance, temps) pour aller plus vite. Reps reste vide.
        const newSet = {
          id: Date.now() + Math.floor(Math.random() * 1000),
          reps: "",
          weight: last?.weight ?? "",
          distance: last?.distance ?? "",
          time: last?.time ?? "",
        };
        return { ...e, sets: [...sets, newSet] };
      }),
    }));
  };
  const updateSet = (eid, sid, patch) => {
    setForm(prev => ({
      ...prev,
      exercises: (prev.exercises || []).map(e => e.id === eid
        ? { ...e, sets: (e.sets || []).map(set => set.id === sid ? { ...set, ...patch } : set) }
        : e),
    }));
  };
  const removeSet = (eid, sid) => {
    setForm(prev => ({
      ...prev,
      exercises: (prev.exercises || []).map(e => e.id === eid
        ? { ...e, sets: (e.sets || []).filter(set => set.id !== sid) }
        : e),
    }));
  };
  // Cardio : pas de notion de série. On édite une ligne unique (distance + temps)
  // sur le premier set de l'exercice, qu'on crée au besoin.
  const updateCardio = (eid, patch) => {
    setForm(prev => ({
      ...prev,
      exercises: (prev.exercises || []).map(e => {
        if (e.id !== eid) return e;
        const sets = (e.sets && e.sets.length)
          ? e.sets
          : [{ id: Date.now() + Math.floor(Math.random() * 1000) }];
        return { ...e, sets: [{ ...sets[0], ...patch }, ...sets.slice(1)] };
      }),
    }));
  };

  const isCardio = form.discipline === "cardio";

  return (
    <div {...backdropDismiss(onClose)}
      style={{ position: "fixed", inset: 0, background: "transparent", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      {/* Pas d'`anim-modal` ici, volontairement : cette fenêtre se déplace à la
          souris et sa position vit dans un `transform`. Une animation d'entrée
          en `transform` écraserait ce translate — la fenêtre sauterait à
          l'origine le temps de l'animation, puis reviendrait. */}
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true"
        style={{ width: "min(640px, 100%)", maxHeight: "min(88vh, 820px)", display: "flex", flexDirection: "column", background: T.white, borderRadius: "var(--radius-modal)", boxShadow: "var(--elev-overlay)", overflow: "hidden", fontFamily: "var(--font-sans)", transform: `translate(${winPos.x}px, ${winPos.y}px)` }}>
        {/* Header — sert aussi de poignée pour déplacer la fenêtre */}
        <div onMouseDown={startWindowDrag}
          style={{ position: "relative", minHeight: 34, padding: "8px 16px", display: "flex", alignItems: "center", gap: 10, cursor: "move", userSelect: "none" }}>
          {/* Poignée de déplacement */}
          <div style={{
            position: "absolute", left: "50%", top: 7, transform: "translateX(-50%)",
            width: 40, height: 4, borderRadius: 999,
            background: dragging ? T.textSub : T.border,
            transition: "background-color 120ms ease",
          }} />
          {editingId && (
            <button onMouseDown={(e) => e.stopPropagation()} onClick={onDelete} aria-label="Supprimer" title="Supprimer la séance"
              style={{ marginLeft: "auto", width: 28, height: 28, borderRadius: "50%", border: "none", background: "transparent", color: T.textSub, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "background-color 120ms ease, color 120ms ease" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.redBg; e.currentTarget.style.color = T.red; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textSub; }}>
              <Trash2 size={15} strokeWidth={1.9} />
            </button>
          )}
          <button onMouseDown={(e) => e.stopPropagation()} onClick={onClose} aria-label="Fermer"
            style={{ marginLeft: editingId ? 0 : "auto", width: 28, height: 28, borderRadius: "50%", border: "none", background: "transparent", color: T.textSub, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "background-color 120ms ease, color 120ms ease" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = FIELD_BG; e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textSub; }}>
            <X size={16} strokeWidth={1.9} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          {/* Modèles de séance */}
          {!editingId && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Label>Modèle de séance</Label>
                <button
                  type="button"
                  onClick={() => setShowPresets(v => !v)}
                  style={{ ...softPill(), marginLeft: "auto", marginBottom: 6 }}>
                  <BookOpen size={12} strokeWidth={1.75} />
                  {showPresets ? "Masquer" : "Choisir un modèle"}
                </button>
              </div>
              {showPresets && (
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(180px, 100%), 1fr))",
                  gap: 6, padding: 10,
                  background: FIELD_BG, border: "none", borderRadius: 12,
                  maxHeight: 220, overflowY: "auto",
                }}>
                  {allPresets.length === 0 && (
                    <div style={{ gridColumn: "1 / -1", textAlign: "center", color: T.textSub, fontSize: 12, padding: "8px 0" }}>
                      Aucun modèle.
                    </div>
                  )}
                  {allPresets.map(p => {
                    const disc = DISCIPLINES.find(d => d.id === p.discipline) || DISCIPLINES[0];
                    return (
                      <div key={p.id} style={{
                        position: "relative",
                        background: T.white, border: "none", borderRadius: 10, boxShadow: T.elevPill,
                        padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4,
                      }}>
                        <button type="button" onClick={() => applyPreset(p)}
                          style={{
                            border: "none", background: "transparent", padding: 0, textAlign: "left",
                            cursor: "pointer", fontFamily: "inherit", color: T.text,
                            display: "flex", flexDirection: "column", gap: 4,
                          }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: disc.color, boxShadow: dotRing(disc.color), flexShrink: 0 }} />
                            <span style={{ fontSize: 13, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {p.name}
                            </span>
                            {p.custom && <span style={{ fontSize: 11, color: T.text, opacity: 0.5, fontWeight: 500 }}>(perso)</span>}
                          </div>
                          <div style={{ fontSize: 12, color: T.text, opacity: 0.5 }}>
                            {(p.exercises || []).length} exercice{(p.exercises || []).length > 1 ? "s" : ""}
                          </div>
                        </button>
                        {p.custom && (
                          <button type="button" onClick={() => deleteCustomPreset(p.id)} aria-label="Supprimer le modèle"
                            style={{
                              position: "absolute", top: 4, right: 4,
                              width: 20, height: 20, borderRadius: "var(--radius-field)", border: "none",
                              background: "transparent", color: T.textSub, cursor: "pointer",
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = T.redBg; e.currentTarget.style.color = T.red; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textSub; }}>
                            <Trash2 size={10} strokeWidth={1.75} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Discipline */}
          <div>
            <Label>Discipline</Label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {DISCIPLINES.map(d => {
                const Icon = d.Icon;
                const active = form.discipline === d.id;
                return (
                  <button key={d.id} type="button"
                    onClick={() => setForm({ ...form, discipline: d.id })}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "8px 16px", fontSize: 13, minHeight: 34, borderRadius: 999, border: "none",
                      background: active ? `${d.color}1F` : FIELD_BG,
                      color: active ? T.text : T.textSub, cursor: "pointer", fontFamily: "inherit",
                      textAlign: "left",
                      transition: "background var(--dur-fast) var(--ease-out)",
                    }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: active ? T.white : `${d.color}1F`, color: d.color, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon size={11} strokeWidth={1.75} />
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{d.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date + durée */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label>
              <Label>Date</Label>
              <DateField value={form.date}
                onChange={(v) => setForm({ ...form, date: v })} />
            </label>
            <label>
              <Label>Durée (min)</Label>
              <input type="number" value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
                placeholder="60"
                style={input()} />
            </label>
          </div>

          {/* Exercices */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Label>Exercices</Label>
              <button type="button" onClick={addExercise}
                style={{ ...softPill(), marginLeft: "auto", marginBottom: 8 }}>
                <Plus size={12} strokeWidth={1.75} /> Ajouter
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(form.exercises || []).map((ex, exIdx, exArr) => (
                <div key={ex.id}
                  onDragOver={(e) => { if (draggedExId != null && draggedExId !== ex.id) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragOverExId !== ex.id) setDragOverExId(ex.id); } }}
                  onDragLeave={() => { if (dragOverExId === ex.id) setDragOverExId(null); }}
                  onDrop={(e) => { e.preventDefault(); if (draggedExId != null) moveExercise(draggedExId, ex.id); setDraggedExId(null); setDragOverExId(null); }}
                  /* Bloc d'exercice : aplat, sans cadre. La cible de dépôt se
                     signale par un trait — c'est le seul moment où un contour
                     porte une information. */
                  style={{
                    background: FIELD_BG,
                    border: `1px solid ${dragOverExId === ex.id ? T.text : "transparent"}`,
                    borderRadius: 12,
                    padding: "10px 12px",
                    opacity: draggedExId === ex.id ? 0.5 : 1,
                    transition: "border-color var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out)",
                  }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                    <span
                      draggable
                      onDragStart={(e) => { setDraggedExId(ex.id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(ex.id)); } catch {} }}
                      onDragEnd={() => { setDraggedExId(null); setDragOverExId(null); }}
                      title="Glisser pour réordonner"
                      aria-label="Réordonner l'exercice"
                      style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 18, height: 22, color: T.textSub, cursor: "grab", flexShrink: 0,
                        marginLeft: -4,
                      }}
                      onMouseDown={(e) => { e.currentTarget.style.cursor = "grabbing"; }}
                      onMouseUp={(e) => { e.currentTarget.style.cursor = "grab"; }}>
                      <GripVertical size={13} strokeWidth={1.75} />
                    </span>
                    {/* Fallback tactile/clavier au drag (souris uniquement) : monter/descendre */}
                    <div style={{ display: "inline-flex", flexDirection: "column", gap: 1, flexShrink: 0, marginLeft: -2 }}>
                      <button type="button" onClick={() => { if (exIdx > 0) moveExercise(ex.id, exArr[exIdx - 1].id); }}
                        disabled={exIdx === 0} aria-label="Monter l'exercice" title="Monter"
                        style={{ ...iconBtn(), width: 20, height: 16, borderRadius: "var(--radius-field)", opacity: exIdx === 0 ? 0.3 : 1, cursor: exIdx === 0 ? "default" : "pointer" }}>
                        <ChevronUp size={12} strokeWidth={2} />
                      </button>
                      <button type="button" onClick={() => { if (exIdx < exArr.length - 1) moveExercise(ex.id, exArr[exIdx + 1].id); }}
                        disabled={exIdx === exArr.length - 1} aria-label="Descendre l'exercice" title="Descendre"
                        style={{ ...iconBtn(), width: 20, height: 16, borderRadius: "var(--radius-field)", opacity: exIdx === exArr.length - 1 ? 0.3 : 1, cursor: exIdx === exArr.length - 1 ? "default" : "pointer" }}>
                        <ChevronDown size={12} strokeWidth={2} />
                      </button>
                    </div>
                    <ExerciseNameCombobox
                      value={ex.name}
                      onChange={(name) => updateExercise(ex.id, { name })}
                      onPick={(item) => updateExercise(ex.id, { name: item.name, category: item.category })}
                      customExercises={customExercises}
                      setCustomExercises={setCustomExercises}
                      hiddenExercises={hiddenExercises}
                      setHiddenExercises={setHiddenExercises}
                      favoriteExercises={favoriteExercises}
                      setFavoriteExercises={setFavoriteExercises}
                      defaultCategory={isCardio ? "cardio" : (ex.category && ex.category !== "cardio" ? ex.category : "full_body")}
                      isCardio={isCardio}
                    />
                    <button type="button" onClick={() => removeExercise(ex.id)} aria-label="Supprimer l'exercice"
                      style={iconBtn()}
                      onMouseEnter={(e) => { e.currentTarget.style.background = T.redBg; e.currentTarget.style.color = T.red; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textSub; }}>
                      <Trash2 size={11} strokeWidth={1.75} />
                    </button>
                  </div>
                  {isCardio ? (() => {
                    /* Cardio : une seule ligne — distance, temps, et vitesse km/h calculée. */
                    const set = (ex.sets && ex.sets[0]) || {};
                    const speed = computeSpeed(set.distance, set.time);
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <SetInput value={set.distance ?? ""} onChange={(v) => updateCardio(ex.id, { distance: v })} placeholder="km" />
                        <SetInput value={set.time ?? ""} onChange={(v) => updateCardio(ex.id, { time: v })} placeholder="min" />
                        <div style={{
                          flex: 1, minWidth: 0, height: 32, borderRadius: 999,
                          border: "none", background: T.white,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: 500, fontVariantNumeric: "tabular-nums",
                          color: speed != null ? T.text : T.textSub,
                        }}>
                          {speed != null ? `${speed} km/h` : "km/h"}
                        </div>
                      </div>
                    );
                  })() : (
                    <>
                      {/* Sets */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {(ex.sets || []).map((set, si) => (
                          <div key={set.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 22, fontSize: 12, color: T.text, opacity: 0.5, fontWeight: 500 }}>S{si + 1}</span>
                            <SetInput value={set.reps} onChange={(v) => updateSet(ex.id, set.id, { reps: v })} placeholder="reps" />
                            <SetInput value={set.weight} onChange={(v) => updateSet(ex.id, set.id, { weight: v })} placeholder="kg" />
                            <button type="button" onClick={() => removeSet(ex.id, set.id)} aria-label="Supprimer la série"
                              style={{ ...iconBtn(), width: 22, height: 22 }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = T.redBg; e.currentTarget.style.color = T.red; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textSub; }}>
                              <X size={10} strokeWidth={2} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={() => addSet(ex.id)}
                        style={{
                          marginTop: 8, padding: "8px 16px", minHeight: 34, borderRadius: 999,
                          border: "none", background: T.white,
                          color: T.textSub, fontSize: 13, fontWeight: 500, cursor: "pointer",
                          fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4,
                        }}>
                        <Plus size={11} strokeWidth={1.75} /> Ajouter une série
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <label>
            <Label>Notes</Label>
            <textarea value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Sensations, énergie, ce que tu retiens…"
              rows={3}
              style={{ ...input(), borderRadius: 14, resize: "vertical", lineHeight: 1.45 }} />
          </label>
        </div>

        {/* Inline prompt pour nommer un nouveau modèle */}
        {presetNamePrompt !== null && (
          <div style={{ padding: "10px 18px", borderTop: `1px solid ${HAIRLINE}`, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: T.text, opacity: 0.5, whiteSpace: "nowrap" }}>Nom du modèle</span>
            <input
              autoFocus
              type="text"
              value={presetNamePrompt}
              onChange={(e) => setPresetNamePrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); confirmSaveAsPreset(); }
                else if (e.key === "Escape") { e.preventDefault(); setPresetNamePrompt(null); }
              }}
              placeholder="Ex : Push lourd"
              style={{ ...input(), minHeight: 28, padding: "5px 12px", fontSize: 13 }}
            />
            <button type="button" onClick={() => setPresetNamePrompt(null)}
              style={{ padding: "8px 16px", minHeight: 34, borderRadius: 999, border: "none", background: "transparent", color: T.textSub, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
              Annuler
            </button>
            <button type="button" onClick={confirmSaveAsPreset}
              disabled={!(presetNamePrompt || "").trim()}
              style={{
                padding: "8px 16px", minHeight: 34, borderRadius: 999, border: "none",
                background: (presetNamePrompt || "").trim() ? T.text : FIELD_BG,
                color: (presetNamePrompt || "").trim() ? T.textInverted : T.textSub,
                fontSize: 13, fontWeight: 500,
                cursor: (presetNamePrompt || "").trim() ? "pointer" : "not-allowed",
                fontFamily: "inherit",
              }}>
              Enregistrer
            </button>
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${HAIRLINE}`, display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
          {(() => {
            const canSavePreset = (form.exercises || []).some(e => (e.name || "").trim());
            return (
              <button type="button" onClick={openSaveAsPreset}
                disabled={!canSavePreset}
                title="Enregistrer la composition de cette séance comme modèle réutilisable"
                style={{ ...softPill(canSavePreset), marginRight: "auto", padding: "7px 13px" }}>
                <Save size={12} strokeWidth={1.75} /> Sauver comme modèle
              </button>
            );
          })()}
          {editingId ? (
            <>
              <span style={{ fontSize: 12, color: T.text, opacity: 0.5, fontFamily: "inherit" }}>
                Modifications enregistrées automatiquement
              </span>
              <button onClick={onClose}
                style={{ padding: "8px 16px", minHeight: 34, borderRadius: 999, border: "none", background: FIELD_BG, color: T.text, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                Fermer
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose}
                style={{ padding: "8px 16px", minHeight: 34, borderRadius: 999, border: "none", background: FIELD_BG, color: T.text, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                Annuler
              </button>
              <button onClick={onSave}
                disabled={!form.date}
                style={{
                  padding: "8px 16px", minHeight: 34, borderRadius: 999, border: "none",
                  background: form.date ? T.text : FIELD_BG,
                  color: form.date ? T.textInverted : T.textSub,
                  fontSize: 13, fontWeight: 500,
                  cursor: form.date ? "pointer" : "not-allowed",
                  fontFamily: "inherit",
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}>
                <Check size={13} strokeWidth={1.75} /> Créer
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* Libellé de champ de la modale : même écriture que `FieldLabel` de la DA,
   avec la marge basse dont les `<label>` de ce formulaire ont besoin. */
function Label({ children }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 500, color: T.text, opacity: 0.5, marginBottom: 6 }}>
      {children}
    </div>
  );
}

/* Champ de saisie : aplat plutôt que cadre. Sur un formulaire de dix champs,
   dix contours faisaient dix rectangles à lire avant d'atteindre le contenu. */
function input() {
  return {
    width: "100%", padding: "9px 14px", borderRadius: 999,
    border: "none", fontSize: 13, fontFamily: "inherit",
    outline: "none", color: T.text, background: FIELD_BG,
  };
}

/* Bouton d'action secondaire de la modale (« Ajouter », « Choisir un modèle »,
   « Sauver comme modèle ») : pilule à aplat, sans contour. */
function softPill(enabled = true) {
  return {
    padding: "8px 16px", minHeight: 34, borderRadius: 999, border: "none",
    background: FIELD_BG, color: T.textSub,
    fontSize: 12, fontWeight: 500,
    cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : 0.5,
    fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5,
  };
}

/* ─── Combobox pour la saisie d'un exercice ───────────────────────
   - Recherche dans la lib intégrée + exercices custom de l'utilisateur
   - Favoris affichés en premier
   - Bouton étoile pour ajouter/retirer des favoris
   - Bouton œil-barré pour masquer un exercice intégré
   - Bouton corbeille pour supprimer un exercice custom
   - Si la recherche ne renvoie rien → bouton "Ajouter <query>" comme nouvel exo */
function ExerciseNameCombobox({
  value, onChange, onPick,
  customExercises = [], setCustomExercises,
  hiddenExercises = [], setHiddenExercises,
  favoriteExercises = [], setFavoriteExercises,
  defaultCategory = "full_body",
  isCardio = false,
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = React.useRef(null);

  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const q = norm((value || "").trim());

  // Liste fusionnée : custom + intégrés - masqués (les custom remplacent l'intégré
  // s'il y a collision sur le nom).
  const allItems = useMemo(() => {
    const customNames = new Set((customExercises || []).map(c => norm(c.name)));
    const builtin = EXERCISE_LIBRARY.filter(e => !customNames.has(norm(e.name)));
    const merged = [...(customExercises || []).map(c => ({ ...c, custom: true })), ...builtin];
    const hiddenSet = new Set((hiddenExercises || []).map(n => norm(n)));
    return merged
      .filter(e => !hiddenSet.has(norm(e.name)))
      .filter(e => isCardio ? e.category === "cardio" : e.category !== "cardio")
      .sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
  }, [customExercises, hiddenExercises, isCardio]);

  const favSet = useMemo(
    () => new Set((favoriteExercises || []).map(n => norm(n))),
    [favoriteExercises]
  );

  const matches = useMemo(() => {
    let list = allItems;
    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      list = list.filter(e => {
        const haystack = norm([e.name, ...((e.aliases || []))].join(" "));
        return tokens.every(t => haystack.includes(t));
      });
    }
    // Favoris d'abord, puis ordre original
    return list
      .map((e, idx) => ({ ...e, _fav: favSet.has(norm(e.name)), _idx: idx }))
      .sort((a, b) => (b._fav ? 1 : 0) - (a._fav ? 1 : 0) || a._idx - b._idx)
      .slice(0, 60);
  }, [allItems, favSet, q]);

  // Une suggestion "ajouter" est dispo si la query ne matche aucun item exact
  const exactMatch = useMemo(() => {
    if (!q) return null;
    return allItems.find(e => norm(e.name) === q) || null;
  }, [allItems, q]);

  useEffect(() => { setActiveIdx(0); }, [q]);

  // Clic extérieur : géré par le Popover, la liste étant portalisée hors de `wrapRef`.
  const close = React.useCallback(() => setOpen(false), []);

  const pick = (item) => {
    onPick?.(item);
    setOpen(false);
  };

  const toggleFav = (name) => {
    setFavoriteExercises?.(prev => {
      const arr = prev || [];
      const key = norm(name);
      return arr.some(n => norm(n) === key)
        ? arr.filter(n => norm(n) !== key)
        : [...arr, name];
    });
  };

  const hideItem = (name) => {
    setHiddenExercises?.(prev => {
      const arr = prev || [];
      const key = norm(name);
      return arr.some(n => norm(n) === key) ? arr : [...arr, name];
    });
  };

  const deleteCustom = (name) => {
    const key = norm(name);
    setCustomExercises?.(prev => (prev || []).filter(c => norm(c.name) !== key));
  };

  const addCustom = (name, category) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    const key = norm(trimmed);
    setCustomExercises?.(prev => {
      const arr = prev || [];
      if (arr.some(c => norm(c.name) === key)) return arr;
      return [...arr, { name: trimmed, category: category || defaultCategory }];
    });
    pick({ name: trimmed, category: category || defaultCategory });
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIdx(i => Math.min(matches.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[activeIdx]) pick(matches[activeIdx]);
      else if (q && !exactMatch) addCustom(value, defaultCategory);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showAddRow = !!q && !exactMatch;

  return (
    <div ref={wrapRef} style={{ flex: 1, position: "relative" }}>
      <input
        type="text"
        value={value || ""}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Rechercher un exercice…"
        style={{ ...input(), borderRadius: 10, padding: "6px 10px", fontWeight: 500, width: "100%" }}
      />
      <Popover
        anchorRef={wrapRef}
        open={open && (matches.length > 0 || showAddRow)}
        onClose={close}
        matchAnchorWidth
        maxHeight={280}
        role="listbox"
        style={{
          background: T.white, border: "none", borderRadius: 12,
          boxShadow: "var(--elev-overlay)", padding: 6, fontFamily: "var(--font-sans)",
        }}
      >
        <>
          {matches.map((m, i) => {
            const cat = CATEGORIES.find(c => c.id === m.category) || CATEGORIES[4];
            const active = i === activeIdx;
            const isFav = m._fav;
            return (
              <div
                key={m.name}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIdx(i)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  width: "100%", padding: "4px 6px 4px 8px", borderRadius: "var(--radius-card)",
                  background: active ? FIELD_BG : "transparent",
                }}
              >
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); pick({ name: m.name, category: m.category }); }}
                  style={{
                    flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8,
                    padding: "4px 4px", border: "none", background: "transparent",
                    cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    color: T.text, fontSize:12,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.name}
                    {m.custom && <span style={{ color: T.textSub, fontSize: 12, marginLeft: 6, fontWeight: 400 }}>(perso)</span>}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 500,
                    color: cat.color, background: `${cat.color}1F`,
                    padding: "2px 9px", borderRadius: 999, flexShrink: 0,
                  }}>{cat.label}</span>
                </button>
                <button
                  type="button"
                  title={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
                  onMouseDown={(e) => { e.preventDefault(); toggleFav(m.name); }}
                  style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 22, height: 22, border: "none", background: "transparent",
                    cursor: "pointer", borderRadius: "var(--radius-field)", flexShrink: 0,
                    color: isFav ? PALETTE.yellow : T.textSub,
                  }}
                >
                  <Star size={12} strokeWidth={1.75} fill={isFav ? PALETTE.yellow : "none"} />
                </button>
                {m.custom ? (
                  <button
                    type="button"
                    title="Supprimer cet exercice"
                    onMouseDown={(e) => { e.preventDefault(); deleteCustom(m.name); }}
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 22, height: 22, border: "none", background: "transparent",
                      cursor: "pointer", borderRadius: "var(--radius-field)", flexShrink: 0, color: T.textSub,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = T.red; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = T.textSub; }}
                  >
                    <Trash2 size={12} strokeWidth={1.75} />
                  </button>
                ) : (
                  <button
                    type="button"
                    title="Masquer cet exercice"
                    onMouseDown={(e) => { e.preventDefault(); hideItem(m.name); }}
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 22, height: 22, border: "none", background: "transparent",
                      cursor: "pointer", borderRadius: "var(--radius-field)", flexShrink: 0, color: T.textSub,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = T.text; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = T.textSub; }}
                  >
                    <EyeOff size={12} strokeWidth={1.75} />
                  </button>
                )}
              </div>
            );
          })}
          {showAddRow && (
            <>
              {/* Le filet qui sépare la liste de l'ajout est un élément à part,
                  et non un `borderTop` posé sur le bouton : le bouton porte déjà
                  `border: none`, et React refuse qu'un raccourci et sa forme
                  longue changent ensemble d'un rendu à l'autre. */}
              {matches.length > 0 && (
                <div style={{ height: 1, background: HAIRLINE, margin: "4px 0" }} />
              )}
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); addCustom(value, defaultCategory); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "6px 10px", border: "none",
                  background: "transparent", cursor: "pointer", borderRadius: 8,
                  color: T.text, fontSize:12, fontFamily: "inherit", textAlign: "left",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = FIELD_BG; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <Plus size={12} strokeWidth={2} />
                Ajouter « {value} » comme nouvel exercice
              </button>
            </>
          )}
          {(hiddenExercises || []).length > 0 && (
            <div style={{ borderTop: `1px solid ${HAIRLINE}`, marginTop: 4, padding: "8px 10px 4px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: T.textSub }}>
              <span>{(hiddenExercises || []).length} masqué{(hiddenExercises || []).length > 1 ? "s" : ""}</span>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setHiddenExercises?.([]); }}
                style={{
                  border: "none", background: "transparent", cursor: "pointer",
                  color: T.textSub, fontSize:12, fontWeight: 500, fontFamily: "inherit",
                  padding: "2px 6px", borderRadius: 8,
                }}
              >
                Tout réafficher
              </button>
            </div>
          )}
        </>
      </Popover>
    </div>
  );
}

function DateField({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const btnRef = React.useRef(null);
  const [viewDate, setViewDate] = useState(() => {
    const d = value ? new Date(value + "T00:00:00") : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
  });
  // Placement et fermeture : Popover. Le calendrier suit son déclencheur au
  // défilement au lieu de se fermer, et sa hauteur se borne à la place réelle.
  const close = React.useCallback(() => setOpen(false), []);

  const label = value
    ? new Date(value + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
    : "Choisir…";

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...input(),
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          cursor: "pointer",
          textAlign: "left",
          color: value ? T.text : T.textSub,
          background: open ? FIELD_BG : T.white,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <Calendar size={13} strokeWidth={1.75} color={T.textSub} />
      </button>
      <Popover anchorRef={btnRef} open={open} onClose={close} maxHeight={360}>
        <MiniCalendar
          value={value}
          viewDate={viewDate}
          setViewDate={setViewDate}
          onPick={(iso) => { onChange(iso); setOpen(false); }}
        />
      </Popover>
    </div>
  );
}

function MiniCalendar({ value, viewDate, setViewDate, onPick }) {
  const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const WD = ["L", "M", "M", "J", "V", "S", "D"];
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const dow = first.getDay();
  const lead = dow === 0 ? 6 : dow - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const selected = value ? new Date(value + "T00:00:00") : null;
  const todayISO = (() => { const d = new Date(); return toISO(d); })();

  const goPrev = () => setViewDate(new Date(year, month - 1, 1));
  const goNext = () => setViewDate(new Date(year, month + 1, 1));

  return (
    <div style={{
      width: 280, background: T.white, border: "none", borderRadius: "var(--radius-modal)",
      boxShadow: "var(--elev-overlay)", padding: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button type="button" onClick={goPrev}
          style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: "transparent", color: T.textSub, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = FIELD_BG; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
          <ChevronDown size={14} style={{ transform: "rotate(90deg)" }} />
        </button>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{MONTHS[month]} {year}</div>
        <button type="button" onClick={goNext}
          style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: "transparent", color: T.textSub, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = FIELD_BG; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
          <ChevronDown size={14} style={{ transform: "rotate(-90deg)" }} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {WD.map((w, i) => (
          <div key={i} style={{ fontSize: 10, color: T.textSub, textAlign: "center", padding: "4px 0", fontWeight: 500 }}>{w}</div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const iso = toISO(d);
          const isSel = selected && toISO(selected) === iso;
          const isToday = iso === todayISO;
          return (
            <button key={i} type="button" onClick={() => onPick(iso)}
              style={{
                width: "100%", aspectRatio: "1 / 1",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 500,
                color: isSel ? "#fff" : T.text,
                background: isSel ? T.text : "transparent",
                border: isToday && !isSel ? `1px solid ${T.border}` : "none",
                borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                transition: "background .1s ease",
              }}
              onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = FIELD_BG; }}
              onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SetInput({ value, onChange, placeholder, small }) {
  return (
    <input
      type="number" inputMode="decimal" step="any"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      /* Posé sur le bloc d'exercice, lui-même déjà en aplat : le champ ressort
         donc en BLANC, l'inverse de la règle habituelle. */
      style={{
        flex: small ? "0 0 64px" : 1, minWidth: 0,
        padding: "6px 12px", borderRadius: 999,
        border: "none", fontSize: 12,
        fontFamily: "inherit", outline: "none", color: T.text,
        background: DA_FIELD_BG, fontVariantNumeric: "tabular-nums",
      }}
    />
  );
}

