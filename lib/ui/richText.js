/**
 * Rendu de texte enrichi pour les notes : markdown léger + formules LaTeX.
 *
 * `renderRichText(src)` rend une note en HTML : titres, listes (imbriquées),
 * citations, tableaux, blocs de code, gras/italique, #tags — et les formules
 * passées à KaTeX (`$…$` en ligne, `$$…$$` / `\[…\]` en bloc centré).
 *
 * Tout le texte est échappé avant injection et KaTeX tourne avec `trust: false`
 * (défaut) : le HTML produit ne contient que les balises construites ici.
 *
 * Ce module importe KaTeX (~280 ko) : ne l'importer que côté aperçu. La
 * conversion du presse-papier vit dans `clipboardMarkdown.js`, sans KaTeX.
 */
import katex from "katex";

/* ─────────────────────────────────────────────────── utilitaires */

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Sentinelles hors-alphabet : elles traversent l'échappement HTML et les regex
// markdown sans jamais matcher (U+0000 est retiré du texte en entrée).
const MATH_OPEN = "\u0000M";
const CODE_OPEN = "\u0000C";
const SENTINEL_END = "\u0000";

/* ─────────────────────────────────── extraction des formules LaTeX */

// Un `$…$` n'est une formule que si le contenu est non vide, tient sur une
// ligne et ne commence/finit pas par une espace : sinon « 100 $ à 200 $ »
// deviendrait une formule. Même heuristique que markdown-it-dollarmath.
function looksLikeMath(tex) {
  if (!tex || tex.length > 2000) return false;
  if (/^\s|\s$/.test(tex)) return false;
  return true;
}

/**
 * Remplace chaque formule par une sentinelle et renvoie la liste des TeX
 * rencontrés, dans l'ordre. Gère `$$…$$`, `$…$`, `\(…\)`, `\[…\]` et `\$`.
 */
function extractMath(src, sink) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];

    if (c === "\\") {
      const next = src[i + 1];
      if (next === "$") { out += "$"; i += 2; continue; }          // dollar littéral
      if (next === "(" || next === "[") {
        const display = next === "[";
        const close = display ? "\\]" : "\\)";
        const end = src.indexOf(close, i + 2);
        if (end !== -1) {
          const tex = src.slice(i + 2, end).trim();
          if (tex) {
            out += MATH_OPEN + sink.push({ tex, display }) + SENTINEL_END;
            i = end + 2;
            continue;
          }
        }
      }
      // Tout autre antislash (\cdot, \frac…) hors formule : texte brut.
      out += c;
      i += 1;
      continue;
    }

    if (c === "$") {
      const display = src[i + 1] === "$";
      const delim = display ? "$$" : "$";
      const end = src.indexOf(delim, i + delim.length);
      if (end !== -1) {
        const tex = src.slice(i + delim.length, end);
        if (display || looksLikeMath(tex)) {
          const clean = tex.trim();
          if (clean) {
            out += MATH_OPEN + sink.push({ tex: clean, display }) + SENTINEL_END;
            i = end + delim.length;
            continue;
          }
        }
      }
      out += c;
      i += 1;
      continue;
    }

    out += c;
    i += 1;
  }
  return out;
}

function renderMath(tex, display) {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      strict: false,
      output: "htmlAndMathml",
      errorColor: "var(--color-red, #EF4444)",
      macros: {
        "\\R": "\\mathbb{R}",
        "\\N": "\\mathbb{N}",
        "\\Z": "\\mathbb{Z}",
        "\\Q": "\\mathbb{Q}",
        "\\C": "\\mathbb{C}",
      },
    });
  } catch {
    // Filet : une formule illisible reste lisible en source plutôt que de
    // faire échouer le rendu de toute la note.
    return `<code class="rt-code">${escapeHtml(display ? `$$${tex}$$` : `$${tex}$`)}</code>`;
  }
}

/* ───────────────────────────────────────────── markdown en ligne */

