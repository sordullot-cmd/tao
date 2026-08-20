"use client";

import { useState, useMemo } from "react";
import { getCurrencySymbol } from "@/lib/userPrefs";

const CALENDAR_DATA = {
  "2026-03-03": 540,
  "2026-03-04": -230,
  "2026-03-05": 380,
  "2026-03-06": 120,
  "2026-03-07": -80,
  "2026-03-10": 610,
  "2026-03-11": 290,
  "2026-03-12": -150,
  "2026-03-13": 480,
  "2026-03-14": 320,
  "2026-03-17": -420,
  "2026-03-18": 180,
  "2026-03-19": 760,
  "2026-03-20": 440,
  "2026-03-21": -90,
  "2026-03-24": 220,
  "2026-03-25": 380,
  "2026-03-26": -180,
  "2026-03-27": 1170,
  "2026-03-28": 490,
  "2026-03-31": 572,
};

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 2, 1));

  const daysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const getDayKey = (year, month, day) => {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };

  const stats = useMemo(() => {
    const values = Object.values(CALENDAR_DATA);
    const positive = values.filter((v) => v > 0).length;
    const negative = values.filter((v) => v < 0).length;
    const total = values.reduce((a, b) => a + b, 0);
    const avg = (total / values.length).toFixed(2);
    const max = Math.max(...values);
    const min = Math.min(...values);

    return { positive, negative, total, avg, max, min, count: values.length };
  }, []);

  const getHeatmapColor = (value) => {
    if (value === undefined || value === null) return "#F7F8FA";
    if (value >= 500) return "#16A34A";
    if (value >= 300) return "#6EE7B7";
    if (value >= 100) return "#86EFAC";
    if (value >= 0) return "#D1FAE5";
    if (value >= -300) return "#FED7AA";
    if (value >= -500) return "#FDBA74";
    return "#F97316";
  };

  const getCellClass = (value) => {
    if (!value) return "text-gray-300";
    if (value > 0) return "text-green-600";
    return "text-red-600";
  };

  const monthDays = daysInMonth(currentDate);
  const firstDay = firstDayOfMonth(currentDate);
  const days = [];

  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= monthDays; i++) {
    days.push(i);
  }

  const monthName = currentDate.toLocaleString("fr-FR", { month: "long", year: "numeric" });

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  return (
    <div className="calendar-container">
      <style>{`
        .calendar-container {
          padding: 24px;
          background: #F7F8FA;
          min-height: 100vh;
          font-family: var(--font-sans);
        }

        .calendar-header {
          margin-bottom: 24px;
        }

        .calendar-header h1 {
          font-size: 28px;
          font-weight: 700;
          color: #0F0F1A;
          margin: 0 0 16px 0;
        }

        .calendar-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px;
          margin-bottom: 24px;
        }

        .stat-card {
          background: white;
          padding: 16px;
          border-radius: var(--radius-card);
          border: 1px solid #E8E9EF;
          text-align: center;
        }

        .stat-label {
          font-size: 12px;
          color: #A0A1B0;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          margin-bottom: 6px;
        }

        .stat-value {
          font-size: 24px;
          font-weight: 700;
          color: #0F0F1A;
        }

        .stat-value.positive {
          color: #22C55E;
        }

        .stat-value.negative {
          color: #EF4444;
        }

        .calendar-main {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }

        .calendar-panel {
          background: white;
          border-radius: var(--radius-card);
          padding: 24px;
          border: 1px solid #E8E9EF;
        }

        .calendar-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .calendar-title {
          font-size: 16px;
          font-weight: 700;
          color: #0F0F1A;
          margin: 0;
          text-transform: capitalize;
        }

        .btn-nav {
          background: #EEF2FF;
          color: #6366F1;
          border: none;
          width: 32px;
          height: 32px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .btn-nav:hover {
          background: #6366F1;
          color: white;
        }

        .calendar-weekdays {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 8px;
          margin-bottom: 8px;
        }

        .weekday {
          text-align: center;
          font-weight: 600;
          font-size: 12px;
          color: #A0A1B0;
          padding: 8px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 8px;
        }

        .calendar-day {
          aspect-ratio: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-field);
          cursor: pointer;
          font-weight: 600;
          font-size: 13px;
          transition: all 0.2s ease;
          border: 1px solid transparent;
          position: relative;
        }

        .calendar-day:hover {
          transform: scale(0.95);
          border-color: #D4D6DF;
        }

        .calendar-day.empty {
          background: transparent;
          cursor: default;
        }

        .calendar-day.empty:hover {
          transform: none;
          border-color: transparent;
        }

        .heatmap-legend {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #E8E9EF;
          flex-wrap: wrap;
          font-size: 12px;
        }

        .legend-label {
          color: #A0A1B0;
          font-weight: 400;
        }

        .legend-item {
          width: 20px;
          height: 20px;
          border-radius: var(--radius-field);
          border: 1px solid #E8E9EF;
        }

        .day-details {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #E8E9EF;
        }

        .day-details h3 {
          font-size: 14px;
          font-weight: 700;
          color: #0F0F1A;
          margin: 0 0 8px 0;
        }

        .day-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 300px;
          overflow-y: auto;
        }

        .day-item {
          padding: 8px;
          background: #F7F8FA;
          border-radius: 6px;
          display: flex;
          justify-content: space-between;
          font-size: 13px;
        }

        .day-item-date {
          color: #A0A1B0;
          font-weight: 400;
        }

        .day-item-pnl {
          font-weight: 700;
        }

        .day-item-pnl.positive {
          color: #22C55E;
        }

        .day-item-pnl.negative {
          color: #EF4444;
        }

        @media (max-width: 1024px) {
          .calendar-main {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="calendar-header">
        <h1>📅 Calendrier de Trading</h1>
      </div>

      <div className="calendar-stats">
        <div className="stat-card">
          <div className="stat-label">Jours Rentables</div>
          <div className="stat-value positive">{stats.positive}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Jours Perdants</div>
          <div className="stat-value negative">{stats.negative}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total P&L</div>
          <div className={`stat-value ${stats.total >= 0 ? "positive" : "negative"}`}>
            ${stats.total >= 0 ? "+" : ""}{stats.total}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">P&L Moyen</div>
          <div className={`stat-value ${stats.avg >= 0 ? "positive" : "negative"}`}>
            ${stats.avg >= 0 ? "+" : ""}{stats.avg}
          </div>
        </div>
      </div>

      <div className="calendar-main">
        <div className="calendar-panel">
          <div className="calendar-nav">
            <h2 className="calendar-title">{monthName}</h2>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="btn-nav" onClick={previousMonth}>
                ←
              </button>
              <button className="btn-nav" onClick={nextMonth}>
                →
              </button>
            </div>
          </div>

          <div className="calendar-weekdays">
            {["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"].map((d) => (
              <div key={d} className="weekday">
                {d}
              </div>
            ))}
          </div>

          <div className="calendar-grid">
            {days.map((day, idx) => {
              const dateKey = day
                ? getDayKey(currentDate.getFullYear(), currentDate.getMonth(), day)
                : null;
              const dayValue = dateKey ? CALENDAR_DATA[dateKey] : null;

              return (
                <div
                  key={idx}
                  className={`calendar-day ${!day ? "empty" : ""}`}
                  style={{
                    backgroundColor: getHeatmapColor(dayValue),
                    color: getCellClass(dayValue),
                  }}
                  title={dayValue ? `${getCurrencySymbol()}${dayValue}` : ""}
                >
                  {day}
                </div>
              );
            })}
          </div>

          <div className="heatmap-legend">
            <span className="legend-label">Légende:</span>
            <div className="legend-item" style={{ backgroundColor: "#F97316" }}></div>
            <span style={{ fontSize: "11px", color: "#A0A1B0" }}>{"< -500"}</span>
            <div className="legend-item" style={{ backgroundColor: "#FDBA74" }}></div>
            <span style={{ fontSize: "11px", color: "#A0A1B0" }}>-500 à 0</span>
            <div className="legend-item" style={{ backgroundColor: "#D1FAE5" }}></div>
            <span style={{ fontSize: "11px", color: "#A0A1B0" }}>0 à 100</span>
            <div className="legend-item" style={{ backgroundColor: "#16A34A" }}></div>
            <span style={{ fontSize: "11px", color: "#A0A1B0" }}>{"> 500"}</span>
          </div>
        </div>

        <div className="calendar-panel">
          <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 700 }}>
            📊 Résumé
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginBottom: "20px",
            }}
          >
            <div>
              <div style={{ fontSize: "12px", color: "#A0A1B0", fontWeight: 600 }}>
                WIN RATE
              </div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#22C55E" }}>
                {(
                  (stats.positive / (stats.positive + stats.negative)) *
                  100
                ).toFixed(1)}
                %
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#A0A1B0", fontWeight: 600 }}>
                JOURS TRADÉS
              </div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#0F0F1A" }}>
                {stats.count}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#A0A1B0", fontWeight: 600 }}>
                MEILLEUR DAY
              </div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#22C55E" }}>
                ${stats.max}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#A0A1B0", fontWeight: 600 }}>
                PIRE DAY
              </div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#EF4444" }}>
                ${stats.min}
              </div>
            </div>
          </div>

          <div className="day-details">
            <h3>Historique des Jours</h3>
            <div className="day-list">
              {Object.entries(CALENDAR_DATA)
                .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
                .map(([date, pnl]) => (
                  <div key={date} className="day-item">
                    <span className="day-item-date">{date}</span>
                    <span className={`day-item-pnl ${pnl >= 0 ? "positive" : "negative"}`}>
                      ${pnl >= 0 ? "+" : ""}{pnl}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
