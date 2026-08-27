"use client";

/**
 * Onglet « Listes » — le vocabulaire du blocage.
 *
 * Une liste est un objet qu'on écrit UNE fois et qu'on réutilise partout : dans
 * un preset, dans un programme, dans une session improvisée. C'est ce qui évite
 * de recocher Instagram tous les matins, et c'est pour ça que cet onglet existe
 * séparément du lancement d'une session.
 */

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Pencil, ShieldOff, Infinity as InfinityIcon } from "lucide-react";
import { T, FIELD_BG } from "@/lib/ui/tokens";
import { TYPE } from "@/lib/ui/type";
import { PALETTE } from "@/lib/ui/palette";
import { CARD, IconButton, PillButton, SectionTitle } from "@/components/ui/da";
import { CATALOG_BY_ID } from "@/lib/focus/model";
import BlocklistEditor from "./BlocklistEditor";

/** Les premiers noms d'une liste, pour qu'on la reconnaisse sans l'ouvrir. */
function Preview({ list }) {
  const names = [
    ...list.itemIds.map(id => CATALOG_BY_ID[id]?.name).filter(Boolean),
    ...list.custom.map(c => c.name || c.domain),
  ];
  if (!names.length) return <span style={{ fontSize: 12, color: PALETTE.orange }}>Vide</span>;
  const shown = names.slice(0, 4).join(", ");
  const rest = names.length - 4;
  return (
    <span style={{ fontSize: 12, color: T.textSub, lineHeight: 1.5 }}>
      {shown}{rest > 0 && ` +${rest}`}
    </span>
  );
}

export default function BlocklistsTab({ store, setStore, actionSlot }) {
  const [editing, setEditing] = useState(null); // { list } | { create: true }

  const save = (list) => setStore(prev => {
    const exists = prev.blocklists.some(b => b.id === list.id);
    return {
      ...prev,
      blocklists: exists
        ? prev.blocklists.map(b => (b.id === list.id ? list : b))
        : [...prev.blocklists, list],
    };
  });

  /* Suppression : la liste part AUSSI des presets et des programmes qui la
     citaient. Laisser un identifiant orphelin ferait une session qui ne bloque
     plus rien, sans que rien à l'écran ne l'explique. */
  /* Bascule le caractère permanent d'une liste depuis sa carte.
     Écrit dans le magasin, donc vu tout de suite par la sentinelle : le blocage
     prend effet au clic, sans rien à relancer. */
  const togglePermanent = (id) => setStore(prev => ({
    ...prev,
    blocklists: prev.blocklists.map(b => (b.id === id ? { ...b, always: !b.always } : b)),
  }));

  const remove = (id) => setStore(prev => ({
    ...prev,
    blocklists: prev.blocklists.filter(b => b.id !== id),
    presets: prev.presets.map(p => ({ ...p, blocklistIds: p.blocklistIds.filter(x => x !== id) })),
    schedules: prev.schedules.map(s => ({ ...s, blocklistIds: s.blocklistIds.filter(x => x !== id) })),
  }));

  const usedBy = (id) => [
    ...store.presets.filter(p => p.blocklistIds.includes(id)).map(p => p.name),
    ...store.schedules.filter(s => s.blocklistIds.includes(id)).map(s => s.name),
  ];

  /* Aligné sur les onglets plutôt qu'au-dessus des cartes : même raison que
     dans SessionStart — créer une liste est une action de la page. */
  const newList = (
    <PillButton variant="primary" compact onClick={() => setEditing({ create: true })}>
      <Plus size={13} /> Nouvelle liste
    </PillButton>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {actionSlot ? createPortal(newList, actionSlot) : newList}
      <SectionTitle size="sm">Listes de blocage</SectionTitle>

      {store.blocklists.length === 0 ? (
        <div style={{ ...CARD, padding: 26, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 999, background: FIELD_BG, display: "grid", placeItems: "center" }}>
            <ShieldOff size={22} color={T.brand} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>Aucune liste</div>
          <div style={{ fontSize: 13, color: T.textSub, maxWidth: 420, lineHeight: 1.6 }}>
            Une liste dit ce qui devient inaccessible pendant une session. Composez-la
            maintenant, à froid : c&apos;est tout l&apos;intérêt du procédé.
          </div>
          <PillButton variant="primary" onClick={() => setEditing({ create: true })}>
            <Plus size={14} /> Composer une liste
          </PillButton>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {store.blocklists.map(list => {
            const hue = PALETTE[list.color] || PALETTE.purple;
            const used = usedBy(list.id);
            return (
              <div key={list.id} style={{ ...CARD, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: hue, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {list.name}
                  </span>
                  {/* Le compte de cibles vivait ici — il se lit déjà sous le
                      titre, dans l'aperçu qui NOMME ce qui est coupé. Un chiffre
                      nu par-dessus disait moins et prenait le seul coin où l'on
                      cherche une action. */}
                  <IconButton
                    onClick={() => setEditing({ list })}
                    aria-label={`Modifier ${list.name}`}
                    title="Modifier"
                  >
                    <Pencil size={13} />
                  </IconButton>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {/* Couper pour de bon ne doit pas demander d'ouvrir un éditeur
                      et d'y trouver une case : c'est ce qu'on vient chercher, et
                      c'est donc sous le titre que ça se décide. Vert une fois
                      actif — la seule couleur qui dise « ça tourne » sans avoir
                      à lire le mot. */}
                  <PillButton
                    compact
                    variant="ghost"
                    onClick={() => togglePermanent(list.id)}
                    aria-pressed={!!list.always}
                    title={list.always
                      ? "Cette liste coupe en permanence. Cliquez pour la rendre à ses sessions."
                      : "Couper cette liste en permanence, sans session ni horaire."}
                    /* Plus bas que la métrique commune des boutons, et c'est
                       délibéré : celui-ci vit sur la ligne des repères, à côté
                       d'une pastille de 11 px. À 34 px il pesait plus que le
                       titre qu'il commente. Il reste un bouton — texte, curseur,
                       état pressé — simplement à la hauteur de sa rangée. */
                    style={{
                      minHeight: 26, padding: "4px 10px", fontSize: TYPE.caption.fontSize,
                      ...(list.always
                        ? { background: `color-mix(in srgb, ${PALETTE.green} 15%, transparent)`, color: PALETTE.green }
                        : null),
                    }}
                  >
                    <InfinityIcon size={12} /> {list.always ? "Permanent" : "Rendre permanent"}
                  </PillButton>

                  {/* Ce qu'une liste inverse — un repère, pas une commande : ça
                      ne se change qu'à l'éditeur, où la conséquence est
                      expliquée. */}
                  {list.mode === "allow" && (
                    <span style={{
                      padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                      background: `color-mix(in srgb, ${PALETTE.orange} 14%, transparent)`, color: PALETTE.orange,
                    }}>
                      Seuls autorisés
                    </span>
                  )}
                </div>

                <Preview list={list} />

                {used.length > 0 ? (
                  <div style={{ fontSize: 11, color: T.textMut }}>
                    Utilisée par {used.join(", ")}
                  </div>
                ) : list.always ? (
                  <div style={{ fontSize: 11, color: T.textMut }}>
                    Aucun preset — elle s&apos;applique quand même, tout le temps.
                  </div>
                ) : null}

              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <BlocklistEditor
          key={editing.list?.id || "new"}
          list={editing.list}
          onSave={save}
          onDelete={remove}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
