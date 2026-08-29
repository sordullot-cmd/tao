"use client";

import { useState, useRef } from "react";
import { parseCSV, calculateStats } from "@/lib/csvParsers";
import { backdropDismiss } from "@/lib/hooks/useBackdropDismiss";
import { useEscapeDismiss } from "@/lib/hooks/useEscapeDismiss";

export default function TradeImportModal({ isOpen, onClose, onImport, T }) {
  // Échap ferme, comme le clic sur le fond.
  useEscapeDismiss(onClose, isOpen);

  // Account Setup
  const [accountName, setAccountName] = useState("");
  const [selectedBroker, setSelectedBroker] = useState("tradovate");
  const [selectedTimezone, setSelectedTimezone] = useState("UTC+1");
  
  // File Import
  const [fileName, setFileName] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [preview, setPreview] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const brokers = [
    { id: "mt5", name: "MetaTrader 5", format: "html", icon: "🔷" },
    { id: "tradovate", name: "Tradovate", format: "csv", icon: "π" },
    { id: "wealthcharts", name: "WealthCharts", format: "csv", icon: "📊" },
  ];

  const timezones = [
    "UTC-12", "UTC-11", "UTC-10", "UTC-9", "UTC-8", "UTC-7", "UTC-6", "UTC-5",
    "UTC-4", "UTC-3", "UTC-2", "UTC-1", "UTC+0", "UTC+1", "UTC+2", "UTC+3",
    "UTC+4", "UTC+5", "UTC+6", "UTC+7", "UTC+8", "UTC+9", "UTC+10", "UTC+11", "UTC+12"
  ];

  const getBrokerInstructions = () => {
    if (selectedBroker === "tradovate") {
      return {
        icon: "π",
        name: "Tradovate",
        title: "Tradovate",
        subtext: "Supported Asset Types: Futures",
        steps: [
          "1. Go to the Account tab in Tradovate",
          "2. Click settings for your account",
          "3. Go to the Orders tab",
          "4. Select your date range and click Go",
          "5. Click Download Report"
        ]
      };
    }
    if (selectedBroker === "wealthcharts") {
      return {
        icon: "📊",
        name: "WealthCharts",
        title: "WealthCharts",
        subtext: "Supported Asset Types: Stocks, Options",
        steps: [
          "1. Ouvrir WealthCharts Trading Platform",
          "2. Aller dans Broker Portfolio",
          "3. Aller dans Trade",
          "4. Exporter vos ordres en CSV",
          "5. Charger le fichier CSV pour importer"
        ]
      };
    }
    return {
      icon: "🔷",
      name: "MetaTrader 5",
      title: "MetaTrader 5",
      subtext: "Supported Asset Types: Forex, Stocks, Crypto",
      steps: [
        "1. Open MetaTrader 5 terminal",
        "2. Open History Center from Tools menu",
        "3. Select your trading account",
        "4. Right-click on trades and export to HTML",
        "5. Upload the HTML file to import"
      ]
    };
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError("");
    setLoading(true);

    try {
      const content = await file.text();
      setFileContent(content);

      // Preview parsing
      const trades = parseCSV(content, selectedBroker);
      if (trades.length === 0) {
        setError("❌ Aucun trade trouvé dans le fichier. Vérifiez le format.");
        setPreview([]);
        setLoading(false);
        return;
      }

      setPreview(trades.slice(0, 3)); // Show first 3
      setError("");
    } catch (err) {
      setError(`❌ Erreur: ${err.message}`);
      setPreview([]);
    }

    setLoading(false);
  };

  const handleImport = () => {
    if (!accountName.trim()) {
      setError("❌ Veuillez entrer un nom de compte");
      return;
    }

    try {
      // If no file is selected, just save the profile with settings
      if (!fileContent) {
        onImport({ 
          trades: [], 
          stats: {}, 
          broker: selectedBroker, 
          fileName: "No file",
          accountName,
          timezone: selectedTimezone,
          isProfileOnly: true
        });

        // Reset
        setAccountName("");
        setFileName("");
        setFileContent("");
        setPreview([]);
        setSelectedBroker("tradovate");
        setSelectedTimezone("UTC+1");
        onClose();
        return;
      }

      // If file is selected, import trades
      const trades = parseCSV(fileContent, selectedBroker);
      if (trades.length === 0) {
        setError("❌ Aucun trade trouvé");
        return;
      }

      const stats = calculateStats(trades);
      onImport({ 
        trades, 
        stats, 
        broker: selectedBroker, 
        fileName,
        accountName,
        timezone: selectedTimezone
      });

      // Reset
      setAccountName("");
      setFileName("");
      setFileContent("");
      setPreview([]);
      setSelectedBroker("tradovate");
      setSelectedTimezone("UTC+1");
      onClose();
    } catch (err) {
      setError(`❌ Erreur d'import: ${err.message}`);
    }
  };

  const handleDropZone = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files?.[0]) {
      const file = e.dataTransfer.files[0];
      const input = fileInputRef.current;
      if (input) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        input.files = dataTransfer.files;
        handleFileSelect({ target: { files: [file] } });
      }
    }
  };

  if (!isOpen) return null;

  const brokerInfo = getBrokerInstructions();

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      {...backdropDismiss(onClose)}
    >
      <div
        style={{
          background: T.surface,
          borderRadius: "12px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          display: "flex",
          maxWidth: "1000px",
          width: "95%",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── LEFT COLUMN: FORM ─── */}
        <div style={{ flex: 1, padding: "32px", borderRight: `1px solid ${T.border}`, overflowY: "auto" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
            <h2 style={{ fontSize: "24px", fontWeight: "700", color: T.text }}>Import Trades</h2>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                fontSize: "28px",
                cursor: "pointer",
                color: T.textMut,
              }}
            >
              ✕
            </button>
          </div>

          {/* ACCOUNT Section */}
          <div style={{ marginBottom: "28px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", letterSpacing: "0.5px", marginBottom: "12px", color: T.textMut, textTransform: "uppercase" }}>
              Account
            </label>
            <div
              style={{
                position: "relative",
                background: T.bg,
                border: `1px solid ${T.border}`,
                borderRadius: "8px",
                padding: "0 14px",
                display: "flex",
                alignItems: "center",
                height: "44px",
                cursor: "text",
              }}
            >
              <input
                type="text"
                placeholder={`${accountName || `adad (${brokerInfo.name})`}`}
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                style={{
                  flex: 1,
                  border: "none",
                  background: "transparent",
                  color: T.text,
                  fontSize: "14px",
                  outline: "none",
                  fontWeight: accountName ? "500" : "400",
                }}
              />
              {accountName && (
                <span style={{ color: T.green, fontSize: "18px", marginLeft: "8px" }}>✓</span>
              )}
            </div>
          </div>

          {/* BROKER Section */}
          <div style={{ marginBottom: "28px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", letterSpacing: "0.5px", marginBottom: "12px", color: T.textMut, textTransform: "uppercase" }}>
              Broker
            </label>
            <div
              style={{
                position: "relative",
                background: T.bg,
                border: `1px solid ${T.border}`,
                borderRadius: "8px",
                overflow: "hidden",
              }}
            >
              <select
                value={selectedBroker}
                onChange={(e) => {
                  setSelectedBroker(e.target.value);
                  setError("");
                }}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  border: "none",
                  background: "transparent",
                  color: T.text,
                  fontSize: "14px",
                  cursor: "pointer",
                  fontWeight: "500",
                  appearance: "none",
                  WebkitAppearance: "none",
                  MozAppearance: "none",
                  paddingRight: "32px",
                }}
              >
                {brokers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.icon} {b.name}
                  </option>
                ))}
              </select>
              <div
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                  color: T.textMut,
                  fontSize: "12px",
                }}
              >
                ▼
              </div>
            </div>
          </div>

          {/* TIME ZONE Section */}
          <div style={{ marginBottom: "28px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", letterSpacing: "0.5px", marginBottom: "12px", color: T.textMut, textTransform: "uppercase" }}>
              Time Zone
            </label>
            <div
              style={{
                position: "relative",
                background: T.bg,
                border: `1px solid ${T.border}`,
                borderRadius: "8px",
                overflow: "hidden",
              }}
            >
              <select
                value={selectedTimezone}
                onChange={(e) => setSelectedTimezone(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  border: "none",
                  background: "transparent",
                  color: T.text,
                  fontSize: "14px",
                  cursor: "pointer",
                  fontWeight: "500",
                  appearance: "none",
                  WebkitAppearance: "none",
                  MozAppearance: "none",
                  paddingRight: "32px",
                }}
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    (GMT{tz === "UTC+0" ? "±0:00" : tz.replace("UTC", "").padStart(3, " ").replace("+", "+").replace("-", "−") + ":00"}) {tz}
                  </option>
                ))}
              </select>
              <div
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                  color: T.textMut,
                  fontSize: "12px",
                }}
              >
                ▼
              </div>
            </div>
          </div>

          {/* FILE Section */}
          <div style={{ marginBottom: "28px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", letterSpacing: "0.5px", marginBottom: "12px", color: T.textMut, textTransform: "uppercase" }}>
              File <span style={{fontWeight:"400",color:T.textSub}}>(optional)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.html,.xlsx,.xls,.txt"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderColor = T.accent;
                e.currentTarget.style.background = T.accentBg;
              }}
              onDragLeave={(e) => {
                e.currentTarget.style.borderColor = T.border;
                e.currentTarget.style.background = "transparent";
              }}
              onDrop={handleDropZone}
              style={{
                border: `2px dashed ${T.border}`,
                borderRadius: "8px",
                padding: "32px 24px",
                textAlign: "center",
                cursor: "pointer",
                transition: "all 0.2s",
                background: "transparent",
              }}
            >
              <div style={{ fontSize: "32px", marginBottom: "8px" }}>📁</div>
              <div style={{ fontSize: "14px", fontWeight: "500", color: T.text, marginBottom: "4px" }}>
                Drop your file here or browse
              </div>
              <div style={{ fontSize: "12px", color: T.textMut }}>
                CSV, TXT, or HTML up to 50 MB
              </div>
              {fileName && (
                <div style={{ fontSize: "12px", color: T.green, marginTop: "12px", fontWeight: "500" }}>
                  ✓ {fileName}
                </div>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div
              style={{
                padding: "12px 14px",
                background: T.redBg,
                border: `1px solid ${T.redBd}`,
                borderRadius: "6px",
                color: T.red,
                fontSize: "13px",
                marginBottom: "20px",
              }}
            >
              {error}
            </div>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div style={{ marginBottom: "20px" }}>
              <h3 style={{ fontSize: "12px", fontWeight: "600", marginBottom: "12px", color: T.text, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Preview ({preview.length} trades)
              </h3>
              <div
                style={{
                  overflowX: "auto",
                  border: `1px solid ${T.border}`,
                  borderRadius: "8px",
                  background: T.bg,
                }}
              >
                <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                      {["Date", "Symbol", "Dir", "Entry", "Exit", "P&L"].map((h) => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: "600", color: T.textMut }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((trade, idx) => (
                      <tr key={idx} style={{ borderBottom: `1px solid ${T.border}` }}>
                        <td style={{ padding: "10px 12px", color: T.textSub }}>{trade.date}</td>
                        <td style={{ padding: "10px 12px", color: T.text, fontWeight: "600" }}>{trade.symbol}</td>
                        <td style={{ padding: "10px 12px", color: trade.direction === "Long" ? T.green : T.red }}>
                          {trade.direction === "Long" ? "L" : "S"}
                        </td>
                        <td style={{ padding: "10px 12px", color: T.textSub }}>{trade.entry.toFixed(2)}</td>
                        <td style={{ padding: "10px 12px", color: T.textSub }}>{trade.exit.toFixed(2)}</td>
                        <td style={{ padding: "10px 12px", color: trade.pnl >= 0 ? T.green : T.red, fontWeight: "600" }}>
                          {trade.pnl >= 0 ? "+" : ""}{trade.pnl.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: "flex", gap: "12px", marginTop: "28px" }}>
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: "12px 24px",
                background: T.bg,
                border: `1px solid ${T.border}`,
                borderRadius: "6px",
                color: T.text,
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 500,
                transition: "all 0.2s",
              }}
              onMouseOver={(e) => (e.target.style.background = T.border)}
              onMouseOut={(e) => (e.target.style.background = T.bg)}
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!accountName.trim() || loading}
              style={{
                flex: 1,
                padding: "12px 24px",
                background: accountName.trim() && !loading ? T.green : T.border2,
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: accountName.trim() && !loading ? "pointer" : "not-allowed",
                fontSize: "14px",
                fontWeight: 500,
                transition: "all 0.2s",
                opacity: accountName.trim() && !loading ? 1 : 0.6,
              }}
              onMouseOver={(e) => {
                if (accountName.trim() && !loading) e.target.style.opacity = "0.9";
              }}
              onMouseOut={(e) => {
                if (accountName.trim() && !loading) e.target.style.opacity = "1";
              }}
            >
              {loading ? "Processing..." : fileContent ? "✓ Import Trades" : "✓ Create Profile"}
            </button>
          </div>
        </div>

        {/* ─── RIGHT COLUMN: INSTRUCTIONS ─── */}
        <div style={{ width: "320px", padding: "32px 24px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", background: T.bg }}>
          <div style={{ fontSize: "60px", marginBottom: "16px" }}>{brokerInfo.icon}</div>
          <h3 style={{ fontSize: "16px", fontWeight: "700", color: T.text, marginBottom: "4px", textAlign: "center" }}>
            {brokerInfo.name}
          </h3>
          <p style={{ fontSize: "12px", color: T.textMut, marginBottom: "20px", textAlign: "center", lineHeight: "1.4" }}>
            {brokerInfo.subtext}
          </p>

          <div style={{ fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px", color: T.textMut, marginBottom: "12px", textTransform: "uppercase" }}>
            To import data from {brokerInfo.name}:
          </div>

          <ol style={{ padding: "0 0 0 16px", margin: 0, listStyleType: "decimal" }}>
            {brokerInfo.steps.map((step, idx) => (
              <li
                key={idx}
                style={{
                  fontSize: "12px",
                  color: T.textSub,
                  marginBottom: "8px",
                  lineHeight: "1.4",
                }}
              >
                {step.replace(/^\d+\. /, "")}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
