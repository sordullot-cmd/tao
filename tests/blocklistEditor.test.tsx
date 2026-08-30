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

/** Ouvre l'éditeur vide, en navigateur — le cas où le poste est illisible. */
function open() {
  const onSave = vi.fn();
  render(<BlocklistEditor onSave={onSave} onClose={() => {}} />);
  return { onSave, field: screen.getByLabelText("Nom de l'application ou du site à ajouter") };
}

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

/* ── Ce que la fenêtre ne montre plus ─────────────────────────────────────── */

describe("dépouillement de la fenêtre", () => {
  it("n'a plus de recherche dans le catalogue : les familles suffisent", () => {
    open();
    expect(screen.queryByLabelText("Rechercher une appli ou un site")).toBeNull();
    expect(screen.getByText("Réseaux sociaux")).toBeTruthy();
  });

  it("ne porte plus de glose sur ses réglages", () => {
    open();
    expect(screen.getByText("Bloquer ce qui est listé")).toBeTruthy();
    expect(screen.queryByText(/Le reste passe/)).toBeNull();
    expect(screen.queryByText(/Sans session, tout le temps/)).toBeNull();
  });

  it("ne compte ce qui est ajouté qu'une fois", async () => {
    const { type, key } = await onDesktop("Steam");
    type("steam");
    key("Enter");
    /* La pastille porte l'entrée ; la répéter en ligne sous le champ donnait
       deux inventaires de la même chose, dont un seul se retirait d'un clic. */
    expect(screen.getAllByLabelText("Retirer Steam")).toHaveLength(1);
  });
});

/* ── Champ d'ajout : « est-ce que cette appli existe vraiment ? » ─────────── */

describe("ajout d'une appli qui n'est pas au catalogue", () => {
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
    const { field } = open();
    fireEvent.change(field, { target: { value: "Discrod" } });
    expect(screen.queryByText(/Aucune application installée/)).toBeNull();
    expect(screen.getByText(/Le nom sera comparé à l'application au premier plan/)).toBeTruthy();
  });

  it("enregistre un domaine tapé à la main", () => {
    const { field, onSave } = open();
    fireEvent.change(field, { target: { value: "figma.com" } });
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.click(screen.getByText("Créer"));
    expect(onSave.mock.calls[0][0].custom).toEqual([expect.objectContaining({ domain: "figma.com" })]);
  });
});

/* ── Le catalogue, qui reste le chemin le plus court ──────────────────────── */

describe("catalogue par familles", () => {
  it("coche une famille entière d'un clic, et le compte le dit", () => {
    const { onSave } = open();
    fireEvent.click(screen.getByText("Messagerie"));
    fireEvent.click(screen.getByText("Créer"));
    expect(onSave.mock.calls[0][0].itemIds).toContain("discord");
  });

  it("montre en pastille ce qui est retenu, et le retire de là", () => {
    open();
    fireEvent.click(screen.getByLabelText("Déplier Réseaux sociaux"));
    fireEvent.click(screen.getByText("Instagram"));
    expect(screen.getByLabelText("Retirer Instagram")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Retirer Instagram"));
    expect(screen.queryByLabelText("Retirer Instagram")).toBeNull();
  });
});
