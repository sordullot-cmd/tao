import { describe, it, expect } from "vitest";
import { clockToSeconds, secondsToClock, stampStartedLine, marksOf, splitStamps, joinStamps, carryStamps, startedLineIndex, blockHasStamp } from "@/lib/study/stamps";
import { renderRichText } from "@/lib/ui/richText";
import {
  emptyStudy, normalizeStudy, emptyNote, descendantIds, folderPath, notesUnder, progressOf,
  removeFolder, canMoveFolder, searchNotes, parseYouTube, fmtStart, tradeStats, type StudyStore,
  closeSession, studyWeek, minutesByDay, fmtMinutes, wordCount, MAX_SESSION_MS, addStudySpan,
} from "@/lib/study/model";

const folder = (id: string, parentId: string | null = null, name = id) => ({ id, name, parentId, createdAt: "" });

function storeWith(): StudyStore {
  const s = emptyStudy();
  s.folders = [folder("ict"), folder("liq", "ict", "Liquidité"), folder("sweep", "liq", "Sweeps"), folder("risk")];
  s.notes = [
    { ...emptyNote("ict", "Kill zones"), id: "n1", status: "mastered" },
    { ...emptyNote("liq", "BSL / SSL"), id: "n2", status: "learning" },
    { ...emptyNote("sweep", "Prise de liquidité"), id: "n3", content: "Mèche au-dessus d'un plus haut" },
    { ...emptyNote("risk", "Taille de position"), id: "n4" },
    { ...emptyNote(null, "Vrac"), id: "n5" },
  ];
  return s;
}

describe("Étude — normalisation", () => {
  it("rend un magasin vide pour une valeur illisible", () => {
    expect(normalizeStudy(null)).toEqual(emptyStudy());
    expect(normalizeStudy("x")).toEqual(emptyStudy());
  });

  it("donne leurs valeurs par défaut aux champs absents d'une ancienne note", () => {
    const s = normalizeStudy({ notes: [{ id: "a", title: "FVG" }] });
    expect(s.notes[0]).toMatchObject({ folderId: null, status: "todo", videos: [], links: [], images: [], tradeIds: [] });
  });

  it("remonte à la racine un dossier dont le parent a disparu", () => {
    const s = normalizeStudy({ folders: [folder("a", "fantome")] });
    expect(s.folders[0].parentId).toBeNull();
  });

  it("sort de la boucle deux dossiers qui se contiennent l'un l'autre", () => {
    const s = normalizeStudy({ folders: [folder("a", "b"), folder("b", "a")] });
    expect(s.folders.some(f => f.parentId === null)).toBe(true);
  });

  it("range hors dossier une note dont le dossier n'existe plus", () => {
    const s = normalizeStudy({ notes: [{ id: "a", folderId: "fantome" }] });
    expect(s.notes[0].folderId).toBeNull();
  });

  it("range les ids de trades en chaînes, sans doublon", () => {
    const s = normalizeStudy({ notes: [{ id: "a", tradeIds: [12, "12", "13", null, ""] }] });
    expect(s.notes[0].tradeIds).toEqual(["12", "13"]);
  });
});

