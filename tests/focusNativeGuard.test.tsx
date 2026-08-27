import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, act } from "@testing-library/react";

/* Le garde natif ne peut pas être éprouvé pour de vrai : jsdom n'a ni poste ni
   fenêtre à reprendre. Ce qu'on met à l'épreuve ici est la BOUCLE — ce qu'elle
   interroge, quand elle reprend la main, et quand elle note une tentative.
   La couche Tauri elle-même (src-tauri/src/blocker.rs) est hors de portée d'un
   test unitaire, et c'est justement pourquoi la frontière est un module à part. */
const snap = { app: "Discord", title: "général", idleSeconds: 0, ok: true, full: true, platform: "macos" };
const frontSnapshot = vi.fn(async () => snap);
const reclaimFocus = vi.fn(async () => true);
type Tab = { app: string; url: string; ok: boolean; error: string | null };
const frontTab = vi.fn(async (app: string): Promise<Tab> => ({ app, url: "", ok: false, error: "not-scriptable" }));
const redirectTab = vi.fn(async (_app: string, _url?: string) => true);
const closeApp = vi.fn(async (_app: string) => true);

vi.mock("@/lib/focus/native", () => ({
  nativeAvailable: () => true,
  frontSnapshot: () => frontSnapshot(),
  reclaimFocus: () => reclaimFocus(),
  frontTab: (app: string) => frontTab(app),
  redirectTab: (app: string, url?: string) => redirectTab(app, url),
  closeApp: (app: string) => closeApp(app),
}));

/** Le poste montre un navigateur, sur l'URL donnée. `null` = URL illisible
 *  (Firefox, Windows, automatisation refusée), ce qui doit faire tomber le
 *  garde sur le titre de la fenêtre. */
function showBrowser(title: string, url: string | null, app = "Google Chrome") {
  frontSnapshot.mockResolvedValue({ ...snap, app, title });
  frontTab.mockResolvedValue(
    url ? { app, url, ok: true, error: null } : { app, url: "", ok: false, error: "automation-denied" }
  );
}

import { useFocusGuard, type GuardHit } from "@/lib/focus/guard";
import { emptyStore, sessionFromPreset } from "@/lib/focus/model";

const store = emptyStore();
const session = sessionFromPreset(
  {
    id: "p", name: "Test", durationMin: 30, blocklistIds: ["bl-msg", "bl-video"],
    mode: "normal", color: "blue", icon: "timer",
  },
  new Date()
);

function Harness({ onHit, store: s = store, session: r = session }: {
  onHit: (h: GuardHit) => void;
  store?: typeof store;
  session?: typeof session | null;
}) {
  useFocusGuard(r, s, onHit);
  return null;
}

/** Laisse la boucle tourner : l'avance des minuteurs, puis les promesses en
 *  attente (le relevé du poste est asynchrone). */
