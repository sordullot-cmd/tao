/**
 * Lecture d'un flux iCalendar (RFC 5545) — emplois du temps universitaires en
 * tête (ADE, Hyperplanning, Celcat), mais n'importe quel `.ics` public convient.
 *
 * Pourquoi un parseur maison plutôt qu'une dépendance : ces exports n'utilisent
 * qu'une poignée de propriétés (une séance = un `VEVENT` déplié, jamais de
 * `RRULE`), et les bibliothèques du domaine embarquent une base de fuseaux
 * complète — plusieurs centaines de kilo-octets pour un besoin que `Intl`
 * couvre déjà. Ce qui est réellement délicat ici, ce n'est pas la grammaire,
 * c'est le fuseau : voir `zonedToInstant`.
 *
 * Ce qui n'est PAS traité, et pourquoi c'est acceptable : les récurrences
 * (`RRULE` / `EXDATE`). Les exports d'emploi du temps déplient chaque séance en
 * un évènement distinct — c'est ce qui leur permet d'annuler un cours isolé.
 * Un flux qui utiliserait `RRULE` (un agenda personnel exporté, par exemple)
 * verrait donc seulement la première occurrence de chaque série.
 */

export interface IcsEvent {
  uid: string;
  summary: string;
  description: string;
  location: string;
  /** Journée entière (`VALUE=DATE`) : `start`/`end` sont des "YYYY-MM-DD". */
  allDay: boolean;
  /**
   * ISO. Suffixé `Z` quand l'instant est connu (UTC ou `TZID` résolu), SANS
   * suffixe quand l'heure est « flottante » — le client l'interprète alors dans
   * son propre fuseau, ce que la RFC demande et que `new Date()` fait déjà.
   */
  start: string;
  end: string;
  status: string;
  /**
   * La MATIÈRE, sans son type de séance — « Anglais », pas « Anglais · TD ».
   *
   * L'intitulé affiché compose les deux (cf. `prettifyIcsEvent`), ce qui en fait
   * un mauvais identifiant de cours : « Anglais · CM » et « Anglais · TD » sont
   * le même enseignement et ne se ressemblent pas comme chaînes. Une couleur
   * posée « sur la matière » se casse dessus — elle ne toucherait que les
   * séances du type qu'on a cliqué.
   *
   * Vaut l'intitulé brut quand l'export ne distingue pas les deux : c'est la
   * meilleure information disponible, et le comportement reste le bon.
   */
  course: string;
  /**
   * Type de séance tel que l'établissement le nomme (« CM », « TD à distance »).
   * Vide hors export structuré : c'est alors l'intitulé qui sert d'indice.
   */
  category: string;
}

/* ─────────────── Dépliage et découpage ─────────────── */

/**
 * Déplie les lignes continuées. La RFC coupe toute ligne à 75 octets et
 * préfixe la suite d'une espace ou d'une tabulation : sans ce recollage, un
 * intitulé de cours un peu long arrive tronqué en plein milieu d'un mot.
 */
export function unfoldLines(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/**
 * Sépare `NOM;PARAM=X:valeur`. Le deux-points de séparation est le premier qui
 * se trouve hors guillemets — un paramètre a le droit d'en contenir
 * (`TZID="Europe/Paris"`), et couper au mauvais endroit décale toute la ligne.
 */
export function splitLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === ":" && !quoted) { colon = i; break; }
  }
  if (colon === -1) return null;

  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts: string[] = [];
  let cur = "";
  quoted = false;
  for (const c of head) {
    if (c === '"') { quoted = !quoted; continue; }
    if (c === ";" && !quoted) { parts.push(cur); cur = ""; continue; }
    cur += c;
  }
  parts.push(cur);

  const name = (parts.shift() || "").toUpperCase();
  const params: Record<string, string> = {};
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq === -1) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name, params, value };
}

