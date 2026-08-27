"use client";

import React, { useState } from "react";
import { Plus, BookOpen, Check, Trash2, Pencil, X, BookMarked, FileText, Library, ChevronDown } from "lucide-react";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { useFirstLoad } from "@/lib/hooks/useFirstLoad";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useUndo } from "@/lib/contexts/UndoContext";
import { Stat } from "@/components/ui/Stat";
import Popover from "@/components/ui/Popover";
import { t, useLang } from "@/lib/i18n";
import { T as BaseT } from "@/lib/ui/tokens";
import { deepen, dotRing } from "@/lib/ui/color";
import { PALETTE, GREY } from "@/lib/ui/palette";
import { Field as DAField, FIELD as DA_FIELD, FIELD_FOCUS_RING as DA_FOCUS_RING, Modal as DAModal, PillButton as DAPillButton } from "@/components/ui/form";
import { FIELD_BG as DA_FIELD_BG } from "@/lib/ui/tokens";
import { WRITING_BG as DA_WRITING_BG } from "@/lib/ui/tokens";

const T = { ...BaseT };

const STORAGE_KEY = "tr4de_books";

const STATUSES = [
  { id: "toRead",  label: "À lire",     color: GREY.grey700 },
  { id: "reading", label: "En cours",   color: PALETTE.blue },
  { id: "done",    label: "Terminé",    color: PALETTE.green },
];
const PRIORITIES = [
  { id: "must_read", label: "À lire absolument", short: "Absolu",   color: PALETTE.red },
  { id: "important", label: "Important",         short: "Important",color: PALETTE.orange },
  { id: "normal",    label: "Normal",            short: "Normal",   color: PALETTE.blue },
  { id: "can_wait",  label: "Peut attendre",     short: "Attend",   color: GREY.grey500 },
];
const CATEGORIES = [
  { id: "trading",      label: "Trading" },
  { id: "psychology",   label: "Psychologie" },
  { id: "philosophy",   label: "Philosophie" },
  { id: "business",     label: "Business" },
  { id: "personal_dev", label: "Développement perso" },
  { id: "other",        label: "Autre" },
];

function defaultBooks() {
  return [];
}

