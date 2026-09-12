import { describe, it, expect, beforeEach } from "vitest";
import {
  appendCapture,
  capturesBetween,
  captureLogKey,
  forgetCapture,
  newCaptureId,
  onCaptureLogChange,
  readCaptureLog,
  type CaptureEntry,
} from "@/lib/captureLog";

const prise = (at: number, extra: Partial<CaptureEntry> = {}): CaptureEntry => ({
  id: newCaptureId(at),
  at,
  path: `/tmp/${at}.jpg`,
  bytes: 1024,
  source: "tray",
  ...extra,
});

describe("journal des captures", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("range les prises sous le jour qu'on lui donne, pas sous le jour courant", () => {
    appendCapture(prise(1_700_000_000_000), "2026-03-04");
    expect(readCaptureLog("2026-03-04")).toHaveLength(1);
    expect(readCaptureLog()).toHaveLength(0);
  });

  it("garde les prises dans l'ordre, même arrivées à l'envers", () => {
    appendCapture(prise(300), "2026-03-04");
    appendCapture(prise(100), "2026-03-04");
    appendCapture(prise(200), "2026-03-04");
    expect(readCaptureLog("2026-03-04").map(e => e.at)).toEqual([100, 200, 300]);
  });

  it("ne retient d'une plage que ce qu'elle contient — ce que lira le journal de session", () => {
    for (const at of [100, 200, 300, 400]) appendCapture(prise(at), "2026-03-04");
    expect(capturesBetween(200, 300, "2026-03-04").map(e => e.at)).toEqual([200, 300]);
  });

  it("inscrit une prise ratée plutôt que de la taire", () => {
    appendCapture(
      prise(100, { path: null, bytes: 0, error: "autorisation manquante" }),
      "2026-03-04"
    );
    const [entree] = readCaptureLog("2026-03-04");
    expect(entree.path).toBeNull();
    expect(entree.error).toBe("autorisation manquante");
  });

  it("oublie une prise sans toucher aux autres", () => {
    appendCapture(prise(100), "2026-03-04");
    appendCapture(prise(200), "2026-03-04");
    forgetCapture(newCaptureId(100), "2026-03-04");
    expect(readCaptureLog("2026-03-04").map(e => e.at)).toEqual([200]);
  });

  it("relaie l'écriture aux autres lecteurs", () => {
    const vus: number[] = [];
    const off = onCaptureLogChange(entries => vus.push(entries.length));
    appendCapture(prise(100), "2026-03-04");
    appendCapture(prise(200), "2026-03-04");
    off();
    appendCapture(prise(300), "2026-03-04"); // plus personne n'écoute
    expect(vus).toEqual([1, 2]);
  });

  it("donne un identifiant utilisable comme nom de fichier — le Rust refuse le reste", () => {
    expect(newCaptureId(Date.now())).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("survit à un journal illisible plutôt que de faire tomber la page", () => {
    localStorage.setItem(captureLogKey("2026-03-04"), "{pas du json");
    expect(readCaptureLog("2026-03-04")).toEqual([]);
  });
});
