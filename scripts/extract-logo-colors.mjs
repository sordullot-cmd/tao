/**
 * Extraction des couleurs dominantes des logos de brokers / prop firms.
 *
 * Utilitaire ponctuel : sert à choisir la couleur d'identité d'une firme à
 * partir du logo réellement affiché dans l'app, plutôt qu'à partir d'une
 * charte trouvée en ligne qui ne correspondrait pas au fichier embarqué.
 *
 *   node scripts/extract-logo-colors.mjs
 */
import sharp from "sharp";
import { readdirSync } from "node:fs";
import path from "node:path";

/** Fichiers passés en argument, ou le lot par défaut ci-dessous. */
const FILES = process.argv.slice(2).length ? process.argv.slice(2) : [
  "public/brokers/Topstep_Logo.jpg",
  "public/brokers/apex.avif",
  "public/brokers/Tradeify.png",
  "public/brokers/lucid.png",
  "public/brokers/ftmo.png",
  "public/trado.png",
  "public/MetaTrader_5.png",
  "public/brokers/MetaTrader_4.png",
];

const hex = (r, g, b) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();

// Saturation/luminosité HSL — sert à écarter les gris, les blancs et les noirs,
// qui dominent presque tous les logos sans rien dire de la marque.
function hsl(r, g, b) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === R) h = 60 * (((G - B) / d) % 6);
    else if (max === G) h = 60 * ((B - R) / d + 2);
    else h = 60 * ((R - G) / d + 4);
  }
  return [(h + 360) % 360, s, l];
}

for (const file of FILES) {
  try {
    const { data, info } = await sharp(file)
      .resize(120, 120, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const buckets = new Map();
    for (let i = 0; i < data.length; i += info.channels) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 200) continue;
      const [, s, l] = hsl(r, g, b);
      if (s < 0.22 || l < 0.1 || l > 0.93) continue; // gris / noir / blanc
      // Quantification par paliers de 24 : regroupe les dégradés d'un même aplat.
      const key = [r, g, b].map((v) => Math.round(v / 24) * 24).join(",");
      const cur = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      cur.n++; cur.r += r; cur.g += g; cur.b += b;
      buckets.set(key, cur);
    }

    const top = [...buckets.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, 4)
      .map((c) => `${hex(Math.round(c.r / c.n), Math.round(c.g / c.n), Math.round(c.b / c.n))} (${c.n}px)`);

    console.log(path.basename(file).padEnd(22), top.join("  ") || "— aucune couleur saturée —");
  } catch (e) {
    console.log(path.basename(file).padEnd(22), "ERREUR:", e.message);
  }
}
