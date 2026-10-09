// Note d'un trade (sur 10) calculée à partir des règles respectées (checklist
// Oui/Non) et des émotions associées. Lit directement les données persistées
// dans localStorage (mêmes clés que le panneau de détail des trades) :
//   - tao_trade_checklist   : { [tradeId]: { [ruleId]: "yes" | "no" } }
//   - tao_emotion_tags      : { [tradeId]: string[] }
//   - tao_checklist_rules_v2: [{ id, label }]  (liste des règles)
//
// Règle "Oui" = +1 positif, "Non" = −1 négatif. Émotion selon EMOTION_SENTIMENT.
// Note = positifs / (positifs + négatifs) × 10. null si rien n'est renseigné.

export const EMOTION_SENTIMENT: Record<string, number> = {
  calm: 1, followed: 1,
  fomo: -1, revenge: -1, overconfident: -1, hesitation: -1, boredom: -1, earlyexit: -1,
};

const DEFAULT_RULE_IDS = ["plan", "signal", "sltp", "exitplan", "rr2"];

function safeParse(key: string, fallback: any): any {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/** Renvoie { score } sur 10, ou null si aucune règle/émotion renseignée. */
export function computeTradeNote(trade: { id?: string | null } | null | undefined): { score: number } | null {
  const id = trade?.id;
  if (!id) return null;

  const checklist = safeParse("tao_trade_checklist", {});
  const emotions = safeParse("tao_emotion_tags", {});
  const rulesRaw = safeParse("tao_checklist_rules_v2", null);
  const ruleIds: string[] = Array.isArray(rulesRaw) && rulesRaw.length
    ? rulesRaw.map((r: any) => r?.id).filter(Boolean)
    : DEFAULT_RULE_IDS;

  const answers = checklist[id] || {};
  let pos = 0, neg = 0;
  ruleIds.forEach((rid) => {
    const a = answers[rid];
    if (a === "yes") pos += 1;
    else if (a === "no") neg += 1;
  });
  (emotions[id] || []).forEach((eid: string) => {
    const s = EMOTION_SENTIMENT[eid] || 0;
    if (s > 0) pos += 1;
    else if (s < 0) neg += 1;
  });

  const total = pos + neg;
  if (total === 0) return null;
  return { score: Math.round((pos / total) * 10) };
}
