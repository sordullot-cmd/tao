import "@testing-library/jest-dom/vitest";

// Polyfill localStorage if jsdom does not provide a full Storage API
if (typeof window !== "undefined") {
  const hasFullStorage =
    typeof window.localStorage?.removeItem === "function" &&
    typeof window.localStorage?.clear === "function";
  if (!hasFullStorage) {
    const store = new Map<string, string>();
    const storage: Storage = {
      get length() { return store.size; },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
    };
    Object.defineProperty(window, "localStorage", { value: storage, writable: true, configurable: true });
  }
}

/* Langue épinglée à l'anglais pour toute la suite.
 *
 * Les tests d'interface vérifient des libellés ANGLAIS, écrits quand c'était la
 * langue par défaut du produit. Ce défaut est passé au français (cf.
 * lib/i18n.ts) : sans épinglage, quarante-six tests se mettraient à chercher
 * « Spending » dans une page qui dit « Dépenses », et échoueraient pour une
 * raison qui n'a rien à voir avec ce qu'ils testent.
 *
 * Un test qui a besoin d'une autre langue la pose lui-même — c'est déjà ce que
 * font ceux qui écrivent `setItem("tr4de_lang", "fr")`. Et la valeur par défaut
 * du produit, elle, reste couverte : tests/i18n.test.ts efface la clé avant de
 * l'interroger.
 */
beforeEach(() => {
  try { window.localStorage.setItem("tr4de_lang", "en"); } catch { /* pas de storage : le défaut suffit */ }
});
