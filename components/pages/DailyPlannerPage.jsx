"use client";

import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useFirstLoad } from "@/lib/hooks/useFirstLoad";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { backdropDismiss } from "@/lib/hooks/useBackdropDismiss";
import { useUndo } from "@/lib/contexts/UndoContext";
import { t, useLang } from "@/lib/i18n";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { TimeField } from "./AgendaDateFields";
import MiniCalendar from "@/components/ui/MiniCalendar";
import { RPG_STORAGE_KEY, RPG_CLOUD_KEY, DEFAULT_CATEGORIES, CatIcon, habitCategoryIds, CATEGORY_PALETTE } from "@/lib/lifeRpgCategories";
import {
  Plus, Check, Trash2,
  Battery, Flame, Clock, MapPin, Target as TargetIcon, X, Pencil,
  StickyNote, ChevronDown,
  // Icônes pour les habitudes
  Dumbbell, BookOpen, Brain, Footprints, Bike, Waves, PenLine, BedDouble, AlarmClock,
  Droplets, Coffee, Apple, Salad, ShoppingCart, GraduationCap, TrendingUp,
  Music, Sparkles as Sparkle, Wallet, Code as CodeIcon, Users, ShowerHead,
  Pill, Dog, Sprout, Wind, Sun, Star, Mic, Utensils, Car,
  // Librairie d'icônes additionnelles pour le picker
  Heart, Smile, Moon, Cloud, CloudRain, Snowflake, Leaf, TreePine, Flower, Flower2,
  Cat, Bird, Fish, Rabbit, Squirrel, Turtle,
  Activity, HeartPulse, Stethoscope, Syringe, Bandage, Eye,
  Trophy, Medal, Award, Crown, Gem, Diamond, Gift,
  Pizza, Sandwich, Cookie, IceCreamCone, IceCreamBowl, Cake, Beef, Egg, Carrot, Cherry, Grape, Wine, Beer, CupSoda, Milk, Soup,
  Tent, Mountain, MountainSnow, Trees, TreePalm, Sailboat, Plane, TrainFront, Bus, Truck, Rocket,
  Camera, Film, Tv, Gamepad2, Headphones, Radio, Guitar,
  Paintbrush, Palette, Scissors, Hammer, Wrench, Cog, Settings,
  Laptop, Smartphone, Keyboard, Monitor, Printer, Server, Database,
  FileText, Notebook, NotebookPen, Folder, Archive, Library, Newspaper, BookMarked, BookOpenCheck,
  Lightbulb, Zap, Battery as BatteryIcon, Plug, Atom, FlaskConical, TestTube, Microscope, Telescope, Globe,
  Briefcase, Building, Building2, House, Bed,
  Map, Compass, Navigation, Anchor, LifeBuoy, Umbrella,
  ShieldCheck, Shield, Lock, Key, Bell, BellRing, Mail, MessageCircle, Phone, PhoneCall, Video,
  DollarSign, Euro, PiggyBank, CreditCard, Receipt, Banknote, Coins,
  Calendar, CalendarCheck, CalendarDays, Timer, Hourglass, Watch,
  Hand, ThumbsUp, HandHeart, Handshake, PartyPopper, Baby,
  Skull, Ghost, Bone, BicepsFlexed,
} from "lucide-react";

import { T } from "@/lib/ui/tokens";
import { vignette } from "@/lib/ui/color";
import { CARD, StepperPill, FIELD_BG } from "@/components/ui/da";
import Popover from "@/components/ui/Popover";
import { FIELD_BG as DA_FIELD_BG, WRITING_BG as DA_WRITING_BG, HAIRLINE as DA_HAIRLINE } from "@/lib/ui/tokens";

/* Surface secondaire (pastilles d'icône, champs, aplats internes). L'ancien
   `T.bg` local pointait sur le gris de survol pour ne pas être blanc ; la page
   étant désormais POSÉE sur le gris du shell, un gris opaque de plus par-dessus
   ferait un bloc dans le bloc. `FIELD_BG` est un voile d'encre : il s'assombrit
   ou s'éclaircit tout seul avec la surface qui le porte. */
const SURFACE = FIELD_BG;

/* ─────────────── Helpers de style du formulaire (alignés sur l'Agenda) ─────────────── */
// Ligne de formulaire : icône à gauche + contenu, comme la fiche d'événement du calendrier.
function FormRow({ icon: Icon, children, top = false, iconColor }) {
  return (
    <div style={{ display: "flex", gap: 18, alignItems: top ? "flex-start" : "center", padding: "6px 0", minHeight: 42 }}>
      <div style={{ width: 24, flexShrink: 0, display: "flex", justifyContent: "center", paddingTop: top ? 8 : 0 }}>
        <Icon size={20} strokeWidth={1.9} color={iconColor || T.textMut} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
// Champ texte sans bordure (souligné par la ligne, pas de boîte).
const rowInp = { width: "100%", border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 14, color: T.text, padding: "5px 0", boxSizing: "border-box" };
/* Boutons : métrique de la nouvelle DA — 12 px Medium, 32 px de haut, pastille
   pleine sans contour pour l'action principale. Le blanc en dur a disparu : sur
   l'aplat `T.text`, qui s'éclaircit en thème sombre, il devenait invisible. */
const topIconBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 32, height: 32, borderRadius: 999, border: "none", background: "transparent",
  color: T.textMut, cursor: "pointer", fontFamily: "inherit",
  transition: "background-color 120ms ease, color 120ms ease",
};
const pillBtn = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "8px 16px", minHeight: 34, borderRadius: 999,
  border: "none", background: DA_FIELD_BG, color: T.text,
  fontSize: 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
};
const ghostBtn = () => ({
  display: "inline-flex", alignItems: "center",
  padding: "8px 16px", minHeight: 34, borderRadius: 999,
  border: "none", background: DA_FIELD_BG, color: T.text,
  fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
});
const primaryBtn = (small = false) => ({
  display: "inline-flex", alignItems: "center",
  padding: "8px 16px", minHeight: 34, borderRadius: 999,
  border: "none", background: T.text, color: T.textInverted,
  fontSize: small ? 12 : 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
});

const STORAGE_PLANNER = "tr4de_daily_planner";
export const STORAGE_HABITS = "tr4de_habits";
export const STORAGE_HABITS_HISTORY = "tr4de_habits_history";
// Clés cloud (Supabase) des habitudes — partagées avec la page « Vie RPG »
// pour que les deux pages lisent/écrivent la même source de vérité.
export const CLOUD_HABITS = "habits";
export const CLOUD_HABITS_HISTORY = "habits_history";

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtDateParts = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return {
    weekday: capFirst(d.toLocaleDateString("fr-FR", { weekday: "long" })),
    day: d.getDate(),
    month: capFirst(d.toLocaleDateString("fr-FR", { month: "long" })),
    year: d.getFullYear(),
  };
};

