/**
 * Conversion du presse-papier HTML en markdown léger.
 *
 * Module volontairement séparé de `richText.js` : celui-ci importe KaTeX
 * (~280 ko), alors que coller n'en a pas besoin. L'éditeur de notes importe
 * donc ce fichier statiquement, et le rendu seulement à l'ouverture de l'aperçu.
 */

const BLOCK_TAGS = new Set([
  "P", "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "MAIN", "ASIDE",
  "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE",
  "PRE", "TABLE", "TR", "HR", "BR", "FIGURE", "FIGCAPTION", "DL", "DT", "DD",
]);

/**
 * Convertit un fragment HTML (presse-papier) en markdown léger.
 * Les formules déjà rendues (KaTeX / MathJax / MathML) sont récupérées via leur
 * source TeX (`<annotation encoding="application/x-tex">`), sinon on hériterait
 * du texte du fallback MathML et la formule serait dupliquée et illisible.
 *
 * @param {string} html contenu `text/html` du presse-papier
 * @returns {string|null} markdown, ou null si rien d'exploitable
 */
export function htmlToMarkdown(html) {
  if (typeof DOMParser === "undefined" || !html) return null;
  let body;
  try {
    body = new DOMParser().parseFromString(html, "text/html").body;
  } catch {
    return null;
  }
  if (!body) return null;

  body.querySelectorAll("script, style, noscript, head, meta, link").forEach(n => n.remove());

  // Formules rendues → $tex$ (tout le conteneur est remplacé par du texte).
  // On remonte au conteneur le plus englobant : `closest()` s'arrêterait sur le
  // <math> et laisserait derrière lui le `.katex-html` — d'où le doublon
  // « $a^m$aman=am+n ». L'ordre des essais est donc du plus large au plus
  // étroit, et non un sélecteur unique.
  body.querySelectorAll("annotation").forEach((ann) => {
    const tex = (ann.textContent || "").trim();
    if (!tex) return;
    const host = ann.closest(".katex-display")
      || ann.closest("mjx-container")
      || ann.closest(".katex")
      || ann.closest("math")
      || ann.parentElement;
    if (!host) return;
    const display = host.classList?.contains("katex-display")
      || host.getAttribute?.("display") === "true"
      || host.getAttribute?.("display") === "block";
    host.replaceWith(body.ownerDocument.createTextNode(display ? `\n\n$$${tex}$$\n\n` : `$${tex}$`));
  });
  // MathJax v2 laisse le TeX dans un <script type="math/tex">.
  body.querySelectorAll("script[type^='math/tex']").forEach((s) => {
    const tex = (s.textContent || "").trim();
    const display = (s.getAttribute("type") || "").includes("mode=display");
    s.replaceWith(body.ownerDocument.createTextNode(display ? `\n\n$$${tex}$$\n\n` : `$${tex}$`));
  });

  const md = [];
  let listStack = []; // { ordered, index }

  const inlineText = (node) => {
    let s = "";
    node.childNodes.forEach((c) => { s += walkInline(c); });
    return s;
  };

  const walkInline = (node) => {
    if (node.nodeType === 3) return (node.nodeValue || "").replace(/\s+/g, " ");
    if (node.nodeType !== 1) return "";
    const tag = node.tagName;
    if (tag === "BR") return "\n";
    if (tag === "CODE" && !node.closest("pre")) return "`" + (node.textContent || "").trim() + "`";
    const inner = inlineText(node);
    if (!inner.trim()) return inner;
    switch (tag) {
      case "STRONG": case "B": return `**${inner.trim()}**`;
      case "EM": case "I": return `*${inner.trim()}*`;
      case "S": case "DEL": case "STRIKE": return `~~${inner.trim()}~~`;
      case "A": {
        const href = node.getAttribute("href") || "";
        return /^(https?:|mailto:)/i.test(href) ? `[${inner.trim()}](${href})` : inner;
      }
      default: return inner;
    }
  };

  const push = (s) => { if (s != null) md.push(s); };

  const walkBlock = (node) => {
    if (node.nodeType === 3) {
      const txt = (node.nodeValue || "").replace(/\s+/g, " ");
      if (txt.trim()) push(txt.trim());
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;

    switch (tag) {
      case "H1": case "H2": case "H3": case "H4": case "H5": case "H6": {
        push("");
        push(`${"#".repeat(Number(tag[1]))} ${inlineText(node).trim()}`);
        push("");
        return;
      }
      case "HR": push(""); push("---"); push(""); return;
      case "PRE": {
        push("");
        push("```");
        push((node.textContent || "").replace(/\n+$/, ""));
        push("```");
        push("");
        return;
      }
      case "BLOCKQUOTE": {
        push("");
        inlineText(node).trim().split("\n").forEach(l => push(`> ${l.trim()}`));
        push("");
        return;
      }
      case "UL": case "OL": {
        if (listStack.length === 0) push("");
        listStack.push({ ordered: tag === "OL", index: Number(node.getAttribute("start") || 1) });
        Array.from(node.children).forEach((li) => { if (li.tagName === "LI") walkBlock(li); });
        listStack.pop();
        if (listStack.length === 0) push("");
        return;
      }
      case "LI": {
        const ctx = listStack[listStack.length - 1] || { ordered: false, index: 1 };
        const pad = "  ".repeat(Math.max(0, listStack.length - 1));
        const marker = ctx.ordered ? `${ctx.index++}.` : "-";
        // Texte de l'item = ses nœuds hors sous-listes / blocs imbriqués.
        const own = [];
        const nested = [];
        node.childNodes.forEach((c) => {
          if (c.nodeType === 1 && (c.tagName === "UL" || c.tagName === "OL")) nested.push(c);
          else if (c.nodeType === 1 && BLOCK_TAGS.has(c.tagName) && c.tagName !== "P" && c.tagName !== "BR") nested.push(c);
          else own.push(c);
        });
        const label = own.map(walkInline).join("").replace(/\s+/g, " ").trim();
        if (label) push(`${pad}${marker} ${label}`);
        else push(`${pad}${marker} `);
        nested.forEach(walkBlock);
        return;
      }
      case "TABLE": {
        const rows = Array.from(node.querySelectorAll("tr"));
        if (rows.length === 0) return;
        push("");
        rows.forEach((tr, idx) => {
          const cells = Array.from(tr.children).map(td => inlineText(td).replace(/\s+/g, " ").trim() || " ");
          push(`| ${cells.join(" | ")} |`);
          if (idx === 0) push(`|${cells.map(() => " --- ").join("|")}|`);
        });
        push("");
        return;
      }
      case "IMG": {
        const src = node.getAttribute("src") || "";
        if (/^(https?:|data:image\/)/i.test(src)) push(`![${node.getAttribute("alt") || ""}](${src})`);
        return;
      }
      case "P": case "DIV": case "SECTION": case "ARTICLE": case "FIGCAPTION":
      case "HEADER": case "FOOTER": case "MAIN": case "ASIDE": case "DD": case "DT": {
        // Un conteneur qui n'englobe que des blocs : on descend sans créer de
        // paragraphe vide (les <div> imbriqués de Notion/Claude, notamment).
        const hasBlockChild = Array.from(node.children).some(c => BLOCK_TAGS.has(c.tagName));
        if (hasBlockChild) {
          node.childNodes.forEach(walkBlock);
          return;
        }
        const txt = inlineText(node).replace(/[ \t]+/g, " ").trim();
        if (txt) { push(""); txt.split("\n").forEach(l => push(l.trim())); push(""); }
        return;
      }
      default: {
        if (BLOCK_TAGS.has(tag)) { node.childNodes.forEach(walkBlock); return; }
        const txt = walkInline(node);
        if (txt.trim()) push(txt.trim());
        return;
      }
    }
  };

  body.childNodes.forEach(walkBlock);

  const result = md
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return result || null;
}

/**
 * Le presse-papier vaut-il la peine d'être converti ? On ignore le `text/html`
 * quand il n'apporte aucune structure (copie d'un simple paragraphe) : le
 * `text/plain` est alors plus fidèle, retours à la ligne compris.
 */
export function htmlHasStructure(html) {
  return /<(ul|ol|li|h[1-6]|table|blockquote|pre|p|div|br|annotation|math|mjx-container)\b/i.test(html || "");
}