function inlineMarkdown(raw, maths, codes) {
  // 1) Formules et code d'abord : leur contenu ne doit subir aucune règle
  //    markdown (`a_1 * b_2` n'est pas de l'italique).
  let s = extractMath(raw, maths);
  s = s.replace(/`([^`]+)`/g, (_, code) => CODE_OPEN + codes.push(code) + SENTINEL_END);

  // 2) Échappement, puis les règles inline sur le texte restant.
  s = escapeHtml(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_, alt, url) =>
    /^(https?:|data:image\/)/i.test(url)
      ? `<img class="rt-img" src="${url}" alt="${alt}" />`
      : escapeHtml(alt));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (m, txt, url) =>
    /^(https?:|mailto:)/i.test(url)
      ? `<a class="rt-a" href="${url}" target="_blank" rel="noopener noreferrer">${txt}</a>`
      : m);
  s = s.replace(/\*\*\*([^\s*][^*]*?)\*\*\*/g, "<strong><em>$1</em></strong>");
  s = s.replace(/\*\*([^\s*][^*]*?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^\s_][^_]*?)__/g, "<strong>$1</strong>");
  s = s.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  s = s.replace(/(^|[\s(])\*([^\s*][^*]*?)\*(?=$|[\s.,;:!?)])/g, "$1<em>$2</em>");
  s = s.replace(/(^|[\s(])_([^\s_][^_]*?)_(?=$|[\s.,;:!?)])/g, "$1<em>$2</em>");
  // Les #tags gardent le bleu du calque d'édition (cohérence éditeur/aperçu).
  s = s.replace(/(^|\s)#([a-zA-Z][a-zA-Z0-9_-]*)/g,
    (_, pre, tag) => `${pre}<span class="rt-tag">#${tag}</span>`);
  s = s.replace(/ {2,}$/, "<br />");

  // 3) Réinjection.
  s = s.replace(new RegExp(`${CODE_OPEN}(\\d+)${SENTINEL_END}`, "g"),
    (_, n) => `<code class="rt-code">${escapeHtml(codes[n - 1])}</code>`);
  s = s.replace(new RegExp(`${MATH_OPEN}(\\d+)${SENTINEL_END}`, "g"),
    (_, n) => { const m = maths[n - 1]; return renderMath(m.tex, m.display); });
  return s;
}

/* ──────────────────────────────────────────────── blocs markdown */

