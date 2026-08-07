"use client";

import React, { useState, useRef, useEffect } from "react";
import { TrendingUp, TrendingDown, Camera, Star, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import QuickAccountSelector from "@/components/QuickAccountSelector";
import { T as BaseT } from "@/lib/ui/tokens";

interface TradeFormProps {
  userId: string;
  strategies?: string[];
  onSuccess?: (tradeId: string) => void;
  existingTrade?: any;
}

const emotionTags = [
  { label: "FOMO", type: "negative" },
  { label: "Revenge", type: "negative" },
  { label: "Overconfident", type: "negative" },
  { label: "Overtrading", type: "negative" },
  { label: "Hesitation", type: "neutral" },
  { label: "Boredom", type: "neutral" },
  { label: "Early Exit", type: "neutral" },
  { label: "Calm", type: "positive" },
  { label: "Focused", type: "positive" },
  { label: "Patient", type: "positive" },
];

const exitTypes = ["Manuel", "Stop Loss", "Take Profit", "AutoLiq"];

export default function TradeForm({
  userId,
  strategies = [],
  onSuccess,
  existingTrade,
}: TradeFormProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loadedStrategies, setLoadedStrategies] = useState<any[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Basic form state
  const [symbol, setSymbol] = useState(existingTrade?.symbol || "");
  const [direction, setDirection] = useState(existingTrade?.direction || "LONG");
  const [entryPrice, setEntryPrice] = useState(
    existingTrade?.entry_price || ""
  );
  const [exitPrice, setExitPrice] = useState(existingTrade?.exit_price || "");
  const [quantity, setQuantity] = useState(existingTrade?.quantity || "");
  const [entryTime, setEntryTime] = useState(
    existingTrade?.entry_time?.substring(0, 16) || ""
  );
  const [exitTime, setExitTime] = useState(
    existingTrade?.exit_time?.substring(0, 16) || ""
  );
  const [setupName, setSetupName] = useState(existingTrade?.setup_name || "");
  const [selectedAccountId, setSelectedAccountId] = useState(existingTrade?.account_id || null);
  const [exitType, setExitType] = useState(existingTrade?.exit_type || "");
  const [selectedStrategy, setSelectedStrategy] = useState("");

  // Subjective fields
  const [notes, setNotes] = useState("");
  const [selectedEmotions, setSelectedEmotions] = useState<string[]>([]);
  const [qualityScore, setQualityScore] = useState(5);
  const [screenshot, setScreenshot] = useState<File | null>(null);

  // Load strategies from localStorage
  useEffect(() => {
    const savedStrategies = localStorage.getItem("apex_strategies");
    if (savedStrategies) {
      setLoadedStrategies(JSON.parse(savedStrategies));
    }
  }, []);

  const handleEmotionToggle = (emotion: string) => {
    setSelectedEmotions((prev) =>
      prev.includes(emotion)
        ? prev.filter((e) => e !== emotion)
        : [...prev, emotion]
    );
  };

  const handleScreenshotUpload = async (file: File) => {
    setScreenshot(file);
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNotes(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.max(120, textareaRef.current.scrollHeight) + "px";
    }
  };

  const validateForm = (): boolean => {
    if (!symbol || !entryPrice || !quantity || !entryTime) {
      setError("Remplis les champs obligatoires");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // Validation: vérifier qu'un compte est sélectionné
      if (!selectedAccountId) {
        setError("Veuillez sélectionner un compte de trading");
        return;
      }

      // Validation: userId est optionnel (fonctionne avec localStorage seul)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const validUserId = userId && uuidRegex.test(userId) ? userId : "local_user";

      // 1. Calculer P&L
      const pnl =
        direction === "LONG"
          ? (parseFloat(exitPrice || "0") - parseFloat(entryPrice)) *
            parseFloat(quantity)
          : (parseFloat(entryPrice) - parseFloat(exitPrice || "0")) *
            parseFloat(quantity);

      // 2. Créer/mettre à jour le trade
      const tradeData = {
        user_id: validUserId,
        symbol,
        direction,
        entry_price: parseFloat(entryPrice),
        exit_price: exitPrice ? parseFloat(exitPrice) : null,
        quantity: parseFloat(quantity),
        pnl: exitPrice ? pnl : null,
        setup_name: setupName,
        account_id: selectedAccountId,
        exit_type: exitType || null,
        entry_time: entryTime,
        exit_time: exitTime || null,
      };

      let tradeId = existingTrade?.id;

      if (existingTrade) {
        const { error: updateError } = await supabase
          .from("trades")
          .update(tradeData)
          .eq("id", tradeId);

        if (updateError) throw updateError;
      } else {
        const { data, error: insertError } = await supabase
          .from("trades")
          .insert([tradeData])
          .select();

        if (insertError) throw insertError;
        tradeId = data?.[0]?.id;
      }

      // 3. Uploader screenshot si présent
      let screenshotUrl = null;
      if (screenshot) {
        const fileName = `${userId}/${tradeId}/${Date.now()}`;
        const { error: uploadError, data } = await supabase.storage
          .from("trade_screenshots")
          .upload(fileName, screenshot);

        if (!uploadError) {
          const {
            data: { publicUrl },
          } = supabase.storage.from("trade_screenshots").getPublicUrl(fileName);
          screenshotUrl = publicUrl;
        }
      }

      // 4. Créer/mettre à jour les détails du trade
      const detailsData = {
        user_id: userId,
        trade_id: tradeId,
        notes,
        emotion_tags: selectedEmotions,
        quality_score: qualityScore,
        screenshot_url: screenshotUrl,
      };

      const { data: existingDetails } = await supabase
        .from("trade_details")
        .select("id")
        .eq("trade_id", tradeId)
        .single();

      if (existingDetails) {
        await supabase
          .from("trade_details")
          .update(detailsData)
          .eq("id", existingDetails.id);
      } else {
        await supabase.from("trade_details").insert([detailsData]);
      }

      // 5. Link trade to strategy if selected
      if (selectedStrategy) {
        const tradeIdKey = `${entryTime.split("T")[0]}${symbol}${entryPrice}`;
        const savedTradeStrategies = localStorage.getItem("tr4de_trade_strategies");
        const tradeStrategies = savedTradeStrategies ? JSON.parse(savedTradeStrategies) : {};
        
        if (!tradeStrategies[tradeIdKey]) {
          tradeStrategies[tradeIdKey] = [];
        }
        
        // Add strategy ID if not already present
        const strategyId = parseInt(selectedStrategy);
        if (!tradeStrategies[tradeIdKey].includes(strategyId)) {
          tradeStrategies[tradeIdKey].push(strategyId);
        }
        
        localStorage.setItem("tr4de_trade_strategies", JSON.stringify(tradeStrategies));
      }

      // 6. Déclencher l'analyse IA
      const analyzeResponse = await fetch("/api/ai/analyze-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeId, userId }),
      });

      const analysis = await analyzeResponse.json();

      setSuccess(
        `Trade sauvegardé! ${analysis.notification?.message || "Analysé par l'IA"}`
      );
      onSuccess?.(tradeId);

      // Reset form
      setSymbol("");
      setEntryPrice("");
      setExitPrice("");
      setQuantity("");
      setDirection("LONG");
      setNotes("");
      setSelectedEmotions([]);
      setQualityScore(5);
      setScreenshot(null);
      setSelectedStrategy("");
    } catch (err) {
      setError(`Erreur: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const getQualityLabel = (score: number) => {
    if (score <= 3) return "Trade impulsif";
    if (score <= 6) return "Trade correct";
    if (score <= 9) return "Bon trade";
    return "Trade parfait";
  };

  // Toutes les clés locales existent dans BaseT → simple spread (dark-aware).
  const T = { ...BaseT };

  const sectionTitle = (label: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: T.textMut, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: T.border }} />
    </div>
  );

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 12px",
    border: `1px solid ${T.border}`,
    borderRadius: "var(--radius-card)",
    fontSize: 13,
    fontFamily: "inherit",
    color: T.text,
    background: T.white,
    outline: "none",
    transition: "border-color .12s ease, box-shadow .12s ease",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 600, color: T.textSub, marginBottom: 6,
  };

  const Field = ({ label, htmlFor, children }: { label?: string; htmlFor?: string; children: React.ReactNode }) => (
    <div>
      {label && <label htmlFor={htmlFor} style={labelStyle}>{label}</label>}
      {children}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {error && (
        <div role="alert" style={{ padding: "10px 14px", background: T.redBg, color: T.red, border: `1px solid ${T.redBg}`, borderRadius: "var(--radius-card)", fontSize: 12, fontWeight: 500 }}>
          {error}
        </div>
      )}
      {success && (
        <div role="status" style={{ padding: "10px 14px", background: T.greenBg, color: T.green, border: `1px solid ${T.greenBg}`, borderRadius: "var(--radius-card)", fontSize: 12, fontWeight: 500 }}>
          {success}
        </div>
      )}

      {/* —— Trade —— */}
      <section>
        {sectionTitle("Trade")}

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
          <Field label="Symbole" htmlFor="tf-symbol">
            <input
              id="tf-symbol"
              type="text"
              placeholder="NQ, ES, BTC…"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              style={{ ...inputStyle, fontWeight: 600, letterSpacing: 0.4 }}
            />
          </Field>
          <Field label="Direction">
            <div style={{ display: "flex", gap: 6, padding: 3, background: T.accentBg, borderRadius: 8 }}>
              {([
                { id: "LONG", label: "Long", icon: TrendingUp, color: T.green },
                { id: "SHORT", label: "Short", icon: TrendingDown, color: T.red },
              ] as const).map(({ id, label, icon: Icon, color }) => {
                const active = direction === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDirection(id)}
                    aria-pressed={active}
                    style={{
                      flex: 1,
                      padding: "6px 10px",
                      background: active ? T.white : "transparent",
                      color: active ? color : T.textMut,
                      border: "none", borderRadius: 6,
                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
                      boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      transition: "all .12s ease",
                      fontFamily: "inherit",
                    }}
                  >
                    <Icon size={12} strokeWidth={2.25} /> {label}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>

        <div style={{ marginTop: 12 }}>
          <Field label="Quantité" htmlFor="tf-quantity">
            <input id="tf-quantity" type="number" step="0.01" placeholder="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={inputStyle} />
          </Field>
        </div>
      </section>

      {/* —— Compte & setup —— */}
      <section>
        {sectionTitle("Compte & setup")}

        <div style={{ marginBottom: 12 }}>
          <Field label="Compte de trading">
            <QuickAccountSelector
              selectedAccountName={setupName}
              onAccountNameChange={setSetupName}
              T={T}
            />
          </Field>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Setup" htmlFor="tf-setup">
            <input
              id="tf-setup"
              type="text"
              placeholder="ICT killzone, ORB…"
              value={setupName}
              onChange={(e) => setSetupName(e.target.value)}
              list="strategies-list"
              style={inputStyle}
            />
          </Field>
          <Field label="Stratégie" htmlFor="tf-strategy">
            <select id="tf-strategy" value={selectedStrategy} onChange={(e) => setSelectedStrategy(e.target.value)} style={inputStyle}>
              <option value="">— Aucune —</option>
              {loadedStrategies.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </Field>
        </div>
        <datalist id="strategies-list">
          {loadedStrategies.map((s) => (<option key={s.id} value={s.name} />))}
        </datalist>
      </section>

      {/* —— Analyse —— */}
      <section>
        {sectionTitle("Analyse")}

        <Field label="Notes" htmlFor="tf-notes">
          <textarea
            id="tf-notes"
            ref={textareaRef}
            value={notes}
            onChange={handleTextareaChange}
            placeholder="Pourquoi ce trade ? Ce que tu as ressenti, ce qui s'est passé…"
            style={{ ...inputStyle, minHeight: 100, padding: "10px 12px", lineHeight: 1.5, resize: "vertical" }}
          />
        </Field>

        <div style={{ marginTop: 12 }}>
          <Field label={`Score de qualité — ${getQualityLabel(qualityScore)} (${qualityScore}/10)`}>
            <div style={{ display: "flex", gap: 4 }}>
              {Array.from({ length: 10 }, (_, i) => {
                const v = i + 1;
                const active = v <= qualityScore;
                const dotColor = qualityScore <= 3 ? T.red : qualityScore <= 6 ? T.amber : T.green;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setQualityScore(v)}
                    aria-label={`Score ${v} sur 10`}
                    style={{
                      flex: 1,
                      height: 8,
                      borderRadius: "var(--radius-field)",
                      border: "none",
                      background: active ? dotColor : T.accentBg,
                      cursor: "pointer",
                      transition: "background .12s ease",
                      padding: 0,
                    }}
                  />
                );
              })}
            </div>
          </Field>
        </div>

        <div style={{ marginTop: 12 }}>
          <Field label="Émotions ressenties">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {emotionTags.map((tag) => {
                const active = selectedEmotions.includes(tag.label);
                const color = tag.type === "negative" ? T.red : tag.type === "positive" ? T.green : T.amber;
                return (
                  <button
                    key={tag.label}
                    type="button"
                    onClick={() => handleEmotionToggle(tag.label)}
                    aria-pressed={active}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "5px 10px", borderRadius: 999,
                      border: `1px solid ${active ? color : T.border}`,
                      background: active ? `color-mix(in srgb, ${color} 15%, transparent)` : T.white,
                      color: active ? color : T.textSub,
                      fontSize: 11, fontWeight: 600, cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "all .12s ease",
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} aria-hidden />
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>

        <div style={{ marginTop: 12 }}>
          <Field label="Screenshot">
            {screenshot ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1px solid ${T.border}`, borderRadius: "var(--radius-card)", background: T.bg }}>
                <Camera size={14} strokeWidth={1.75} color={T.green} />
                <span style={{ flex: 1, fontSize: 12, color: T.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{screenshot.name}</span>
                <button type="button" onClick={() => setScreenshot(null)} aria-label="Retirer le screenshot"
                  style={{ width: 22, height: 22, borderRadius: "var(--radius-field)", border: "none", background: "transparent", color: T.textMut, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = T.red; e.currentTarget.style.background = T.redBg; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = T.textMut; e.currentTarget.style.background = "transparent"; }}>
                  <X size={12} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file && file.type.startsWith("image/")) handleScreenshotUpload(file);
                }}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) handleScreenshotUpload(file);
                  };
                  input.click();
                }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") (e.currentTarget as HTMLDivElement).click(); }}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "20px 12px",
                  border: `1px dashed ${T.border}`, borderRadius: "var(--radius-card)",
                  background: T.bg, color: T.textSub, fontSize: 12, fontWeight: 500,
                  cursor: "pointer",
                  transition: "background .12s ease, border-color .12s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.accentBg; e.currentTarget.style.borderColor = T.text; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = T.bg; e.currentTarget.style.borderColor = T.border; }}
              >
                <Camera size={16} strokeWidth={1.5} />
                <span>Glisse une image ou clique pour ajouter</span>
              </div>
            )}
          </Field>
        </div>
      </section>

      {/* —— Submit —— */}
      <button
        type="submit"
        disabled={loading}
        style={{
          width: "100%",
          padding: "10px 16px",
          height: 38,
          background: loading ? T.textMut : T.accent,
          color: T.white,
          border: `1px solid ${loading ? T.textMut : T.accent}`,
          borderRadius: "var(--radius-card)",
          fontSize: 13,
          fontWeight: 600,
          cursor: loading ? "wait" : "pointer",
          fontFamily: "inherit",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
          transition: "background .12s ease",
        }}
      >
        {loading ? "Sauvegarde…" : (existingTrade ? "Mettre à jour le trade" : "Enregistrer le trade")}
      </button>
    </form>
  );
}