describe("Étude — arbre", () => {
  it("compte la descendance à toute profondeur", () => {
    expect([...descendantIds(storeWith(), "ict")].sort()).toEqual(["ict", "liq", "sweep"]);
  });

  it("reconstruit le chemin de la racine au dossier", () => {
    expect(folderPath(storeWith(), "sweep").map(f => f.id)).toEqual(["ict", "liq", "sweep"]);
    expect(folderPath(storeWith(), null)).toEqual([]);
  });

  it("prend les notes des sous-dossiers, et toutes à la racine", () => {
    expect(notesUnder(storeWith(), "liq").map(n => n.id).sort()).toEqual(["n2", "n3"]);
    expect(notesUnder(storeWith(), null)).toHaveLength(5);
  });

  it("supprime un dossier avec sa descendance et rend ce qui est parti", () => {
    const { store, folders, notes } = removeFolder(storeWith(), "liq");
    expect(store.folders.map(f => f.id).sort()).toEqual(["ict", "risk"]);
    expect(folders.map(f => f.id).sort()).toEqual(["liq", "sweep"]);
    expect(notes.map(n => n.id).sort()).toEqual(["n2", "n3"]);
    expect(store.notes.map(n => n.id).sort()).toEqual(["n1", "n4", "n5"]);
  });

  it("refuse de ranger un dossier dans sa propre descendance", () => {
    const s = storeWith();
    expect(canMoveFolder(s, "ict", "sweep")).toBe(false);
    expect(canMoveFolder(s, "ict", "ict")).toBe(false);
    expect(canMoveFolder(s, "sweep", "risk")).toBe(true);
    expect(canMoveFolder(s, "sweep", null)).toBe(true);
  });
});

describe("Étude — progression et recherche", () => {
  it("compte une note en cours pour moitié", () => {
    const p = progressOf(storeWith().notes.slice(0, 2));
    expect(p).toMatchObject({ total: 2, mastered: 1, learning: 1 });
    expect(p.ratio).toBeCloseTo(0.75);
  });

  it("ne divise pas par zéro sur un dossier vide", () => {
    expect(progressOf([]).ratio).toBe(0);
  });

  it("cherche dans le contenu, sans accents ni casse", () => {
    expect(searchNotes(storeWith().notes, "meche PLUS").map(n => n.id)).toEqual(["n3"]);
    expect(searchNotes(storeWith().notes, "liquidite").map(n => n.id)).toEqual(["n3"]);
    expect(searchNotes(storeWith().notes, "  ")).toHaveLength(5);
  });
});

describe("Étude — YouTube", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ", 0],
    ["https://youtu.be/dQw4w9WgXcQ?t=90", "dQw4w9WgXcQ", 90],
    ["youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s", "dQw4w9WgXcQ", 90],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1", "dQw4w9WgXcQ", 0],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ", 0],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ?start=42", "dQw4w9WgXcQ", 42],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ", 0],
    ["https://youtu.be/dQw4w9WgXcQ?t=1h2m3s", "dQw4w9WgXcQ", 3723],
  ])("reconnaît %s", (url, id, start) => {
    expect(parseYouTube(url)).toEqual({ youtubeId: id, start });
  });

  it.each([
    "https://www.tradingview.com/chart/",
    "https://www.youtube.com/@ICT",
    "https://www.youtube.com/watch?v=court",
    "pas une url",
  ])("laisse %s à l'état de lien", (url) => {
    expect(parseYouTube(url)).toBeNull();
  });

  it("formate un départ en minutes, et en heures au-delà", () => {
    expect(fmtStart(90)).toBe("1:30");
    expect(fmtStart(3723)).toBe("1:02:03");
  });
});

describe("Étude — trades reliés", () => {
  it("ne compte que les trades encore présents dans le journal", () => {
    const byId = new Map<string, { id: string; pnl: unknown }>([
      ["a", { id: "a", pnl: 100 }], ["b", { id: "b", pnl: "-40" }], ["c", { id: "c", pnl: 0 }],
    ]);
    expect(tradeStats(["a", "b", "c", "disparu"], byId)).toEqual({ count: 3, wins: 1, pnl: 60, winRate: 1 / 3 });
    expect(tradeStats([], byId).winRate).toBeNull();
  });
});

