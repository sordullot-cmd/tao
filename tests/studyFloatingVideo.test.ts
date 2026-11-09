import { describe, it, expect, beforeEach } from "vitest";
import {
  handOff, track, claim, dismiss, requestOpen, takeOpenRequest, onOpenRequest, resetFloatingVideo,
} from "@/components/study/floatingVideo";

const entry = { noteId: "n1", videoId: "v1", youtubeId: "yt1", title: "Leçon", time: 42 };

describe("vidéo flottante de l'Étude", () => {
  beforeEach(() => resetFloatingVideo());

  it("rend au lecteur de la note le temps atteint en flottant", () => {
    handOff(entry);
    track(97.5);
    expect(claim("n1", "yt1")).toBe(97.5);
    expect(claim("n1", "yt1")).toBeNull();
  });

  it("ferme sans rien rendre quand la note remonte avec une autre vidéo", () => {
    handOff(entry);
    expect(claim("n1", "autre")).toBeNull();
    // La fenêtre est fermée : la vidéo remplacée ne revient pas.
    expect(claim("n1", "yt1")).toBeNull();
  });

  it("laisse flotter la vidéo quand c'est une autre note qui s'ouvre", () => {
    handOff(entry);
    expect(claim("n2", "yt1")).toBeNull();
    expect(claim("n1", "yt1")).toBe(42);
  });

  it("ne garde rien après fermeture", () => {
    handOff(entry);
    dismiss();
    track(10);
    expect(claim("n1", "yt1")).toBeNull();
  });

  it("ne sert qu'une fois la demande de réouverture", () => {
    const seen: string[] = [];
    const off = onOpenRequest(() => { const id = takeOpenRequest(); if (id) seen.push(id); });
    requestOpen("n1");
    expect(seen).toEqual(["n1"]);
    expect(takeOpenRequest()).toBeNull();
    off();
  });
});
