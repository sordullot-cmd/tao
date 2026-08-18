import { describe, it, expect } from "vitest";
import { clozeNumbers, parseClozes, renderCloze, stripCloze, wrapCloze } from "@/lib/srs/cloze";
import {
  createNote, emptyStore, endOfSrsDay, isLeech, ordsForNote, renderCard, srsDay,
  syncNoteCards, type SrsCard, type SrsNote, type SrsStore,
} from "@/lib/srs/model";
import { answerCard, buildQueue, dayCounters, queueKindOf } from "@/lib/srs/queue";
import { fromAnkiText, fromJsonBackup, toAnkiText, toJsonBackup } from "@/lib/srs/ankiText";
import { evaluate, buildSamples, parseParameters } from "@/lib/srs/optimizer";
import { DAY_MS, defaultConfig, newSchedulingState } from "@/lib/srs/fsrs";
import { forecast, retention, stateBreakdown, streak } from "@/lib/srs/stats";

/* ── Texte à trous ────────────────────────────────────────────────────────── */

describe("texte à trous", () => {
  it("repère les trous, leurs numéros et leurs indices", () => {
    const text = "La {{c1::stabilité}} se mesure en {{c2::jours::unité}}.";
    expect(clozeNumbers(text)).toEqual([1, 2]);
    const spans = parseClozes(text);
    expect(spans[0].answer).toBe("stabilité");
    expect(spans[1].hint).toBe("unité");
  });

  it("ne masque que le trou visé et laisse les autres en contexte", () => {
    const text = "La {{c1::stabilité}} se mesure en {{c2::jours}}.";
    expect(renderCloze(text, 1, false)).toBe("La […] se mesure en jours.");
    expect(renderCloze(text, 2, false)).toBe("La stabilité se mesure en […].");
    expect(renderCloze(text, 1, true)).toBe("La [stabilité] se mesure en jours.");
  });

  it("affiche l'indice à la place des points de suspension", () => {
    expect(renderCloze("Le {{c1::risque::en %}} par trade.", 1, false)).toBe("Le [en %] par trade.");
  });

  it("masque ensemble deux occurrences du même numéro", () => {
    const text = "{{c1::Paris}} est en France, et {{c1::Paris}} a une tour.";
    expect(clozeNumbers(text)).toEqual([1]);
    expect(renderCloze(text, 1, false)).toBe("[…] est en France, et […] a une tour.");
  });

  it("accepte un trou qui enjambe un retour à la ligne", () => {
    const text = "Formule :\n{{c1::R = (1 + F·t/S)^d\nsoit la courbe}}";
    expect(clozeNumbers(text)).toEqual([1]);
    expect(stripCloze(text)).toContain("soit la courbe");
  });

  it("numérote automatiquement un nouveau trou", () => {
    const t1 = wrapCloze("stabilité et difficulté", 0, 9);
    expect(t1).toBe("{{c1::stabilité}} et difficulté");
    expect(wrapCloze(t1, 21, 31)).toBe("{{c1::stabilité}} et {{c2::difficulté}}");
  });
});

/* ── Note → cartes ────────────────────────────────────────────────────────── */

describe("notes et cartes", () => {
  it("engendre une, deux ou n cartes selon le type de note", () => {
    expect(ordsForNote({ kind: "basic", front: "a" })).toEqual([0]);
    expect(ordsForNote({ kind: "reversed", front: "a" })).toEqual([0, 1]);
    expect(ordsForNote({ kind: "cloze", front: "{{c1::a}} {{c3::b}}" })).toEqual([1, 3]);
  });

  it("n'engendre aucune carte pour un texte à trous sans trou", () => {
    expect(ordsForNote({ kind: "cloze", front: "rien à masquer" })).toEqual([]);
  });

  it("inverse bien la question sur la seconde carte d'un recto-verso", () => {
    const note = { kind: "reversed", front: "Stabilité", back: "Délai à 90 % de rappel", extra: "" } as SrsNote;
    expect(renderCard(note, 0).question).toBe("Stabilité");
    expect(renderCard(note, 1).question).toBe("Délai à 90 % de rappel");
  });

  it("préserve la planification des cartes qui survivent à une réécriture", () => {
    const { note, cards } = createNote({ deckId: "d1", kind: "cloze", front: "{{c1::a}} {{c2::b}}" });
    // On simule une carte déjà travaillée : elle ne doit pas repartir de zéro.
    const worked = cards.map(c => (c.ord === 1 ? { ...c, reps: 12, stability: 40 } : c));
    const edited: SrsNote = { ...note, front: "{{c1::a}} {{c3::c}}" };
    const out = syncNoteCards(edited, worked);
    expect(out.added).toBe(1);
    expect(out.removed).toBe(1);
    const kept = out.cards.find(c => c.ord === 1);
    expect(kept?.reps).toBe(12);
    expect(kept?.stability).toBe(40);
    expect(out.cards.map(c => c.ord).sort()).toEqual([1, 3]);
  });
});

