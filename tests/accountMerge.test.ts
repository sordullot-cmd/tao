import { describe, it, expect } from "vitest";
import { createMergeCode, verifyMergeCode, MERGE_CODE_TTL_MS } from "@/lib/accountMerge";

const SECRET = "secret-de-test";
const SOURCE = "6f1c2a9e-0000-4000-8000-000000000001";
const NOW = 1_760_000_000_000;

describe("code de transfert de fusion", () => {
  it("rend l'identifiant du compte qui l'a émis", () => {
    const { code } = createMergeCode(SOURCE, SECRET, NOW);
    expect(verifyMergeCode(code, SECRET, NOW + 1000)).toEqual({ ok: true, sourceUserId: SOURCE });
  });

  it("survit aux espaces et sauts de ligne d'un copier-coller", () => {
    const { code } = createMergeCode(SOURCE, SECRET, NOW);
    const pasted = `  ${code.slice(0, 20)}\n${code.slice(20)} `;
    expect(verifyMergeCode(pasted, SECRET, NOW).ok).toBe(true);
  });

  it("expire passé le délai", () => {
    const { code, expiresAt } = createMergeCode(SOURCE, SECRET, NOW);
    expect(expiresAt).toBe(NOW + MERGE_CODE_TTL_MS);
    expect(verifyMergeCode(code, SECRET, expiresAt + 1)).toEqual({ ok: false, reason: "expired" });
  });

  it("refuse un code dont on a changé le compte source", () => {
    const { code } = createMergeCode(SOURCE, SECRET, NOW);
    const [body, mac] = code.slice("tr4de-".length).split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), s: "un-autre-compte" }),
    ).toString("base64url");
    expect(verifyMergeCode(`tr4de-${forged}.${mac}`, SECRET, NOW)).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuse un code signé avec un autre secret", () => {
    const { code } = createMergeCode(SOURCE, "autre-secret", NOW);
    expect(verifyMergeCode(code, SECRET, NOW).ok).toBe(false);
  });

  it("refuse le n'importe quoi sans jeter", () => {
    for (const junk of ["", "tr4de-", "tr4de-abc", "tr4de-abc.def", "bonjour", "tr4de-.x"]) {
      expect(verifyMergeCode(junk, SECRET, NOW)).toEqual({ ok: false, reason: "invalid" });
    }
  });
});
