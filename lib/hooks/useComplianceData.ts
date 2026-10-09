"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ComplianceRule, RULE_LOCK_MS } from "@/lib/compliance";
import { useAuth } from "@/lib/auth/supabaseAuthProvider";
import { createClient } from "@/lib/supabase/client";

const RULES_KEY = "tao_compliance_rules";
const WEBHOOK_KEY = "tao_compliance_webhook";
const RULES_EVENT = "tao:compliance-rules-changed";
// Flag de seed (une seule fois) — voir seedDefaultRules().
const SEED_KEY = "tao_compliance_seeded_v1";

function readRules(): ComplianceRule[] {
  try {
    const raw = localStorage.getItem(RULES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

/**
 * Ajoute les règles présentes par défaut, une seule fois (flag SEED_KEY).
 * Aujourd'hui : une règle de journaling active, pour suivre la constance du
 * journal dès l'arrivée sur la page. Respecte une suppression ultérieure
 * (le flag empêche toute réapparition).
 */
function seedDefaultRules(current: ComplianceRule[]): ComplianceRule[] {
  try {
    if (localStorage.getItem(SEED_KEY)) return current;
    localStorage.setItem(SEED_KEY, "1");
    if (current.some(r => r.type === "journaling")) return current;
    const now = new Date();
    const rule: ComplianceRule = {
      id: `cr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "journaling",
      active: true,
      created_at: now.toISOString(),
      effective_at: new Date(now.getTime() + RULE_LOCK_MS).toISOString(),
      params: {},
    };
    const next = [...current, rule];
    writeRules(next);
    return next;
  } catch {
    return current;
  }
}

function writeRules(rules: ComplianceRule[]) {
  try {
    localStorage.setItem(RULES_KEY, JSON.stringify(rules));
    // Notifie toutes les instances du hook dans le même onglet (storage event ne fire que cross-tab)
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(RULES_EVENT));
    }
  } catch {}
}

export function useComplianceRules() {
  const { user } = useAuth();
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Vrai une fois la première lecture cloud terminée : empêche d'écraser le
  // cloud avec l'état local avant de l'avoir chargé.
  const cloudLoadedRef = useRef(false);

  useEffect(() => {
    setRules(seedDefaultRules(readRules()));
    setLoaded(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === RULES_KEY) setRules(readRules());
    };
    const onLocal = () => setRules(readRules());
    window.addEventListener("storage", onStorage);
    window.addEventListener(RULES_EVENT, onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(RULES_EVENT, onLocal);
    };
  }, []);

  /** Pousse les règles en ligne (user_preferences.compliance_rules). */
  const pushCloud = useCallback(async (next: ComplianceRule[]) => {
    if (!user?.id) return;
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("user_preferences")
        .upsert(
          [{ user_id: user.id, compliance_rules: next, updated_at: new Date().toISOString() }],
          { onConflict: "user_id" },
        );
      if (error) console.warn("⚠️ save compliance rules:", error.message);
    } catch (e) {
      console.error("⚠️ save compliance rules failed:", e);
    }
  }, [user?.id]);

  // Charge les règles depuis Supabase dès que l'utilisateur est connu, et
  // resynchronise au retour de focus (cohérence multi-appareils).
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const supabase = createClient();
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("user_preferences")
          .select("compliance_rules")
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          console.warn("⚠️ load compliance rules:", error.code, error.message);
        } else if (data && Array.isArray(data.compliance_rules)) {
          // Le cloud fait foi : on l'applique et on met le cache local à jour.
          setRules(data.compliance_rules as ComplianceRule[]);
          writeRules(data.compliance_rules as ComplianceRule[]);
        } else {
          // Aucune donnée en ligne : on migre les règles locales existantes.
          const local = readRules();
          if (local.length) pushCloud(local);
        }
      } catch (e) {
        console.error("⚠️ load compliance rules failed:", e);
      } finally {
        if (!cancelled) cloudLoadedRef.current = true;
      }
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; window.removeEventListener("focus", onFocus); };
  }, [user?.id, pushCloud]);

  const persist = useCallback((next: ComplianceRule[]) => {
    setRules(next);
    writeRules(next);
    pushCloud(next);
  }, [pushCloud]);

  /** Crée une nouvelle règle. effective_at = now + 24h (lock anti-auto-sabotage). */
  const addRule = useCallback((rule: Omit<ComplianceRule, "id" | "created_at" | "effective_at">) => {
    const now = new Date();
    const r: ComplianceRule = {
      ...rule,
      id: `cr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      created_at: now.toISOString(),
      effective_at: new Date(now.getTime() + RULE_LOCK_MS).toISOString(),
    };
    persist([...readRules(), r]);
    return r;
  }, [persist]);

  /** Met à jour une règle. Toute modif (sauf désactivation) re-arme le lock 24h. */
  const updateRule = useCallback((id: string, patch: Partial<ComplianceRule>) => {
    const cur = readRules();
    const next = cur.map(r => {
      if (r.id !== id) return r;
      // Si seul `active` change vers false, on n'arme pas le lock (désactiver est immédiat)
      const onlyDeactivating = Object.keys(patch).length === 1 && patch.active === false;
      const merged = { ...r, ...patch };
      if (!onlyDeactivating) {
        merged.effective_at = new Date(Date.now() + RULE_LOCK_MS).toISOString();
      }
      return merged;
    });
    persist(next);
  }, [persist]);

  const deleteRule = useCallback((id: string) => {
    persist(readRules().filter(r => r.id !== id));
  }, [persist]);

  return { rules, loaded, addRule, updateRule, deleteRule };
}

/** Webhook URL (Discord, Telegram ou générique) — stocké en localStorage. */
export function useComplianceWebhook() {
  const [url, setUrl] = useState("");
  useEffect(() => {
    try { setUrl(localStorage.getItem(WEBHOOK_KEY) || ""); } catch {}
  }, []);
  const save = useCallback((next: string) => {
    setUrl(next);
    try { localStorage.setItem(WEBHOOK_KEY, next); } catch {}
  }, []);
  return { url, save };
}