const BULLET_RE = /^([\s\t]*)(?:[-*+•◦▪·o]|[–—])[ \t]+(.*)$/;
const ORDERED_RE = /^([\s\t]*)(\d{1,3})[.)][ \t]+(.*)$/;
const HEADING_RE = /^(#{1,6})[ \t]+(.*)$/;
const QUOTE_RE = /^[ \t]*>[ \t]?(.*)$/;
const HR_RE = /^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/;
const FENCE_RE = /^[ \t]*```(.*)$/;
const TABLE_SEP_RE = /^[ \t]*\|?[\s:|-]*-[\s:|-]*\|?[ \t]*$/;

// Un niveau d'indentation = 2 espaces (une tabulation en vaut 4, comme dans la
// plupart des éditeurs) ; l'éditeur de notes indente par 8 espaces via Tab.
function levelOf(indent) {
  const width = indent.replace(/\t/g, "    ").length;
  return Math.min(4, Math.floor(width / 2));
}

function splitRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
}

/**
 * Rend une note (markdown léger + LaTeX) en HTML.
 * @param {string} src texte source de la note
 * @returns {string} HTML prêt pour `dangerouslySetInnerHTML`
 */
export function renderRichText(src) {
  const text = String(src || "").replace(/\r\n?/g, "\n").replace(/\u0000/g, "");
  const lines = text.split("\n");
  const maths = [];
  const codes = [];
  const inline = (s) => inlineMarkdown(s, maths, codes);

  const out = [];
  let i = 0;

  // Rend une suite d'items de liste en ul/ol imbriquées.
  const flushList = (items) => {
    const html = [];
    const stack = []; // niveaux ouverts : "ul" | "ol"
    let open = false; // un <li> est-il en cours ?
    for (const it of items) {
      while (stack.length > it.level + 1) {
        if (open) { html.push("</li>"); open = false; }
        html.push(`</${stack.pop()}>`);
        if (stack.length) html.push("</li>");
      }
      if (stack.length === it.level + 1 && stack[stack.length - 1] !== it.type) {
        if (open) { html.push("</li>"); open = false; }
        html.push(`</${stack.pop()}>`);
        stack.push(it.type);
        html.push(`<${it.type} class="rt-list">`);
      }
      while (stack.length < it.level + 1) {
        if (open) open = false; // la sous-liste vit dans le <li> courant
        stack.push(it.type);
        html.push(`<${it.type} class="rt-list">`);
      }
      if (open) { html.push("</li>"); open = false; }
      html.push(`<li class="rt-li">${inline(it.text)}`);
      open = true;
      if (it.extra.length) html.push(`<div class="rt-li-more">${it.extra.map(inline).join("<br />")}</div>`);
    }
    if (open) html.push("</li>");
    while (stack.length) {
      html.push(`</${stack.pop()}>`);
      if (stack.length) html.push("</li>");
    }
    return html.join("");
  };

  while (i < lines.length) {
    const line = lines[i];

    // ── ligne vide
    if (!line.trim()) { i++; continue; }

    // ── bloc de code ```
    const fence = line.match(FENCE_RE);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !FENCE_RE.test(lines[i])) buf.push(lines[i++]);
      i++; // ferme la clôture
      out.push(`<pre class="rt-pre"><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }

    // ── formule en bloc seule sur sa ligne ($$…$$ ou \[…\], éventuellement
    //    étalée sur plusieurs lignes)
    const openDisplay = line.trim().match(/^(\$\$|\\\[)(.*)$/);
    if (openDisplay) {
      const close = openDisplay[1] === "$$" ? "$$" : "\\]";
      let body = openDisplay[2];
      let endIdx = body.indexOf(close);
      if (endIdx !== -1) {
        body = body.slice(0, endIdx);
        i++;
      } else {
        i++;
        const buf = [body];
        while (i < lines.length) {
          const l = lines[i++];
          const at = l.indexOf(close);
          if (at !== -1) { buf.push(l.slice(0, at)); break; }
          buf.push(l);
        }
        body = buf.join("\n");
      }
      const tex = body.trim();
      if (tex) out.push(`<div class="rt-math-block">${renderMath(tex, true)}</div>`);
      continue;
    }

    // ── séparateur
    if (HR_RE.test(line)) { out.push('<hr class="rt-hr" />'); i++; continue; }

    // ── titre
    const h = line.match(HEADING_RE);
    if (h) {
      const lvl = Math.min(6, h[1].length);
      out.push(`<h${lvl} class="rt-h rt-h${lvl}">${inline(h[2].trim())}</h${lvl}>`);
      i++;
      continue;
    }

    // ── citation (blocs contigus regroupés)
    if (QUOTE_RE.test(line)) {
      const buf = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) buf.push(lines[i++].match(QUOTE_RE)[1]);
      out.push(`<blockquote class="rt-quote">${buf.map(inline).join("<br />")}</blockquote>`);
      continue;
    }

    // ── tableau : ligne de |…| suivie d'un séparateur |---|
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(splitRow(lines[i++]));
      out.push(
        `<div class="rt-table-wrap"><table class="rt-table"><thead><tr>${
          head.map(c => `<th>${inline(c)}</th>`).join("")
        }</tr></thead><tbody>${
          rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")
        }</tbody></table></div>`
      );
      continue;
    }

    // ── listes (à puces et numérotées, imbriquées)
    if (BULLET_RE.test(line) || ORDERED_RE.test(line)) {
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        const b = l.match(BULLET_RE);
        const o = !b && l.match(ORDERED_RE);
        if (b || o) {
          const indent = b ? b[1] : o[1];
          items.push({ level: levelOf(indent), type: b ? "ul" : "ol", text: (b ? b[2] : o[3]).trim(), extra: [] });
          i++;
          continue;
        }
        // Continuation : ligne indentée qui n'ouvre pas un nouvel item.
        if (items.length && /^[ \t]+\S/.test(l) && !HEADING_RE.test(l) && !HR_RE.test(l)) {
          items[items.length - 1].extra.push(l.trim());
          i++;
          continue;
        }
        break;
      }
      out.push(flushList(items));
      continue;
    }

    // ── paragraphe : lignes consécutives jusqu'à une ligne vide ou un bloc
    const para = [];
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) break;
      if (BULLET_RE.test(l) || ORDERED_RE.test(l) || HEADING_RE.test(l) || QUOTE_RE.test(l)
        || HR_RE.test(l) || FENCE_RE.test(l) || /^(\$\$|\\\[)/.test(l.trim())) break;
      para.push(l);
      i++;
    }
    out.push(`<p class="rt-p">${para.map(inline).join("<br />")}</p>`);
  }

  return out.join("\n") || "";
}
