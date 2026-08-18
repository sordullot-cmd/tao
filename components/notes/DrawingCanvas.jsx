"use client";

/**
 * Couche de dessin vectorielle posée au-dessus de l'éditeur de notes.
 *
 * Choix d'implémentation :
 * - Vectoriel (liste de traits) et non bitmap : le dessin reste net à tout
 *   zoom / DPI, se sérialise en quelques Ko dans la note (cf. useCloudState)
 *   et la gomme peut retirer un trait entier.
 * - Les couleurs sont stockées par CLÉ ("ink", "blue", …) et résolues au
 *   rendu depuis les CSS vars du design system : un dessin fait en clair reste
 *   lisible en sombre (cf. lib/ui/tokens.ts).
 * - Les coordonnées sont exprimées dans l'espace du CONTENU (pas du viewport),
 *   donc indépendantes du scroll : le canvas est un frère du textarea dans le
 *   même conteneur scrollable.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------- palette

export const INKS = {
  ink:    { label: "Encre",  cssVar: "--color-text",   fallback: "#0D0D0D" },
  blue:   { label: "Bleu",   cssVar: "--color-blue",   fallback: "#1CB0F6" },
  red:    { label: "Rouge",  cssVar: "--color-red",    fallback: "#FF4B4B" },
  green:  { label: "Vert",   cssVar: "--color-green",  fallback: "#58CC02" },
  amber:  { label: "Orange", cssVar: "--color-amber",  fallback: "#FF9600" },
  purple: { label: "Violet", cssVar: "--color-purple", fallback: "#CE82FF" },
};

export const INK_KEYS = Object.keys(INKS);

export const SIZES = [
  { key: "s", label: "Fin",   w: 1.75 },
  { key: "m", label: "Moyen", w: 3.25 },
  { key: "l", label: "Épais", w: 6 },
];

export const sizeWidth = (key) => (SIZES.find(s => s.key === key) || SIZES[1]).w;

export const isShapeTool = (t) => t === "line" || t === "arrow" || t === "rect" || t === "ellipse";

/** Résout une clé d'encre en couleur réelle via les CSS vars (dark-aware). */
export function resolveInk(key) {
  const ink = INKS[key] || INKS.ink;
  if (typeof window === "undefined") return ink.fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(ink.cssVar).trim();
  return v || ink.fallback;
}

/** Incrémente à chaque bascule de thème, pour forcer un re-rendu du canvas. */
export function useThemeTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => setTick(t => t + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return tick;
}

// ---------------------------------------------------------------- géométrie

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Ramer-Douglas-Peucker sur des triplets [x, y, pression, …]. Divise par ~3 le
 * nombre de points capturés sans altérer visiblement le tracé.
 */
function simplify(pts, eps) {
  const n = pts.length / 3;
  if (n < 3) return pts;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a * 3], ay = pts[a * 3 + 1], bx = pts[b * 3], by = pts[b * 3 + 1];
    let best = -1, bestD = 0;
    for (let i = a + 1; i < b; i++) {
      const d = distToSeg(pts[i * 3], pts[i * 3 + 1], ax, ay, bx, by);
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best !== -1 && bestD > eps) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
  }
  return out;
}

/** Arrondis : 1 décimale pour les positions, 2 pour la pression. */
function quantize(pts) {
  const out = new Array(pts.length);
  for (let i = 0; i < pts.length; i++) {
    out[i] = i % 3 === 2 ? Math.round(pts[i] * 100) / 100 : Math.round(pts[i] * 10) / 10;
  }
  return out;
}

/** Shift : contraint les angles à 45° (traits/flèches) ou force carré/cercle. */
function constrainShape(x0, y0, x1, y1, tool, shift) {
  if (!shift) return [x1, y1];
  const dx = x1 - x0, dy = y1 - y0;
  if (tool === "rect" || tool === "ellipse") {
    const s = Math.max(Math.abs(dx), Math.abs(dy));
    return [x0 + Math.sign(dx || 1) * s, y0 + Math.sign(dy || 1) * s];
  }
  const len = Math.hypot(dx, dy);
  const step = Math.PI / 4;
  const ang = Math.round(Math.atan2(dy, dx) / step) * step;
  return [x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len];
}