// Auto-icône : devine une icône pertinente à partir du nom de l'habitude.
const ICON_RULES = [
  { re: /(médit|meditat|yoga|pleine conscience|respir|breath)/i, Icon: Brain },
  { re: /(sport|run|jog|fitness|gym|muscu|entr|étirement|etirement|stretch)/i, Icon: Dumbbell },
  { re: /(marche|walk|balade|promenade)/i, Icon: Footprints },
  { re: /(vélo|velo|bike|cycle)/i, Icon: Bike },
  { re: /(nat(a|er)|swim|pisc)/i, Icon: Waves },
  { re: /(lect|livre|read|book)/i, Icon: BookOpen },
  { re: /(journal|écri|ecri|write|blog)/i, Icon: PenLine },
  { re: /(sommeil|dormi|sleep|coucher)/i, Icon: BedDouble },
  { re: /(lever|réveil|reveil|wake)/i, Icon: AlarmClock },
  { re: /(eau|boire|hydra|water)/i, Icon: Droplets },
  { re: /(café|cafe|coffee|thé|the|tea)/i, Icon: Coffee },
  { re: /(diet|régime|regime|nutri)/i, Icon: Utensils },
  { re: /(sain|healthy|légume|legume|salade|manger|food|repas|brocoli|veget)/i, Icon: Salad },
  { re: /(éloquence|eloquence|oratoire|prise de parole|speaking|discours)/i, Icon: Mic },
  { re: /(salle|gym|muscu|musculation)/i, Icon: Dumbbell },
  { re: /(fruit|pomme|apple|banane)/i, Icon: Apple },
  { re: /(market|course|épicerie|epicerie|shopping|groceries)/i, Icon: ShoppingCart },
  { re: /(étude|etude|study|cours|apprend|learn)/i, Icon: GraduationCap },
  { re: /(trading|marché|marche|bourse|chart)/i, Icon: TrendingUp },
  { re: /(musique|guitare|piano|music)/i, Icon: Music },
  { re: /(argent|budget|money|finance)/i, Icon: Wallet },
  // "Code de la route" / permis : icône voiture (priorité sur le match `code` générique).
  { re: /(code de la route|permis|conduite|driving)/i, Icon: Car },
  { re: /(code|dev|program)/i, Icon: CodeIcon },
  { re: /(famille|family|appel|call)/i, Icon: Users },
  { re: /(douche|shower|bain|hygiène|hygiene)/i, Icon: ShowerHead },
  { re: /(vitamin|suppl|complément|complement|médoc|medoc)/i, Icon: Pill },
  { re: /(chien|dog)/i, Icon: Dog },
  { re: /(jardin|plant)/i, Icon: Sprout },
  { re: /(prière|priere|pray|gratitude|mindful)/i, Icon: Sparkle },
  { re: /(soleil|sun|matin)/i, Icon: Sun },
  { re: /(air|vent|wind)/i, Icon: Wind },
];
function autoIcon(name) {
  if (!name) return Star;
  for (const r of ICON_RULES) if (r.re.test(name)) return r.Icon;
  return Star;
}

// Librairie d'icônes choisissables manuellement (clé stable → composant).
// Organisée par thème pour le picker.
const ICON_LIBRARY = {
  // Sport / corps
  dumbbell: Dumbbell, biceps: BicepsFlexed, footprints: Footprints, bike: Bike, waves: Waves,
  bone: Bone, activity: Activity, heartpulse: HeartPulse, mountain: Mountain, mountainsnow: MountainSnow,
  // Mental / bien-être
  brain: Brain, sparkle: Sparkle, heart: Heart, smile: Smile, sun: Sun, moon: Moon, cloud: Cloud,
  cloudrain: CloudRain, snowflake: Snowflake, wind: Wind, flame: Flame, eye: Eye,
  // Lecture / écriture / études
  book: BookOpen, bookmarked: BookMarked, bookcheck: BookOpenCheck, library: Library,
  newspaper: Newspaper, notebook: Notebook, notebookpen: NotebookPen, pen: PenLine,
  file: FileText, folder: Folder, archive: Archive, graduation: GraduationCap,
  // Sommeil / maison
  bed: BedDouble, bed2: Bed, alarm: AlarmClock, house: House, building: Building, building2: Building2,
  shower: ShowerHead,
  // Boisson / nourriture
  droplets: Droplets, coffee: Coffee, cupsoda: CupSoda, milk: Milk, wine: Wine, beer: Beer,
  apple: Apple, cherry: Cherry, grape: Grape, carrot: Carrot, salad: Salad, soup: Soup,
  pizza: Pizza, sandwich: Sandwich, cookie: Cookie, cake: Cake, icecream: IceCreamCone,
  icecreambowl: IceCreamBowl, beef: Beef, egg: Egg, utensils: Utensils,
  // Santé
  pill: Pill, stethoscope: Stethoscope, syringe: Syringe, bandage: Bandage,
  // Travail / argent
  briefcase: Briefcase, wallet: Wallet, dollar: DollarSign, euro: Euro, piggy: PiggyBank,
  card: CreditCard, receipt: Receipt, banknote: Banknote, coins: Coins, trend: TrendingUp,
  // Tech / dev
  code: CodeIcon, laptop: Laptop, smartphone: Smartphone, keyboard: Keyboard,
  monitor: Monitor, printer: Printer, server: Server, database: Database,
  // Créatif / loisirs
  music: Music, mic: Mic, guitar: Guitar, headphones: Headphones, radio: Radio,
  camera: Camera, film: Film, tv: Tv, gamepad: Gamepad2,
  paint: Paintbrush, palette: Palette, scissors: Scissors,
  // Outils
  hammer: Hammer, wrench: Wrench, cog: Cog, settings: Settings, plug: Plug,
  // Science
  atom: Atom, flask: FlaskConical, testtube: TestTube, microscope: Microscope,
  telescope: Telescope, globe: Globe, lightbulb: Lightbulb, zap: Zap, battery: BatteryIcon,
  // Voyage / nature
  tent: Tent, trees: Trees, treepalm: TreePalm, sprout: Sprout, leaf: Leaf,
  flower: Flower, flower2: Flower2, sailboat: Sailboat, plane: Plane, train: TrainFront,
  bus: Bus, truck: Truck, car: Car, rocket: Rocket, map: Map, compass: Compass,
  navigation: Navigation, anchor: Anchor, lifebuoy: LifeBuoy, umbrella: Umbrella,
  // Animaux
  dog: Dog, cat: Cat, bird: Bird, fish: Fish, rabbit: Rabbit, squirrel: Squirrel, turtle: Turtle,
  // Social / communication
  users: Users, hand: Hand, thumbsup: ThumbsUp, handheart: HandHeart, handshake: Handshake,
  party: PartyPopper, baby: Baby, bell: Bell, bellring: BellRing,
  mail: Mail, message: MessageCircle, phone: Phone, phonecall: PhoneCall, video: Video,
  // Récompenses
  trophy: Trophy, medal: Medal, award: Award, crown: Crown, gem: Gem, diamond: Diamond, gift: Gift,
  // Sécurité
  shield: Shield, shieldcheck: ShieldCheck, lock: Lock, key: Key,
  // Temps
  clock: Clock, calendar: Calendar, calendarcheck: CalendarCheck, calendardays: CalendarDays,
  timer: Timer, hourglass: Hourglass, watch: Watch,
  // Shopping / divers
  cart: ShoppingCart, target: TargetIcon, star: Star, skull: Skull, ghost: Ghost,
};

