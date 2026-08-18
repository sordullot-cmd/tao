"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface SportExportOptions {
  workouts: Array<{
    id?: string | number;
    date: string;
    discipline: string;
    exercises: Array<{
      name: string;
      sets?: number;
      reps?: string;
      weight?: string;
      notes?: string;
    }>;
    notes?: string;
    duration?: number;
  }>;
  title?: string;
}

/**
 * Génère un PDF élégant et moderne de l'historique des entraînements.
 */
export async function exportSportPdf(opts: SportExportOptions): Promise<void> {
  const { workouts = [], title = "Historique d'entraînement" } = opts;

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

  // Stats rapides
  const totalWorkouts = workouts.length;
  const totalDuration = workouts.reduce((sum, w) => sum + (w.duration || 0), 0);
  const disciplines = new Set(workouts.map((w) => w.discipline)).size;

  doc.setFontSize(9);
  doc.setTextColor(...hexToRgb(colors.secondary));
  doc.text(
    `Entraînements: ${totalWorkouts} | Disciplines: ${disciplines} | Durée totale: ${totalDuration}min`,
    margin,
    margin + 58
  );

  // Ligne de séparation
  doc.setDrawColor(...hexToRgb(colors.border));
  doc.line(margin, margin + 68, pageWidth - margin, margin + 68);

  let cursorY = margin + 85;

  // ── Entraînements groupés par date ──────────────────────────────
  workouts.forEach((workout) => {
    if (cursorY > pageHeight - 100) {
      doc.addPage();
      cursorY = margin;
    }

    // En-tête de l'entraînement
    const dateStr = new Date(workout.date).toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...hexToRgb(colors.primary));
    doc.text(`${dateStr} • ${workout.discipline}`, margin, cursorY);

    if (workout.duration) {
      doc.setFontSize(9);
      doc.setTextColor(...hexToRgb(colors.muted));
      doc.text(`${workout.duration} min`, pageWidth - margin, cursorY, { align: "right" });
    }

    cursorY += 14;

    // Exercices
    const tableData = (workout.exercises || []).map((ex) => [
      ex.name || "—",
      ex.sets ? `${ex.sets}x` : "—",
      ex.reps || "—",
      ex.weight || "—",
      ex.notes || "",
    ]);

    if (tableData.length > 0) {
      autoTable(doc, {
        startY: cursorY,
        head: [["Exercice", "Séries", "Reps", "Poids", "Notes"]],
        body: tableData,
        theme: "striped",
        headStyles: {
          fillColor: hexToRgb(colors.background),
          textColor: hexToRgb(colors.secondary),
          fontSize: 8,
          fontStyle: "bold",
        },
        bodyStyles: { fontSize: 8, halign: "left" },
        columnStyles: {
          0: { cellWidth: maxWidth * 0.35 },
          1: { cellWidth: maxWidth * 0.1 },
          2: { cellWidth: maxWidth * 0.15 },
          3: { cellWidth: maxWidth * 0.15 },
          4: { cellWidth: maxWidth * 0.25 },
        },
        margin: { left: margin, right: margin },
      });

      // @ts-expect-error -- jsPDF extension
      cursorY = (doc.lastAutoTable?.finalY || cursorY) + 8;
    }

    // Notes
    if (workout.notes) {
      const noteLines = doc.splitTextToSize(workout.notes, maxWidth - 20);
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...hexToRgb(colors.muted));
      doc.text(noteLines, margin + 10, cursorY + 8);
      cursorY += noteLines.length * 4 + 8;
    }

    cursorY += 12;
  });

  doc.save("sport.pdf");
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