/** Polyligne d'échantillonnage d'un trait — sert au test de collision gomme. */
function outlinePoints(s) {
  const p = s.pts;
  if (s.tool === "pen" || s.tool === "marker") return p;
  const [x0, y0, , x1, y1] = p;
  if (s.tool === "line" || s.tool === "arrow") return [x0, y0, 1, x1, y1, 1];
  if (s.tool === "rect") {
    return [x0, y0, 1, x1, y0, 1, x1, y1, 1, x0, y1, 1, x0, y0, 1];
  }
  // ellipse : 24 points sur le contour
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
  const out = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 1);
  }
  return out;
}

/** Le point (x, y) touche-t-il le trait, à `pad` px près ? */
function hitsStroke(s, x, y, pad) {
  const p = outlinePoints(s);
  const tol = pad + (s.tool === "marker" ? s.size * 2 : s.size / 2);
  if (p.length === 3) return Math.hypot(x - p[0], y - p[1]) <= tol;
  for (let i = 3; i < p.length; i += 3) {
    if (distToSeg(x, y, p[i - 3], p[i - 2], p[i], p[i + 1]) <= tol) return true;
  }
  return false;
}

/** Bas du trait — sert à étendre la zone de dessin quand on dessine vers le bas. */
export function strokeMaxY(s) {
  let max = 0;
  for (let i = 1; i < s.pts.length; i += 3) if (s.pts[i] > max) max = s.pts[i];
  return max + (s.tool === "marker" ? s.size * 2 : s.size);
}

// ---------------------------------------------------------------- rendu

/** Trace une polyligne lissée (quadratiques par les points milieux). */
function smoothPath(ctx, p) {
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  if (p.length === 3) {
    ctx.lineTo(p[0] + 0.01, p[1]);
  } else {
    for (let i = 3; i < p.length - 3; i += 3) {
      ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 3]) / 2, (p[i + 1] + p[i + 4]) / 2);
    }
    ctx.lineTo(p[p.length - 3], p[p.length - 2]);
  }
  ctx.stroke();
}

