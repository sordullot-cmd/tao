import { describe, it, expect } from "vitest";
// @ts-expect-error — module JS sans déclarations de types
import { renderRichText } from "@/lib/ui/richText";
// @ts-expect-error — module JS sans déclarations de types
import { htmlToMarkdown, htmlHasStructure } from "@/lib/ui/clipboardMarkdown";

/** Vérifie que toutes les balises produites sont correctement appariées. */
function isWellFormed(html: string) {
  const VOID = new Set(["br", "hr", "img", "input", "path", "line", "use", "col"]);
  const stack: string[] = [];
  for (const m of html.matchAll(/<\/?([a-z0-9]+)[^>]*?(\/?)>/gi)) {
    const [full, tag, selfClose] = m;
    const t = tag.toLowerCase();
    if (VOID.has(t) || selfClose === "/") continue;
    if (full.startsWith("</")) {
      if (stack.pop() !== t) return false;
    } else stack.push(t);
  }
  return stack.length === 0;
}

describe("renderRichText — formules", () => {
  it("rend une formule en ligne avec KaTeX", () => {
    const html = renderRichText("Produit : $a^m \\cdot a^n = a^{m+n}$ voilà");
    expect(html).toContain("class=\"katex");
    expect(html).not.toContain("katex-error");
    expect(html).not.toContain("$a^m");
  });

  it("rend $$…$$ en bloc centré", () => {
    const html = renderRichText("$$\\sqrt{a+b} \\neq \\sqrt{a} + \\sqrt{b}$$");
    expect(html).toContain("rt-math-block");
    expect(html).toContain("katex-display");
  });

  it("accepte les délimiteurs \\( \\) et \\[ \\]", () => {
    expect(renderRichText("soit \\(x^2\\) donc")).toContain("class=\"katex");
    expect(renderRichText("\\[x^2\\]")).toContain("katex-display");
  });

  it("ne préserve pas l'italique markdown à l'intérieur du TeX", () => {
    // a_1 … b_2 : les underscores ne doivent pas devenir de l'italique.
    const html = renderRichText("$a_1 + b_2$");
    expect(html).not.toContain("<em>");
  });

  it("laisse les montants en dollars intacts", () => {
    const html = renderRichText("Un prix de 100 $ à 200 $ par lot.");
    expect(html).not.toContain("katex");
    expect(html).toContain("100 $ à 200 $");
  });

  it("gère le dollar échappé", () => {
    expect(renderRichText("Frais de \\$50 par contrat")).toContain("$50");
  });

  it("ne casse pas le rendu sur une formule invalide", () => {
    const html = renderRichText("$\\frac{{{$");
    expect(html).toBeTruthy();
    expect(isWellFormed(html)).toBe(true);
  });
});

