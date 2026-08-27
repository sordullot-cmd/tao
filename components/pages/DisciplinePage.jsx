"use client";

import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import {
  X as LucideX,
  Trash2 as LucideTrash2,
  TrendingUp as LucideTrendingUp,
  Check as LucideCheck,
  Pencil,
  Plus,
  GripVertical,
  Sun, Compass, Newspaper, ListChecks, NotebookPen, ShieldCheck, Flame,
  ClipboardCheck, ChevronDown, ChevronUp,
} from "lucide-react";
import { T } from "@/lib/ui/tokens";
import { t, useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth/supabaseAuthProvider";
import { createClient } from "@/lib/supabase/client";
import { useDisciplineTracking } from "@/lib/hooks/useDisciplineTracking";
import { useCustomDisciplineRules } from "@/lib/hooks/useCustomDisciplineRules";
import { useUndo } from "@/lib/contexts/UndoContext";
import { useCloudState } from "@/lib/hooks/useCloudState";
import { getLocalDateString } from "@/lib/dateUtils";
import { getCurrencySymbol } from "@/lib/userPrefs";
import { backdropDismiss } from "@/lib/hooks/useBackdropDismiss";
import { useSwipeToDismiss } from "@/lib/hooks/useSwipeToDismiss";
import RiskCalculator from "@/components/RiskCalculator";
import ComplianceModule, { ComplianceInsights } from "@/components/discipline/ComplianceModule";
import { useComplianceRules } from "@/lib/hooks/useComplianceData";
import { useDailySessionNotes } from "@/lib/hooks/useDailySessionNotes";
import { useTradeNotes } from "@/lib/hooks/useTradeNotes";
import { describeRule, isRuleLive, computeStats, computeJournaledDates } from "@/lib/compliance";
import { CARD } from "@/components/ui/da";
import { useApp } from "@/lib/contexts/AppContext";
import { SkeletonScreen, SkeletonCard, SkeletonStats, SkeletonList, SkeletonText } from "@/components/ui/Skeleton";
import Popover from "@/components/ui/Popover";
import { FIELD_BG as DA_FIELD_BG } from "@/lib/ui/tokens";
import { FIELD_FOCUS_RING as DA_FOCUS_RING, Modal as DAModal, PillButton as DAPillButton, ScrollArea as DAScrollArea } from "@/components/ui/form";
import { HAIRLINE as DA_HAIRLINE } from "@/lib/ui/tokens";


/* Échelle de la carte de discipline : le vert PRINCIPAL de la charte, dilué en
   cinq crans. Une seule teinte diluée fait une échelle qu'on lit d'un coup
   d'œil, là où cinq verts choisis séparément se lisent comme cinq couleurs.
   En `color-mix` avec du transparent plutôt qu'en pastels figés : le même
   pourcentage tient donc en clair comme en sombre. */
const DISC_GREENS = [
  "color-mix(in srgb, #58CC02 22%, transparent)",
  "color-mix(in srgb, #58CC02 45%, transparent)",
  "color-mix(in srgb, #58CC02 68%, transparent)",
  "color-mix(in srgb, #58CC02 85%, transparent)",
  "#58CC02",
];
/* Une journée où l'on a tradé sans respecter une seule règle. */
const DISC_RED = "color-mix(in srgb, #FF4B4B 45%, transparent)";

function reorder(arr, from, to) {
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// Édition inline : le bloc lui-même devient éditable (pas de modale ni de drawer).
// On affiche les items en cards éditables avec poignée + champ + corbeille.
function EditListModal({ open, title, accent, items, isCheckList, onClose, onSave }) {
  const [draft, setDraft] = useState([]);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  useEffect(() => {
    if (open) setDraft(items.map(it => isCheckList ? { ...it } : { label: it }));
  }, [open, items, isCheckList]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* Renvoi au glissé : le tiroir arrive par la droite, on le repousse vers la
     droite. Même geste et même physique que la barre latérale — vitesse de
     relâchement, projection de l'inertie, résistance dans le mauvais sens.
     Appelé avant le retour anticipé ci-dessous : un hook ne peut pas être
     conditionnel. */
  const { ref: drawerRef, handlers: swipeHandlers } =
    useSwipeToDismiss({ onDismiss: onClose, direction: 1, axis: "x", enabled: open });

  if (!open) return null;
  const update = (i, val) => setDraft(d => d.map((x, idx) => idx === i ? { ...x, label: val } : x));
  const remove = (i) => setDraft(d => d.filter((_, idx) => idx !== i));
  const add = () => setDraft(d => [...d, isCheckList ? { id: `personal_${Date.now()}_${d.length}`, label: "" } : { label: "" }]);
  const move = (from, to) => setDraft(d => reorder(d, from, to));
  const save = () => {
    const cleaned = draft.map(x => ({ ...x, label: (x.label || "").trim() })).filter(x => x.label);
    if (isCheckList) onSave(cleaned);
    else onSave(cleaned.map(x => x.label));
    onClose();
  };
  return ReactDOM.createPortal(
    <>
      {/* Backdrop avec slide-in fade */}
      <div {...backdropDismiss(onClose)} style={{
        position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",zIndex:9998,
        animation:"tr4de-drawer-fade 180ms ease both",
      }}/>

      {/* Drawer latéral.
          `data-sheet` (globals.css) plutôt qu'une keyframe locale : une
          keyframe avec `both` fige la valeur finale du transform et prend le
          pas sur le style inline — le glissé n'aurait donc eu aucun effet
          visible. Une transition, elle, laisse la main et repart toujours de
          la position affichée à l'écran. */}
      <aside
        ref={drawerRef}
        {...swipeHandlers}
        data-sheet="right"
        style={{
        position:"fixed",top:0,right:0,bottom:0,width:"min(440px, 92vw)",
        background:T.white,border:"none",
        zIndex:9999,display:"flex",flexDirection:"column",
        boxShadow:"var(--elev-overlay)",
        fontFamily:"var(--font-sans)",
        touchAction:"pan-y",
      }}>

        {/* Header avec accent à gauche */}
        <div style={{display:"flex",alignItems:"stretch"}}>
          <div style={{width:3,background:accent,flexShrink:0}}/>
          <div style={{flex:1,display:"flex",alignItems:"center",gap:10,padding:"18px 20px"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:11,fontWeight:600,color:T.textMut,textTransform:"uppercase",letterSpacing:0.5,marginBottom:2}}>Édition</div>
              <h2 style={{fontSize:16,fontWeight:600,color:T.text,margin:0,letterSpacing:-0.15,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{title}</h2>
            </div>
            <button onClick={onClose} aria-label="Fermer"
              style={{display:"flex",alignItems:"center",justifyContent:"center",width:32,height:32,background:"transparent",border:"none",cursor:"pointer",color:T.textMut,borderRadius:"var(--radius-card)",flexShrink:0}}
              onMouseEnter={(e)=>{e.currentTarget.style.background="var(--color-hover-bg, #F5F5F5)";e.currentTarget.style.color=T.text}}
              onMouseLeave={(e)=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.textMut}}>
              <LucideX size={18} strokeWidth={1.75}/>
            </button>
          </div>
        </div>

        {/* Liste éditable */}
        <DAScrollArea style={{flex:1,padding:"16px 20px"}}>
          {draft.length === 0 ? (
            <div style={{padding:"48px 16px",textAlign:"center",color:T.textMut,fontSize:13}}>
              Aucune règle pour l'instant.<br/>
              <span style={{fontSize:12,color:T.textMut}}>Ajoute-en une avec le bouton ci-dessous.</span>
            </div>
          ) : (
            <ol style={{listStyle:"none",margin:0,padding:0,display:"flex",flexDirection:"column",gap:8}}>
              {draft.map((it, i) => (
                <li key={i}
                  draggable
                  onDragStart={()=>setDragIdx(i)}
                  onDragOver={(e)=>{e.preventDefault();setOverIdx(i)}}
                  onDragLeave={()=>setOverIdx(null)}
                  onDrop={()=>{ if (dragIdx!==null && dragIdx!==i) move(dragIdx, i); setDragIdx(null); setOverIdx(null); }}
                  onDragEnd={()=>{setDragIdx(null);setOverIdx(null)}}
                  style={{
                    display:"flex",alignItems:"center",gap:6,
                    background: DA_FIELD_BG,
                    border:"none",
                    boxShadow: overIdx===i && dragIdx!==i ? `0 0 0 2px ${accent}` : "none",
                    borderRadius:12,
                    padding:"4px 8px 4px 4px",
                    opacity: dragIdx===i ? 0.4 : 1,
                    transition:"box-shadow var(--dur-fast) var(--ease-out), opacity .12s ease",
                  }}>
                  <span style={{cursor:"grab",color:T.textMut,display:"inline-flex",padding:"6px 4px",flexShrink:0}} title="Glisser pour réordonner">
                    <GripVertical size={14} strokeWidth={1.75}/>
                  </span>
                  <input
                    type="text" value={it.label} placeholder={`Règle ${i+1}`}
                    onChange={(e)=>update(i, e.target.value)}
                    style={{flex:1,padding:"8px 0",border:"none",outline:"none",fontSize:13,fontFamily:"inherit",color:T.text,background:"transparent"}}
                  />
                  <button type="button" onClick={()=>remove(i)} title="Supprimer"
                    style={{width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",border:"none",background:"transparent",cursor:"pointer",color:T.textMut,borderRadius:6,flexShrink:0,transition:"color .12s ease, background .12s ease"}}
                    onMouseEnter={(e)=>{e.currentTarget.style.color=T.red;e.currentTarget.style.background=T.redBg}}
                    onMouseLeave={(e)=>{e.currentTarget.style.color=T.textMut;e.currentTarget.style.background="transparent"}}>
                    <LucideTrash2 size={14} strokeWidth={1.75}/>
                  </button>
                </li>
              ))}
            </ol>
          )}

          {/* Bouton ajouter */}
          <button type="button" onClick={add}
            style={{minHeight: 34,
              display:"flex",alignItems:"center",justifyContent:"center",gap:6,
              padding:"8px 16px",fontSize:13,fontWeight:500,
              color:T.text,background:DA_FIELD_BG,
              border:"none",cursor:"pointer",borderRadius:999,
              fontFamily:"inherit",width:"100%",marginTop:draft.length === 0 ? 0 : 8,
              transition:"var(--tr-ui)",
            }}
            onMouseEnter={(e)=>{e.currentTarget.style.background=accent+"14"}}
            onMouseLeave={(e)=>{e.currentTarget.style.background=DA_FIELD_BG}}>
            <Plus size={14} strokeWidth={2}/> Ajouter une règle
          </button>
        </DAScrollArea>

        {/* Footer */}
        <div style={{display:"flex",gap:8,justifyContent:"space-between",alignItems:"center",padding:"14px 20px",borderTop:`1px solid ${DA_HAIRLINE}`,flexShrink:0}}>
          <span style={{fontSize:11,color:T.textMut,fontVariantNumeric:"tabular-nums"}}>
            {draft.filter(d => (d.label || "").trim()).length} règle{draft.length > 1 ? "s" : ""}
          </span>
          <div style={{display:"flex",gap:8}}>
            <DAPillButton onClick={onClose}>Annuler</DAPillButton>
            <DAPillButton variant="primary" onClick={save}>Enregistrer</DAPillButton>
          </div>
        </div>

      </aside>

      <style>{`
        @keyframes tr4de-drawer-fade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </>,
    document.body
  );
}
function EditableTextList({ title, iconBg, icon, items, onSave, renderPrefix, accent }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const enterEdit = () => { setDraft(items.map(it => ({ label: it }))); setEditing(true); };
  const cancelEdit = () => { setEditing(false); setDraft([]); };
  const saveEdit = () => {
    const cleaned = draft.map(x => (x.label || "").trim()).filter(Boolean);
    onSave(cleaned);
    setEditing(false); setDraft([]);
  };
  const update = (i, val) => setDraft(d => d.map((x, idx) => idx === i ? { ...x, label: val } : x));
  const removeRow = (i) => setDraft(d => d.filter((_, idx) => idx !== i));
  const addRow = () => setDraft(d => [...d, { label: "" }]);
  const move = (from, to) => setDraft(d => reorder(d, from, to));
  return (
    <div
      style={{background:T.white,border:`1px solid ${editing ? accent : T.border}`,borderRadius:"var(--radius-card)",overflow:"hidden",transition:"border-color .15s ease"}}
      onMouseEnter={(e)=>{ if (!editing) { const btn = e.currentTarget.querySelector('[data-edit-btn]'); if (btn) btn.style.opacity = 1; } }}
      onMouseLeave={(e)=>{ if (!editing) { const btn = e.currentTarget.querySelector('[data-edit-btn]'); if (btn) btn.style.opacity = 0; } }}>
      {/* Header */}
      <div style={{padding:"14px 16px 12px",borderBottom:`1px solid ${editing ? accent + "30" : T.border}`,display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:24,height:24,borderRadius:6,background:iconBg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{icon}</div>
        <div style={{fontSize:13,fontWeight:600,color:T.text,letterSpacing:-0.1,flex:1}}>{title}</div>
        {editing ? (
          <div style={{display:"flex",gap:6}}>
            <button onClick={cancelEdit} style={{height:26,padding:"0 10px",border:`1px solid ${T.border}`,background:T.white,color:T.textSub,fontSize:12,fontWeight:500,cursor:"pointer",borderRadius:6,fontFamily:"inherit"}}>Annuler</button>
            <button onClick={saveEdit} style={{height:26,padding:"0 10px",border:`1px solid ${accent}`,background:accent,color:T.white,fontSize:12,fontWeight:600,cursor:"pointer",borderRadius:6,fontFamily:"inherit"}}>OK</button>
          </div>
        ) : (
          <button data-edit-btn type="button" onClick={enterEdit} title="Modifier"
            style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:24,height:24,border:"none",background:"transparent",cursor:"pointer",color:T.textMut,borderRadius:6,opacity:0,transition:"opacity .15s ease"}}
            onMouseEnter={(e)=>{e.currentTarget.style.background=T.border;e.currentTarget.style.color=T.text}}
            onMouseLeave={(e)=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.textMut}}>
            <Pencil size={13} strokeWidth={1.75}/>
          </button>
        )}
      </div>

      {/* Corps */}
      {editing ? (
        <div style={{padding:"8px 10px 12px"}}>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {draft.map((it,i)=>(
              <div key={i}
                draggable
                onDragStart={()=>setDragIdx(i)}
                onDragOver={(e)=>{e.preventDefault();setOverIdx(i)}}
                onDragLeave={()=>setOverIdx(null)}
                onDrop={()=>{ if (dragIdx!==null && dragIdx!==i) move(dragIdx,i); setDragIdx(null); setOverIdx(null); }}
                onDragEnd={()=>{setDragIdx(null);setOverIdx(null)}}
                style={{display:"flex",alignItems:"center",gap:4,padding:"2px 4px",borderRadius:6,
                  background: overIdx===i && dragIdx!==i ? "var(--color-hover-bg, #F5F5F5)" : "transparent",
                  opacity: dragIdx===i ? 0.4 : 1,
                  transition:"background .12s ease",
                }}>
                <span style={{cursor:"grab",color:T.textMut,display:"inline-flex",padding:4,flexShrink:0}}><GripVertical size={12} strokeWidth={1.75}/></span>
                <input
                  type="text" value={it.label} placeholder={`Règle ${i+1}`}
                  onChange={(e)=>update(i, e.target.value)}
                  onKeyDown={(e)=>{ if (e.key==="Enter"){ e.preventDefault(); addRow(); } }}
                  style={{flex:1,fontSize:12,padding:"6px 12px",border:"none",borderRadius:999,outline:"none",fontFamily:"inherit",color:T.text,background:DA_FIELD_BG}}
                  onFocus={(e)=>{e.currentTarget.style.boxShadow=DA_FOCUS_RING}}
                  onBlur={(e)=>{e.currentTarget.style.boxShadow="none"}}
                />
                <button type="button" onClick={()=>removeRow(i)} title="Supprimer"
                  style={{width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",border:"none",background:"transparent",cursor:"pointer",color:T.textMut,borderRadius:"var(--radius-field)",flexShrink:0}}
                  onMouseEnter={(e)=>{e.currentTarget.style.color=T.red}} onMouseLeave={(e)=>{e.currentTarget.style.color=T.textMut}}>
                  <LucideTrash2 size={12} strokeWidth={1.75}/>
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addRow}
            style={{display:"inline-flex",alignItems:"center",gap:4,marginTop:6,padding:"6px 8px",fontSize:12,color:T.textSub,background:"transparent",border:"none",cursor:"pointer",borderRadius:6,fontFamily:"inherit"}}
            onMouseEnter={(e)=>{e.currentTarget.style.background="var(--color-hover-bg, #F5F5F5)";e.currentTarget.style.color=T.text}}
            onMouseLeave={(e)=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.textSub}}>
            <Plus size={12} strokeWidth={2}/> Ajouter
          </button>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",padding:"8px 6px"}}>
          {items.length === 0 && (
            <div style={{padding:"12px",fontSize:12,color:T.textMut,textAlign:"center"}}>Aucun élément. Survolez et cliquez ✎ pour ajouter.</div>
          )}
          {items.map((txt,i)=>(
            <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"6px 10px",borderRadius:6,transition:"background .12s ease"}}
              onMouseEnter={(e)=>{e.currentTarget.style.background="var(--color-hover-bg, #F5F5F5)"}}
              onMouseLeave={(e)=>{e.currentTarget.style.background="transparent"}}>
              {renderPrefix?.(i)}
              <div style={{fontSize:12,color:T.text,fontWeight:400,lineHeight:1.5,flex:1}}>{txt}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EditableCheckList({ title, iconBg, icon, items, checkedRuleIds, onToggleCheck, onSave, accent }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState([]);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const checkedCount = items.filter(r => !!checkedRuleIds[r.id]).length;
  const enterEdit = () => { setDraft(items.map(it => ({...it}))); setEditing(true); };
  const cancelEdit = () => { setEditing(false); setDraft([]); };
  const saveEdit = () => {
    const cleaned = draft.map(x => ({...x, label: (x.label||"").trim()})).filter(x => x.label);
    onSave(cleaned);
    setEditing(false); setDraft([]);
  };
  const update = (i, val) => setDraft(d => d.map((x,idx) => idx===i ? {...x, label: val} : x));
  const removeRow = (i) => setDraft(d => d.filter((_,idx) => idx!==i));
  const addRow = () => setDraft(d => [...d, { id: `personal_${Date.now()}_${d.length}`, label: "" }]);
  const move = (from, to) => setDraft(d => reorder(d, from, to));
  return (
    <div style={{background:T.white,border:`1px solid ${editing ? accent : T.border}`,borderRadius:"var(--radius-card)",overflow:"hidden",transition:"border-color .15s ease"}}
      onMouseEnter={(e)=>{ if (!editing) { const btn = e.currentTarget.querySelector('[data-edit-btn]'); if (btn) btn.style.opacity = 1; } }}
      onMouseLeave={(e)=>{ if (!editing) { const btn = e.currentTarget.querySelector('[data-edit-btn]'); if (btn) btn.style.opacity = 0; } }}>
      <div style={{padding:"14px 16px 12px",borderBottom:`1px solid ${editing ? accent + "30" : T.border}`,display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:24,height:24,borderRadius:6,background:iconBg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{icon}</div>
        <div style={{fontSize:13,fontWeight:600,color:T.text,letterSpacing:-0.1,flex:1}}>{title}</div>
        {editing ? (
          <div style={{display:"flex",gap:6}}>
            <button onClick={cancelEdit} style={{height:26,padding:"0 10px",border:`1px solid ${T.border}`,background:T.white,color:T.textSub,fontSize:12,fontWeight:500,cursor:"pointer",borderRadius:6,fontFamily:"inherit"}}>Annuler</button>
            <button onClick={saveEdit} style={{height:26,padding:"0 10px",border:`1px solid ${accent}`,background:accent,color:T.white,fontSize:12,fontWeight:600,cursor:"pointer",borderRadius:6,fontFamily:"inherit"}}>OK</button>
          </div>
        ) : (
          <>
            <div style={{fontSize:11,color:T.textMut,fontVariantNumeric:"tabular-nums"}}>{checkedCount}/{items.length}</div>
            <button data-edit-btn type="button" onClick={enterEdit} title="Modifier"
              style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:24,height:24,border:"none",background:"transparent",cursor:"pointer",color:T.textMut,borderRadius:6,opacity:0,transition:"opacity .15s ease"}}
              onMouseEnter={(e)=>{e.currentTarget.style.background=T.border;e.currentTarget.style.color=T.text}}
              onMouseLeave={(e)=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.textMut}}>
              <Pencil size={13} strokeWidth={1.75}/>
            </button>
          </>
        )}
      </div>

      {editing ? (
        <div style={{padding:"8px 10px 12px"}}>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {draft.map((it,i)=>(
              <div key={i}
                draggable
                onDragStart={()=>setDragIdx(i)}
                onDragOver={(e)=>{e.preventDefault();setOverIdx(i)}}
                onDragLeave={()=>setOverIdx(null)}
                onDrop={()=>{ if (dragIdx!==null && dragIdx!==i) move(dragIdx,i); setDragIdx(null); setOverIdx(null); }}
                onDragEnd={()=>{setDragIdx(null);setOverIdx(null)}}
                style={{display:"flex",alignItems:"center",gap:4,padding:"2px 4px",borderRadius:6,
                  background: overIdx===i && dragIdx!==i ? "var(--color-hover-bg, #F5F5F5)" : "transparent",
                  opacity: dragIdx===i ? 0.4 : 1,
                  transition:"background .12s ease",
                }}>
                <span style={{cursor:"grab",color:T.textMut,display:"inline-flex",padding:4,flexShrink:0}}><GripVertical size={12} strokeWidth={1.75}/></span>
                <input
                  type="text" value={it.label} placeholder={`Règle ${i+1}`}
                  onChange={(e)=>update(i, e.target.value)}
                  onKeyDown={(e)=>{ if (e.key==="Enter"){ e.preventDefault(); addRow(); } }}
                  style={{flex:1,fontSize:12,padding:"6px 12px",border:"none",borderRadius:999,outline:"none",fontFamily:"inherit",color:T.text,background:DA_FIELD_BG}}
                  onFocus={(e)=>{e.currentTarget.style.boxShadow=DA_FOCUS_RING}}
                  onBlur={(e)=>{e.currentTarget.style.boxShadow="none"}}
                />
                <button type="button" onClick={()=>removeRow(i)} title="Supprimer"
                  style={{width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",border:"none",background:"transparent",cursor:"pointer",color:T.textMut,borderRadius:"var(--radius-field)",flexShrink:0}}
                  onMouseEnter={(e)=>{e.currentTarget.style.color=T.red}} onMouseLeave={(e)=>{e.currentTarget.style.color=T.textMut}}>
                  <LucideTrash2 size={12} strokeWidth={1.75}/>
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addRow}
            style={{display:"inline-flex",alignItems:"center",gap:4,marginTop:6,padding:"6px 8px",fontSize:12,color:T.textSub,background:"transparent",border:"none",cursor:"pointer",borderRadius:6,fontFamily:"inherit"}}
            onMouseEnter={(e)=>{e.currentTarget.style.background="var(--color-hover-bg, #F5F5F5)";e.currentTarget.style.color=T.text}}
            onMouseLeave={(e)=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.textSub}}>
            <Plus size={12} strokeWidth={2}/> Ajouter
          </button>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",padding:"8px 6px"}}>
          {items.length === 0 && (
            <div style={{padding:"12px",fontSize:12,color:T.textMut,textAlign:"center"}}>Aucune règle. Survolez et cliquez ✎ pour en ajouter.</div>
          )}
          {items.map(r => {
            const checked = !!checkedRuleIds[r.id];
            return (
              <label key={r.id}
                style={{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",borderRadius:6,cursor:"pointer",background:"transparent",transition:"background .12s ease"}}
                onMouseEnter={(e)=>{e.currentTarget.style.background="var(--color-hover-bg, #F5F5F5)"}}
                onMouseLeave={(e)=>{e.currentTarget.style.background="transparent"}}>
                <input type="checkbox" checked={checked} onChange={()=>onToggleCheck(r.id)}
                  style={{width:14,height:14,accentColor:T.green,cursor:"pointer",margin:0,flexShrink:0}}/>
                <span style={{fontSize:12, color: checked ? T.textMut : T.text, fontWeight:400, lineHeight:1.5, textDecoration: checked ? "line-through" : "none"}}>
                  {r.label}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ComplianceRulesCard() {
  const { rules, loaded } = useComplianceRules();
  const liveRules = (rules || []).filter(r => isRuleLive(r));
  const total = (rules || []).length;
  const activeCount = liveRules.length;

  return (
    <div style={{background:T.white,border:`1px solid #E5E5E5`,borderRadius:"var(--radius-card)",overflow:"hidden"}}>
      <div style={{padding:"14px 16px 12px",borderBottom:`1px solid #E5E5E5`,display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:24,height:24,borderRadius:6,background:DA_FIELD_BG,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <ShieldCheck size={13} strokeWidth={1.75} color={T.green}/>
        </div>
        <div style={{fontSize:13,fontWeight:600,color:T.text,letterSpacing:-0.1,flex:1}}>Règles automatiques</div>
        <div style={{fontSize:11,color:T.textMut,fontVariantNumeric:"tabular-nums"}}>{activeCount}/{total}</div>
      </div>

      <div style={{padding:"12px 14px"}}>
        {!loaded ? null : total === 0 ? (
          <div style={{padding:"24px 14px",fontSize:13,color:T.textMut,textAlign:"center",lineHeight:1.6}}>
            Aucune règle automatique.<br/>
            <span style={{fontSize:12}}>Définis tes règles dans le moteur de compliance plus bas.</span>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column"}}>
            {(rules || []).map((rule, i) => {
              const live = isRuleLive(rule);
              return (
                <div key={rule.id} style={{
                  display:"grid",
                  gridTemplateColumns:"auto 1fr",
                  gap:12, alignItems:"center",
                  padding:"12px 12px",
                  borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
                  opacity: rule.active ? 1 : 0.55,
                }}>
                  <ShieldCheck size={14} strokeWidth={1.75} color={live ? T.green : T.textMut}/>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}
                      title={describeRule(rule)}>
                      {describeRule(rule)}
                    </div>
                    <div style={{fontSize:11,color:T.textMut,marginTop:2,display:"flex",alignItems:"center",gap:8}}>
                      {live ? (
                        <span style={{display:"inline-flex",alignItems:"center",gap:3,color:T.green}}>
                          <span style={{width:6,height:6,borderRadius:"50%",background:T.green,display:"inline-block"}}/>
                          active
                        </span>
                      ) : (
                        <span style={{display:"inline-flex",alignItems:"center",gap:3,color:T.textMut}}>
                          <span style={{width:6,height:6,borderRadius:"50%",background:T.border2,display:"inline-block"}}/>
                          inactive
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DisciplinePage({ trades = [] }) {
  useLang();
  // ✅ Utiliser les hooks Supabase
  const { user } = useAuth();
  const { getDayDiscipline, setRuleCompleted, getDayScore, baseRules, disciplineData } = useDisciplineTracking();
  const { customRules, loading: rulesLoading, addRule, deleteRule } = useCustomDisciplineRules();
  const { pushUndo } = useUndo();

  // Stats compliance (règles automatiques) → utilisées par la heatmap pour afficher
  // un % de discipline quotidien basé sur les violations détectées sur les trades du jour.
  const { rules: complianceRules } = useComplianceRules();
  const { notes: dailyNotes } = useDailySessionNotes();
  const { notes: tradeNotes } = useTradeNotes();
  const journaledDates = React.useMemo(
    () => computeJournaledDates(trades || [], dailyNotes, tradeNotes),
    [trades, dailyNotes, tradeNotes]
  );
  const complianceStats = React.useMemo(
    () => computeStats(complianceRules || [], trades || [], journaledDates),
    [complianceRules, trades, journaledDates]
  );
  const violatingTradesByDay = React.useMemo(() => {
    const map = new Map();
    for (const v of complianceStats.violations) {
      let s = map.get(v.date);
      if (!s) { s = new Set(); map.set(v.date, s); }
      s.add(v.trade_id);
    }
    return map;
  }, [complianceStats]);
  
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [showRoutinePopover, setShowRoutinePopover] = useState(false);
  const routineBtnRef = useRef(null);
  // Checklist routine — état journalier, persisté localement par date.
  const [routineChecks, setRoutineChecks] = useState(() => {
    try {
      const k = `tr4de_routine_checklist_${getLocalDateString()}`;
      return JSON.parse(localStorage.getItem(k) || "{}");
    } catch { return {}; }
  });
  const DEFAULT_ROUTINE_ITEMS = [
    { id: "biais_journalier", label: "Biais journalier défini" },
    { id: "fvg_respecte",     label: "FVG respectée identifiée" },
    { id: "zones_cle",        label: "Traçage des zones clé" },
  ];
  const [routineItems, setRoutineItems] = useCloudState(
    "tr4de_routine_rules",
    "routine_rules",
    DEFAULT_ROUTINE_ITEMS,
  );
  const ROUTINE_ITEMS = Array.isArray(routineItems) && routineItems.length ? routineItems : DEFAULT_ROUTINE_ITEMS;
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [editingRuleDraft, setEditingRuleDraft] = useState("");
  const [newRuleDraft, setNewRuleDraft] = useState("");
  const addRoutineRule = () => {
    const v = newRuleDraft.trim();
    if (!v) return;
    setRoutineItems(prev => {
      const base = Array.isArray(prev) && prev.length ? prev : DEFAULT_ROUTINE_ITEMS;
      return [...base, { id: `r_${Date.now()}`, label: v }];
    });
    setNewRuleDraft("");
  };
  // Crée une règle vide et passe immédiatement en édition.
  const startCreateRoutineRule = () => {
    const id = `r_${Date.now()}`;
    setRoutineItems(prev => {
      const base = Array.isArray(prev) && prev.length ? prev : DEFAULT_ROUTINE_ITEMS;
      return [...base, { id, label: "" }];
    });
    setEditingRuleId(id);
    setEditingRuleDraft("");
  };
  const startEditRule = (it) => { setEditingRuleId(it.id); setEditingRuleDraft(it.label); };
  const commitEditRule = () => {
    const v = editingRuleDraft.trim();
    const id = editingRuleId;
    if (!id) return;
    setRoutineItems(prev => {
      const base = Array.isArray(prev) && prev.length ? prev : DEFAULT_ROUTINE_ITEMS;
      if (!v) return base.filter(x => x.id !== id); // règle vide → supprimée
      return base.map(x => x.id === id ? { ...x, label: v } : x);
    });
    setEditingRuleId(null); setEditingRuleDraft("");
  };
  const cancelEditRule = () => {
    const id = editingRuleId;
    if (id) {
      // Si la règle était vide (création), on la retire.
      setRoutineItems(prev => {
        const base = Array.isArray(prev) && prev.length ? prev : DEFAULT_ROUTINE_ITEMS;
        const cur = base.find(x => x.id === id);
        if (cur && !cur.label) return base.filter(x => x.id !== id);
        return base;
      });
    }
    setEditingRuleId(null); setEditingRuleDraft("");
  };
  const removeRoutineRule = (id) => {
    setRoutineItems(prev => {
      const base = Array.isArray(prev) && prev.length ? prev : DEFAULT_ROUTINE_ITEMS;
      return base.filter(x => x.id !== id);
    });
    // Nettoie l'éventuel check du jour pour cette règle.
    setRoutineChecks(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev }; delete next[id];
      try {
        const k = `tr4de_routine_checklist_${getLocalDateString()}`;
        localStorage.setItem(k, JSON.stringify(next));
      } catch {}
      return next;
    });
    setHeatmapVersion(v => v + 1);
  };
  const toggleRoutineCheck = (id) => {
    setRoutineChecks(prev => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        const k = `tr4de_routine_checklist_${getLocalDateString()}`;
        localStorage.setItem(k, JSON.stringify(next));
      } catch {}
      return next;
    });
    // La heatmap intègre la routine → forcer un recalcul.
    setHeatmapVersion(v => v + 1);
  };
  const routineDoneCount = ROUTINE_ITEMS.reduce((n, it) => n + (routineChecks[it.id] ? 1 : 0), 0);
  // Fermeture (clic extérieur, Échap) : Popover.
  const closeRoutinePopover = React.useCallback(() => setShowRoutinePopover(false), []);
  const [heatmapVersion, setHeatmapVersion] = useState(0);
  // Historique des checklists de routine, indexé par date, MÉMOÏSÉ.
  // Auparavant reconstruit dans le rendu de la heatmap en balayant tout
  // localStorage à CHAQUE render → coûteux. Recalculé uniquement quand la
  // routine change (heatmapVersion, bumpé à chaque toggle) ou quand la
  // définition des règles change (routineItems).
  const routineByDay = React.useMemo(() => {
    const map = new Map();
    const totalRules = ROUTINE_ITEMS.length;
    if (!totalRules) return map;
    try {
      const prefix = "tr4de_routine_checklist_";
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        const date = k.slice(prefix.length);
        let obj;
        try { obj = JSON.parse(localStorage.getItem(k) || "{}"); } catch { obj = {}; }
        if (!obj || Object.keys(obj).length === 0) continue; // aucune donnée
        const done = ROUTINE_ITEMS.reduce((n, it) => n + (obj[it.id] ? 1 : 0), 0);
        map.set(date, { done, total: totalRules });
      }
    } catch {}
    return map;
  }, [heatmapVersion, routineItems]);
  // Mémorise la dernière règle cochée pour gérer Shift+clic (sélection plage)
  const [lastClickedRuleId, setLastClickedRuleId] = useState(null);
  const [checkedRuleIds, setCheckedRuleIds] = useState(() => {
    try {
      const todayKey = getLocalDateString();
      return JSON.parse(localStorage.getItem(`tr4de_checked_rules_${todayKey}`) || "{}");
    } catch {
      return {};
    }
  });
  const [newManualRule, setNewManualRule] = useState("");
  const [ruleCategory, setRuleCategory] = useState("texte");
  const [ruleTime, setRuleTime] = useState("09:00");
  const [ruleAmount, setRuleAmount] = useState("");
  const [disciplineRules, setDisciplineRules] = useCloudState("tr4de_discipline_rules_config", "discipline_rules_config", {});
  const [activeDays, setActiveDays] = useCloudState("tr4de_discipline_active_days", "discipline_active_days", {});

  // Listes éditables pour Bias / Règles à suivre / Erreurs à éviter — vides
  // par défaut pour que chaque utilisateur les remplisse lui-même.
  const DEFAULT_BIAS = [];
  const DEFAULT_PERSONAL = [];
  const DEFAULT_ERRORS = [];
  const [biasItems, setBiasItems] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("tr4de_bias_items") || "null");
      return Array.isArray(saved) ? saved : DEFAULT_BIAS;
    } catch { return DEFAULT_BIAS; }
  });
  const [personalRules, setPersonalRules] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("tr4de_personal_rules") || "null");
      return Array.isArray(saved) ? saved : DEFAULT_PERSONAL;
    } catch { return DEFAULT_PERSONAL; }
  });
  const [errorItems, setErrorItems] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("tr4de_error_items") || "null");
      return Array.isArray(saved) ? saved : DEFAULT_ERRORS;
    } catch { return DEFAULT_ERRORS; }
  });
  React.useEffect(() => { try { localStorage.setItem("tr4de_bias_items", JSON.stringify(biasItems)); } catch {} }, [biasItems]);
  React.useEffect(() => { try { localStorage.setItem("tr4de_personal_rules", JSON.stringify(personalRules)); } catch {} }, [personalRules]);
  React.useEffect(() => { try { localStorage.setItem("tr4de_error_items", JSON.stringify(errorItems)); } catch {} }, [errorItems]);

  // === Sync online (Supabase user_preferences) des 3 listes Discipline ===
  const [listsLoadedFromCloud, setListsLoadedFromCloud] = useState(false);
  React.useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const supabase = createClient();
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("user_preferences")
          .select("bias_items, error_items, personal_rules")
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) {
          console.warn("⚠️ load discipline lists:", error.code, error.message);
        } else if (!cancelled && data) {
          if (Array.isArray(data.bias_items))     setBiasItems(data.bias_items);
          if (Array.isArray(data.error_items))    setErrorItems(data.error_items);
          if (Array.isArray(data.personal_rules)) setPersonalRules(data.personal_rules);
        }
      } catch (e) { console.error("⚠️ load discipline lists failed:", e?.message || e); }
      finally { if (!cancelled) setListsLoadedFromCloud(true); }
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; window.removeEventListener("focus", onFocus); };
  }, [user?.id]);

  // Auto-save (debounced) à chaque modification d'une des 3 listes
  React.useEffect(() => {
    if (!user?.id || !listsLoadedFromCloud) return;
    const supabase = createClient();
    const handle = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from("user_preferences")
          .upsert([{
            user_id: user.id,
            bias_items: biasItems,
            error_items: errorItems,
            personal_rules: personalRules,
            updated_at: new Date().toISOString(),
          }], { onConflict: "user_id" });
        if (error) console.error("⚠️ save discipline lists failed:", error.message);
      } catch (e) { console.error("⚠️ save discipline lists error:", e); }
    }, 600);
    return () => clearTimeout(handle);
  }, [biasItems, errorItems, personalRules, user?.id, listsLoadedFromCloud]);

  const heatmapScrollRef = useRef(null);
  const today = getLocalDateString();
  const todayDate = new Date();
  const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  const currentMonth = monthNames[todayDate.getMonth()];
  const currentDay = todayDate.getDate();
  const dayLabelsShort = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  // ✅ Récupérer les règles d'aujourd'hui depuis Supabase via le hook
  const todayRules = getDayDiscipline(today);
  const todayScore = getDayScore(today);
  
  // ✅ disciplineData (depuis Supabase) est la source de vérité.
  //    setRuleCompleted fait un optimistic update synchrone, donc cet effet
  //    reflète toujours soit Supabase, soit la dernière action utilisateur.
  //    On re-dérive aussi `journal` à partir des notes du jour pour éviter
  //    qu'il "blinke" (décoché/recoché) à chaque mise à jour Supabase.
  React.useEffect(() => {
    const fromSupabase = (disciplineData && disciplineData[today]) || {};
    let hasNote = false;
    try {
      const dailyNotesData = JSON.parse(localStorage.getItem("tr4de_daily_notes") || "{}");
      const note = dailyNotesData[today];
      hasNote = !!(note && String(note).trim().length > 0);
    } catch {}
    setCheckedRuleIds(hasNote ? { ...fromSupabase, journal: true } : fromSupabase);
  }, [today, disciplineData]);

  // Auto-update journal rule when daily notes change
  React.useEffect(() => {
    const handleStorageChange = () => {
      const currentDate = getLocalDateString();
      const dailyNotesData = JSON.parse(localStorage.getItem("tr4de_daily_notes") || "{}");
      const todayNote = dailyNotesData[currentDate];
      
      setCheckedRuleIds(prev => {
        const updated = { ...prev };
        if (todayNote && todayNote.trim().length > 0) {
          updated.journal = true;
        } else {
          // Don't auto-uncheck if note is removed - let user decide
          // This preserves manual override
        }
        return updated;
      });
    };

    // Listen for storage changes (when notes are saved from JournalPage)
    window.addEventListener('storage', handleStorageChange);
    
    // Also check periodically in case save happens in same tab
    const interval = setInterval(handleStorageChange, 1000);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  React.useEffect(() => {
    setHeatmapVersion(v => v + 1);
  }, [disciplineData]);

  React.useEffect(() => {
    if (heatmapScrollRef.current) {
      const container = heatmapScrollRef.current;
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      
      // Find all month labels and scroll to the current month
      const monthLabels = container.querySelectorAll('[data-month]');
      monthLabels.forEach((label) => {
        const monthIndex = parseInt(label.getAttribute('data-month'));
        if (monthIndex === currentMonth) {
          // Scroll this month into view
          setTimeout(() => {
            label.parentElement.scrollLeft = label.offsetLeft - 100;
          }, 0);
        }
      });
    }
  }, [heatmapVersion]);

  const toggleRule = (ruleId, currentAllRules) => {
    setCheckedRuleIds(prev => {
      const updated = { ...prev, [ruleId]: !prev[ruleId] };
      localStorage.setItem(`tr4de_checked_rules_${today}`, JSON.stringify(updated));

      // ✅ Sauvegarder dans Supabase via le hook
      const newStatus = !prev[ruleId];
      setRuleCompleted(today, ruleId, newStatus).catch(err => {
        console.error("❌ Erreur sauvegarde discipline Supabase:", err);
      });

      return updated;
    });
    setHeatmapVersion(v => v + 1);
  };

  // Coche/décoche une plage de règles (utilisé par Shift+clic).
  // `orderedIds` doit refléter l'ordre visible des règles dans le bloc cliqué.
  const setRulesRange = (orderedIds, fromId, toId, value) => {
    if (!orderedIds || !orderedIds.length) return;
    const ai = orderedIds.indexOf(fromId);
    const bi = orderedIds.indexOf(toId);
    if (ai === -1 || bi === -1) return;
    const lo = Math.min(ai, bi);
    const hi = Math.max(ai, bi);
    const ids = orderedIds.slice(lo, hi + 1);
    setCheckedRuleIds(prev => {
      const updated = { ...prev };
      ids.forEach(id => { updated[id] = value; });
      localStorage.setItem(`tr4de_checked_rules_${today}`, JSON.stringify(updated));
      ids.forEach(id => {
        setRuleCompleted(today, id, value).catch(err => console.error("❌ Erreur sauvegarde discipline Supabase:", err));
      });
      return updated;
    });
    setHeatmapVersion(v => v + 1);
  };

  const handleRuleClick = (e, ruleId, orderedIds) => {
    if (e.shiftKey && lastClickedRuleId && lastClickedRuleId !== ruleId && orderedIds.includes(lastClickedRuleId)) {
      e.preventDefault();
      const newValue = !checkedRuleIds[ruleId];
      setRulesRange(orderedIds, lastClickedRuleId, ruleId, newValue);
      setLastClickedRuleId(ruleId);
      return;
    }
    // Toggle normal — laisse onChange faire son travail
    setLastClickedRuleId(ruleId);
  };

  const ruleDescriptions = {
    premarket: t("disc.ruleDesc.premarket"),
    biais: t("disc.ruleDesc.biais"),
    news: t("disc.ruleDesc.news"),
    followall: t("disc.ruleDesc.followall"),
    journal: t("disc.ruleDesc.journal"),
  };

  // Liste quotidienne uniquement (base + custom Supabase). Affichée dans la
  // section "Liste quotidienne".
  const dailyRules = [
    { id: "premarket", label: t("disc.rule.premarket"), uuid: null },
    { id: "biais", label: t("disc.rule.biais"), uuid: null },
    { id: "news", label: t("disc.rule.news"), uuid: null },
    { id: "followall", label: t("disc.rule.followall"), uuid: null },
    { id: "journal", label: t("disc.rule.journal"), uuid: null },
    ...customRules.map(r => ({ id: r.rule_id, label: r.text, uuid: r.id })),
  ].map(r => ({ ...r, status: checkedRuleIds[r.id] || false }));

  // Le progress tracker / la heatmap ne comptent QUE la liste quotidienne.
  // Les règles perso "Règles à suivre" sont indépendantes.
  const allRules = dailyRules;

  const completedCount = allRules.filter(r => r.status).length;
  const completeProgress = (completedCount / Math.max(allRules.length, 1)) * 100;
  const currentDate = new Date();

  // Auto-toggle "Followed All Rules" quand toutes les règles perso sont cochées.
  // (Les règles perso ne comptent toujours PAS dans le progress tracker, mais elles
  // pilotent cette case-là, qui elle est dans la liste quotidienne.)
  React.useEffect(() => {
    if (!personalRules.length) return;
    const allChecked = personalRules.every(r => !!checkedRuleIds[r.id]);
    const followAllCurrent = !!checkedRuleIds["followall"];
    if (allChecked && !followAllCurrent) {
      toggleRule("followall", allRules);
    } else if (!allChecked && followAllCurrent) {
      toggleRule("followall", allRules);
    }
  }, [checkedRuleIds, personalRules]);

  const saveDisciplineRules = () => {
    // useCloudState persists automatically (localStorage + Supabase debounced)
    setShowRulesModal(false);
  };

  const addManualRule = async () => {
    if (ruleCategory === "texte" && !newManualRule.trim()) return;
    if (ruleCategory === "horaire" && !ruleTime) return;
    if (ruleCategory === "argent" && !ruleAmount.trim()) return;
    
    try {
      let displayText = "";
      if (ruleCategory === "texte") {
        displayText = newManualRule;
      } else if (ruleCategory === "horaire") {
        displayText = `Horaire: ${ruleTime}`;
      } else if (ruleCategory === "argent") {
        displayText = `Argent: $${ruleAmount}`;
      }
      
      // Sauvegarder dans Supabase via le hook
      await addRule(ruleCategory, displayText, ruleTime, ruleAmount);
    } catch (err) {
      console.error("❌ Erreur ajout règle:", err);
    }
    
    // Reset form
    setNewManualRule("");
    setRuleTime("09:00");
    setRuleAmount("");
    setRuleCategory("texte");
    setShowRuleForm(false);
  };

  const removeManualRule = async (id) => {
    try {
      const snap = customRules.find(r => r.id === id);
      await deleteRule(id);
      if (snap) pushUndo({
        label: "Suppression de la règle",
        undo: async () => { try { await addRule(snap.text); } catch (e) { console.error("undo rule failed:", e); } },
      });
    } catch (err) {
      console.error("❌ Erreur suppression règle:", err);
    }
  };

  const toggleActiveDay = (ruleId, dayIdx) => {
    setActiveDays(prev => ({
      ...prev,
      [ruleId]: prev[ruleId].map((day, idx) => idx === dayIdx ? !day : day)
    }));
  };

  /* Les scores de discipline se calculent SUR les trades : affichés avant
     qu'ils soient là, ils annoncent 0 % de respect des règles — le pire
     contresens possible sur cette page-là. */
  const { tradesLoading } = useApp();
  if (tradesLoading && trades.length === 0) {
    return (
      <SkeletonScreen label={t("nav.discipline")} gap={24}>
        <SkeletonStats count={4} />
        <SkeletonCard><SkeletonList rows={5} avatar={false} /></SkeletonCard>
        <SkeletonCard><SkeletonText lines={4} /></SkeletonCard>
      </SkeletonScreen>
    );
  }

  return (
    <>
      {/* Même ossature que les autres pages de la DA : fond gris hérité de la
          coquille, sections espacées de 24, léger retrait haut. */}
      <div style={{display:"flex",flexDirection:"column",gap:24,fontFamily:"var(--font-sans)"}} className="anim-1">
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{marginLeft:"auto", display:"flex", alignItems:"center", gap:8}}>
            <div ref={routineBtnRef} style={{position:"relative", fontFamily:"var(--font-sans)"}}>
              <button
                onClick={() => setShowRoutinePopover(v => !v)}
                aria-haspopup="listbox"
                aria-expanded={showRoutinePopover}
                title="Règles de routine du jour"
                style={{
                  padding:"8px 16px",
                  height:34,
                  borderRadius:999,
                  background:T.white,
                  border:`1px solid ${showRoutinePopover ? T.border2 : T.border}`,
                  fontSize:13,
                  fontWeight:500,
                  cursor:"pointer",
                  display:"flex",
                  alignItems:"center",
                  gap:8,
                  color:T.text,
                  fontFamily:"inherit",
                  transition:"border-color 120ms ease",
                }}
              >
                <ClipboardCheck size={14} strokeWidth={1.75} color={T.text} />
                <span>Routine</span>
                <span style={{
                  fontSize:11, fontWeight:600, fontVariantNumeric:"tabular-nums",
                  padding:"1px 7px", borderRadius:999,
                  background:"var(--color-hover-bg, #F5F5F5)", color:T.textSub,
                }}>
                  {routineDoneCount}/{ROUTINE_ITEMS.length}
                </span>
                {showRoutinePopover
                  ? <ChevronUp size={14} strokeWidth={2} color={T.textMut} />
                  : <ChevronDown size={14} strokeWidth={2} color={T.textMut} />}
              </button>

              <Popover
                anchorRef={routineBtnRef}
                open={showRoutinePopover}
                onClose={closeRoutinePopover}
                gap={4}
                minWidth={280}
                atLeastAnchorWidth
                maxHeight={420}
                id="tr4de-routine-popover"
                role="listbox"
                style={{
                  background:T.white,
                  border:"none",
                  borderRadius:"var(--radius-modal)",
                  boxShadow:"var(--elev-overlay)",
                  padding:4,
                }}
              >
                <>
                  <div style={{
                    display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"4px 6px 4px 10px",
                  }}>
                    <span style={{ fontSize:11, color:T.textMut, fontWeight:500 }}>
                      Routine du jour
                    </span>
                    <button
                      type="button"
                      onClick={startCreateRoutineRule}
                      title="Ajouter une règle"
                      aria-label="Ajouter une règle"
                      style={{
                        display:"inline-flex", alignItems:"center", justifyContent:"center",
                        width:22, height:22, border:"none", background:"transparent",
                        cursor:"pointer", color:T.textMut, borderRadius:"var(--radius-field)",
                        transition:"background .12s ease, color .12s ease",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = "var(--color-hover-bg, #EBEBEB)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = T.textMut; e.currentTarget.style.background = "transparent"; }}
                    >
                      <Plus size={13} strokeWidth={2} />
                    </button>
                  </div>

                  {ROUTINE_ITEMS.map((it, idx) => {
                    const checked = !!routineChecks[it.id];
                    const isEditing = editingRuleId === it.id;
                    return (
                      <React.Fragment key={it.id}>
                        <div
                          style={{
                            display:"flex",
                            alignItems:"center",
                            gap:10,
                            width:"100%",
                            padding:"7px 10px",
                            borderRadius:10,
                            fontFamily:"inherit",
                            color:T.text,
                            fontSize:13,
                            fontWeight:500,
                            boxSizing:"border-box",
                            transition:"background .12s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "var(--color-hover-bg, #F5F5F5)";
                            const act = e.currentTarget.querySelector('[data-rule-actions]'); if (act) act.style.opacity = 1;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
                            const act = e.currentTarget.querySelector('[data-rule-actions]'); if (act && !isEditing) act.style.opacity = 0;
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isEditing}
                            onChange={() => toggleRoutineCheck(it.id)}
                            style={{ width:14, height:14, accentColor:T.text, cursor: isEditing ? "default" : "pointer", margin:0, flexShrink:0, opacity: isEditing ? 0.4 : 1 }}
                          />
                          {isEditing ? (
                            <input
                              autoFocus
                              type="text"
                              placeholder="Nouvelle règle…"
                              value={editingRuleDraft}
                              onChange={(e) => setEditingRuleDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); commitEditRule(); }
                                if (e.key === "Escape") { e.preventDefault(); cancelEditRule(); }
                              }}
                              onBlur={commitEditRule}
                              style={{
                                flex:1, minWidth:0,
                                padding:"4px 12px",
                                border:"none",
                                borderRadius:999,
                                boxShadow: DA_FOCUS_RING,
                                fontSize:13, fontWeight:500,
                                outline:"none", fontFamily:"inherit", color:T.text,
                                background: DA_FIELD_BG,
                              }}
                            />
                          ) : (
                            <span
                              onClick={() => startEditRule(it)}
                              style={{
                                flex:1, minWidth:0,
                                color: checked ? T.textMut : T.text,
                                textDecoration: checked ? "line-through" : "none",
                                cursor:"text",
                                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                              }}
                              title="Cliquer pour modifier"
                            >{it.label}</span>
                          )}
                          <div data-rule-actions style={{
                            display:"inline-flex", alignItems:"center", gap:2,
                            opacity: isEditing ? 1 : 0,
                            transition:"opacity .15s ease",
                            flexShrink:0,
                          }}>
                            {!isEditing && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); startEditRule(it); }}
                                title="Modifier"
                                style={{
                                  display:"inline-flex", alignItems:"center", justifyContent:"center",
                                  width:22, height:22, border:"none", background:"transparent",
                                  cursor:"pointer", color:T.textMut, borderRadius:"var(--radius-field)",
                                  transition:"background .12s ease, color .12s ease",
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = "var(--color-hover-bg, #EBEBEB)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = T.textMut; e.currentTarget.style.background = "transparent"; }}
                              >
                                <Pencil size={12} strokeWidth={1.75} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); if (isEditing) cancelEditRule(); removeRoutineRule(it.id); }}
                              title="Supprimer"
                              style={{
                                display:"inline-flex", alignItems:"center", justifyContent:"center",
                                width:22, height:22, border:"none", background:"transparent",
                                cursor:"pointer", color:T.textMut, borderRadius:"var(--radius-field)",
                                transition:"background .12s ease, color .12s ease",
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = T.red; e.currentTarget.style.background = T.redBg; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = T.textMut; e.currentTarget.style.background = "transparent"; }}
                            >
                              <LucideTrash2 size={12} strokeWidth={1.75} />
                            </button>
                          </div>
                        </div>
                        {idx < ROUTINE_ITEMS.length - 1 && (
                          <div style={{ height:1, background:T.border, margin:"0 8px" }} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </>
              </Popover>
            </div>
            <div id="tr4de-page-header-slot" />
          </div>
        </div>

        {/* ═══ BILAN — même bloc de tête que les autres pages de la DA :
            chiffre héros puis mini-KPI, posés à même le fond gris. ═══ */}
        {(() => {
          const s = complianceStats;
          const todayStr = getLocalDateString(new Date());
          const sessionViolations = s.violations.filter(v => v.date === todayStr);
          const liveRules = (complianceRules || []).filter(r => isRuleLive(r)).length;
          const totalRules = (complianceRules || []).length;
          const kpis = [
            {
              label: "Statut du jour",
              value: sessionViolations.length === 0 ? "Clean" : `${sessionViolations.length} violation${sessionViolations.length > 1 ? "s" : ""}`,
              color: sessionViolations.length === 0 ? T.green : T.red,
            },
            { label: "Série en cours", value: s.streak > 0 ? `${s.streak} j` : "—" },
            { label: "Meilleure série", value: s.bestStreak > 0 ? `${s.bestStreak} j` : "—" },
            { label: "Règles actives", value: totalRules > 0 ? `${liveRules}/${totalRules}` : "—" },
            {
              label: "Trades conformes",
              value: s.totalTrades > 0 ? `${s.compliantTrades}/${s.totalTrades}` : "—",
            },
          ];
          return (
            <div style={{display:"flex",flexDirection:"column",gap:12,minWidth:0}}>
              {/* Le héros est le taux de journées propres : c'est LA mesure de
                  la discipline, là où un P&L mesurerait autre chose. */}
              <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
                <span style={{
                  fontSize:28, fontWeight:500, lineHeight:"31px", letterSpacing:-0.2,
                  color:T.text, fontVariantNumeric:"tabular-nums", whiteSpace:"nowrap",
                }}>
                  {s.byDay.size > 0 ? `${Math.round(s.complianceRatePct)}%` : "—"}
                </span>
                <span style={{fontSize:13,fontWeight:500,lineHeight:1,color:T.textSub,whiteSpace:"nowrap"}}>
                  de journées sans écart · {s.byDay.size} {s.byDay.size > 1 ? "jours tradés" : "jour tradé"}
                </span>
              </div>
              <div style={{display:"flex",alignItems:"flex-start",gap:28,flexWrap:"wrap"}}>
                {kpis.map(k => (
                  <div key={k.label} style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:2}}>
                    <span style={{fontSize:11,lineHeight:1,color:T.textSub,whiteSpace:"nowrap"}}>{k.label}</span>
                    <span style={{
                      fontSize:14, fontWeight:600, lineHeight:1, whiteSpace:"nowrap",
                      color:k.color || T.text, fontVariantNumeric:"tabular-nums",
                    }}>
                      {k.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ═══ DISCIPLINE QUOTIDIENNE + INSIGHTS ═══
            Deux cartes de la DA côte à côte, au lieu d'une seule carte bordée
            découpée par des filets. `2fr 1fr` retombe en une colonne sous
            1024 px (sélecteur responsive de globals.css). */}
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:12,alignItems:"stretch"}}>
          {/* HEATMAP CALENDAR - DISCIPLINE TRACKER */}
          <div key={heatmapVersion} style={{...CARD,padding:0,minWidth:0,overflow:"hidden"}}>
            {(() => {
              // Streak compliance = nombre de jours consécutifs sans aucune violation (depuis le jour le plus récent ayant tradé)
              const streak = complianceStats.streak;
              // Stats du jour
              const todayStr = getLocalDateString(new Date());
              const todayDay = complianceStats.byDay.get(todayStr);
              const todayViolatingSet = violatingTradesByDay.get(todayStr) || new Set();
              const todayClean = todayDay ? Math.max(0, todayDay.trades - todayViolatingSet.size) : 0;
              const todayTotal = todayDay ? todayDay.trades : 0;
              return (
                <div style={{padding:"16px 20px 0",display:"flex",alignItems:"flex-start",gap:10}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:T.text}}>Discipline quotidienne</div>
                    <div style={{fontSize:11,color:T.textMut,marginTop:2}}>
                      {streak >= 2 ? t("disc.streakDays").replace("{n}", String(streak)) : t("disc.noStreak")}
                    </div>
                  </div>
                  <div style={{fontSize:11,color:T.textMut,fontVariantNumeric:"tabular-nums",marginTop:2}}>
                    {todayTotal > 0 ? `${todayClean}/${todayTotal}` : "—"}
                  </div>
                </div>
              );
            })()}
            <div style={{padding:"18px 20px"}}>

            <div ref={heatmapScrollRef} style={{overflowX:"auto",paddingBottom:12,cursor:"grab"}}>
              <div style={{minWidth:"max-content"}}>
              {(() => {
                const frMonths = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
                const dayLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
                const today = new Date();
                
                // Find the earliest trade date, fallback to Jan 1st of current year
                const earliestTrade = trades && trades.length > 0
                  ? trades.reduce((min, t) => {
                      const d = new Date(t.date || t.open_time || t.closeTime || t.created_at);
                      return d < min ? d : min;
                    }, new Date())
                  : new Date(today.getFullYear(), 0, 1);
                
                const startDate = new Date(earliestTrade.getFullYear(), earliestTrade.getMonth(), 1);
                const endDate = new Date(today.getFullYear(), 11, 31); // End of current year
                
                // Build months array from startDate to endDate
                const monthCount = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()) + 1;
                const months = Array.from({length: monthCount}, (_, i) => frMonths[(startDate.getMonth() + i) % 12]);
                
                /**
                 * Moteur de Couleur - Calcule la couleur basée sur la discipline
                 * Logique - 5 paliers:
                 * - Si pas de trading: Gris Clair
                 * - 1-20%: Vert Très Pâle
                 * - 21-40%: Vert Pâle
                 * - 41-60%: Vert Moyen
                 * - 61-80%: Vert Clair
                 * - 81-100%: Vert Vif
                 */
                const getColorByDiscipline = (percentage, hasData = true) => {
                  if (!hasData) return null;                // Aucune donnée = gris clair (fallback)
                  // Activité mais rien de respecté : le rouge principal, dilué.
                  if (percentage === 0) return DISC_RED;
                  if (percentage < 100) {
                    if (percentage <= 25) return DISC_GREENS[0];
                    if (percentage <= 50) return DISC_GREENS[1];
                    if (percentage <= 75) return DISC_GREENS[2];
                    return DISC_GREENS[3];
                  }
                  return DISC_GREENS[4]; // 100 % : le vert principal, plein
                };
                
                // Historique des checklists de routine, indexé par date.
                // Les checks du jour sont persistés localement sous
                // `tr4de_routine_checklist_${date}`. On les relit tous ici pour
                // pouvoir colorer chaque case du calendrier. Le total de règles
                // est celui de la définition courante (ROUTINE_ITEMS) ; un jour
                // sans aucune donnée de routine n'entre pas dans le calcul.
                // routineByDay est désormais mémoïsé au niveau composant (voir plus haut)
                // pour éviter de rebalayer localStorage à chaque render.

                // La heatmap combine le moteur de compliance (règles automatiques
                // sur les trades) ET les règles de routine cochées ce jour-là.
                // % = (routine cochée + trades sans violation) / (total routine + total trades).
                // La routine n'est prise en compte que si des données existent pour
                // le jour ; sinon le jour reste piloté par la seule compliance des trades
                // (et gris s'il n'y a ni trade ni routine).
                const getDailyData = (dateStr) => {
                  const day = complianceStats.byDay.get(dateStr);
                  const hasTrades = !!(day && day.trades > 0);
                  const routine = routineByDay.get(dateStr); // { done, total } | undefined

                  let numerator = 0, denominator = 0;
                  let tradesClean = 0, tradesTotal = 0;
                  if (hasTrades) {
                    const violatingSet = violatingTradesByDay.get(dateStr) || new Set();
                    tradesClean = day.trades - violatingSet.size;
                    tradesTotal = day.trades;
                    numerator += tradesClean;
                    denominator += tradesTotal;
                  }
                  if (routine) {
                    numerator += routine.done;
                    denominator += routine.total;
                  }
                  if (denominator === 0) {
                    return {
                      percentage: 0, hadTrading: false, rulesRespected: 0, totalRules: 0,
                      routineDone: 0, routineTotal: 0, tradesClean: 0, tradesTotal: 0,
                    };
                  }
                  const percentage = Math.round((numerator / denominator) * 100);
                  return {
                    percentage,
                    hadTrading: hasTrades,
                    rulesRespected: numerator,
                    totalRules: denominator,
                    routineDone: routine ? routine.done : 0,
                    routineTotal: routine ? routine.total : 0,
                    tradesClean,
                    tradesTotal,
                  };
                };
                
                // Build all weeks across all months
                const allWeeks = [];
                
                // Build calendar continuously across all 6 months
                // (endDate already defined above as Dec 31)
                
                // Find the Monday of the week containing startDate
                const calStart = new Date(startDate);
                const dow = calStart.getDay();
                const offsetToMonday = dow === 0 ? -6 : 1 - dow;
                calStart.setDate(calStart.getDate() + offsetToMonday);
                
                // Find the Sunday of the week containing endDate
                const calEnd = new Date(endDate);
                const dowEnd = calEnd.getDay();
                const offsetToSunday = dowEnd === 0 ? 0 : 7 - dowEnd;
                calEnd.setDate(calEnd.getDate() + offsetToSunday);
                
                let currentWeek = [];
                const cursor = new Date(calStart);
                
                while (cursor <= calEnd) {
                  const dayOfWeek = cursor.getDay();
                  const adjustedDow = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 0=Mon
                  
                  if (adjustedDow === 0) {
                    currentWeek = new Array(7).fill(null);
                  }
                  
                  const inRange = cursor >= startDate && cursor <= endDate;
                  if (inRange) {
                    const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
                    const dailyData = getDailyData(dateStr);
                    // hasData = il y a des trades et/ou une routine ce jour-là (denominator > 0).
                    const color = getColorByDiscipline(dailyData.percentage, dailyData.totalRules > 0);
                    currentWeek[adjustedDow] = { dateStr, ...dailyData, color };
                  }
                  
                  if (adjustedDow === 6) {
                    allWeeks.push(currentWeek);
                  }
                  
                  cursor.setDate(cursor.getDate() + 1);
                }
                
                // Close last week if needed
                if (currentWeek.length > 0 && currentWeek.some(d => d !== null)) {
                  allWeeks.push(currentWeek);
                }
                
                // Calculate month positions AFTER building allWeeks (precise alignment)
                const monthPositions = months.map((monthName, mi) => {
                  const targetMonth = (startDate.getMonth() + mi) % 12;
                  const targetYear = startDate.getFullYear() + Math.floor((startDate.getMonth() + mi) / 12);
                  let firstWeek = -1, lastWeek = -1;
                  allWeeks.forEach((week, wi) => {
                    const hasDay = week.some(d => {
                      if (!d) return false;
                      const date = new Date(d.dateStr);
                      return date.getMonth() === targetMonth && date.getFullYear() === targetYear;
                    });
                    if (hasDay) { if (firstWeek === -1) firstWeek = wi; lastWeek = wi; }
                  });
                  return { name: monthName, start: firstWeek, end: lastWeek + 1, monthIndex: targetMonth };
                }).filter(p => p.start !== -1);
                
                return (
                  <div style={{display:"flex"}}>
                    {/* Days of week labels */}
                    <div style={{display:"flex",flexDirection:"column",marginRight:12}}>
                      <div style={{height:24,fontSize:10,fontWeight:400,color:T.textMut,marginBottom:0}}></div>
                      {dayLabels.map(day => (
                        <div 
                          key={day}
                          style={{
                            height:28,
                            marginBottom:3,
                            display:"flex",
                            alignItems:"center",
                            fontSize:12,
                            fontWeight:400,
                            color:T.textMut,
                            width:40
                          }}
                        >
                          {day}
                        </div>
                      ))}
                    </div>
                    
                    {/* Calendar grid */}
                    <div>
                      {/* Month labels */}
                      <div style={{display:"flex",gap:0,marginBottom:8}}>
                        {monthPositions.map((pos, idx) => {
                          const weeksCount = pos.end - pos.start;
                          return (
                            <div
                              key={`month-label-${idx}`}
                              data-month={pos.monthIndex}
                              style={{
                                fontSize:11,
                                fontWeight:400,
                                color:T.textMut,
                                display:"flex",
                                gap:0,
                                width:(weeksCount * 31),
                                alignItems:"center",
                                justifyContent:"center"
                              }}
                            >
                              {pos.name}
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Heatmap grid */}
                      <div>
                        {dayLabels.map((dayLabel, dayIdx) => (
                          <div key={`row-${dayIdx}`} style={{display:"flex",gap:3,marginBottom:3}}>
                            {allWeeks.map((week, weekIdx) => {
                              const day = week[dayIdx];
                              if (!day) {
                                return (
                                  <div
                                    key={`empty-${weekIdx}`}
                                    style={{
                                      width:28,
                                      height:28,
                                      background:"transparent",
                                      borderRadius:"var(--radius-field)",
                                      flexShrink:0
                                    }}
                                  />
                                );
                              }
                              
                              const cellLabel =
                                `${day.dateStr} : ${day.percentage}% discipline` +
                                (day.routineTotal ? ` · routine ${day.routineDone}/${day.routineTotal}` : "") +
                                (day.tradesTotal ? ` · trades clean ${day.tradesClean}/${day.tradesTotal}` : "");
                              return (
                                <div
                                  key={`${weekIdx}-${dayIdx}`}
                                  role="img"
                                  aria-label={cellLabel}
                                  style={{
                                    width:28,
                                    height:28,
                                    // Aucune donnée → gris (var), 0% avec activité → rouge (voir getColorByDiscipline)
                                    background: day.color || "var(--color-hover-bg, #F1F5F9)",
                                    borderRadius:"var(--radius-field)",
                                    // Pas de cursor:pointer : pas de handler réel (évite une fausse affordance).
                                    flexShrink:0,
                                    transition: "var(--tr-ui)",
                                    border: 'none',
                                    opacity: 1
                                  }}
                                  title={cellLabel}
                                />
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
              </div>
            </div>

            {/* Legend */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:20,fontSize:11,color:T.textMut}}>
              <span>{t("disc.legendLess")}</span>
              {DISC_GREENS.map((color, i) => (
                <div
                  key={i}
                  style={{
                    width:16,
                    height:16,
                    background:color,
                    borderRadius:"var(--radius-field)",
                    border:'none'
                  }}
                />
              ))}
              <span>{t("disc.legendMore")}</span>
            </div>
          </div>
          </div>

          {/* INSIGHTS — carte voisine, plus une colonne soudée à la heatmap. */}
          <div style={{...CARD,padding:0,minWidth:0,overflow:"hidden"}}>
            <ComplianceInsights trades={trades} flat />
          </div>
        </div>

        {/* COMPLIANCE ENGINE — règles structurées, KPIs, heatmap, log, insights, webhooks */}
        <ComplianceModule trades={trades} />

      </div>

      {/* MODAL MODIFIER REGLES */}
      {showRulesModal && (
        <DAModal
          title={t("disc.editRules")}
          onClose={() => setShowRulesModal(false)}
          width={480}
          maxHeight="85vh"
          bodyStyle={{padding:"6px 20px 16px",gap:20}}
          footer={
            <DAPillButton variant="primary" onClick={() => setShowRulesModal(false)}>
              {t("disc.done")}
            </DAPillButton>
          }>
          <div>
            <div style={{fontSize:14,fontWeight:600,color:T.text,letterSpacing:-0.1}}>{t("disc.editRules")}</div>
            <div style={{fontSize:12,color:T.text,opacity:0.5,marginTop:3,lineHeight:1.5}}>{t("disc.editRulesSub")}</div>
          </div>
              {/* AUTOMATED */}
              <div>
                <div style={{fontSize:12,fontWeight:600,color:T.textSub,marginBottom:8}}>{t("disc.dailyRulesSection")}</div>
                <div style={{borderRadius:"var(--radius-card)",overflow:"hidden",background:T.white}}>
                  {(() => {
                    const dailyArr = allRules.filter(r => ["premarket", "biais", "news", "followall", "journal"].includes(r.id));
                    const dailyIds = dailyArr.map(r => r.id);
                    return dailyArr.map((rule, idx, arr) => (
                    <label key={rule.id} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"18px 14px",cursor:"pointer",borderBottom:idx<arr.length-1?`1px solid ${T.border}`:"none"}}>
                      <input
                        type="checkbox"
                        checked={checkedRuleIds[rule.id] || false}
                        onClick={(e) => handleRuleClick(e, rule.id, dailyIds)}
                        onChange={() => toggleRule(rule.id, allRules)}
                        style={{marginTop:2,width:16,height:16,accentColor:T.text,cursor:"pointer",flexShrink:0}}
                      />
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:T.text,marginBottom:2}}>{rule.label}</div>
                        <div style={{fontSize:11,color:T.textSub,lineHeight:1.4}}>{ruleDescriptions[rule.id]}</div>
                      </div>
                    </label>
                  ));
                  })()}
                </div>
              </div>

              {/* PERSONAL — custom rules + add row */}
              <div>
                <div style={{fontSize:12,fontWeight:600,color:T.textSub,marginBottom:8}}>{t("disc.personalRules")}</div>
                <div style={{borderRadius:"var(--radius-card)",overflow:"hidden",background:T.white}}>
                  {(() => {
                    const personalArr = allRules.filter(r => !["premarket", "biais", "news", "followall", "journal"].includes(r.id));
                    const personalIds = personalArr.map(r => r.id);
                    return personalArr.map((rule, idx, arr) => (
                    <div key={rule.id} style={{display:"flex",alignItems:"center",gap:12,padding:"16px 14px",borderBottom:idx<arr.length-1?`1px solid ${T.border}`:"none"}}>
                      <input
                        type="checkbox"
                        checked={checkedRuleIds[rule.id] || false}
                        onClick={(e) => handleRuleClick(e, rule.id, personalIds)}
                        onChange={() => toggleRule(rule.id, allRules)}
                        style={{width:16,height:16,accentColor:T.text,cursor:"pointer",flexShrink:0}}
                      />
                      <div style={{flex:1,minWidth:0,fontSize:13,fontWeight:500,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{rule.label}</div>
                      <button
                        type="button"
                        onClick={() => removeManualRule(rule.uuid || rule.id)}
                        aria-label={t("disc.removeAria")}
                        title={t("disc.removeAria")}
                        style={{width:24,height:24,display:"inline-flex",alignItems:"center",justifyContent:"center",background:"transparent",border:"none",borderRadius:6,color:T.textMut,cursor:"pointer",flexShrink:0}}
                        onMouseEnter={(e)=>{e.currentTarget.style.background=T.redBg;e.currentTarget.style.color=T.red;}}
                        onMouseLeave={(e)=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.textMut;}}
                      >
                        <LucideTrash2 size={12} strokeWidth={1.75}/>
                      </button>
                    </div>
                  ));
                  })()}
                  {/* ADD ROW intégrée à la catégorie */}
                  <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px"}}>
                    <input
                      type="text"
                      placeholder={t("disc.addRulePlaceholder")}
                      value={newManualRule}
                      onChange={(e) => setNewManualRule(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && newManualRule.trim()) addManualRule(); }}
                      style={{flex:1,padding:"8px 10px",border: "none",borderRadius: "var(--radius-field)",fontSize:12,background: DA_FIELD_BG,color:T.text,outline:"none",fontFamily:"inherit"}}
                    />
                    <button
                      type="button"
                      onClick={() => { if (newManualRule.trim()) addManualRule(); }}
                      disabled={!newManualRule.trim()}
                      aria-label={t("disc.addAria")}
                      title={t("disc.addAria")}
                      style={{width: 34,height: 34,display:"inline-flex",alignItems:"center",justifyContent:"center",background:newManualRule.trim()?T.text:T.bg,color:newManualRule.trim()?"#fff":T.textMut,border:`1px solid ${newManualRule.trim()?T.text:T.border}`,borderRadius:999,cursor:newManualRule.trim()?"pointer":"not-allowed",fontFamily:"inherit",flexShrink:0}}
                    >
                      <Plus size={14} strokeWidth={2}/>
                    </button>
                  </div>
                </div>
              </div>
        </DAModal>
      )}
    </>
  );
}