function drawStroke(ctx, s, color) {
  const p = s.pts;
  if (!p || p.length < 3) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = s.size;

  if (s.tool === "marker") {
    // Un seul path pour éviter que les recouvrements du même trait
    // s'assombrissent entre eux.
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = s.size * 4;
    ctx.lineCap = "butt";
    smoothPath(ctx, p);
  } else if (s.tool === "pen") {
    // Pression : uniquement au stylet. Si elle est ~constante (souris, doigt)
    // on privilégie le path lissé, bien plus propre que segment par segment.
    let min = 1, max = 0;
    for (let i = 2; i < p.length; i += 3) { if (p[i] < min) min = p[i]; if (p[i] > max) max = p[i]; }
    if (p.length === 3) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], s.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (max - min < 0.08) {
      smoothPath(ctx, p);
    } else {
      for (let i = 3; i < p.length; i += 3) {
        ctx.beginPath();
        ctx.lineWidth = s.size * (0.55 + 0.45 * ((p[i - 1] + p[i + 2]) / 2));
        ctx.moveTo(p[i - 3], p[i - 2]);
        ctx.lineTo(p[i], p[i + 1]);
        ctx.stroke();
      }
    }
  } else {
    const x0 = p[0], y0 = p[1], x1 = p[3], y1 = p[4];
    ctx.beginPath();
    if (s.tool === "rect") {
      ctx.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.stroke();
    } else if (s.tool === "ellipse") {
      ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      if (s.tool === "arrow") {
        const head = Math.max(9, s.size * 3.6);
        const a = Math.atan2(y1 - y0, x1 - x0);
        const w = Math.PI / 7;
        ctx.beginPath();
        ctx.moveTo(x1 - Math.cos(a - w) * head, y1 - Math.sin(a - w) * head);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x1 - Math.cos(a + w) * head, y1 - Math.sin(a + w) * head);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

const eraserCursor = (r) =>
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='${2 * r + 4}' height='${2 * r + 4}'>` +
  `<circle cx='${r + 2}' cy='${r + 2}' r='${r}' fill='rgba(150,150,150,0.18)' stroke='%23999' stroke-width='1.25'/></svg>") ` +
  `${r + 2} ${r + 2}, crosshair`;

// ---------------------------------------------------------------- composant

export default function DrawingCanvas({
  strokes = [],
  active = false,
  tool = "pen",
  inkKey = "ink",
  sizeKey = "m",
  onCommitStroke,
  onEraseStrokes,
  scrollRef,
}) {
  const wrapRef = useRef(null);
  const baseRef = useRef(null);
  const liveRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0, dpr: 1 });
  const themeTick = useThemeTick();

  const liveDraw = useRef(null);      // trait en cours de tracé
  const pointers = useRef(new Map()); // pointeurs actifs (pan 2 doigts)
  const pan = useRef(null);
  const erased = useRef(new Set());
  const raf = useRef(0);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  // -- taille du canvas : suit le conteneur (texte qui grandit, resize fenêtre)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // Note très longue = canvas très haut : on baisse la densité plutôt que
    // d'allouer des dizaines de Mo (deux calques). Au-delà de ~16000 px CSS de
    // haut, les navigateurs refusent le canvas — cas non couvert (note géante).
    const MAX_PIXELS = 6e6;
    const sync = () => {
      const r = el.getBoundingClientRect();
      let dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const area = Math.max(1, r.width * r.height);
      if (area * dpr * dpr > MAX_PIXELS) dpr = Math.max(1, Math.sqrt(MAX_PIXELS / area));
      dpr = Math.round(dpr * 100) / 100; // évite les re-rendus sur du bruit flottant
      setBox(prev => {
        const w = Math.round(r.width), h = Math.round(r.height);
        if (prev.w === w && prev.h === h && prev.dpr === dpr) return prev;
        return { w, h, dpr };
      });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener("resize", sync);
    return () => { ro.disconnect(); window.removeEventListener("resize", sync); };
  }, []);

  const setupCtx = useCallback((canvas) => {
    if (!canvas || box.w === 0 || box.h === 0) return null;
    const { w, h, dpr } = box;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return ctx;
  }, [box]);

  // -- traits committés
  useEffect(() => {
    const ctx = setupCtx(baseRef.current);
    if (!ctx) return;
    const cache = new Map();
    for (const s of strokes) {
      let c = cache.get(s.color);
      if (!c) { c = resolveInk(s.color); cache.set(s.color, c); }
      drawStroke(ctx, s, c);
    }
  }, [strokes, setupCtx, themeTick]);

  // -- trait en cours
  const renderLive = useCallback(() => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const ctx = setupCtx(liveRef.current);
      if (!ctx) return;
      const d = liveDraw.current;
      if (!d || d.eraser) return;
      drawStroke(ctx, buildLiveStroke(d), d.color);
    });
  }, [setupCtx]);

  const clearLive = useCallback(() => {
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = 0; }
    const c = liveRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
  }, []);

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  // Sortir du mode dessin en pleine main levée : on abandonne le trait.
  useEffect(() => {
    if (!active) { liveDraw.current = null; pan.current = null; pointers.current.clear(); clearLive(); }
  }, [active, clearLive]);

  const localPos = (e) => {
    const r = wrapRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const pressure = (e) =>
    e.pointerType === "pen" && e.pressure > 0 ? Math.max(0.08, Math.min(1, e.pressure)) : 1;

  const eraseAt = (x, y) => {
    const hit = [];
    for (const s of strokesRef.current) {
      if (erased.current.has(s.id)) continue;
      if (hitsStroke(s, x, y, 9)) { erased.current.add(s.id); hit.push(s.id); }
    }
    if (!hit.length || !onEraseStrokes) return;
    // Premier lot du glissé : rien n'avait encore été effacé avant.
    onEraseStrokes(hit, erased.current.size === hit.length);
  };

  const onPointerDown = (e) => {
    if (!active) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });

    // Deux doigts = pan vertical (le canvas capte le tactile, donc le scroll
    // natif ne peut pas s'appliquer ici).
    if (e.pointerType === "touch" && pointers.current.size >= 2) {
      liveDraw.current = null;
      clearLive();
      const c = centroid(pointers.current);
      pan.current = { x: c.x, y: c.y };
      return;
    }

    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    const { x, y } = localPos(e);

    if (tool === "eraser") {
      erased.current = new Set();
      liveDraw.current = { eraser: true };
      eraseAt(x, y);
      return;
    }
    liveDraw.current = {
      tool,
      colorKey: inkKey,
      color: resolveInk(inkKey),
      size: sizeWidth(sizeKey),
      pts: [x, y, pressure(e)],
      cur: { x, y },
      shift: e.shiftKey,
    };
    renderLive();
  };

  const onPointerMove = (e) => {
    if (!active) return;
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    }
    if (pan.current) {
      const c = centroid(pointers.current);
      const sc = scrollRef?.current;
      if (sc) sc.scrollTop -= c.y - pan.current.y;
      pan.current = c;
      return;
    }
    const d = liveDraw.current;
    if (!d) return;
    const { x, y } = localPos(e);
    if (d.eraser) { eraseAt(x, y); return; }
    if (isShapeTool(d.tool)) {
      d.cur = { x, y };
      d.shift = e.shiftKey;
      renderLive();
      return;
    }
    // Les événements coalescés récupèrent les points intermédiaires que le
    // navigateur a regroupés : tracé nettement plus fidèle au stylet.
    const raw = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const samples = raw.length ? raw.map(ev => ({ ...localPos(ev), p: pressure(ev) })) : [{ x, y, p: pressure(e) }];
    let added = false;
    for (const s of samples) {
      const n = d.pts.length;
      if (Math.hypot(s.x - d.pts[n - 3], s.y - d.pts[n - 2]) < 1.4) continue;
      d.pts.push(s.x, s.y, s.p);
      added = true;
    }
    if (added) renderLive();
  };

  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pan.current) {
      if (pointers.current.size < 2) pan.current = null;
      else pan.current = centroid(pointers.current);
      return;
    }
    const d = liveDraw.current;
    if (!d) return;
    liveDraw.current = null;
    clearLive();
    if (d.eraser) { erased.current = new Set(); return; }

    const id = Date.now() + Math.random();
    if (isShapeTool(d.tool)) {
      const [x0, y0] = [d.pts[0], d.pts[1]];
      const [x1, y1] = constrainShape(x0, y0, d.cur.x, d.cur.y, d.tool, d.shift);
      if (Math.hypot(x1 - x0, y1 - y0) < 4) return; // simple clic : rien à tracer
      onCommitStroke?.({ id, tool: d.tool, color: d.colorKey, size: d.size, pts: quantize([x0, y0, 1, x1, y1, 1]) });
      return;
    }
    const pts = quantize(simplify(d.pts, d.tool === "marker" ? 1.1 : 0.55));
    onCommitStroke?.({ id, tool: d.tool, color: d.colorKey, size: d.size, pts });
  };

  const cursor = !active ? "auto"
    : tool === "eraser" ? eraserCursor(11)
    : "crosshair";

  const canvasStyle = { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" };

  return (
    <div
      ref={wrapRef}
      aria-hidden={!active}
      aria-label={active ? "Zone de dessin" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => { if (active) e.preventDefault(); }}
      style={{
        position: "absolute", inset: 0, zIndex: 3,
        pointerEvents: active ? "auto" : "none",
        touchAction: active ? "none" : "auto",
        cursor,
      }}
    >
      <canvas ref={baseRef} aria-hidden style={canvasStyle} />
      <canvas ref={liveRef} aria-hidden style={canvasStyle} />
    </div>
  );
}

function buildLiveStroke(d) {
  if (!isShapeTool(d.tool)) return { tool: d.tool, size: d.size, pts: d.pts };
  const [x0, y0] = [d.pts[0], d.pts[1]];
  const [x1, y1] = constrainShape(x0, y0, d.cur.x, d.cur.y, d.tool, d.shift);
  return { tool: d.tool, size: d.size, pts: [x0, y0, 1, x1, y1, 1] };
}

function centroid(map) {
  let x = 0, y = 0, n = 0;
  for (const p of map.values()) { x += p.x; y += p.y; n++; }
  return n ? { x: x / n, y: y / n } : { x: 0, y: 0 };
}
