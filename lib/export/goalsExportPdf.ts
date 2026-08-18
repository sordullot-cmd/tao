"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface GoalsExportOptions {
  goals: Array<{
    id?: string | number;
    name: string;
    category?: string;
    level?: string;
    targetValue?: number | string;
    currentValue?: number | string;
    type?: string;
    horizon?: string;
    status?: string;
    notes?: string;
    createdAt?: string;
    unit?: string;
  }>;
  title?: string;
  currencySymbol?: string;
}

/**
 * Génère un PDF élégant et moderne des objectifs.
 */
export async function exportGoalsPdf(opts: GoalsExportOptions): Promise<void> {
  const {
    goals = [],
    title = "Objectifs",
    currencySymbol = "$",
  } = opts;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const maxWidth = pageWidth - margin * 2;

  const colors = {
    primary: "#0D0D0D",
    secondary: "#5C5C5C",
    muted: "#8E8E8E",
    accent: "#1CB0F6",
    success: "#58CC02",
    warning: "#FF9600",
    danger: "#FF4B4B",
    border: "#E5E5E5",
    background: "#F5F5F5",
  };

  // ── En-tête ──────────────────────────────────────────────────────
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...hexToRgb(colors.primary));
  doc.text(title, margin, margin + 20);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...hexToRgb(colors.muted));
  doc.text(`Généré le ${new Date().toLocaleString("fr-FR")}`, margin, margin + 45);

  // Statistiques rapides
  const byStatus = {
    not_started: goals.filter((g: any) => !g.status || g.status === "not_started").length,
    in_progress: goals.filter((g: any) => g.status === "in_progress").length,
    completed: goals.filter((g: any) => g.status === "completed").length,
  };
  const totalGoals = goals.length;

  doc.setFontSize(9);
  doc.setTextColor(...hexToRgb(colors.secondary));
  doc.text(
    `Total: ${totalGoals} | En cours: ${byStatus.in_progress} | Terminés: ${byStatus.completed}`,
    margin,
    margin + 58
  );

  // Ligne de séparation
  doc.setDrawColor(...hexToRgb(colors.border));
  doc.line(margin, margin + 68, pageWidth - margin, margin + 68);

  let cursorY = margin + 85;

  // ── Grouper par catégorie ────────────────────────────────────────
  const byCategory: Record<string, any[]> = {};
  goals.forEach((g: any) => {
    const cat = g.category || "Autre";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(g);
  });

  Object.keys(byCategory)
    .sort()
    .forEach((category) => {
      const catGoals = byCategory[category];

      if (cursorY > pageHeight - 150) {
        doc.addPage();
        cursorY = margin;
      }

      // En-tête de catégorie
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...hexToRgb(colors.accent));
      doc.text(category, margin, cursorY);
      cursorY += 16;

      // Tableau des objectifs
      const tableData = catGoals.map((g: any) => {
        const progress = g.currentValue && g.targetValue
          ? `${Math.round((parseFloat(g.currentValue) / parseFloat(g.targetValue)) * 100)}%`
          : "—";
        const target = g.targetValue
          ? `${g.targetValue}${g.unit || ""}`
          : "—";
        return [
          g.name || "—",
          target,
          progress,
          (g.status || "not_started") === "completed" ? "✓" : "",
        ];
      });

      autoTable(doc, {
        startY: cursorY,
        head: [["Objectif", "Cible", "Progression", ""]],
        body: tableData,
        theme: "striped",
        headStyles: {
          fillColor: hexToRgb(colors.background),
          textColor: hexToRgb(colors.secondary),
          fontSize: 9,
          fontStyle: "bold",
        },
        bodyStyles: { fontSize: 8.5, halign: "left" },
        columnStyles: {
          0: { cellWidth: maxWidth * 0.5 },
          1: { cellWidth: maxWidth * 0.2 },
          2: { cellWidth: maxWidth * 0.2 },
          3: { cellWidth: maxWidth * 0.1 },
        },
        margin: { left: margin, right: margin },
        didDrawPage: (data: any) => {
          cursorY = data.cursor?.y || cursorY;
        },
      });

      // @ts-expect-error -- jsPDF extension
      cursorY = (doc.lastAutoTable?.finalY || cursorY) + 16;
    });

  doc.save("objectifs.pdf");
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [0, 0, 0];
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
  ];
}
