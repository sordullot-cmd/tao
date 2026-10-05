import { describe, it, expect } from "vitest";
import { normalizeAvatar, resolveAvatar, DEFAULT_AVATAR } from "@/lib/profileAvatar";

const IMG = "data:image/jpeg;base64,AAAA";
const GOOGLE = "https://lh3.googleusercontent.com/a/x";

describe("avatar du profil", () => {
  it("garde le comportement d'avant chez qui n'a rien réglé", () => {
    expect(resolveAvatar(DEFAULT_AVATAR, GOOGLE)).toEqual({ src: GOOGLE, color: null });
    expect(resolveAvatar(DEFAULT_AVATAR, null)).toEqual({ src: null, color: null });
  });

  it("préfère les initiales quand on les choisit, même avec une photo Google", () => {
    expect(resolveAvatar({ mode: "initials", color: "#3B82F6", image: IMG }, GOOGLE)).toEqual({ src: null, color: "#3B82F6" });
  });

  it("affiche la photo importée", () => {
    expect(resolveAvatar({ mode: "image", color: null, image: IMG }, GOOGLE).src).toBe(IMG);
  });

  it("retombe sur les initiales quand la photo Google a disparu", () => {
    expect(resolveAvatar({ mode: "provider", color: null, image: null }, null).src).toBeNull();
  });

  it("écarte ce qu'un magasin abîmé y a laissé", () => {
    expect(normalizeAvatar(null)).toEqual(DEFAULT_AVATAR);
    expect(normalizeAvatar({ mode: "image", image: null })).toEqual(DEFAULT_AVATAR);
    expect(normalizeAvatar({ mode: "zzz", color: "rouge", image: "javascript:alert(1)" })).toEqual(DEFAULT_AVATAR);
  });
});
