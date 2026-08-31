import { describe, it, expect } from "vitest";

/**
 * Ce que ce tri protège, c'est un ordre qui SURVIT : la liste des comptes change
 * sous lui — une firme créée, un compte supprimé, un compte rattaché ailleurs —
 * et un ordre manuel qui se défait au premier changement ne vaut pas la peine
 * d'être posé.
 */

import { moveEntry, orderEntries } from "@/lib/accountsOrder";

const e = (...ids: string[]) => ids.map((id) => ({ id }));
const ids = (list: { id: string }[]) => list.map((x) => x.id);

describe("ordre manuel de la liste des comptes", () => {
  it("suit l'ordre choisi, firmes et comptes mêlés", () => {
    const order = ["acc:b", "firm:1", "acc:a"];
    expect(ids(orderEntries(e("firm:1", "acc:a", "acc:b"), order)))
      .toEqual(["acc:b", "firm:1", "acc:a"]);
  });

  it("rend la liste inchangée tant que rien n'a été trié", () => {
    const list = e("firm:1", "acc:a");
    expect(orderEntries(list, [])).toBe(list);
    expect(orderEntries(list, null)).toBe(list);
  });

  it("ignore ce que l'ordre nomme et qui n'existe plus", () => {
    // « firm:9 » a été supprimée ailleurs : elle ne doit pas trouer la liste.
    expect(ids(orderEntries(e("acc:a", "firm:1"), ["firm:9", "firm:1", "acc:a"])))
      .toEqual(["firm:1", "acc:a"]);
  });

  it("pose une ligne jamais triée derrière son voisin, pas en fin de liste", () => {
    /* « acc:neuf » vient d'être créé et arrive en 2ᵉ position naturelle : il
       reste là, au lieu de tomber sous un compte qu'on avait descendu exprès. */
    expect(ids(orderEntries(e("firm:1", "acc:neuf", "acc:a"), ["acc:a", "firm:1"])))
      .toEqual(["acc:a", "firm:1", "acc:neuf"]);
  });

  it("ne retient qu'un identifiant en double, le premier", () => {
    expect(ids(orderEntries(e("acc:a", "acc:b"), ["acc:b", "acc:a", "acc:b"])))
      .toEqual(["acc:b", "acc:a"]);
  });
});

describe("déplacement d'une ligne", () => {
  const list = e("firm:1", "acc:a", "acc:b");

  it("dépose avant la ligne visée", () => {
    expect(moveEntry(list, "acc:b", "firm:1", "before"))
      .toEqual(["acc:b", "firm:1", "acc:a"]);
  });

  it("dépose après la ligne visée", () => {
    expect(moveEntry(list, "firm:1", "acc:b", "after"))
      .toEqual(["acc:a", "acc:b", "firm:1"]);
  });

  it("compte la cible APRÈS le retrait de la ligne tirée", () => {
    // Descendre d'un cran : sans le recalcul d'index, la ligne ne bougeait pas.
    expect(moveEntry(list, "firm:1", "acc:a", "after"))
      .toEqual(["acc:a", "firm:1", "acc:b"]);
  });

  it("rend l'ordre COMPLET, y compris ce qui n'avait jamais été trié", () => {
    expect(moveEntry(list, "acc:b", "firm:1", "before")).toHaveLength(3);
  });

  it("ne bouge rien si la ligne est lâchée sur elle-même ou hors liste", () => {
    expect(moveEntry(list, "acc:a", "acc:a", "after")).toEqual(ids(list));
    expect(moveEntry(list, "acc:z", "acc:a", "after")).toEqual(ids(list));
  });
});
