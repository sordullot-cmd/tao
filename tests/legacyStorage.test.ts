import { describe, it, expect, beforeEach } from "vitest";
import { LEGACY_STORAGE_SCRIPT } from "@/lib/legacyStorage";

const run = () => new Function(LEGACY_STORAGE_SCRIPT)();

describe("reprise des clés tr4de", () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it("déplace chaque clé tr4de vers tao, quel que soit le séparateur", () => {
    localStorage.setItem("tr4de_trades", "[1]");
    localStorage.setItem("tr4de.drive.zoom.p1", "2");
    localStorage.setItem("tr4de_daily_notes:pending", "{}");
    sessionStorage.setItem("tr4de_x", "s");
    run();
    expect(localStorage.getItem("tao_trades")).toBe("[1]");
    expect(localStorage.getItem("tao.drive.zoom.p1")).toBe("2");
    expect(localStorage.getItem("tao_daily_notes:pending")).toBe("{}");
    expect(sessionStorage.getItem("tao_x")).toBe("s");
    expect(localStorage.getItem("tr4de_trades")).toBeNull();
  });

  it("laisse gagner une clé tao déjà écrite après le renommage", () => {
    localStorage.setItem("tr4de_lang", "fr");
    localStorage.setItem("tao_lang", "en");
    run();
    expect(localStorage.getItem("tao_lang")).toBe("en");
    expect(localStorage.getItem("tr4de_lang")).toBeNull();
  });

  it("ne touche pas aux clés étrangères", () => {
    localStorage.setItem("sb-auth-token", "t");
    run();
    expect(localStorage.getItem("sb-auth-token")).toBe("t");
  });
});
