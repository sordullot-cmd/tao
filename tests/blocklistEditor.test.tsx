import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";

/* Le disque n'existe pas sous jsdom. On remplace le pont natif, PAS la commande
   Tauri : ce qui est vérifié ici, c'est ce que l'éditeur fait d'une liste
   d'applications — et le fait qu'il se comporte autrement quand il n'y en a
   pas, ce qui est le cas du navigateur. */
const installed = { list: [] as { name: string; path: string; system: boolean }[], native: false };
vi.mock("@/lib/focus/native", () => ({
  nativeAvailable: () => installed.native,
  installedApps: async () => installed.list,
}));

import BlocklistEditor from "@/components/focus/BlocklistEditor";

const app = (name: string, system = false) => ({ name, path: `/Applications/${name}.app`, system });

beforeEach(() => { installed.list = []; installed.native = false; });
afterEach(cleanup);

/** Monte l'éditeur vide et rend de quoi observer ce qu'il enregistrerait. */
function open(list?: object) {
  const onSave = vi.fn();
  render(<BlocklistEditor list={list} onSave={onSave} onClose={() => {}} />);
  const field = screen.getByLabelText("Rechercher une appli ou un site");
  const type = (v: string) => fireEvent.change(field, { target: { value: v } });
  const key = (k: string) => fireEvent.keyDown(field, { key: k });
  const save = () => {
    fireEvent.click(screen.getByText("Créer"));
    return onSave.mock.calls[0][0];
  };
  return { onSave, type, key, save };
}

describe("choix des applis à bloquer", () => {
  it("met en tête ce qui ressemble le plus à ce qui est tapé", () => {
    const { type } = open();
    type("disc");
    const rows = screen.getAllByRole("button").filter(el => el.getAttribute("aria-pressed") !== null);
    expect(within(rows[0]).getByText(/Disc/)).toBeTruthy();
    // Les familles ont disparu : on cherche, on ne range plus.
    expect(screen.queryByText("Réseaux sociaux")).toBeNull();
  });

  it("coche le résultat visé à Entrée, sans quitter le clavier", () => {
    const { type, key, save } = open();
    type("netflix");
    key("Enter");
    expect(save().itemIds).toEqual(["netflix"]);
  });

  it("laisse les flèches viser un autre résultat que le premier", () => {
    const { type, key, save } = open();
    type("st");
    fireEvent.keyDown(screen.getByLabelText("Rechercher une appli ou un site"), { key: "ArrowDown" });
    key("Enter");
    const first = save().itemIds;
    expect(first.length).toBe(1);
    expect(first[0]).not.toBe("steam");
  });

  it("montre ce qui est retenu sans qu'il faille le retrouver", () => {
    const { type, key } = open();
    type("netflix");
    key("Enter");
    /* La pastille est la seule preuve visible une fois la recherche vidée :
       c'est précisément ce qui manquait. */
    expect(screen.getByLabelText("Retirer Netflix")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Retirer Netflix"));
    expect(screen.queryByLabelText("Retirer Netflix")).toBeNull();
  });

  it("propose d'ajouter ce que le catalogue ignore, depuis le champ de recherche", () => {
    const { type, key, save } = open();
    type("figma.com");
    expect(screen.getByText(/Ajouter « figma.com »/)).toBeTruthy();
    key("Enter");
    expect(save().custom).toEqual([expect.objectContaining({ domain: "figma.com" })]);
  });

  it("efface la recherche à Échap plutôt que de fermer la fenêtre", () => {
    const onClose = vi.fn();
    render(<BlocklistEditor onSave={vi.fn()} onClose={onClose} />);
    const field = screen.getByLabelText("Rechercher une appli ou un site");
    fireEvent.change(field, { target: { value: "netflix" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect((field as HTMLInputElement).value).toBe("");
    expect(onClose).not.toHaveBeenCalled();
  });
});

/* ── Champ d'ajout : « est-ce que cette appli existe vraiment ? » ─────────── */

describe("ajout d'une appli qui n'est pas au catalogue", () => {
  /** Ouvre l'éditeur sur une machine qui a les applications données. */
  async function onDesktop(...apps: string[]) {
    installed.native = true;
    installed.list = apps.map(a => app(a));
    const onSave = vi.fn();
    render(<BlocklistEditor onSave={onSave} onClose={() => {}} />);
    const field = screen.getByLabelText("Nom de l'application ou du site à ajouter");
    /* La lecture du disque est asynchrone : on attend qu'elle ait eu lieu, sans
       quoi les cas mesureraient l'écran d'avant la réponse. */
    await waitFor(() => expect(screen.queryByText(/L'app de bureau propose ici/)).toBeNull());
    const type = (v: string) => fireEvent.change(field, { target: { value: v } });
    const key = (k: string) => fireEvent.keyDown(field, { key: k });
    const save = () => {
      fireEvent.click(screen.getByText("Créer"));
      return onSave.mock.calls[0][0];
    };
    return { field, type, key, save };
  }

  it("propose les applications réellement installées, classées", async () => {
    const { type } = await onDesktop("Disk Copy", "Discord", "Steam");
    type("disc");
    const panel = await screen.findByLabelText("Applications installées");
    const rows = within(panel).getAllByRole("button");
    /* « Discord » commence par la frappe ; « Disk Copy » ne fait que la porter
       en lettres dispersées (d-i-s…c). L'ordre du disque ne décide de rien —
       c'est tout l'objet du classement. */
    expect(rows.map(r => r.textContent)).toEqual([
      expect.stringContaining("Discord"),
      expect.stringContaining("Disk Copy"),
    ]);
  });

  it("enregistre le nom du système, pas la frappe", async () => {
    const { type, key, save } = await onDesktop("Discord");
    type("disc");
    await screen.findByLabelText("Applications installées");
    key("Enter");
    /* « disc » aurait été enregistré tel quel avant : il n'aurait jamais
       correspondu à l'application au premier plan. */
    expect(save().custom).toEqual([expect.objectContaining({ app: "Discord" })]);
  });

  it("dit qu'aucune application installée ne porte ce nom", async () => {
    const { type } = await onDesktop("Discord");
    type("Discrod");
    expect(await screen.findByText(/Aucune application installée ne porte ce nom/)).toBeTruthy();
  });

  it("confirme quand le nom tapé est celui d'une application présente", async () => {
    const { type } = await onDesktop("Steam");
    type("steam");
    expect(await screen.findByText(/« Steam » est installée sur ce poste/)).toBeTruthy();
  });

  it("ne propose aucune appli pour un domaine — on ne bloque pas un navigateur pour une adresse", async () => {
    const { type } = await onDesktop("Discord");
    type("discord.com");
    expect(screen.queryByText(/est installée sur ce poste/)).toBeNull();
    expect(await screen.findByText(/Site « discord.com »/)).toBeTruthy();
  });

  it("en navigateur, ne prétend pas savoir ce qui est installé", () => {
    open();
    const field = screen.getByLabelText("Nom de l'application ou du site à ajouter");
    fireEvent.change(field, { target: { value: "Discrod" } });
    expect(screen.queryByText(/Aucune application installée/)).toBeNull();
    expect(screen.getByText(/Le nom sera comparé à l'application au premier plan/)).toBeTruthy();
  });
});