export default function ReadingListPage() {
  useLang();
  const [books, setBooks, booksReady] = useCloudState(STORAGE_KEY, "reading_list", defaultBooks());
  const { pushUndo } = useUndo();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const emptyForm = { title: "", author: "", category: "trading", status: "toRead", priority: "normal", totalPages: "", currentPage: "" };
  const [form, setForm] = useState(emptyForm);
  const [expandedId, setExpandedId] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [filter, setFilter] = useState("all"); // all | toRead | reading | done
  const [showIntro, setShowIntro] = useCloudState("tr4de_reading_show_intro", "reading_show_intro", true);


  const save = () => {
    if (!form.title.trim()) return;
    const total = parseInt(form.totalPages) || 0;
    const current = parseInt(form.currentPage) || 0;
    if (editingId) {
      setBooks(prev => prev.map(b => b.id === editingId ? { ...b, title: form.title.trim(), author: form.author.trim(), category: form.category, status: form.status, priority: form.priority, totalPages: total, currentPage: current } : b));
    } else {
      setBooks(prev => [{ id: Date.now(), title: form.title.trim(), author: form.author.trim(), category: form.category, status: form.status, priority: form.priority, totalPages: total, currentPage: current, notes: "", createdAt: new Date().toISOString() }, ...prev]);
    }
    setForm(emptyForm); setShowForm(false); setEditingId(null);
  };
  const openEdit = (b) => {
    setForm({ title: b.title, author: b.author || "", category: b.category || "trading", status: b.status || "toRead", priority: b.priority || "normal", totalPages: String(b.totalPages || ""), currentPage: String(b.currentPage || "") });
    setEditingId(b.id); setShowForm(true);
  };
  const cancel = () => { setForm(emptyForm); setEditingId(null); setShowForm(false); };
  const remove = (id) => {
    const snap = books.find(b => b.id === id);
    setBooks(prev => prev.filter(b => b.id !== id));
    if (expandedId === id) setExpandedId(null);
    if (snap) pushUndo({
      label: "Suppression du livre",
      undo: async () => setBooks(prev => [snap, ...prev]),
      redo: async () => setBooks(prev => prev.filter(b => b.id !== snap.id)),
    });
  };
  const updateNote = (id, val) => setBooks(prev => prev.map(b => b.id === id ? { ...b, notes: val } : b));

  const shown = books.filter(b => filter === "all" ? true : (b.status || "toRead") === filter);
  const counts = {
    all: books.length,
    toRead: books.filter(b => (b.status || "toRead") === "toRead").length,
    reading: books.filter(b => b.status === "reading").length,
    done: books.filter(b => b.status === "done").length,
  };
  // Pages lues = somme des currentPage pour les "reading" + totalPages pour les "done"
  const pagesRead = books.reduce((sum, b) => {
    if (b.status === "done") return sum + (b.totalPages || 0);
    if (b.status === "reading") return sum + (b.currentPage || 0);
    return sum;
  }, 0);

  if (useFirstLoad(booksReady, STORAGE_KEY)) {
    return <PageSkeleton variant="list" label={t("nav.reading")} gap={16} toolbarRight={[152]} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="anim-1">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm); }}
          style={{ marginLeft: "auto", padding: "8px 16px", height: 34, minHeight: 34, borderRadius: 999, background: T.text, border: `1px solid ${T.text}`, color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Plus size={14} strokeWidth={2} /> Ajouter un livre
        </button>
        <div id="tr4de-page-header-slot" />
      </div>

      {/* Importance de la lecture */}
      {showIntro ? (
        <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", padding: 16, display: "flex", gap: 14, alignItems: "flex-start", position: "relative" }}>
          <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, background: T.accentBg, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <BookOpen size={18} strokeWidth={1.75} color={T.text} />
          </div>
          <div style={{ minWidth: 0, flex: 1, paddingRight: 28 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 4, letterSpacing: -0.1 }}>Pourquoi lire est essentiel pour un trader</div>
            <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.55 }}>
              La lecture est le raccourci le plus court entre l’expérience des autres et la tienne. Les meilleurs traders consacrent du temps chaque jour à lire — sur les marchés, la psychologie, le risque et la prise de décision. Un livre bien choisi peut t’éviter des années d’erreurs coûteuses, affiner ton edge et solidifier ta discipline mentale. Construis ta bibliothèque, prends des notes, retiens les idées clés : c’est un investissement à rendement composé.
            </div>
          </div>
          <button onClick={() => setShowIntro(false)} aria-label="Masquer l'encart" title="Masquer"
            style={{ position: "absolute", top: 10, right: 10, width: 24, height: 24, borderRadius: 6, border: `1px solid ${T.border}`, background: T.white, color: T.textSub, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <X size={12} strokeWidth={2} />
          </button>
        </div>
      ) : (
        <button onClick={() => setShowIntro(true)}
          style={{ alignSelf: "flex-start", padding: "8px 16px", minHeight: 34, borderRadius: 999, border: `1px dashed ${T.border}`, background: T.white, color: T.textSub, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <BookOpen size={12} strokeWidth={1.75} /> Afficher l’importance de la lecture
        </button>
      )}

      {/* Header stats — strip collé style page Objectifs */}
      <div style={{ display: "flex", flexWrap: "wrap", background: T.white, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", overflow: "hidden", fontFamily: "var(--font-sans)" }}>
        <ReadingStatCell icon={BookMarked} label="En cours"   value={counts.reading} subLabel={counts.reading > 1 ? "livres en lecture" : "livre en lecture"} />
        <ReadingStatCell icon={Check}      label="Terminés"   value={counts.done}    subLabel={counts.done > 1 ? "livres lus" : "livre lu"} />
        <ReadingStatCell icon={FileText}   label="Pages lues" value={pagesRead}      subLabel="pages cumulées" />
        <ReadingStatCell icon={Library}    label="À lire"     value={counts.toRead}  subLabel="à découvrir" isLast />
      </div>

      {showForm && (
        <DAModal
          open
          /* Lu par les lecteurs d'ecran seulement : l'en-tete de la DA ne porte
             qu'une poignee et la fermeture, et le titre du livre est deja le
             premier champ du formulaire. */
          title={editingId ? "Modifier le livre" : "Nouveau livre"}
          onClose={cancel}
          width={480}
          maxHeight="85vh"
          footer={(
            <>
              <DAPillButton variant="ghost" onClick={cancel}>Annuler</DAPillButton>
              <DAPillButton variant="primary" disabled={!form.title.trim()} onClick={save}>
                {editingId ? "Enregistrer" : "Ajouter"}
              </DAPillButton>
            </>
          )}
        >
          <>
              {/* Le titre du livre, en grand et sans chrome — comme le nom d'un
                  document. Le filet en dessous etait le dernier contour du
                  formulaire, et l'auteur juste apres n'en avait deja pas. */}
              <input type="text" autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Titre du livre"
                style={{ width: "100%", padding: "6px 0", border: "none", borderRadius: 0, fontSize: 16, fontWeight: 600, outline: "none", fontFamily: "inherit", color: T.text, background: "transparent", letterSpacing: -0.2 }} />

              <input type="text" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })}
                placeholder="Auteur"
                style={{ width: "100%", padding: "4px 0", border: "none", fontSize: 13, outline: "none", fontFamily: "inherit", color: T.textSub, background: "transparent", fontStyle: "italic" }} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Catégorie">
                  <PrettySelect
                    value={form.category}
                    onChange={(v) => setForm({ ...form, category: v })}
                    options={CATEGORIES.map(c => ({ value: c.id, label: c.label }))}
                  />
                </Field>
                <Field label="Statut">
                  <PrettySelect
                    value={form.status}
                    onChange={(v) => setForm({ ...form, status: v })}
                    options={STATUSES.map(s => ({ value: s.id, label: s.label, color: s.color }))}
                  />
                </Field>
              </div>

              <Field label="Importance">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {PRIORITIES.map(p => {
                    const active = form.priority === p.id;
                    return (
                      <button key={p.id} type="button" onClick={() => setForm({ ...form, priority: p.id })}
                        style={{
                          padding: "8px 16px", minHeight: 34, borderRadius: 999,
                          border: `1px solid ${active ? p.color : T.border}`,
                          background: active ? p.color + "14" : T.white,
                          color: active ? p.color : T.textSub,
                          fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                          display: "inline-flex", alignItems: "center", gap: 6,
                          transition: "var(--tr-ui)",
                        }}>
                        <span style={{ width: 7, height: 7, borderRadius: 999, background: p.color, boxShadow: dotRing(p.color) }} />
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Pages totales">
                  <input type="number" value={form.totalPages} onChange={(e) => setForm({ ...form, totalPages: e.target.value })} style={inputStyleLg()} placeholder="320" />
                </Field>
                <Field label="Page actuelle">
                  <input type="number" value={form.currentPage} onChange={(e) => setForm({ ...form, currentPage: e.target.value })} style={inputStyleLg()} placeholder="48" />
                </Field>
              </div>
          </>
        </DAModal>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, WebkitOverflowScrolling: "touch" }}>
        {[{ id: "all", label: "Tous" }, ...STATUSES].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            style={{
              padding: "8px 16px", minHeight: 34, borderRadius: 999,
              border: `1px solid ${filter === f.id ? T.text : T.border}`,
              background: filter === f.id ? T.text : T.white,
              color: filter === f.id ? T.white : T.text,
              fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", gap: 6,
              flexShrink: 0, whiteSpace: "nowrap",
            }}>
            {f.label}
            <span style={{ padding: "0 6px", borderRadius: 999, fontSize: 10, background: filter === f.id ? "rgba(255,255,255,0.18)" : T.accentBg, color: filter === f.id ? T.white : T.textSub }}>{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div style={{ background: T.white, border: `1px dashed ${T.border}`, borderRadius: "var(--radius-card)", padding: "48px 24px", textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "var(--radius-card)", background: T.accentBg, marginBottom: 12 }}>
            <BookOpen size={20} strokeWidth={1.75} color={T.textSub} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 4 }}>Aucun livre pour le moment</div>
          <div style={{ fontSize: 12, color: T.textSub }}>Ajoute ton premier livre pour construire ta bibliothèque</div>
        </div>
      ) : (
        <div className="anim-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))", gap: 12 }}>
          {shown.map(b => {
            const total = b.totalPages || 0;
            const current = b.currentPage || 0;
            const pct = total > 0 ? Math.max(0, Math.min(100, (current / total) * 100)) : (b.status === "done" ? 100 : 0);
            const st = STATUSES.find(s => s.id === (b.status || "toRead"));
            const cat = CATEGORIES.find(c => c.id === (b.category || "other"));
            const pri = PRIORITIES.find(p => p.id === (b.priority || "normal"));
            const isOpen = expandedId === b.id;
            return (
              <div key={b.id} data-card style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.text, letterSpacing: -0.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
                    {b.author && <div style={{ fontSize: 11, color: T.textMut, marginTop: 2, fontStyle: "italic" }}>{b.author}</div>}
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: deepen(st.color), background: st.color + "18", padding: "2px 8px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.4 }}>{st.label}</span>
                      {pri && (
                        <span title={pri.label} style={{ fontSize: 10, fontWeight: 600, color: pri.color, background: pri.color + "18", padding: "2px 8px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.4, display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: 999, background: pri.color }} />
                          {pri.short}
                        </span>
                      )}
                      {cat && <span style={{ fontSize: 10, color: T.textSub, background: T.accentBg, padding: "2px 8px", borderRadius: 999 }}>{cat.label}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => openEdit(b)} style={miniBtn()} aria-label="Modifier le livre" title="Modifier"><Pencil size={11} strokeWidth={1.75} /></button>
                    <button onClick={() => remove(b.id)} style={{ ...miniBtn(), color: T.red }} aria-label="Supprimer le livre" title="Supprimer"><Trash2 size={11} strokeWidth={1.75} /></button>
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.textMut, marginBottom: 4 }}>
                    <span>{total > 0 ? `${current}/${total} pages` : (b.status === "done" ? "Terminé" : "—")}</span>
                    <span>{Math.round(pct)}%</span>
                  </div>
                  <div style={{ height: 5, background: T.accentBg, borderRadius: "var(--radius-field)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: st.color, boxShadow: dotRing(st.color), borderRadius: "var(--radius-field)", transition: "width .4s ease" }} />
                  </div>
                </div>

                <button onClick={() => { setExpandedId(isOpen ? null : b.id); setNoteDraft(b.notes || ""); }}
                  style={{ fontSize: 11, color: T.textSub, background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", textAlign: "left" }}>
                  {isOpen ? "Masquer notes & citations" : "Notes & citations"}
                </button>
                {isOpen && (
                  <textarea
                    value={noteDraft}
                    onChange={(e) => { setNoteDraft(e.target.value); updateNote(b.id, e.target.value); }}
                    placeholder="Citations clés, idées à retenir..."
                    style={{ width: "100%", minHeight: 90, padding: 10, border: "none", borderRadius: "var(--radius-field)", fontSize: 12, outline: "none", fontFamily: "inherit", color: T.text, background: DA_WRITING_BG, resize: "vertical", lineHeight: 1.5 }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
// Deleguent aux briques communes (components/ui/form.jsx).
function Field({ label, children }) { return <DAField label={label}>{children}</DAField>; }
function inputStyleLg() { return { ...DA_FIELD, padding: "10px 14px", fontSize: 14 }; }
function miniBtn() { return { width: 24, height: 24, borderRadius: "50%", border: "none", background: DA_FIELD_BG, color: T.textSub, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }; }

function PrettySelect({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);
  // Clic extérieur : géré par le Popover (liste portalisée hors de `ref`).
  const close = React.useCallback(() => setOpen(false), []);
  const current = options.find(o => o.value === value) || options[0];
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          ...DA_FIELD, cursor: "pointer",
          boxShadow: open ? DA_FOCUS_RING : "none",
          display: "inline-flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          transition: "box-shadow var(--dur-fast) var(--ease-out)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {current?.color && <span style={{ width: 8, height: 8, borderRadius: 999, background: current.color, flexShrink: 0 }} />}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current?.label}</span>
        </span>
        <ChevronDown size={14} strokeWidth={2} style={{ color: T.textSub, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s ease" }} />
      </button>
      <Popover
        anchorRef={ref}
        open={open}
        onClose={close}
        gap={4}
        matchAnchorWidth
        maxHeight={260}
        style={{
          background: T.white, border: "none", borderRadius: 10,
          boxShadow: "var(--elev-overlay)", padding: 4,
        }}
      >
        <>
          {options.map(o => {
            const selected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = selected ? T.accentBg : "transparent"; }}
                style={{
                  width: "100%", padding: "8px 10px", border: "none", borderRadius: 6,
                  background: selected ? T.accentBg : "transparent", color: T.text,
                  fontSize:13, fontFamily: "inherit", cursor: "pointer", textAlign: "left",
                  display: "inline-flex", alignItems: "center", gap: 8,
                  fontWeight: 500,
                }}
              >
                {o.color && <span style={{ width: 8, height: 8, borderRadius: 999, background: o.color, flexShrink: 0 }} />}
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                {selected && <Check size={13} strokeWidth={2.5} style={{ color: T.text }} />}
              </button>
            );
          })}
        </>
      </Popover>
    </div>
  );
}

// Cellule type "StatCell" de la page Objectifs : icône en bulle gris clair,
// label, gros chiffre, sous-texte. Séparées par bordures verticales.
function ReadingStatCell({ icon: Icon, label, subLabel, value, isLast }) {
  return (
    <div style={{ flex: "1 1 140px", minWidth: 140, padding: 16, borderRight: isLast ? "none" : `1px solid ${T.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {Icon && (
          <div style={{ width: 26, height: 26, borderRadius: "var(--radius-card)", background: T.accentBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon size={14} strokeWidth={1.75} color={T.text} />
          </div>
        )}
        <div style={{ fontSize: 12, color: T.textSub, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, color: T.text, letterSpacing: -0.2, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 11, color: T.textMut, fontWeight: 500, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subLabel}</div>
    </div>
  );
}