export function iconFor(h) {
  if (h && h.icon && ICON_LIBRARY[h.icon]) return ICON_LIBRARY[h.icon];
  return autoIcon(h?.name);
}

// Auto-description : si le nom match un thème connu, suggère une description.
const DESC_RULES = [
  { re: /(lect|livre|read|book)/i,                          desc: "Lire 20 minutes" },
  { re: /(journal|écri|ecri|write|blog)/i,                  desc: "Noter pensées et ressentis du jour" },
  { re: /(diet|régime|regime|nutri|sain|healthy|food|repas)/i, desc: "Manger équilibré et respecter les portions" },
  { re: /(salle|gym|muscu|musculation)/i,                   desc: "Séance de musculation (45-60 min)" },
  { re: /(sport|run|jog|fitness|entr)/i,                    desc: "Séance cardio / entraînement" },
  { re: /(éloquence|eloquence|oratoire|prise de parole|speaking|discours)/i, desc: "S'entraîner à parler à voix haute 10 min" },
  { re: /(sommeil|dormi|sleep|coucher)/i,                   desc: "Dormir au moins 7 à 8 heures" },
  { re: /(médit|meditat|yoga|pleine conscience)/i,          desc: "Méditation 10 minutes" },
  { re: /(marche|walk|balade|promenade)/i,                  desc: "Marcher 30 minutes en extérieur" },
  { re: /(vélo|velo|bike|cycle)/i,                          desc: "Sortie vélo" },
  { re: /(nat(a|er)|swim|pisc)/i,                           desc: "Séance de natation" },
  { re: /(eau|boire|hydra|water)/i,                         desc: "Boire 2L d'eau dans la journée" },
  { re: /(café|cafe|coffee)/i,                              desc: "Limiter la caféine" },
  { re: /(étude|etude|study|cours|apprend|learn)/i,         desc: "Session d'étude 45 min" },
  { re: /(trading|marché|marche|bourse|chart)/i,            desc: "Revue de marché & journal de trading" },
  { re: /(musique|guitare|piano|music)/i,                   desc: "Pratique musicale" },
  { re: /(nettoya|clean|rang|ménage|menage)/i,              desc: "Mise en ordre de l'espace" },
  { re: /(argent|budget|money|finance)/i,                   desc: "Revue du budget" },
  { re: /(code de la route|permis|conduite|driving)/i,      desc: "Réviser le code de la route" },
  { re: /(code|dev|program)/i,                              desc: "Session de code dédiée" },
  { re: /(famille|family|appel|call)/i,                     desc: "Appeler un proche" },
  { re: /(étirement|etirement|stretch)/i,                   desc: "Étirements 10 minutes" },
  { re: /(respir|breath)/i,                                 desc: "Exercices de respiration" },
  { re: /(prière|priere|pray|gratitude)/i,                  desc: "Moment de gratitude" },
];
export function autoDescription(name) {
  if (!name) return "";
  for (const r of DESC_RULES) if (r.re.test(name)) return r.desc;
  return "";
}

export const defaultHabits = () => {
  const mk = (id, name) => ({ id, name, description: autoDescription(name) });
  return [
    mk(1, "Lecture"),
    mk(2, "Journaling"),
    mk(3, "Diet"),
    mk(4, "Salle de sport"),
    mk(5, "Éloquence"),
    mk(6, "Sommeil"),
    mk(7, "Code de la route"),
  ];
};