describe("renderRichText — blocs markdown", () => {
  const src = [
    "## B. Les Lois des Puissances",
    "",
    "Soient $a$ et $b$ des réels non nuls :",
    "",
    "1. **Produit de même base** : $a^m \\cdot a^n = a^{m+n}$ *(on additionne)*",
    "2. **Quotient de même base** : $\\frac{a^m}{a^n} = a^{m-n}$",
    "",
    "- niveau 1",
    "  - niveau 2",
    "    1. numéroté imbriqué",
    "- retour niveau 1",
    "",
    "> *Preuve rapide :* $\\sqrt{25} = 5$",
    "",
    "| Loi | Formule |",
    "| --- | --- |",
    "| Produit | $a^m a^n$ |",
    "",
    "```",
    "code brut ** non gras **",
    "```",
    "",
    "---",
    "Texte avec #maths et un [lien](https://example.com).",
  ].join("\n");

  const html = renderRichText(src);

  it("produit un HTML bien formé", () => {
    expect(isWellFormed(html)).toBe(true);
  });

  it("reconnaît titres, listes, citation, tableau, code et séparateur", () => {
    expect(html).toContain("<h2");
    expect(html).toMatch(/<ol class="rt-list">/);
    expect(html).toMatch(/<ul class="rt-list">/);
    expect(html).toContain("<blockquote");
    expect(html).toContain("<table");
    expect(html).toContain("<pre");
    expect(html).toContain("rt-hr");
  });

  it("imbrique les sous-listes dans leur item parent", () => {
    // Une <ul> imbriquée doit apparaître avant la fermeture du <li> parent.
    expect(html).toMatch(/<li class="rt-li"[^>]*>niveau 1<ul/);
  });

  it("applique gras et italique hors formules", () => {
    expect(html).toContain("<strong>Produit de même base</strong>");
    expect(html).toContain("<em>(on additionne)</em>");
  });

  it("n'interprète pas le markdown dans un bloc de code", () => {
    expect(html).toContain("code brut ** non gras **");
  });

  it("colore les #tags et rend les liens", () => {
    expect(html).toContain("rt-tag");
    expect(html).toContain('href="https://example.com"');
  });

  it("échappe le HTML de l'utilisateur", () => {
    const evil = renderRichText('<img src=x onerror="alert(1)"> <script>alert(2)</script>');
    // Le contenu doit rester du texte : aucune balise réellement ouverte.
    expect(evil).not.toMatch(/<(script|img)\b/i);
    expect(evil).toContain("&lt;script");
    // Un lien javascript: n'est pas transformé en <a>.
    expect(renderRichText("[clic](javascript:alert(1))")).not.toContain("<a ");
  });

  it("renvoie une chaîne vide pour une note vide", () => {
    expect(renderRichText("")).toBe("");
    expect(renderRichText(null)).toBe("");
  });
});

describe("htmlToMarkdown — collage depuis un assistant", () => {
  // Ce que met réellement Claude/ChatGPT dans le presse-papier : les formules
  // sont du KaTeX rendu, la source TeX vit dans <annotation>.
  const clip = `<meta charset="utf-8"><h3>B. Les Lois des Puissances</h3>`
    + `<ol><li><p><strong>Produit de même base</strong> : `
    + `<span class="katex"><span class="katex-mathml"><math><semantics><mrow><msup><mi>a</mi><mi>m</mi></msup></mrow>`
    + `<annotation encoding="application/x-tex">a^m \\cdot a^n = a^{m+n}</annotation></semantics></math></span>`
    + `<span class="katex-html" aria-hidden="true">aman=am+n</span></span> <em>(on additionne les exposants)</em></p></li>`
    + `<li><p><strong>Quotient</strong></p><ul><li>sous-item</li></ul></li></ol>`
    + `<blockquote><p>Preuve rapide</p></blockquote>`;

  const md = htmlToMarkdown(clip) as string;

  it("récupère la source TeX au lieu du texte MathML aplati", () => {
    expect(md).toContain("$a^m \\cdot a^n = a^{m+n}$");
    expect(md).not.toContain("aman=am+n");
  });

  it("sépare les items de liste (le bug du collage tout-en-un)", () => {
    const items = md.split("\n").filter((l) => /^\d+\./.test(l.trim()));
    expect(items.length).toBe(2);
  });

  it("indente les sous-listes", () => {
    expect(md).toMatch(/\n {2}- sous-item/);
  });

  it("conserve titres, gras, italique et citation", () => {
    expect(md).toContain("### B. Les Lois des Puissances");
    expect(md).toContain("**Produit de même base**");
    expect(md).toContain("*(on additionne les exposants)*");
    expect(md).toContain("> Preuve rapide");
  });

  it("se rend ensuite correctement en HTML", () => {
    const html = renderRichText(md);
    expect(html).toContain("class=\"katex");
    expect(isWellFormed(html)).toBe(true);
  });

  it("détecte l'absence de structure exploitable", () => {
    expect(htmlHasStructure("<span>bonjour</span>")).toBe(false);
    expect(htmlHasStructure("<ul><li>a</li></ul>")).toBe(true);
  });

  it("renvoie null sur un HTML vide", () => {
    expect(htmlToMarkdown("")).toBe(null);
    expect(htmlToMarkdown("<div>   </div>")).toBe(null);
  });
});

