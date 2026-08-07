"use client";

import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface EmotionDistributionProps {
  topEmotions: Array<{ emotion: string; frequency: number; avgPnL: number }>;
}

export function EmotionDistribution({ topEmotions }: EmotionDistributionProps) {
  // Palette catégorielle de 8 teintes DISTINCTES (aucun doublon : deux émotions
  // ne peuvent plus recevoir la même couleur). On n'affiche que les 8 premières.
  const COLORS = [
    "#3B82F6", // bleu
    "#16A34A", // vert
    "#A855F7", // violet
    "#F97316", // orange
    "#EF4444", // rouge
    "#06B6D4", // cyan
    "#EC4899", // rose
    "#EAB308", // jaune
  ];

  const data = topEmotions.slice(0, 8).map((e) => ({
    name: e.emotion,
    value: e.frequency,
    avgPnL: e.avgPnL,
  }));

  if (data.length === 0) {
    return (
      <div
        style={{
          padding: 24,
          background: "#FAFAFA",
          borderRadius: 12,
          textAlign: "center",
          color: "#8E8E8E",
        }}
      >
        Pas assez de données émotionnelles
      </div>
    );
  }

  return (
    <div style={{ background: "#FFFFFF", padding: 20, borderRadius: 12 }}>
      <h3 style={{ margin: "0 0 16px 0", fontSize: 16, fontWeight: 600 }}>
        🧠 Distribution des Émotions
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, value }) => `${name} (${value})`}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "#FFFFFF",
              border: "1px solid #ccc",
              borderRadius: 8,
              padding: 8,
            }}
            formatter={(value: any, name: any, props: any) => {
              const emotion = props.payload;
              return [
                `Occurrences: ${emotion.value} | Avg P&L: ${emotion.avgPnL > 0 ? "+" : ""}${emotion.avgPnL.toFixed(2)}$`,
                name,
              ];
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ marginTop: 16, fontSize: 12, color: "#5C5C5C" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {data.map((emotion, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  background: COLORS[i],
                }}
              />
              <span>
                {emotion.name} ({emotion.value}x, {emotion.avgPnL > 0 ? "+" : ""}
                {emotion.avgPnL.toFixed(0)}$)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
