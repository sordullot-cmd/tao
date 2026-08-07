"use client";

import React from "react";
import { LucideIcon, FileQuestion } from "lucide-react";
import Button from "./Button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  size?: "sm" | "md" | "lg";
}

export function EmptyState({ icon: Icon = FileQuestion, title, description, action, size = "md" }: EmptyStateProps) {
  const iconBox = size === "sm" ? 36 : size === "md" ? 44 : 56;
  const iconSize = size === "sm" ? 18 : size === "md" ? 22 : 28;
  const titleSize = size === "sm" ? 14 : size === "md" ? 16 : 18;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: size === "lg" ? "48px 32px" : "32px 24px",
      textAlign: "center",
      fontFamily: "var(--font-sans)",
    }}>
      <div style={{
        width: iconBox,
        height: iconBox,
        borderRadius: 10,
        background: "var(--color-hover-bg, #F0F0F0)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 12,
      }}>
        <Icon size={iconSize} strokeWidth={1.75} color="var(--color-text-sub, #5C5C5C)" />
      </div>
      <div style={{ fontSize: titleSize, fontWeight: 600, color: "var(--color-text, #0D0D0D)", marginBottom: 4 }}>
        {title}
      </div>
      {description && (
        <div style={{ fontSize: 13, color: "var(--color-text-sub, #5C5C5C)", maxWidth: 320, lineHeight: 1.5 }}>
          {description}
        </div>
      )}
      {action && (
        <div style={{ marginTop: 16 }}>
          <Button variant="secondary" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
