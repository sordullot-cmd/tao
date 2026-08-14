// @vitest-environment node
//
// Sous jsdom, `jose` refuse de signer : son `TextEncoder` rend un Uint8Array
// d'un autre realm que celui du contrôle de type. Le connecteur ne tourne de
// toute façon que côté serveur — c'est bien Node qu'il faut éprouver ici.

import { generateKeyPairSync } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ALL_DAYS } from "@/lib/bank/transactions";

/**
 * Profondeur d'historique demandée à Enable Banking.
 *
 * C'est la requête elle-même qu'on fixe ici, pas la normalisation : sans
 * `strategy=longest`, l'ASPSP rend SA fenêtre par défaut — souvent 90 jours —
 * et un `date_from` plus ancien échoue au lieu de rendre ce qu'il a. Une
 * régression sur ce paramètre ne casse donc rien de visible : elle rabote
 * silencieusement l'historique à trois mois.
 */

/** Clé de signature jetable : le module refuse de démarrer sans PEM lisible. */
beforeAll(() => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  process.env.ENABLEBANKING_APP_ID = "test-app";
  process.env.ENABLEBANKING_PRIVATE_KEY_BASE64 = Buffer.from(pem).toString("base64");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** Réponses servies dans l'ordre, et les URL appelées. */
function stubFetch(pages: { transactions?: unknown[]; continuation_key?: string }[]) {
  const calls: URL[] = [];
  let i = 0;
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(new URL(url));
    const body = pages[Math.min(i, pages.length - 1)];
    i += 1;
    return { ok: true, json: async () => body } as Response;
  });
  return calls;
}

async function load() {
  return await import("@/lib/bank/enablebanking");
}

describe("fetchTransactions — profondeur demandée", () => {
  it("s'en tient à date_from sur la fenêtre courte", async () => {
    const calls = stubFetch([{ transactions: [] }]);
    const { fetchTransactions } = await load();

    await fetchTransactions("acc-1", 90);

    const params = calls[0].searchParams;
    expect(params.get("date_from")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(params.get("strategy")).toBeNull();
  });

  it("demande strategy=longest au-delà de 90 jours", async () => {
    const calls = stubFetch([{ transactions: [] }]);
    const { fetchTransactions } = await load();

    await fetchTransactions("acc-1", 365);

    // `date_from` reste : en `longest` il ne borne plus, il suggère où chercher.
    expect(calls[0].searchParams.get("strategy")).toBe("longest");
    expect(calls[0].searchParams.get("date_from")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("ne borne rien du tout sur « tout »", async () => {
    const calls = stubFetch([{ transactions: [] }]);
    const { fetchTransactions } = await load();

    await fetchTransactions("acc-1", ALL_DAYS);

    expect(calls[0].searchParams.get("strategy")).toBe("longest");
    expect(calls[0].searchParams.get("date_from")).toBeNull();
  });

  it("suit la clé de continuation même sur une page vide", async () => {
    // En `longest`, l'agrégateur remonte par paliers : une page sans ligne mais
    // avec une clé veut dire « je cherche encore », pas « c'est fini ».
    const calls = stubFetch([
      { transactions: [], continuation_key: "k1" },
      {
        transactions: [
          { entry_reference: "t1", booking_date: "2024-03-02", transaction_amount: { amount: "12.00", currency: "EUR" }, credit_debit_indicator: "DBIT" },
        ],
      },
    ]);
    const { fetchTransactions } = await load();

    const txs = await fetchTransactions("acc-1", ALL_DAYS);

    expect(calls).toHaveLength(2);
    expect(calls[1].searchParams.get("continuation_key")).toBe("k1");
    expect(txs).toHaveLength(1);
    expect(txs[0].date).toBe("2024-03-02");
  });
});