/* ── Journée de révision ──────────────────────────────────────────────────── */

describe("journée de révision", () => {
  it("rattache une séance nocturne à la veille", () => {
    // 1 h du matin le 12 appartient encore au 11 : sans ça, réviser tard ouvrirait
    // un second quota de nouvelles cartes dans la même nuit.
    expect(srsDay(new Date(2026, 2, 12, 1, 0), 4)).toBe("2026-03-11");
    expect(srsDay(new Date(2026, 2, 12, 5, 0), 4)).toBe("2026-03-12");
  });

  it("place la bascule au lendemain à l'heure dite", () => {
    const end = endOfSrsDay("2026-03-11", 4);
    expect(end.getDate()).toBe(12);
    expect(end.getHours()).toBe(4);
  });
});

/* ── File du jour ─────────────────────────────────────────────────────────── */

/** Un magasin de test : `n` notes recto simple dans un paquet unique. */
function storeWith(n: number, now = new Date()): SrsStore {
  const store = emptyStore();
  store.decks = [{ id: "d1", name: "Test", color: "blue", createdAt: now.toISOString() }];
  for (let i = 0; i < n; i++) {
    const { note, cards } = createNote({ deckId: "d1", kind: "basic", front: `q${i}`, back: `r${i}` }, now);
    store.notes.push(note);
    store.cards.push(...cards);
  }
  return store;
}

describe("file du jour", () => {
  const now = new Date(2026, 2, 12, 10, 0);

  it("plafonne les nouvelles cartes et dit combien sont retenues", () => {
    const store = { ...storeWith(30, now), newPerDay: 5 };
    const q = buildQueue(store, now);
    expect(q.counts.new).toBe(5);
    expect(q.heldBack.new).toBe(25);
    expect(q.cardIds).toHaveLength(5);
  });

  it("sert une carte en révision due plus tard dans la journée", () => {
    const store = storeWith(1, now);
    store.cards[0] = {
      ...store.cards[0], state: "review", step: null, stability: 10, difficulty: 5,
      reps: 3, due: new Date(2026, 2, 12, 22, 0).toISOString(),
      lastReview: new Date(2026, 2, 2, 10, 0).toISOString(),
    };
    expect(buildQueue(store, now).counts.review).toBe(1);
  });

  it("écarte ce qui est suspendu ou enfoui", () => {
    const store = storeWith(3, now);
    store.cards[0] = { ...store.cards[0], suspended: true };
    store.cards[1] = { ...store.cards[1], buriedUntil: new Date(2026, 2, 13, 4, 0).toISOString() };
    expect(buildQueue(store, now).cardIds).toHaveLength(1);
  });

  it("libère une carte dont l'enfouissement a expiré", () => {
    const store = storeWith(1, now);
    store.cards[0] = { ...store.cards[0], buriedUntil: new Date(2026, 2, 12, 4, 0).toISOString() };
    expect(buildQueue(store, now).cardIds).toHaveLength(1);
  });

  it("ignore les limites quand on le demande explicitement", () => {
    const store = { ...storeWith(30, now), newPerDay: 5 };
    expect(buildQueue(store, now, { ignoreLimits: true }).counts.new).toBe(30);
  });

  it("applique la limite du paquet quand la séance ne porte que sur lui", () => {
    const store = { ...storeWith(30, now), newPerDay: 5 };
    store.decks[0] = { ...store.decks[0], newPerDay: 12 };
    expect(buildQueue(store, now, { deckIds: ["d1"] }).counts.new).toBe(12);
  });

  it("décompte le quota déjà consommé aujourd'hui", () => {
    const store = { ...storeWith(30, now), newPerDay: 5 };
    store.log = store.cards.slice(0, 3).map(c => ({
      cardId: c.id, rating: 3 as const, at: new Date(2026, 2, 12, 9, 0).toISOString(),
      state: "learning" as const, elapsed: null, stability: null, difficulty: null,
    }));
    expect(dayCounters(store, now).introduced).toBe(3);
    expect(buildQueue(store, now).counts.new).toBe(2);
  });
});

/* ── Réponse ──────────────────────────────────────────────────────────────── */