describe("Étude — temps d'étude", () => {
  const at = (s: string) => new Date(s);

  it("compte le temps mesuré tout seul, en une séance par minute écrite", () => {
    const t = (hm: string) => Date.parse(`2026-11-02T${hm}:00`);
    let s = addStudySpan(emptyStudy(), t("09:00"), t("09:01"));
    s = addStudySpan(s, t("09:01"), t("09:02"));
    s = addStudySpan(s, t("09:02"), t("09:10"));
    expect(s.sessions).toHaveLength(1);
    expect(studyWeek(s, at("2026-11-02T12:00:00")).today).toBeCloseTo(10);
    /* Une vraie pause ouvre une autre séance. */
    s = addStudySpan(s, t("10:00"), t("10:05"));
    expect(s.sessions).toHaveLength(2);
    expect(studyWeek(s, at("2026-11-02T12:00:00")).today).toBeCloseTo(15);
  });

  it("ne compte pas deux fois le temps de deux onglets ouverts", () => {
    const t = (hm: string) => Date.parse(`2026-11-02T${hm}:00`);
    let s = addStudySpan(emptyStudy(), t("09:00"), t("09:10"));
    s = addStudySpan(s, t("09:05"), t("09:08"));
    expect(studyWeek(s, at("2026-11-02T12:00:00")).today).toBeCloseTo(10);
  });

  it("range la séance en cours à la réouverture de la porte", () => {
    const s = { ...emptyStudy(), running: at("2026-11-02T09:00:00").toISOString() };
    const closed = closeSession(s, at("2026-11-02T09:25:00"));
    expect(closed.running).toBeNull();
    expect(closed.sessions).toHaveLength(1);
    expect(studyWeek(closed, at("2026-11-02T12:00:00")).today).toBeCloseTo(25);
  });

  it("plafonne une porte oubliée fermée toute la nuit", () => {
    const s = { ...emptyStudy(), running: at("2026-11-01T20:00:00").toISOString() };
    const closed = closeSession(s, at("2026-11-03T08:00:00"));
    const ms = Date.parse(closed.sessions[0].end) - Date.parse(closed.sessions[0].start);
    expect(ms).toBe(MAX_SESSION_MS);
  });

  it("compte la séance en cours sans attendre qu'elle se termine", () => {
    const s = { ...emptyStudy(), running: at("2026-11-02T10:00:00").toISOString() };
    expect(studyWeek(s, at("2026-11-02T10:12:00")).today).toBeCloseTo(12);
  });

  it("coupe à minuit une séance à cheval sur deux jours", () => {
    const s = { ...emptyStudy(), sessions: [{ id: "a", start: at("2026-11-01T23:30:00").toISOString(), end: at("2026-11-02T00:20:00").toISOString() }] };
    const byDay = minutesByDay(s, at("2026-11-02T12:00:00"));
    expect(byDay.get("2026-11-01")).toBeCloseTo(30);
    expect(byDay.get("2026-11-02")).toBeCloseTo(20);
  });

  it("garde la série tant que la journée n'est pas finie", () => {
    const day = (d: string) => ({ id: d, start: at(`${d}T10:00:00`).toISOString(), end: at(`${d}T10:30:00`).toISOString() });
    const s = { ...emptyStudy(), sessions: [day("2026-10-30"), day("2026-10-31"), day("2026-11-01")] };
    expect(studyWeek(s, at("2026-11-02T08:00:00")).streak).toBe(3);
    expect(studyWeek(s, at("2026-11-03T08:00:00")).streak).toBe(0);
  });

  it("formate les minutes en heures au-delà de soixante", () => {
    expect(fmtMinutes(3.9)).toBe("3 min");
    expect(fmtMinutes(65)).toBe("1 h 05");
  });

  it("compte les mots sans la syntaxe markdown", () => {
    expect(wordCount("## Titre\n- [ ] une case")).toBe(3);
    expect(wordCount("   ")).toBe(0);
  });
});

