"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface NotesExportOptions {
  notes: Array<{
    id?: string | number;
    content: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
  title?: string;
}

/**
 * Génère un PDF élégant et moderne des notes.
 * Inclut un en-tête avec période + notes groupées par tag
 */
export async function exportNotesPdf(opts: NotesExportOptions): Promise<void> {
  const {
    notes = [],
    title = "Notes & Idées",
  } = opts;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const maxWidth = pageWidth - margin * 2;

  // Couleurs modernes
  const colors = {
    primary: "#0D0D0D",
    secondary: "#5C5C5C",
    muted: "#8E8E8E",
    accent: "#1CB0F6",
    border: "#E5E5E5",
    background: "#F5F5F5",
  };

  // ── En-tête ──────────────────────────────────────────────────────
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...hexToRgb(colors.primary));
  doc.text(title, margin, margin + 20);

  // Sous-titre et date
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...hexToRgb(colors.muted));
  doc.text(`Généré le ${new Date().toLocaleString("fr-FR")}`, margin, margin + 45);
  doc.text(`Total: ${notes.length} note${notes.length > 1 ? "s" : ""}`, margin, margin + 58);

  // Ligne de séparation
  doc.setDrawColor(...hexToRgb(colors.border));
  doc.line(margin, margin + 68, pageWidth - margin, margin + 68);

  // ── Parsing des tags ─────────────────────────────────────────────
  const TAG_RE = /#([a-zA-Z][a-zA-Z0-9_-]*)/g;
  const parseTags = (text: string): string[] => {
    const out = [];
    let m;
    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(text)) !== null) out.push(m[1].toLowerCase());
    return Array.from(new Set(out));
  };

  // Grouper les notes par tag
  const notesWithTags = notes.map(n => ({
    ...n,
    tags: parseTags(n.content),
  }));

  const tagMap: Record<string, typeof notesWithTags> = {};
  const noTagNotes: typeof notesWithTags = [];

  notesWithTags.forEach(n => {
    if (n.tags.length === 0) {
      noTagNotes.push(n);
    } else {
      n.tags.forEach(tag => {
        if (!tagMap[tag]) tagMap[tag] = [];
        tagMap[tag].push(n);
      });
    }
  });

  const sortedTags = Object.keys(tagMap).sort();
  const allTags = sortedTags.length > 0 ? sortedTags : null;

  let cursorY = margin + 85;

  // ── Notes sans tags ──────────────────────────────────────────────
  if (noTagNotes.length > 0) {
    if (cursorY > pageHeight - 100) {
      doc.addPage();
      cursorY = margin;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...hexToRgb(colors.primary));
    doc.text("Sans catégorie", margin, cursorY);
    cursorY += 18;

    noTagNotes.forEach((note, idx) => {
      if (cursorY > pageHeight - 50) {
        doc.addPage();
        cursorY = margin;
      }

      const lines = doc.splitTextToSize(note.content, maxWidth - 20);
      const lineHeight = 4.5;
      const blockHeight = lines.length * lineHeight + 12;

      // Fond léger
      doc.setFillColor(...hexToRgb(colors.background));
      doc.rect(margin + 10, cursorY - 2, maxWidth - 20, blockHeight, "F");

      // Texte
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...hexToRgb(colors.secondary));
      doc.text(lines, margin + 15, cursorY + 8);

      // Date
      doc.setFontSize(8);
      doc.setTextColor(...hexToRgb(colors.muted));
      const dateStr = note.updatedAt
        ? new Date(note.updatedAt).toLocaleDateString("fr-FR")
        : "—";
      doc.text(dateStr, pageWidth - margin - 10, cursorY + 8, { align: "right" });

      cursorY += blockHeight + 12;
    });
  }

  // ── Notes par tag ───────────────────────────────────────────────
  if (allTags) {
    allTags.forEach(tag => {
      const tagNotes = tagMap[tag];

      if (cursorY > pageHeight - 100) {
        doc.addPage();
        cursorY = margin;
      }

      // En-tête du tag
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...hexToRgb(colors.accent));
      doc.text(`#${tag}`, margin, cursorY);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...hexToRgb(colors.muted));
      doc.text(`(${tagNotes.length} note${tagNotes.length > 1 ? "s" : ""})`, margin + 50, cursorY);
      cursorY += 18;

      // Notes du tag
      tagNotes.forEach((note) => {
        if (cursorY > pageHeight - 50) {
          doc.addPage();
          cursorY = margin;
        }

        const lines = doc.splitTextToSize(note.content, maxWidth - 20);
        const lineHeight = 4.5;
        const blockHeight = lines.length * lineHeight + 12;

        // Fond léger
        doc.setFillColor(...hexToRgb(colors.background));
        doc.rect(margin + 10, cursorY - 2, maxWidth - 20, blockHeight, "F");

        // Texte
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...hexToRgb(colors.secondary));
        doc.text(lines, margin + 15, cursorY + 8);

        // Date
        doc.setFontSize(8);
        doc.setTextColor(...hexToRgb(colors.muted));
        const dateStr = note.updatedAt
          ? new Date(note.updatedAt).toLocaleDateString("fr-FR")
          : "—";
        doc.text(dateStr, pageWidth - margin - 10, cursorY + 8, { align: "right" });

        cursorY += blockHeight + 12;
      });

      cursorY += 6;
    });
  }

  // Télécharger
  doc.save("notes.pdf");
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