describe("réponse à une carte", () => {
  const now = new Date(2026, 2, 12, 10, 0);

  it("enfouit les cartes sœurs quand la carte quitte la journée", () => {
    const store = emptyStore();
    store.decks = [{ id: "d1", name: "Test", color: "blue", createdAt: now.toISOString() }];
    const { note, cards } = createNote({ deckId: "d1", kind: "reversed", front: "a", back: "b" }, now);
    store.notes.push(note);
    store.cards.push(...cards);
    // « Facile » du premier coup fait sortir des paliers : la carte part à
    // plusieurs jours, sa sœur n'a plus rien à faire aujourd'hui.
    const out = answerCard(store, cards[0].id, 4, now);
    expect(out?.buried).toBe(1);
    expect(out?.stillInSession).toBe(false);
  });

  it("n'enfouit rien tant que la carte reste dans la séance", () => {
    const store = emptyStore();
    store.decks = [{ id: "d1", name: "Test", color: "blue", createdAt: now.toISOString() }];
    const { note, cards } = createNote({ deckId: "d1", kind: "reversed", front: "a", back: "b" }, now);
    store.notes.push(note);
    store.cards.push(...cards);
    const out = answerCard(store, cards[0].id, 1, now);
    expect(out?.buried).toBe(0);
    expect(out?.stillInSession).toBe(true);
  });

  it("suspend une sangsue au seuil et journalise la réponse", () => {
    const store = storeWith(1, now);
    store.cards[0] = {
      ...store.cards[0], state: "review", step: null, stability: 10, difficulty: 8,
      reps: 20, lapses: 7, due: now.toISOString(),
      lastReview: new Date(2026, 2, 2).toISOString(),
    };
    const out = answerCard(store, store.cards[0].id, 1, now);
    expect(out?.becameLeech).toBe(true);
    expect(out?.suspended).toBe(true);
    expect(out?.log).toHaveLength(1);
    expect(out?.log[0].state).toBe("review");
  });

  it("ne redéclare pas sangsue à chaque oubli suivant", () => {
    const store = storeWith(1, now);
    store.leechAction = "tag";
    store.cards[0] = {
      ...store.cards[0], state: "review", step: null, stability: 10, difficulty: 8,
      reps: 20, lapses: 8, due: now.toISOString(),
      lastReview: new Date(2026, 2, 2).toISOString(),
    };
    // 9ᵉ oubli : entre deux alertes, pas d'alerte.
    expect(answerCard(store, store.cards[0].id, 1, now)?.becameLeech).toBe(false);
  });

  it("qualifie correctement une carte selon son état", () => {
    const fresh = { ...newSchedulingState(now), id: "x", noteId: "n", ord: 0, suspended: false, buriedUntil: null } as SrsCard;
    expect(queueKindOf(fresh)).toBe("new");
    expect(queueKindOf({ ...fresh, reps: 1 })).toBe("learning");
    expect(queueKindOf({ ...fresh, state: "review" })).toBe("review");
    expect(queueKindOf({ ...fresh, state: "relearning" })).toBe("learning");
  });
});

/* ── Statistiques ─────────────────────────────────────────────────────────── */

describe("statistiques", () => {
  const now = new Date(2026, 2, 12, 10, 0);

  it("sépare les cartes jeunes des cartes mûres", () => {
    const store = storeWith(3, now);
    store.cards[0] = {
      ...store.cards[0], state: "review", reps: 4, stability: 40,
      lastReview: new Date(2026, 1, 1).toISOString(), due: new Date(2026, 3, 1).toISOString(),
    };
    store.cards[1] = {
      ...store.cards[1], state: "review", reps: 2, stability: 3,
      lastReview: new Date(2026, 2, 10).toISOString(), due: new Date(2026, 2, 14).toISOString(),
    };
    const b = stateBreakdown(store.cards, now);
    expect(b.mature).toBe(1);
    expect(b.young).toBe(1);
    expect(b.new).toBe(1);
  });

  it("reporte sur aujourd'hui les cartes en retard", () => {
    const store = storeWith(1, now);
    store.cards[0] = {
      ...store.cards[0], state: "review", reps: 4, stability: 10,
      lastReview: new Date(2026, 1, 1).toISOString(), due: new Date(2026, 1, 20).toISOString(),
    };
    const f = forecast(store.cards, now, 4, 7);
    expect(f[0].total).toBe(1);
    expect(f[0].day).toBe("2026-03-12");
  });

  it("ne compte dans la rétention que la première réponse du jour", () => {
    const store = storeWith(1, now);
    const id = store.cards[0].id;
    const mk = (at: Date, rating: 1 | 3) => ({
      cardId: id, rating, at: at.toISOString(), state: "review" as const,
      elapsed: 30, stability: 20, difficulty: 5,
    });
    // Ratée puis reprise le même jour : c'est UN échec, pas un échec et une réussite.
    store.log = [mk(new Date(2026, 2, 12, 9, 0), 1), mk(new Date(2026, 2, 12, 9, 10), 3)];
    const r = retention(store, now);
    expect(r.overall.total).toBe(1);
    expect(r.overall.rate).toBe(0);
    expect(r.mature.total).toBe(1);
  });

  it("ne casse pas la série avant la fin de la journée en cours", () => {
    const store = storeWith(1, now);
    const id = store.cards[0].id;
    store.log = [10, 11].map(d => ({
      cardId: id, rating: 3 as const, at: new Date(2026, 2, d, 10, 0).toISOString(),
      state: "review" as const, elapsed: 1, stability: 5, difficulty: 5,
    }));
    // On n'a pas encore révisé aujourd'hui : la série d'hier tient toujours.
    expect(streak(store, now).current).toBe(2);
    expect(streak(store, now).best).toBe(2);
  });
});