describe("Étude — minutages dans le texte", () => {
  it("convertit dans les deux sens", () => {
    expect(clockToSeconds("1:02:03")).toBe(3723);
    expect(secondsToClock(83)).toBe("1:23");
    expect(secondsToClock(3723)).toBe("1:02:03");
  });

  it("minute la ligne qu'on commence pendant la lecture", () => {
    const before = "## Setup\n";
    const after = "## Setup\nS";
    expect(stampStartedLine(before, after, after.length, 71)).toBe("## Setup\nS {=1:11}");
  });

  it("ne minute pas une ligne qu'on retouche", () => {
    const before = "Swept the low";
    const after = "Swept the lows";
    expect(stampStartedLine(before, after, after.length, 71)).toBeNull();
  });

  it("ne minute pas deux fois la même ligne", () => {
    expect(stampStartedLine("", "a {=0:10}", 1, 71)).toBeNull();
  });

  it("sépare les temps de ligne du texte édité, sans manger l'espace tapée", () => {
    const { text, stamps } = splitStamps("Swept {=1:11}\nRien\nHigh  {=0:05}");
    expect(text).toBe("Swept\nRien\nHigh ");
    expect(stamps).toEqual([71, null, 5]);
    expect(joinStamps(text, stamps)).toBe("Swept {=1:11}\nRien\nHigh  {=0:05}");
  });

  it("garde chaque temps sur sa ligne quand on insère, coupe ou fusionne des lignes", () => {
    expect(carryStamps("a\nb", [1, 2], "x\na\nb")).toEqual([null, 1, 2]);
    expect(carryStamps("abc\nd", [1, 2], "ab\nc\nd")).toEqual([1, null, 2]);
    expect(carryStamps("a\nb", [1, 2], "ab")).toEqual([1]);
  });

  it("repère la ligne qu'on vient de commencer", () => {
    expect(startedLineIndex("## Setup\n", "## Setup\nS", 10)).toBe(1);
    expect(startedLineIndex("Swept", "Swepts", 6)).toBeNull();
  });

  it("ne minute qu'une fois par bloc : un Entrée continue, deux Entrée en ouvrent un neuf", () => {
    /* Un seul Entrée : même bloc, déjà minuté. */
    expect(blockHasStamp("Swept\nPuis", [71, null], 1)).toBe(true);
    /* Deux Entrée : la ligne vide coupe, le bloc neuf n'a pas de temps. */
    expect(blockHasStamp("Swept\n\nPuis", [71, null, null], 2)).toBe(false);
    /* Une ligne insérée en tête d'un bloc minuté n'en prend pas un second. */
    expect(blockHasStamp("Neuf\nSwept", [null, 71], 0)).toBe(true);
    /* Bloc écrit en pause : rien à respecter, la ligne suivante le minute. */
    expect(blockHasStamp("Pause\nLecture", [null, null], 1)).toBe(false);
  });

  it("aligne chaque temps de ligne sur sa propre ligne dans un paragraphe", () => {
    const html = renderRichText("Une {=0:10}\nDeux {=0:20}", { times: true });
    expect(html.match(/class="rt-ln" data-line="\d"/g)).toEqual(['class="rt-ln" data-line="0"', 'class="rt-ln" data-line="1"']);
  });

  it("liste les repères de la note, triés et légendés", () => {
    const text = "## Entry {=2:41}\n- Confirmation {2:41} puis {3:42}\nRien ici";
    expect(marksOf(text)).toEqual([
      { sec: 161, label: "Entry" },
      { sec: 222, label: "Confirmation  puis" },
    ]);
  });

  it("ne compte pas les minutages comme des mots", () => {
    expect(wordCount("Entry {=2:41} sur {3:42} NQ")).toBe(3);
  });
});

describe("Étude — rendu", () => {
  it("rend les minutages en puces cliquables, sur demande seulement", () => {
    const on = renderRichText("Entrée {3:42} ici {=0:24}", { times: true });
    expect(on).toContain('class="rt-time"');
    expect(on).toContain('data-t="222"');
    expect(on).toContain('class="rt-stamp"');
    expect(renderRichText("Entrée {3:42}")).toContain("{3:42}");
  });

  it("rend une maxime et un surlignage", () => {
    expect(renderRichText("> [!maxime] Ne force pas.")).toContain("rt-callout-maxim");
    expect(renderRichText("attendre la ==réaction==")).toContain('<mark class="rt-mark">réaction</mark>');
  });
});