async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("garde natif", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    frontSnapshot.mockReset();
    frontSnapshot.mockResolvedValue(snap);
    frontTab.mockReset();
    frontTab.mockResolvedValue({ app: "", url: "", ok: false, error: "not-scriptable" });
    reclaimFocus.mockClear();
    redirectTab.mockReset();
    redirectTab.mockResolvedValue(true);
    closeApp.mockReset();
    closeApp.mockResolvedValue(true);
  });
  afterEach(() => vi.useRealTimers());

  it("reprend la main et note la tentative quand une appli coupée passe devant", async () => {
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} />);
    await advance(0);

    // L'appli est fermée, puis le premier plan revient sur l'explication : une
    // app qui disparaît sans un mot passe pour un plantage.
    expect(closeApp).toHaveBeenCalledWith("Discord");
    expect(reclaimFocus).toHaveBeenCalled();
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("app");
    expect(hits[0].closed).toBe(true);
    expect(hits[0].target).toBe("discord");
    expect(hits[0].appName).toBe("Discord");
    expect(hits[0].listName).toBe("Messagerie");
  });

  it("ne note qu'UNE tentative quand on insiste, mais reprend la main plusieurs fois", async () => {
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} />);
    await advance(0);
    // Vingt secondes d'insistance : sous le délai du journal, au-dessus de
    // celui de la reprise de main.
    for (let i = 0; i < 10; i++) await advance(2_000);

    expect(hits).toHaveLength(1);
    expect(reclaimFocus.mock.calls.length).toBeGreaterThan(1);
    expect(reclaimFocus.mock.calls.length).toBeLessThan(10);
  });

  it("ne touche à rien quand le poste n'est pas lisible", async () => {
    frontSnapshot.mockResolvedValueOnce({ ...snap, ok: false });
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} />);
    await advance(0);

    expect(reclaimFocus).not.toHaveBeenCalled();
    expect(hits).toHaveLength(0);
  });

  it("arrête d'interroger le poste quand la session s'arrête", async () => {
    const { unmount } = render(<Harness onHit={() => {}} />);
    await advance(0);
    const seen = frontSnapshot.mock.calls.length;
    unmount();
    await advance(10_000);
    expect(frontSnapshot.mock.calls.length).toBe(seen);
  });

  it("juge un onglet sur son URL et le renvoie vers une page vide", async () => {
    showBrowser("Mix — YouTube", "https://m.youtube.com/watch?v=x");
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} />);
    await advance(0);

    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("site");
    expect(hits[0].target).toBe("youtube");
    expect(hits[0].url).toBe("https://m.youtube.com/watch?v=x");
    // La page de blocage a pris la place de l'onglet : la personne a tout sous
    // les yeux, là où elle est. La ramener dans l'app par-dessus n'ajouterait
    // qu'une interruption.
    expect(reclaimFocus).not.toHaveBeenCalled();
    expect(hits[0].handled).toBe(true);

    // L'onglet part sur la page de blocage de l'app, qui porte tout ce qu'elle
    // affiche : le site coupé, la liste, la session, le rang de la tentative.
    const [app, url] = redirectTab.mock.calls[0];
    expect(app).toBe("Google Chrome");
    const dest = new URL(url!);
    expect(dest.origin).toBe(window.location.origin);
    expect(dest.pathname).toBe("/blocked");
    expect(dest.searchParams.get("t")).toBe("YouTube");
    expect(dest.searchParams.get("l")).toBe("Vidéo & streaming");
    expect(dest.searchParams.get("n")).toBe("1");
  });

  it("ne touche pas à un onglet que rien ne retient, même sur un titre trompeur", async () => {
    // Le titre contient « YouTube », l'URL non : c'est l'URL qui tranche.
    showBrowser("Comment YouTube gagne de l'argent — Le Monde", "https://arxiv.org/abs/1");
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} />);
    await advance(0);

    expect(hits).toHaveLength(0);
    expect(redirectTab).not.toHaveBeenCalled();
  });

  it("retombe sur le titre quand l'URL n'est pas lisible, sans renvoyer l'onglet", async () => {
    showBrowser("Mix — YouTube", null, "Firefox");
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} />);
    await advance(0);

    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("window");
    expect(hits[0].target).toBe("youtube");
    // Rien à renvoyer : on n'a pas su lire l'onglet, on ne prétend pas l'écrire.
    expect(redirectTab).not.toHaveBeenCalled();
  });

  it("reprend la main quand le renvoi de l'onglet a échoué", async () => {
    showBrowser("Mix — YouTube", "https://youtube.com/watch?v=x");
    redirectTab.mockResolvedValue(false);
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} />);
    await advance(0);

    // Rien ne s'est vu dans le navigateur : il faut bien que quelque chose se
    // voie, donc l'écran de blocage de l'app reprend son rôle.
    expect(reclaimFocus).toHaveBeenCalled();
    expect(hits[0].handled).toBe(false);
  });

  it("reprend la main pour une appli, qui n'a pas de page à remplacer", async () => {
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} />);
    await advance(0);

    expect(reclaimFocus).toHaveBeenCalled();
    expect(redirectTab).not.toHaveBeenCalled();
    expect(hits[0].handled).toBe(false);
  });

  it("ne demande pas d'URL à une appli qui n'est pas un navigateur", async () => {
    render(<Harness onHit={() => {}} />);
    await advance(0);
    expect(frontTab).not.toHaveBeenCalled();
  });

  it("coupe une appli sans aucune session quand la liste est permanente", async () => {
    /* C'est tout l'objet du drapeau : ce qu'on a décidé une fois pour toutes
       n'a pas à être relancé chaque matin. */
    const always = {
      ...store,
      blocklists: store.blocklists.map(b => (b.id === "bl-msg" ? { ...b, always: true } : b)),
    };
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} store={always} session={null} />);
    await advance(0);

    expect(hits).toHaveLength(1);
    expect(hits[0].target).toBe("discord");
    expect(reclaimFocus).toHaveBeenCalled();
  });

  it("ne coupe rien hors session quand aucune liste n'est permanente", async () => {
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} session={null} />);
    await advance(0);

    expect(hits).toHaveLength(0);
    expect(frontSnapshot).not.toHaveBeenCalled();
  });

  it("ajoute le permanent à ce que la session coupe, sans le remplacer", async () => {
    /* Deux décisions prises à deux moments n'ont pas à s'annuler : la session
       ne couvre que la messagerie, la liste permanente que la vidéo, et les
       deux tiennent en même temps. */
    const always = {
      ...store,
      blocklists: store.blocklists.map(b => (b.id === "bl-video" ? { ...b, always: true } : b)),
    };
    const msgOnly = sessionFromPreset(
      { id: "p2", name: "Msg", durationMin: 30, blocklistIds: ["bl-msg"], mode: "normal", color: "blue", icon: "timer" },
      new Date()
    );
    showBrowser("Mix — YouTube", "https://youtube.com/watch?v=x");
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} store={always} session={msgOnly} />);
    await advance(0);

    expect(hits).toHaveLength(1);
    expect(hits[0].target).toBe("youtube");
  });

  it("ne ferme jamais un navigateur, qui se juge onglet par onglet", async () => {
    /* Fermer Chrome parce qu'un onglet est sur YouTube emporterait tout le
       reste — la documentation, le brouillon, les onze autres onglets. */
    showBrowser("Mix — YouTube", "https://youtube.com/watch?v=x");
    render(<Harness onHit={() => {}} />);
    await advance(0);

    expect(closeApp).not.toHaveBeenCalled();
    expect(redirectTab).toHaveBeenCalled();
  });

  it("retombe sur la reprise de main quand l'appli refuse de fermer", async () => {
    /* Autorisation manquante, ou question posée avant de quitter : on ne
       prétend pas l'avoir fermée, et le blocage vaut quand même mieux que rien. */
    closeApp.mockResolvedValue(false);
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} />);
    await advance(0);

    expect(hits[0].closed).toBe(false);
    expect(reclaimFocus).toHaveBeenCalled();
  });
});