/* ── Import / export ──────────────────────────────────────────────────────── */

describe("import et export", () => {
  const now = new Date(2026, 2, 12, 10, 0);

  function sampleStore(): SrsStore {
    const store = emptyStore();
    store.decks = [{ id: "d1", name: "Trading", color: "blue", createdAt: now.toISOString() }];
    for (const spec of [
      { kind: "basic" as const, front: "Risque par trade", back: "1 % du capital", extra: "Jamais plus après deux pertes", tags: ["regles"] },
      { kind: "reversed" as const, front: "Drawdown", back: "Recul depuis le sommet", extra: "", tags: [] },
      { kind: "cloze" as const, front: "On coupe à {{c1::-1R}} et on vise {{c2::+2R}}.", back: "", extra: "Ratio minimal", tags: ["gestion"] },
    ]) {
      const { note, cards } = createNote({ deckId: "d1", ...spec }, now);
      store.notes.push(note);
      store.cards.push(...cards);
    }
    return store;
  }

  it("fait un aller-retour sans perte au format texte Anki", () => {
    const store = sampleStore();
    const text = toAnkiText(store);
    expect(text).toContain("#separator:tab");
    expect(text).toContain("Basic (and reversed card)");
    const { rows, skipped } = fromAnkiText(text);
    expect(skipped).toHaveLength(0);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      kind: "basic", deck: "Trading", front: "Risque par trade",
      back: "1 % du capital", extra: "Jamais plus après deux pertes", tags: ["regles"],
    });
    expect(rows[1].kind).toBe("reversed");
    expect(rows[2]).toMatchObject({ kind: "cloze", extra: "Ratio minimal" });
  });

  it("protège les champs qui contiennent une tabulation ou un guillemet", () => {
    const store = emptyStore();
    store.decks = [{ id: "d1", name: "T", color: "blue", createdAt: now.toISOString() }];
    const { note, cards } = createNote({
      deckId: "d1", kind: "basic",
      front: 'Il a dit "stop"\tpuis rien', back: "Ligne 1\nLigne 2",
    }, now);
    store.notes.push(note); store.cards.push(...cards);
    const rows = fromAnkiText(toAnkiText(store)).rows;
    expect(rows[0].front).toBe('Il a dit "stop"\tpuis rien');
    expect(rows[0].back).toBe("Ligne 1\nLigne 2");
  });

  it("accepte un collage brut de deux colonnes et devine le type", () => {
    const { rows, format } = fromAnkiText("chat\tcat\nchien\tdog\nLa capitale est {{c1::Paris}}\t");
    expect(format).toBe("plain");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kind: "basic", front: "chat", back: "cat" });
    expect(rows[2].kind).toBe("cloze");
  });

  it("signale les lignes inexploitables au lieu de les avaler", () => {
    const { rows, skipped } = fromAnkiText("bon\tverso\n\tverso orphelin\nsans verso\t");
    expect(rows).toHaveLength(1);
    expect(skipped).toHaveLength(2);
    expect(skipped[0].reason).toBe("recto vide");
    expect(skipped[1].reason).toBe("verso vide");
  });

  it("rétrograde un « Cloze » annoncé sans aucun trou", () => {
    const { rows } = fromAnkiText("#separator:tab\n#notetype column:1\nCloze\tpas de trou\tun verso");
    expect(rows[0].kind).toBe("basic");
  });

  it("conserve les paquets d'origine d'un fichier qui en porte plusieurs", () => {
    // Un export Anki multi-paquets doit ressortir multi-paquets : la page crée
    // les manquants à la volée à partir de ce champ.
    const row = (...cells: string[]) => cells.join("\t");
    const text = [
      "#separator:tab",
      "#notetype column:1",
      "#deck column:2",
      "#tags column:5",
      row("Basic", "Trading", "Risque", "1 %", ""),
      row("Basic", "Anglais", "stop loss", "ordre de protection", ""),
      row("Cloze", "Trading", "On coupe à {{c1::-1R}}", "", ""),
    ].join("\n");
    const { rows, skipped } = fromAnkiText(text);
    expect(skipped).toHaveLength(0);
    expect(rows.map(r => r.deck)).toEqual(["Trading", "Anglais", "Trading"]);
    expect(rows[2].kind).toBe("cloze");
  });

  it("retombe sur le paquet par défaut quand le fichier n'en nomme aucun", () => {
    const { rows } = fromAnkiText("chat\tcat", "Import du jour");
    expect(rows[0].deck).toBe("Import du jour");
  });

  it("refuse une sauvegarde JSON qui n'est pas la nôtre", () => {
    const store = sampleStore();
    expect(fromJsonBackup(toJsonBackup(store))?.notes).toHaveLength(3);
    expect(fromJsonBackup('{"format":"autre chose"}')).toBeNull();
    expect(fromJsonBackup("pas du json")).toBeNull();
  });
});