describe("renderRichText — cases à cocher", () => {
  it("rend une case vide et une case cochée", () => {
    const html = renderRichText("- [ ] à faire\n- [x] fait");
    expect(html).toContain('class="rt-li rt-task"');
    expect(html).toContain('class="rt-li rt-task rt-task-done"');
    expect(html).toContain('aria-checked="true"');
    expect(isWellFormed(html)).toBe(true);
  });

  it("désigne la ligne du markdown, pas le rang de la tâche", () => {
    const html = renderRichText("# Titre\n\n- [ ] a\n- [ ] b");
    expect(html).toContain('data-line="2"');
    expect(html).toContain('data-line="3"');
  });

  it("laisse les puces ordinaires sans case", () => {
    const html = renderRichText("- simple puce");
    expect(html).not.toContain("rt-task");
  });

  it("garde les cases des listes numérotées", () => {
    const html = renderRichText("1. [x] fait");
    expect(html).toContain("rt-task-done");
    expect(html).toContain("<ol");
  });
});

describe("renderRichText — encadrés et blocs repliables", () => {
  it("rend un encadré à sa couleur", () => {
    const html = renderRichText("> [!warning] Attention\n> le corps");
    expect(html).toContain("rt-callout rt-callout-warning");
    expect(html).toContain("Attention");
    expect(html).toContain("le corps");
    expect(isWellFormed(html)).toBe(true);
  });

  it("replie un bloc suffixé d'un tiret et déplie celui suffixé d'un plus", () => {
    expect(renderRichText("> [!note]- Caché\n> corps")).not.toContain("<details class=\"rt-callout rt-callout-note rt-callout-fold\" open>");
    expect(renderRichText("> [!tip]+ Ouvert\n> corps")).toContain(" open>");
  });

  it("rend le corps d'un encadré comme du markdown complet", () => {
    const html = renderRichText("> [!info] Liste\n> - un\n> - deux");
    expect(html).toContain("<ul");
  });

  it("ne rend pas cliquables les cases d'un encadré", () => {
    const html = renderRichText("> [!info] T\n> - [ ] a");
    expect(html).toContain("rt-task");
    // L'encadré porte sa ligne, mais la case qu'il contient n'en a pas : une
    // fois le « > » retiré, on ne saurait plus quelle ligne réécrire.
    expect(html).not.toMatch(/rt-box[^>]*data-line/);
  });

  it("laisse une citation ordinaire en blockquote", () => {
    const html = renderRichText("> juste une citation");
    expect(html).toContain("rt-quote");
    expect(html).not.toContain("rt-callout");
  });

  it("sépare deux encadrés consécutifs", () => {
    const html = renderRichText("> [!info] Un\n> a\n> [!tip] Deux\n> b");
    expect(html).toContain("rt-callout-info");
    expect(html).toContain("rt-callout-tip");
  });
});

describe("renderRichText — liens entre notes", () => {
  it("rend un [[lien]] avec sa cible", () => {
    const html = renderRichText("voir [[Plan 2026]]");
    expect(html).toContain('data-note="Plan 2026"');
    expect(html).toContain(">Plan 2026</a>");
  });

  it("respecte l'alias [[cible|libellé]]", () => {
    const html = renderRichText("voir [[Plan|mon plan]]");
    expect(html).toContain('data-note="Plan"');
    expect(html).toContain(">mon plan</a>");
  });

  it("n'invente pas de lien pour un simple crochet", () => {
    expect(renderRichText("un [tableau] ordinaire")).not.toContain("rt-wiki");
  });
});
