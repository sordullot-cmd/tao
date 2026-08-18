"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ReadingListExportOptions {
  books: Array<{
    id?: string | number;
    title: string;
    author?: string;
    category?: string;
    status?: string;
    priority?: string;
    totalPages?: number;
    currentPage?: number;
    notes?: string;
    createdAt?: string;
  }>;
  title?: string;
}

/**
 * Génère un PDF élégant et moderne de la liste de lecture.
 */
export async function exportReadingListPdf(
  opts: ReadingListExportOptions
): Promise<void> {
  const { books = [], title = "Liste de Lecture" } = opts;

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
    toRead: books.filter((b) => !b.status || b.status === "toRead").length,
    reading: books.filter((b) => b.status === "reading").length,
    done: books.filter((b) => b.status === "done").length,
  };

  const totalBooks = books.length;
  const pagesRead = books.reduce((sum, b) => {
    if (b.status === "done") return sum + (b.totalPages || 0);
    if (b.status === "reading") return sum + (b.currentPage || 0);
    return sum;
  }, 0);

  doc.setFontSize(9);
  doc.setTextColor(...hexToRgb(colors.secondary));
  doc.text(
    `Total: ${totalBooks} | À lire: ${byStatus.toRead} | En cours: ${byStatus.reading} | Terminés: ${byStatus.done} | Pages lues: ${pagesRead}`,
    margin,
    margin + 58
  );

  // Ligne de séparation
  doc.setDrawColor(...hexToRgb(colors.border));
  doc.line(margin, margin + 68, pageWidth - margin, margin + 68);

  let cursorY = margin + 85;

  // ── Grouper par statut ──────────────────────────────────────────
  const statuses = [
    { id: "done", label: "Terminés", color: colors.success },
    { id: "reading", label: "En cours", color: colors.accent },
    { id: "toRead", label: "À lire", color: colors.muted },
  ];

  statuses.forEach((status) => {
    const statusBooks = books.filter(
      (b) =>
        (b.status || "toRead") ===
        (status.id === "toRead" && !b.status ? "toRead" : status.id)
    );

    if (statusBooks.length === 0) return;

    if (cursorY > pageHeight - 150) {
      doc.addPage();
      cursorY = margin;
    }

    // En-tête du statut
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...hexToRgb(status.color));
    doc.text(status.label, margin, cursorY);
    cursorY += 16;

    // Tableau des livres
    const tableData = statusBooks.map((b) => {
      const progress = b.totalPages
        ? b.status === "done"
          ? "100%"
          : `${Math.round(((b.currentPage || 0) / b.totalPages) * 100)}%`
        : "—";

      return [
        b.title || "—",
        b.author || "—",
        b.totalPages ? String(b.totalPages) : "—",
        progress,
        (b.priority || "normal").replace(/_/g, " "),
      ];
    });

    autoTable(doc, {
      startY: cursorY,
      head: [["Titre", "Auteur", "Pages", "Progression", "Priorité"]],
      body: tableData,
      theme: "striped",
      headStyles: {
        fillColor: hexToRgb(colors.background),
        textColor: hexToRgb(colors.secondary),
        fontSize: 8.5,
        fontStyle: "bold",
      },
      bodyStyles: { fontSize: 8, halign: "left" },
      columnStyles: {
        0: { cellWidth: maxWidth * 0.35 },
        1: { cellWidth: maxWidth * 0.25 },
        2: { cellWidth: maxWidth * 0.1 },
        3: { cellWidth: maxWidth * 0.15 },
        4: { cellWidth: maxWidth * 0.15 },
      },
      margin: { left: margin, right: margin },
      didDrawPage: (data: any) => {
        cursorY = data.cursor?.y || cursorY;
      },
    });

    // @ts-expect-error -- jsPDF extension
    cursorY = (doc.lastAutoTable?.finalY || cursorY) + 16;
  });

  // ── Section notes ──────────────────────────────────────────────
  const booksWithNotes = books.filter((b) => b.notes && b.notes.trim());
  if (booksWithNotes.length > 0) {
    if (cursorY > pageHeight - 100) {
      doc.addPage();
      cursorY = margin;
    }

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...hexToRgb(colors.primary));
    doc.text("Notes de lecture", margin, cursorY);
    cursorY += 16;

    booksWithNotes.forEach((book) => {
      if (cursorY > pageHeight - 50) {
        doc.addPage();
        cursorY = margin;
      }

      // Titre du livre
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...hexToRgb(colors.accent));
      doc.text(`${book.title}`, margin, cursorY);

      // Auteur
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...hexToRgb(colors.muted));
      doc.text(book.author ? `par ${book.author}` : "", margin + 10, cursorY + 12);
      cursorY += 20;

      // Notes
      const noteLines = doc.splitTextToSize(book.notes || "", maxWidth - 20);
      doc.setFontSize(8.5);
      doc.setTextColor(...hexToRgb(colors.secondary));
      doc.text(noteLines, margin + 10, cursorY);
      cursorY += noteLines.length * 4 + 12;
    });
  }

  doc.save("liste_lecture.pdf");
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