/* ── Optimiseur ───────────────────────────────────────────────────────────── */

describe("optimiseur", () => {
  it("écarte les cartes sans aucune révision à long terme", () => {
    const log = [
      { cardId: "a", rating: 3 as const, at: "2026-01-01T10:00:00Z", state: "learning" as const, elapsed: null, stability: null, difficulty: null },
      { cardId: "a", rating: 3 as const, at: "2026-01-01T10:10:00Z", state: "learning" as const, elapsed: 0.007, stability: 1, difficulty: 5 },
      { cardId: "b", rating: 3 as const, at: "2026-01-01T10:00:00Z", state: "learning" as const, elapsed: null, stability: null, difficulty: null },
      { cardId: "b", rating: 3 as const, at: "2026-01-05T10:00:00Z", state: "review" as const, elapsed: 4, stability: 3, difficulty: 5 },
    ];
    const samples = buildSamples(log);
    expect(samples).toHaveLength(1);
  });

  it("mesure un coût fini et cohérent", () => {
    const log = Array.from({ length: 40 }, (_, i) => {
      const card = `c${i % 10}`;
      return i % 4 === 0
        ? { cardId: card, rating: 3 as const, at: `2026-01-0${(i % 9) + 1}T10:00:00Z`, state: "learning" as const, elapsed: null, stability: null, difficulty: null }
        : { cardId: card, rating: (i % 5 === 0 ? 1 : 3) as 1 | 3, at: `2026-02-0${(i % 9) + 1}T10:00:00Z`, state: "review" as const, elapsed: 3 + (i % 7), stability: 5, difficulty: 5 };
    });
    const ev = evaluate(buildSamples(log), defaultConfig());
    expect(Number.isFinite(ev.logLoss)).toBe(true);
    expect(ev.count).toBeGreaterThan(0);
    expect(ev.predicted).toBeGreaterThan(0);
    expect(ev.predicted).toBeLessThanOrEqual(1);
  });

  it("lit un jeu de poids collé depuis Anki et refuse une liste mal formée", () => {
    const ok = parseParameters("[0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]");
    expect(ok).toHaveLength(21);
    expect(ok?.[0]).toBeCloseTo(0.212, 6);
    expect(parseParameters("0.1, 0.2")).toBeNull();
    expect(parseParameters("des mots")).toBeNull();
  });
});

/* ── Sangsues ─────────────────────────────────────────────────────────────── */

describe("sangsues", () => {
  it("alerte au seuil puis tous les quatre oublis", () => {
    const mk = (lapses: number) => ({ lapses } as SrsCard);
    expect(isLeech(mk(7), 8)).toBe(false);
    expect(isLeech(mk(8), 8)).toBe(true);
    expect(isLeech(mk(9), 8)).toBe(false);
    expect(isLeech(mk(12), 8)).toBe(true);
  });
});

/* ── Repères ──────────────────────────────────────────────────────────────── */

describe("repères de durée", () => {
  it("compte une journée en millisecondes", () => {
    expect(DAY_MS).toBe(24 * 3600 * 1000);
  });
});