// === Helpers semaine ===
// Lundi = début de semaine. Retourne l'ISO du lundi de la semaine contenant `iso`.
const weekStartIso = (iso) => {
  const d = new Date(iso + "T00:00:00");
  const dow = d.getDay(); // 0 = dim, 1 = lun, ..., 6 = sam
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const addDaysIso = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtShortDay = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return capFirst(d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", ""));
};
const fmtRange = (startIso, endIso) => {
  const s = new Date(startIso + "T00:00:00");
  const e = new Date(endIso + "T00:00:00");
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const sM = capFirst(s.toLocaleDateString("fr-FR", { month: "short" })).replace(".", "");
  const eM = capFirst(e.toLocaleDateString("fr-FR", { month: "short" })).replace(".", "");
  if (sameMonth) return `${s.getDate()} – ${e.getDate()} ${sM} ${e.getFullYear()}`;
  return `${s.getDate()} ${sM} – ${e.getDate()} ${eM} ${e.getFullYear()}`;
};

export default function DailyPlannerPage() {
  useLang();
  // Mobile : on centre le bloc « Habitudes du jour » avec une largeur max.
  const isMobile = useIsMobile();
  const [dateKey, setDateKey] = useState(() => todayKey());

  // Planner (tâches, objectifs, énergie) par jour — synchronisé Supabase
  const [plannerStore, setPlannerStore, plannerReady] = useCloudState(STORAGE_PLANNER, "daily_planner", {});
  const day = plannerStore[dateKey] || { tasks: [], goals: [], energy: 7 };
  const updateDay = (patch) => setPlannerStore(prev => ({ ...prev, [dateKey]: { ...day, ...patch } }));

  // Habits — synchronisées Supabase
  const [habits, setHabits] = useCloudState(STORAGE_HABITS, CLOUD_HABITS, defaultHabits());
  const [habitHistory, setHabitHistory] = useCloudState(STORAGE_HABITS_HISTORY, CLOUD_HABITS_HISTORY, {});

  // Catégories (« cartes ») de la page Vie RPG — en lecture seule ici, pour
  // permettre de rattacher optionnellement une habitude à une carte. L'édition
  // des catégories elles-mêmes se fait dans la page Vie RPG.
  const [rpgState] = useCloudState(RPG_STORAGE_KEY, RPG_CLOUD_KEY, { categories: DEFAULT_CATEGORIES });
  const rpgCategories = Array.isArray(rpgState.categories) ? rpgState.categories : DEFAULT_CATEGORIES;

  // Couleur d'une habitude = couleur de sa 1re carte « Vie RPG » rattachée
  // (s'il y en a une). Sert à colorer la pastille d'icône et la case à cocher.
  const catColorMap = useMemo(() => {
    const m = {};
    for (const c of rpgCategories) m[c.id] = c.color;
    return m;
  }, [rpgCategories]);
  const habitColor = (h) => {
    for (const id of habitCategoryIds(h)) if (catColorMap[id]) return catColorMap[id];
    // Repli : couleur stable dérivée de l'id, pour qu'une habitude sans carte
    // rattachée reste colorée (et garde la même couleur d'un rendu à l'autre).
    const n = Math.abs(Number(h?.id) || String(h?.id || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0));
    return CATEGORY_PALETTE[n % CATEGORY_PALETTE.length];
  };

  const { pushUndo } = useUndo();
  const [dragHabitId, setDragHabitId] = useState(null);
  const [dragOverHabitId, setDragOverHabitId] = useState(null);

  const reorderHabit = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setHabits(prev => {
      const arr = [...prev];
      const sIdx = arr.findIndex(h => h.id === sourceId);
      const tIdx = arr.findIndex(h => h.id === targetId);
      if (sIdx < 0 || tIdx < 0) return prev;
      const [moved] = arr.splice(sIdx, 1);
      arr.splice(tIdx, 0, moved);
      return arr;
    });
  };

  const toggleHabit = (habitId) => {
    const snapDate = dateKey;
    setHabitHistory(prev => {
      const h = { ...(prev[habitId] || {}) };
      if (h[snapDate]) delete h[snapDate]; else h[snapDate] = true;
      return { ...prev, [habitId]: h };
    });
    const toggle = () => setHabitHistory(prev => {
      const h = { ...(prev[habitId] || {}) };
      if (h[snapDate]) delete h[snapDate]; else h[snapDate] = true;
      return { ...prev, [habitId]: h };
    });
    pushUndo({ label: "Habitude", undo: async () => toggle(), redo: async () => toggle() });
  };
  const removeHabit = (id) => {
    const snapHabit = habits.find(h => h.id === id);
    const snapHistory = habitHistory[id];
    setHabits(prev => prev.filter(h => h.id !== id));
    setHabitHistory(prev => { const n = { ...prev }; delete n[id]; return n; });
    if (snapHabit) pushUndo({
      label: "Suppression de l'habitude",
      undo: async () => {
        setHabits(prev => [...prev, snapHabit]);
        if (snapHistory) setHabitHistory(prev => ({ ...prev, [id]: snapHistory }));
      },
      redo: async () => {
        setHabits(prev => prev.filter(h => h.id !== id));
        setHabitHistory(prev => { const n = { ...prev }; delete n[id]; return n; });
      },
    });
  };

  // Habit form (add + edit)
  const [habitFormOpen, setHabitFormOpen] = useState(false);
  const [editingHabitId, setEditingHabitId] = useState(null);
  const emptyHabit = { name: "", description: "", time: "", location: "", icon: "", attributes: [] };
  const [habitDraft, setHabitDraft] = useState(emptyHabit);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const iconPickerAnchor = React.useRef(null);
  // Glisser-déposer du formulaire (comme le calendrier)
  const [modalPos, setModalPos] = useState({ x: 0, y: 0 });
  const [modalDragging, setModalDragging] = useState(false);
  const modalDragRef = React.useRef(null);
  const openCreateHabit = () => { setHabitDraft(emptyHabit); setEditingHabitId(null); setIconPickerOpen(false); setModalPos({ x: 0, y: 0 }); setHabitFormOpen(true); };
  const openEditHabit = (h) => { setHabitDraft({ name: h.name, description: h.description || "", time: h.time || "", location: h.location || "", icon: h.icon || "", attributes: habitCategoryIds(h) }); setEditingHabitId(h.id); setIconPickerOpen(false); setModalPos({ x: 0, y: 0 }); setHabitFormOpen(true); };
  const startModalDrag = (e) => {
    if (e.target.closest("button")) return; // pas de drag en cliquant un bouton
    e.preventDefault();
    const start = { mx: e.clientX, my: e.clientY, x: modalPos.x, y: modalPos.y };
    modalDragRef.current = start;
    setModalDragging(true);
    const onMove = (ev) => {
      const st = modalDragRef.current;
      if (!st) return;
      setModalPos({ x: st.x + (ev.clientX - st.mx), y: st.y + (ev.clientY - st.my) });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      modalDragRef.current = null;
      setModalDragging(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const saveHabit = () => {
    const nm = habitDraft.name.trim();
    if (!nm) return;
    const desc = habitDraft.description.trim() || autoDescription(nm);
    const iconKey = habitDraft.icon && ICON_LIBRARY[habitDraft.icon] ? habitDraft.icon : "";
    const attributes = Array.isArray(habitDraft.attributes) ? habitDraft.attributes.filter(Boolean) : [];
    if (editingHabitId) {
      // `attribute: undefined` retire l'ancien champ unique hérité (rétrocompat).
      setHabits(prev => prev.map(h => h.id === editingHabitId ? { ...h, name: nm, description: desc, time: habitDraft.time, location: habitDraft.location.trim(), icon: iconKey, attributes, attribute: undefined } : h));
    } else {
      setHabits(prev => [...prev, { id: Date.now(), name: nm, description: desc, time: habitDraft.time, location: habitDraft.location.trim(), icon: iconKey, attributes }]);
    }
    setHabitFormOpen(false); setHabitDraft(emptyHabit); setEditingHabitId(null); setIconPickerOpen(false);
  };
  const closeHabitForm = () => { setHabitFormOpen(false); setHabitDraft(emptyHabit); setEditingHabitId(null); setIconPickerOpen(false); };
  const deleteHabitFromForm = () => { if (editingHabitId != null) removeHabit(editingHabitId); closeHabitForm(); };

  const shiftDay = (delta) => {
    const d = new Date(dateKey + "T00:00:00");
    d.setDate(d.getDate() + delta);
    setDateKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  };

  // Sélecteur de date (popover calendrier) sur le libellé du jour.
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  // Ancre du sélecteur de date, désormais portalisé hors de la barre d'outils.
  const dayPickerAnchor = React.useRef(null);
  const pickDate = (d) => {
    setDateKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  };

  const energyColor = day.energy >= 8 ? T.green : day.energy >= 5 ? T.amber : T.red;

  // --- Tâches du jour ---
  const tasks = day.tasks || [];
  const [newTaskId, setNewTaskId] = useState(null);
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const addTask = () => {
    const id = Date.now();
    updateDay({ tasks: [...tasks, { id, text: "", done: false, note: "" }] });
    setNewTaskId(id);
  };
  const toggleTask = (id) => updateDay({ tasks: tasks.map(p => p.id === id ? { ...p, done: !p.done } : p) });
  const updateTaskText = (id, text) => updateDay({ tasks: tasks.map(p => p.id === id ? { ...p, text } : p) });
  const updateTaskNote = (id, note) => updateDay({ tasks: tasks.map(p => p.id === id ? { ...p, note } : p) });
  const removeTask = (id) => updateDay({ tasks: tasks.filter(p => p.id !== id) });
  const taskDoneCount = tasks.filter(p => p.done).length;

  /* Journée et habitudes viennent de la même hydratation : les deux clés sont
     passées pour qu'un cache partiel (habitudes en place, journée absente)
     n'ouvre PAS sur un squelette — il y a déjà de quoi peindre. */
  if (useFirstLoad(plannerReady, STORAGE_PLANNER, STORAGE_HABITS)) {
    /* Sélecteur de jour à gauche (`StepperPill`), avancement et ajout à droite. */
    return <PageSkeleton variant="list" label={t("nav.dailyPlanner")} gap={24} toolbarLeft={[210]} toolbarRight={[96, 140]} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: "var(--font-sans)" }} className="anim-1">
      {/* ═══ 1. BARRE DU JOUR ═══
          Pas de titre de page — comme le dashboard et le calendrier, la page se
          présente par son contenu. Le sélecteur de jour OUVRE la ligne, à gauche :
          c'est lui qui dit ce qu'on regarde, et tout le reste de la page en
          dépend. L'avancement du jour et l'ajout ferment la ligne à droite.
          La date passe par la brique commune de navigation de période
          (`StepperPill`, celle du calendrier et de l'agenda) — le libellé ouvre
          toujours le sélecteur de date. Le filet de 1 px qui poussait le compteur
          vers la droite a disparu avec elle. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div ref={dayPickerAnchor} style={{ position: "relative", display: "inline-flex" }}>
          <StepperPill
            label={(() => { const p = fmtDateParts(dateKey); return `${p.weekday} ${p.day} ${p.month}`; })()}
            onPrev={() => shiftDay(-1)}
            onNext={() => shiftDay(1)}
            onLabel={() => setDayPickerOpen((o) => !o)}
            labelTitle="Choisir une date"
            prevLabel="Jour précédent"
            nextLabel="Jour suivant"
          />
          {dayPickerOpen && (
            <MiniCalendar
              anchorRef={dayPickerAnchor}
              value={new Date(dateKey + "T00:00:00")}
              onSelect={pickDate}
              onClose={() => setDayPickerOpen(false)}
              align="left"
            />
          )}
        </div>
        <span style={{ marginLeft: "auto", fontSize: 13, color: T.textSub, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
          {habits.filter(h => habitHistory[h.id]?.[dateKey]).length}/{habits.length}
        </span>
        {/* Action principale de la page : une pilule LIBELLÉE, comme « Nouvelle
            séance » (Sport) ou « Nouvelle note » (Révisions). Le rond « + » muet
            d'avant obligeait à survoler pour savoir ce qu'il ajoutait — sur une
            page qui porte à la fois des habitudes et des tâches du jour, c'était
            une devinette. */}
        <button onClick={openCreateHabit}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", minHeight: 34, borderRadius: 999, border: "none", background: T.text, color: T.textInverted, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap" }}>
          <Plus size={14} strokeWidth={1.75} /> Nouvelle habitude
        </button>
        <div id="tr4de-page-header-slot" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 24, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Habitudes du jour */}
      <div style={isMobile ? { alignSelf: "center", width: "100%", maxWidth: 480 } : undefined}>

          {/* Formulaire ajout/edit */}
          {habitFormOpen && typeof document !== "undefined" && ReactDOM.createPortal(
            <div
              {...backdropDismiss(closeHabitForm)}
              style={{
                position: "fixed", inset: 0,
                background: "transparent",
                zIndex: 10000,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 16,
                animation: "fadeIn 140ms ease both",
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === "Escape") closeHabitForm(); if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveHabit(); }}
                style={{
                  background: T.white,
                  borderRadius: 12,
                  padding: 0,
                  width: "100%", maxWidth: 540,
                  maxHeight: "92vh",
                  overflow: "auto",
                  boxShadow: "var(--elev-overlay)",
                  fontFamily: "var(--font-sans)",
                  display: "flex", flexDirection: "column",
                  transform: `translate(${modalPos.x}px, ${modalPos.y}px)`,
                }}
              >
                {/* Barre du haut = poignée de déplacement (façon Sport) + boutons */}
                <div onMouseDown={startModalDrag} title="Glisser pour déplacer la fenêtre"
                  style={{
                    position: "relative",
                    padding: "10px 16px 0", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2,
                    cursor: "move", userSelect: "none",
                    borderTopLeftRadius: 12, borderTopRightRadius: 12,
                  }}>
                  {/* Poignée de déplacement (barre grise centrée) */}
                  <div style={{
                    position: "absolute", left: "50%", top: 7, transform: "translateX(-50%)",
                    width: 40, height: 4, borderRadius: 999,
                    background: modalDragging ? T.textMut : T.border,
                    transition: "background-color 120ms ease",
                  }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                    {editingHabitId != null && (
                      <button onMouseDown={(e) => e.stopPropagation()} onClick={deleteHabitFromForm} aria-label="Supprimer" title="Supprimer" style={topIconBtn}
                        onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; e.currentTarget.style.color = T.red; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMut; }}>
                        <Trash2 size={15} strokeWidth={1.9} />
                      </button>
                    )}
                    <button onMouseDown={(e) => e.stopPropagation()} onClick={closeHabitForm} aria-label="Fermer" title="Fermer" style={topIconBtn}
                      onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; e.currentTarget.style.color = T.text; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textMut; }}>
                      <X size={16} strokeWidth={1.9} />
                    </button>
                  </div>
                </div>

                {/* Corps : champs encadrés (ancien) + détails Calendar */}
                <div style={{ padding: "16px 24px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Nom — ligne soulignée (sans rectangle ni label) */}
                  <div>
                    <input type="text" value={habitDraft.name} onChange={(e) => setHabitDraft({ ...habitDraft, name: e.target.value })}
                      placeholder="Nom de l'habitude" autoFocus
                      style={{ width: "100%", boxSizing: "border-box", padding: "8px 2px", border: "none", borderRadius: 0, fontSize: 16, fontWeight: 500, outline: "none", fontFamily: "inherit", color: T.text, background: "transparent" }} />
                  </div>

                  {/* Icône — sélecteur en menu déroulant (style Calendar) */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 500, color: T.textSub, display: "block", marginBottom: 6 }}>
                      Icône <span style={{ color: T.textMut, fontWeight: 400 }}>· optionnel</span>
                    </label>
                    <div ref={iconPickerAnchor} data-menu-root style={{ position: "relative" }}>
                      <button type="button" onClick={() => setIconPickerOpen((o) => !o)} style={pillBtn}>
                        {(() => {
                          const PreviewIco = habitDraft.icon && ICON_LIBRARY[habitDraft.icon] ? ICON_LIBRARY[habitDraft.icon] : autoIcon(habitDraft.name?.trim() || "");
                          return <PreviewIco size={16} strokeWidth={1.9} color={T.text} />;
                        })()}
                        {habitDraft.icon ? "Icône choisie" : "Icône · auto"}
                        <ChevronDown size={14} color={T.textMut} style={{ marginLeft: 2 }} />
                      </button>
                      <Popover
                        anchorRef={iconPickerAnchor}
                        open={iconPickerOpen}
                        onClose={() => setIconPickerOpen(false)}
                        gap={4}
                        matchAnchorWidth
                        maxHeight={260}
                        style={{ background: T.white, border: "none", borderRadius: 12, padding: 10, boxShadow: "var(--elev-overlay)" }}
                      >
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(34px, 100%), 1fr))", gap: 6 }}>
                              {(() => {
                                const previewName = habitDraft.name?.trim() || "";
                                const AutoIco = autoIcon(previewName);
                                const isAuto = !habitDraft.icon;
                                return (
                                  <button type="button" onClick={() => { setHabitDraft({ ...habitDraft, icon: "" }); setIconPickerOpen(false); }}
                                    title="Auto (selon le nom)"
                                    style={{
                                      width: "100%", aspectRatio: "1 / 1",
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                      borderRadius: 12,
                                      border: "none",
                                      background: isAuto ? T.text : DA_FIELD_BG,
                                      color: isAuto ? T.textInverted : T.text,
                                      cursor: "pointer", padding: 0, position: "relative",
                                    }}>
                                    <AutoIco size={15} strokeWidth={1.75} />
                                    <span style={{ position: "absolute", bottom: -2, right: -2, fontSize: 10, background: isAuto ? T.white : T.text, color: isAuto ? T.text : T.textInverted, borderRadius: 6, padding: "1px 3px", lineHeight: 1, fontWeight: 600 }}>A</span>
                                  </button>
                                );
                              })()}
                              {Object.entries(ICON_LIBRARY).map(([key, IconCmp]) => {
                                const selected = habitDraft.icon === key;
                                return (
                                  <button key={key} type="button"
                                    onClick={() => { setHabitDraft({ ...habitDraft, icon: key }); setIconPickerOpen(false); }}
                                    title={key}
                                    style={{
                                      width: "100%", aspectRatio: "1 / 1",
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                      borderRadius: 12,
                                      border: "none",
                                      background: selected ? T.text : DA_FIELD_BG,
                                      color: selected ? T.textInverted : T.text,
                                      cursor: "pointer", padding: 0,
                                      transition: "background .12s ease, border-color .12s ease",
                                    }}
                                    onMouseEnter={(e) => { if (!selected) { e.currentTarget.style.background = SURFACE; } }}
                                    onMouseLeave={(e) => { if (!selected) { e.currentTarget.style.background = DA_FIELD_BG; } }}>
                                    <IconCmp size={15} strokeWidth={1.75} />
                                  </button>
                                );
                              })}
                          </div>
                        </>
                      </Popover>
                    </div>
                  </div>

                  {/* Heure + Lieu */}
                  <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 500, color: T.textSub, display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
                        <Clock size={11} strokeWidth={1.75} /> Heure
                      </label>
                      <TimeField value={habitDraft.time} onChange={(v) => setHabitDraft({ ...habitDraft, time: v })}
                        placeholder="Choisir l'heure"
                        triggerStyle={{ width: "100%", boxSizing: "border-box", padding: "9px 14px", border: "none", borderRadius: 999, fontSize: 13, color: T.text, background: DA_FIELD_BG, justifyContent: "space-between" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 500, color: T.textSub, display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
                        <MapPin size={11} strokeWidth={1.75} /> Lieu <span style={{ color: T.textMut, fontWeight: 400 }}>· optionnel</span>
                      </label>
                      <input type="text" value={habitDraft.location} onChange={(e) => setHabitDraft({ ...habitDraft, location: e.target.value })}
                        placeholder="ex. Bureau, salon…"
                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 14px", border: "none", borderRadius: 999, fontSize: 13, outline: "none", fontFamily: "inherit", color: T.text, background: DA_FIELD_BG }} />
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 500, color: T.textSub, display: "block", marginBottom: 6 }}>
                      Description <span style={{ color: T.textMut, fontWeight: 400 }}>· optionnel</span>
                    </label>
                    <textarea value={habitDraft.description} onChange={(e) => setHabitDraft({ ...habitDraft, description: e.target.value })}
                      placeholder="Pourquoi cette habitude ? Comment la déclencher ?"
                      rows={3}
                      style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", border: "none", borderRadius: 10, fontSize: 13, outline: "none", fontFamily: "inherit", color: T.text, background: DA_WRITING_BG, resize: "vertical", lineHeight: 1.5 }} />
                  </div>

                  {/* Objectifs de l'année — liens optionnels (plusieurs possibles) */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 500, color: T.textSub, display: "block", marginBottom: 6 }}>
                      {"Objectifs de l'année"} <span style={{ color: T.textMut, fontWeight: 400 }}>· optionnel · plusieurs possibles</span>
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {rpgCategories.map((c) => {
                        const sel = Array.isArray(habitDraft.attributes) ? habitDraft.attributes : [];
                        const active = sel.includes(c.id);
                        const toggle = () => setHabitDraft({ ...habitDraft, attributes: active ? sel.filter(x => x !== c.id) : [...sel, c.id] });
                        return (
                          <button key={c.id} type="button" onClick={toggle}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 16px", minHeight: 34, borderRadius: 999, border: "none", boxShadow: active ? `inset 0 0 0 1px ${c.color}` : "none", background: active ? `color-mix(in srgb, ${c.color} 10%, transparent)` : DA_FIELD_BG, color: active ? c.color : T.text, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                            {active
                              ? <Check size={13} strokeWidth={2.5} color={c.color} />
                              : <CatIcon name={c.icon} size={13} strokeWidth={1.9} color={T.textMut} />}
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 10, color: T.textMut, marginTop: 6, lineHeight: 1.4 }}>
                      {rpgCategories.length === 0
                        ? "Définis d'abord tes objectifs de l'année sur la page « Objectifs » pour y rattacher cette habitude."
                        : "Rattache cette habitude à un ou plusieurs objectifs de l'année (page « Objectifs ») : la cocher les fait progresser."}
                    </div>
                  </div>
                </div>

                {/* Pied */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "14px 24px", borderTop: `1px solid ${DA_HAIRLINE}` }}>
                  <button onClick={closeHabitForm} style={ghostBtn()}>Annuler</button>
                  <button onClick={saveHabit} disabled={!habitDraft.name?.trim()}
                    style={{ ...primaryBtn(true), opacity: habitDraft.name?.trim() ? 1 : 0.5, cursor: habitDraft.name?.trim() ? "pointer" : "not-allowed" }}>
                    {editingHabitId ? "Enregistrer" : "Ajouter"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* Liste des habitudes — dans une carte, comme toutes les listes des
              nouvelles pages (les trades, les comptes) : une seule carte porte
              toute la liste, ses lignes étant des rangées et non des objets
              autonomes. */}
          {habits.length === 0 ? (
            <div style={{ ...CARD, padding: "40px 24px", textAlign: "center", color: T.textMut, fontSize: 13 }}>Ajoute ta première habitude</div>
          ) : (
            <div style={{ ...CARD, padding: 8, display: "flex", flexDirection: "column", gap: 0 }}>
              {habits.map(h => {
                const done = !!(habitHistory[h.id] && habitHistory[h.id][dateKey]);
                const Ico = iconFor(h);
                const color = habitColor(h);
                return (
                  <div key={h.id}
                    draggable
                    onDragStart={(e) => {
                      setDragHabitId(h.id);
                      try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(h.id)); } catch {}
                    }}
                    onDragOver={(e) => {
                      if (!dragHabitId || dragHabitId === h.id) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverHabitId(h.id);
                    }}
                    onDragLeave={() => { if (dragOverHabitId === h.id) setDragOverHabitId(null); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      reorderHabit(dragHabitId, h.id);
                      setDragHabitId(null);
                      setDragOverHabitId(null);
                    }}
                    onDragEnd={() => { setDragHabitId(null); setDragOverHabitId(null); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 16px",
                      borderRadius: 12,
                      transition: "background .12s ease, box-shadow .12s ease",
                      opacity: dragHabitId === h.id ? 0.4 : 1,
                      boxShadow: dragOverHabitId === h.id ? `inset 0 2px 0 ${T.text}` : "none",
                      cursor: "grab",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = T.accentBg;
                      const del = e.currentTarget.querySelector("[data-habit-del]"); if (del) del.style.opacity = 1;
                      const ed = e.currentTarget.querySelector("[data-habit-edit]"); if (ed) ed.style.opacity = 1;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                      const del = e.currentTarget.querySelector("[data-habit-del]"); if (del) del.style.opacity = 0;
                      const ed = e.currentTarget.querySelector("[data-habit-edit]"); if (ed) ed.style.opacity = 0;
                    }}
                  >
                    {/* Vignette d'icône — celle des pages Focus et Sport,
                        tenue par `vignette` (lib/ui/color) : voile de la couleur
                        du sujet sur le disque, glyphe dans cette même couleur.
                        Une fois l'habitude cochée, elle retombe sur le gris
                        neutre. */}
                    <div style={{
                      width: 34, height: 34, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                      ...(done
                        ? { background: T.accentBg, color: T.textMut }
                        : (color ? vignette(color) : { background: T.accentBg, color: T.text })),
                      transition: "background .15s ease, color .15s ease",
                    }}>
                      <Ico size={15} />
                    </div>

                    {/* Content (non cliquable) */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 600, color: done ? T.textMut : T.text,
                        textDecoration: done ? "line-through" : "none",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2,
                      }}>
                        {h.name}
                      </div>
                      {/* Heure + lieu : ligne inline, descritpion : ligne séparée qui peut wrapper */}
                      {(h.time || h.location) && (
                        <div style={{
                          display: "flex", alignItems: "center", gap: 6, marginTop: 2,
                          fontSize: 11, color: T.textMut, lineHeight: 1.2,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {h.time && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                              <Clock size={10} strokeWidth={1.75} /> {h.time}
                            </span>
                          )}
                          {h.time && h.location && <span>·</span>}
                          {h.location && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                              <MapPin size={10} strokeWidth={1.75} /> {h.location}
                            </span>
                          )}
                        </div>
                      )}
                      {h.description && (
                        <div style={{ marginTop: 4, fontSize: 11, color: T.textMut, lineHeight: 1.4, whiteSpace: "normal", wordBreak: "break-word" }}>
                          {h.description}
                        </div>
                      )}
                    </div>

                    {/* Checkbox — collée au texte */}
                    <button onClick={() => toggleHabit(h.id)}
                      role="checkbox" aria-checked={done}
                      aria-label={`${h.name} — ${done ? "complétée" : "à faire"} aujourd'hui`}
                      style={{
                        width: 18, height: 18, borderRadius: "var(--radius-field)",
                        border: done ? "none" : `2px solid ${color || T.border2}`,
                        background: done ? (color || T.green) : T.white,
                        cursor: "pointer",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, transition: "var(--tr-ui)",
                      }}>
                      {done && <Check size={11} strokeWidth={3} color={T.onSolid} />}
                    </button>

                    {/* Edit (masqué au survol sur desktop, toujours visible au tactile) */}
                    <button data-habit-edit onClick={() => openEditHabit(h)} title="Modifier" aria-label={`Modifier ${h.name}`}
                      style={{ width: 22, height: 22, borderRadius: "var(--radius-field)", border: "none", background: "transparent", color: T.textMut, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", opacity: isMobile ? 1 : 0, transition: "opacity .15s ease, color .12s ease, background .12s ease", flexShrink: 0 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = T.accentBg; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = T.textMut; e.currentTarget.style.background = "transparent"; }}>
                      <Pencil size={11} strokeWidth={1.75} />
                    </button>

                    {/* Delete (masqué au survol sur desktop, toujours visible au tactile) */}
                    <button data-habit-del onClick={() => removeHabit(h.id)} title="Supprimer" aria-label={`Supprimer ${h.name}`}
                      style={{ width: 22, height: 22, borderRadius: "var(--radius-field)", border: "none", background: "transparent", color: T.textMut, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", opacity: isMobile ? 1 : 0, transition: "opacity .15s ease, color .12s ease, background .12s ease", flexShrink: 0 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = T.red; e.currentTarget.style.background = T.redBg; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = T.textMut; e.currentTarget.style.background = "transparent"; }}>
                      <Trash2 size={11} strokeWidth={1.75} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        </div>
      </div>

      {/* Graphique ligne : complétion habitudes (30 derniers jours) — pleine largeur, en bas */}
      <HabitsChart habits={habits} history={habitHistory} />
    </div>
  );
}

function HabitsChart({ habits, history }) {
  const [hoverIdx, setHoverIdx] = React.useState(null);
  const total = habits.length;
  // Trouve la première date où au moins une habitude a été cochée
  let firstIso = null;
  for (const h of habits) {
    const map = history[h.id] || {};
    for (const iso of Object.keys(map)) {
      if (map[iso] && (firstIso === null || iso < firstIso)) firstIso = iso;
    }
  }
  // Fallback : si rien n'est coché, on affiche les 7 derniers jours
  const today = new Date();
  let startDate;
  if (firstIso) {
    const [y, m, d] = firstIso.split("-").map(Number);
    startDate = new Date(y, m - 1, d);
  } else {
    startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 6);
  }
  // Nombre de jours entre startDate et aujourd'hui (inclus)
  const msPerDay = 86400000;
  const startMs = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const span = Math.max(1, Math.round((todayMs - startMs) / msPerDay) + 1);
  const days = [];
  for (let i = 0; i < span; i++) {
    const d = new Date(startMs + i * msPerDay);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const done = habits.reduce((acc, h) => acc + (history[h.id]?.[iso] ? 1 : 0), 0);
    const pct = total > 0 ? (done / total) * 100 : 0;
    days.push({ iso, day: d.getDate(), date: d, done, pct, isToday: i === span - 1 });
  }
  // Courbe SVG — style harmonisé avec les charts du Dashboard (Y labels à droite, lignes droites)
  const VB_W = 1000;
  const VB_H = 180;
  const padL = 8, padR = 36, padT = 14, padB = 24;
  const chartW = VB_W - padL - padR;
  const chartH = VB_H - padT - padB;
  const points = days.map((d, i) => {
    const x = padL + (i / Math.max(days.length - 1, 1)) * chartW;
    const y = padT + chartH - (d.pct / 100) * chartH;
    return { x, y, ...d };
  });
  // Lignes droites entre points (pas de Bezier)
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  const yTicks = [0, 50, 100];
  const xTicks = points.filter((_, i) => i === 0 || i === points.length - 1 || i % 5 === 0);

  return (
    /* Le titre vit AU-DESSUS de la carte, sur le gris du shell — comme les
       sections de la page Objectifs. La carte blanche ne porte plus que le
       tracé. */
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: T.text, letterSpacing: -0.1, padding: "0 4px" }}>
        Complétion des habitudes
      </div>
      <div style={CARD}>
      {total === 0 ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: T.textMut, fontSize: 13 }}>
          Ajoute des habitudes pour voir ton graphique
        </div>
      ) : (
        <div
          style={{ position: "relative", width: "100%" }}
          onMouseLeave={() => setHoverIdx(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            // Le SVG est étiré (preserveAspectRatio="none") : on convertit la
            // position souris en coordonnées du viewBox, puis le long de la zone
            // réellement tracée [padL, padL+chartW] (padR est réservé à l'axe Y).
            const vbX = rect.width > 0 ? (x / rect.width) * VB_W : 0;
            const ratio = chartW > 0 ? (vbX - padL) / chartW : 0;
            const idx = Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
            setHoverIdx(idx);
          }}
        >
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none"
            style={{ width: "100%", height: 240, display: "block", fontFamily: "var(--font-sans)" }}>
            {/* Rien sous la courbe : ni trame ni dégradé. Le tracé seul, à
                l'accent de marque (`T.kraken`, la couleur des courbes du site,
                qui suit le préréglage d'accent choisi dans les Réglages). */}
            <path d={pathD} fill="none" stroke={T.kraken} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {hoverIdx !== null && points[hoverIdx] && (
              <line x1={points[hoverIdx].x} y1={padT} x2={points[hoverIdx].x} y2={padT + chartH} stroke={T.textMut} strokeWidth="1" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" pointerEvents="none" />
            )}
          </svg>


          {/* Point au survol + tooltip listant les habitudes cochées ce jour-là */}
          {hoverIdx !== null && points[hoverIdx] && (() => {
            const p = points[hoverIdx];
            const leftPct = (p.x / VB_W) * 100;
            const topPct = (p.y / VB_H) * 100;
            const checked = habits.filter(h => history[h.id]?.[p.iso]);
            const dateLabel = p.date.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
            const onLeftHalf = leftPct > 60;
            return (
              <>
                <div style={{
                  position: "absolute",
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  transform: onLeftHalf
                    ? "translate(calc(-100% - 14px), -50%)"
                    : "translate(14px, -50%)",
                  background: T.white, color: T.text,
                  border: "none",
                  borderRadius: 12, padding: "10px 12px",
                  fontSize: 11, lineHeight: 1.4,
                  minWidth: 170, maxWidth: 260,
                  boxShadow: "var(--elev-overlay)",
                  pointerEvents: "none", zIndex: 5,
                  fontFamily: "var(--font-sans)",
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{dateLabel}</span>
                    <span style={{ color: T.textMut, fontSize: 10, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                      {p.done}/{habits.length} · {Math.round(p.pct)}%
                    </span>
                  </div>
                  {checked.length === 0 ? (
                    <div style={{ color: T.textMut, fontStyle: "italic", fontSize: 10 }}>
                      Aucune habitude cochée
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {checked.slice(0, 6).map(h => (
                        <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Check size={10} strokeWidth={2.5} color={T.green} style={{ flexShrink: 0 }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                        </div>
                      ))}
                      {checked.length > 6 && (
                        <div style={{ color: T.textMut, fontSize: 10, marginTop: 2 }}>
                          + {checked.length - 6} autre{checked.length - 6 > 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            );
          })()}

          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: padB, pointerEvents: "none" }}>
            {xTicks.filter(p => !p.isToday).map(p => {
              const label = `${String(p.date.getDate()).padStart(2, "0")}/${String(p.date.getMonth() + 1).padStart(2, "0")}`;
              const isFirst = p === points[0];
              const isLast = p === points[points.length - 1];
              const leftPct = (p.x / VB_W) * 100;
              const transform = isFirst ? "translateX(0)" : isLast ? "translateX(-100%)" : "translateX(-50%)";
              return (
                <div key={`xh-${p.iso}`} style={{
                  position: "absolute", left: `${leftPct}%`, bottom: 4,
                  transform, fontSize: 10,
                  color: T.textMut,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}>
                  {label}
                </div>
              );
            })}
          </div>

          <div style={{ position: "absolute", top: 0, right: 0, width: 36, height: "100%", pointerEvents: "none" }}>
            {yTicks.map(t => {
              const yPx = padT + chartH - (t / 100) * chartH;
              const topPct = (yPx / VB_H) * 100;
              return (
                <div key={`yh-${t}`} style={{ position: "absolute", top: `${topPct}%`, right: 6, transform: "translateY(-50%)", fontSize: 10, color: T.textMut, fontWeight: 500 }}>{t}%</div>
              );
            })}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function DailyStatCell({ label, value, subLabel, color }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, color: T.textMut, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || T.text, letterSpacing: -0.3, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 11, color: T.textMut, fontWeight: 500, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subLabel}</div>
    </div>
  );
}

