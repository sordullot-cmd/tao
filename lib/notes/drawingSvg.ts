/**
 * Rendu des dessins de note en SVG, pour que les schémas tracés dans l'app
 * s'affichent aussi dans Obsidian.
 *
 * Les traits sont stockés vectoriellement (cf. components/notes/DrawingCanvas.jsx :
 * `{ id, tool, color, size, pts: [x, y, pression, …] }`), donc le SVG est une
 * traduction directe du même modèle — pas une capture d'écran.
 *
 * Deux écarts assumés par rapport au canevas de l'app :
 * - la pression du stylet n'est pas restituée (largeur de trait constante) : un
 *   SVG à largeur variable demanderait de convertir chaque trait en contour
 *   rempli, pour un gain invisible à la taille d'affichage d'une note ;
 * - les couleurs sont figées en hexa. Le canevas les résout depuis les CSS vars
 *   du thème ; un fichier du vault n'a pas accès à ces variables, donc l'encre
 *   par défaut reçoit une règle `prefers-color-scheme` pour rester lisible dans
 *   Obsidian en thème sombre.
 */

import type { NoteDrawing } from "./markdown";

interface Stroke {
  id?: number | string;
  tool: string;
  color: string;
  size: number;
  pts: number[];
}

/** Repli hexa des encres — miroir de `INKS` dans DrawingCanvas.jsx. */
const INK_HEX: Record<string, string> = {
  ink: "#0D0D0D",
  blue: "#1CB0F6",
  red: "#FF4B4B",
  green: "#58CC02",
  amber: "#FF9600",
  purple: "#CE82FF",
};

const PAD = 12;

function isShape(tool: string): boolean {
  return tool === "line" || tool === "arrow" || tool === "rect" || tool === "ellipse";
}

/** Demi-épaisseur réellement peinte — le surligneur est 4× plus large. */
function halfWidth(s: Stroke): number {
  const w = s.tool === "marker" ? s.size * 4 : s.size;
  return w / 2 + (s.tool === "arrow" ? Math.max(9, s.size * 3.6) : 0);
}

function bbox(strokes: Stroke[]): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) {
    const p = s.pts || [];
    if (p.length < 3) continue;
    const pad = halfWidth(s);
    for (let i = 0; i < p.length; i += 3) {
      if (p[i] - pad < x0) x0 = p[i] - pad;
      if (p[i] + pad > x1) x1 = p[i] + pad;
      if (p[i + 1] - pad < y0) y0 = p[i + 1] - pad;
      if (p[i + 1] + pad > y1) y1 = p[i + 1] + pad;
    }
  }
  if (!Number.isFinite(x0)) return null;
  return { x0: x0 - PAD, y0: y0 - PAD, x1: x1 + PAD, y1: y1 + PAD };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Même lissage que le canevas : quadratiques passant par les points milieux.
 * Reproduire la formule à l'identique évite qu'un schéma paraisse « redessiné »
 * une fois exporté.
 */
function smoothPathD(p: number[]): string {
  if (p.length === 3) return `M ${r1(p[0])} ${r1(p[1])} l 0.01 0`;
  let d = `M ${r1(p[0])} ${r1(p[1])}`;
  for (let i = 3; i < p.length - 3; i += 3) {
    d += ` Q ${r1(p[i])} ${r1(p[i + 1])} ${r1((p[i] + p[i + 3]) / 2)} ${r1((p[i + 1] + p[i + 4]) / 2)}`;
  }
  d += ` L ${r1(p[p.length - 3])} ${r1(p[p.length - 2])}`;
  return d;
}

function strokeSvg(s: Stroke): string {
  const p = s.pts || [];
  if (p.length < 3) return "";
  const cls = INK_HEX[s.color] ? s.color : "ink";
  const common = `class="${cls}" fill="none"`;

  if (s.tool === "marker") {
    return `<path ${common} d="${smoothPathD(p)}" stroke-width="${r1(s.size * 4)}" stroke-opacity="0.3" stroke-linecap="butt" stroke-linejoin="round"/>`;
  }
  if (!isShape(s.tool)) {
    if (p.length === 3) {
      return `<circle class="${cls}" fill="currentColor" cx="${r1(p[0])}" cy="${r1(p[1])}" r="${r1(s.size / 2)}" stroke="none"/>`;
    }
    return `<path ${common} d="${smoothPathD(p)}" stroke-width="${s.size}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  const [x0, y0, , x1, y1] = p;
  const geom = `stroke-width="${s.size}" stroke-linecap="round" stroke-linejoin="round"`;
  if (s.tool === "rect") {
    return `<rect ${common} ${geom} x="${r1(Math.min(x0, x1))}" y="${r1(Math.min(y0, y1))}" width="${r1(Math.abs(x1 - x0))}" height="${r1(Math.abs(y1 - y0))}"/>`;
  }
  if (s.tool === "ellipse") {
    return `<ellipse ${common} ${geom} cx="${r1((x0 + x1) / 2)}" cy="${r1((y0 + y1) / 2)}" rx="${r1(Math.abs(x1 - x0) / 2)}" ry="${r1(Math.abs(y1 - y0) / 2)}"/>`;
  }
  const line = `<line ${common} ${geom} x1="${r1(x0)}" y1="${r1(y0)}" x2="${r1(x1)}" y2="${r1(y1)}"/>`;
  if (s.tool !== "arrow") return line;
  // Pointe de flèche : mêmes proportions que le canevas (angle π/7).
  const head = Math.max(9, s.size * 3.6);
  const a = Math.atan2(y1 - y0, x1 - x0);
  const w = Math.PI / 7;
  const ax = x1 - Math.cos(a - w) * head, ay = y1 - Math.sin(a - w) * head;
  const bx = x1 - Math.cos(a + w) * head, by = y1 - Math.sin(a + w) * head;
  return (
    line +
    `<polyline ${common} ${geom} points="${r1(ax)},${r1(ay)} ${r1(x1)},${r1(y1)} ${r1(bx)},${r1(by)}"/>`
  );
}

/**
 * SVG autonome du dessin d'une note, ou `null` s'il n'y a rien à tracer.
 * La zone est recadrée sur les traits : un dessin fait en bas d'une longue note
 * ne produit pas un fichier de 3 000 px de haut presque vide.
 */
export function drawingToSvg(drawing: NoteDrawing | null | undefined): string | null {
  const strokes = ((drawing?.strokes || []) as Stroke[]).filter((s) => s && (s.pts || []).length >= 3);
  if (strokes.length === 0) return null;
  const box = bbox(strokes);
  if (!box) return null;

  const w = Math.max(1, Math.ceil(box.x1 - box.x0));
  const h = Math.max(1, Math.ceil(box.y1 - box.y0));
  const body = strokes.map(strokeSvg).filter(Boolean).join("\n    ");

  const light = Object.entries(INK_HEX)
    .map(([key, hex]) => `.${key}{stroke:${hex};color:${hex}}`)
    .join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
    `viewBox="${r1(box.x0)} ${r1(box.y0)} ${w} ${h}" role="img" aria-label="Schéma de la note">\n` +
    `  <style>${light}\n` +
    `  @media (prefers-color-scheme: dark){.ink{stroke:#EDEDED;color:#EDEDED}}</style>\n` +
    `  <g>\n    ${body}\n  </g>\n` +
    `</svg>\n`
  );
}