/** Déséchappe une valeur TEXT (`\n`, `\,`, `\;`, `\\`). */
export function unescapeText(v: string): string {
  return v.replace(/\\([nN,;\\])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
}

/* ─────────────── Fuseaux ─────────────── */

/** Décalage du fuseau `tz` à cet instant, en millisecondes. */
function tzOffset(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - at.getTime();
}

/**
 * Heure murale dans un fuseau → instant absolu.
 *
 * Le décalage dépend de l'instant, qu'on cherche justement : on part du
 * décalage estimé à l'heure murale lue comme UTC, puis on corrige une fois. Ce
 * second passage n'est pas du zèle — sans lui, les deux semaines de cours qui
 * encadrent un changement d'heure tombent une heure à côté.
 */
function zonedToInstant(
  y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string,
): Date | null {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  try {
    const off1 = tzOffset(tz, new Date(wall));
    const off2 = tzOffset(tz, new Date(wall - off1));
    return new Date(wall - off2);
  } catch {
    // TZID inconnu de la plateforme (identifiant Windows, fuseau maison d'un
    // export exotique) : on laisse l'appelant retomber sur l'heure flottante.
    return null;
  }
}

/** `20260907T080000Z` / `20260907T080000` / `20260907` → ISO + drapeau all-day. */
export function parseIcsDate(value: string, tzid?: string): { iso: string; allDay: boolean } | null {
  const v = String(value || "").trim();

  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    return { iso: `${y}-${mo}-${d}`, allDay: true };
  }

  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;

  if (z) return { iso: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString(), allDay: false };

  if (tzid) {
    const inst = zonedToInstant(+y, +mo, +d, +h, +mi, +s, tzid);
    if (inst) return { iso: inst.toISOString(), allDay: false };
  }

  // Heure flottante : pas de suffixe, le client l'interprète chez lui.
  return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}`, allDay: false };
}

/** `PT1H30M`, `P1D`… → millisecondes. Renvoie 0 si illisible. */
export function parseDuration(v: string): number {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v || "").trim());
  if (!m) return 0;
  const [, sign, w, d, h, mi, s] = m;
  const ms =
    (+(w || 0) * 7 * 86400 + +(d || 0) * 86400 + +(h || 0) * 3600 + +(mi || 0) * 60 + +(s || 0)) * 1000;
  return sign === "-" ? -ms : ms;
}

/**
 * Décale un horaire ISO en conservant sa nature : une heure flottante décalée
 * reste flottante. La figer en UTC la déplacerait du décalage du lecteur.
 */
function shiftIso(iso: string, ms: number): string {
  const floating = !iso.endsWith("Z");
  const shifted = new Date(new Date(floating ? `${iso}Z` : iso).getTime() + ms).toISOString();
  return floating ? shifted.slice(0, 19) : shifted;
}

/** Ajoute des jours à un "YYYY-MM-DD" (les journées entières se comptent en dates). */
function addDays(day: string, n: number): string {
  const [y, mo, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/* ─────────────── Parseur ─────────────── */

/** Extrait les `VEVENT` d'un flux iCalendar. */
export function parseIcs(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let cur: Record<string, unknown> | null = null;
  // Les composants imbriqués (VALARM, VTIMEZONE) portent des DTSTART qui ne
  // sont PAS ceux de la séance : sans ce compteur, un rappel écrase l'horaire.
  let nested = 0;

  for (const line of unfoldLines(text)) {
    const parsed = splitLine(line);
    if (!parsed) continue;
    const { name, params, value } = parsed;

    if (name === "BEGIN") {
      if (value === "VEVENT") { cur = {}; nested = 0; }
      else if (cur) nested++;
      continue;
    }
    if (name === "END") {
      if (value === "VEVENT") {
        if (cur) {
          const ev = finalize(cur);
          if (ev) events.push(ev);
        }
        cur = null;
      } else if (cur && nested > 0) nested--;
      continue;
    }
    if (!cur || nested > 0) continue;

    switch (name) {
      case "UID": cur.uid = value; break;
      case "SUMMARY": cur.summary = unescapeText(value); break;
      case "DESCRIPTION": cur.description = unescapeText(value); break;
      case "LOCATION": cur.location = unescapeText(value); break;
      case "STATUS": cur.status = value.toLowerCase(); break;
      case "DTSTART": cur.start = parseIcsDate(value, params.TZID); break;
      case "DTEND": cur.end = parseIcsDate(value, params.TZID); break;
      case "DURATION": cur.duration = parseDuration(value); break;
      default: break;
    }
  }
  return events;
}

/** Complète les champs manquants d'un VEVENT et le rejette s'il est inexploitable. */
function finalize(cur: Record<string, unknown>): IcsEvent | null {
  const start = cur.start as { iso: string; allDay: boolean } | undefined;
  if (!start?.iso) return null; // sans début, rien à placer dans la grille

  const duration = typeof cur.duration === "number" ? cur.duration : 0;
  let end = cur.end as { iso: string; allDay: boolean } | undefined;
  if (!end && duration) {
    if (start.allDay) {
      end = { iso: addDays(start.iso, Math.max(1, Math.round(duration / 86400000))), allDay: true };
    } else {
      end = { iso: shiftIso(start.iso, duration), allDay: false };
    }
  }
  if (!end) {
    // Ni DTEND ni DURATION : la RFC dit « un jour » pour une date, « instantané »
    // pour un horaire — mais un cours de durée nulle serait invisible dans la
    // grille, donc une heure par défaut.
    end = start.allDay
      ? { iso: addDays(start.iso, 1), allDay: true }
      : { iso: shiftIso(start.iso, 3600000), allDay: false };
  }

  const summary = String(cur.summary || "(Sans titre)");
  return {
    uid: String(cur.uid || `${start.iso}-${cur.summary || ""}`),
    summary,
    course: summary,
    description: String(cur.description || ""),
    location: String(cur.location || ""),
    allDay: !!start.allDay,
    start: start.iso,
    end: end.iso,
    status: cur.status === "cancelled" ? "cancelled" : "confirmed",
    category: "",
  };
}

/**
 * Ne garde que ce qui recoupe la fenêtre affichée. Un export universitaire
 * couvre l'année entière : renvoyer les 1 500 séances pour afficher une semaine
 * ferait transiter — et redessiner — cent fois trop.
 */
export function filterByRange(events: IcsEvent[], timeMin: string, timeMax: string): IcsEvent[] {
  const min = new Date(timeMin).getTime();
  const max = new Date(timeMax).getTime();
  if (!Number.isFinite(min) || !Number.isFinite(max)) return events;
  return events.filter((ev) => {
    const s = new Date(ev.allDay ? `${ev.start}T00:00:00` : ev.start).getTime();
    const e = new Date(ev.allDay ? `${ev.end}T00:00:00` : ev.end).getTime();
    if (!Number.isFinite(s)) return false;
    return (Number.isFinite(e) ? e : s) > min && s < max;
  });
}

/* ─────────────── Lisibilité des exports ADE ─────────────── */

/**
 * Recompose un intitulé lisible pour les exports ADE.
 *
 * Leur `SUMMARY` concatène tout dans l'ordre le moins utile —
 * « TD - DEG - Salle 07 (36) - Laboratoire Langues - UE 17A : Anglais - EG1G04A » :
 * dans une case de deux centimètres, on lit le type et la salle, jamais la
 * matière. La `DESCRIPTION`, elle, est structurée en champs nommés ; on y
 * retrouve la matière et la catégorie, et on remonte « Anglais · TD ».
 *
 * Prudent par construction : sans les champs attendus (tout autre flux iCal),
 * l'évènement ressort inchangé.
 */
export function prettifyIcsEvent(ev: IcsEvent): IcsEvent {
  // `[ \t]` et non `\s` : `\s` engloberait le retour à la ligne, si bien qu'un
  // champ vide (« Salle : » d'un cours à distance) capturerait la ligne
  // suivante — la salle affichée devenait « Matière : UE 17A : Anglais ».
  const field = (label: string) => {
    const m = new RegExp(`^${label}[ \\t]*:[ \\t]*(.*)$`, "im").exec(ev.description);
    return (m?.[1] || "").trim();
  };
  const categorie = field("Catégorie");
  const matiere = field("Matière");
  // Sans matière, l'intitulé d'origine reste le meilleur libellé — mais la
  // catégorie, elle, est exploitable dès qu'elle existe (couleur du type).
  if (!matiere) return categorie ? { ...ev, category: categorie } : ev;

  // « UE 17A : Anglais » → « Anglais ». Le code d'UE est déjà dans la
  // description, et c'est le nom que l'on cherche des yeux dans la grille.
  const nom = matiere.includes(":") ? matiere.slice(matiere.lastIndexOf(":") + 1).trim() : matiere;
  const summary = categorie ? `${nom} · ${categorie}` : nom;

  return {
    ...ev,
    category: categorie,
    summary: summary || ev.summary,
    // La matière SEULE, séparée de son type : c'est elle qui identifie un
    // enseignement d'un bout à l'autre du semestre.
    course: nom || ev.summary,
    // La salle est déjà dans LOCATION ; on la reprend de la description
    // seulement si LOCATION est vide (cours à distance, salle non affectée).
    location: ev.location || field("Salle"),
  };
}
