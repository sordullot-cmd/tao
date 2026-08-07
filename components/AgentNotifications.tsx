"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { T as BaseT } from "@/lib/ui/tokens";

interface Notification {
  id: string;
  title: string;
  message: string;
  notification_type: "info" | "warning" | "stop" | "report";
  is_read: boolean;
  created_at: string;
}

interface AgentNotificationsProps {
  userId: string;
}

export default function AgentNotifications({ userId }: AgentNotificationsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const supabase = createClient();

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    // Polling toutes les 30 secondes
    const interval = setInterval(fetchNotifications, 30000);
    fetchNotifications();
    return () => clearInterval(interval);
  }, [userId]);

  const fetchNotifications = async () => {
    // Vérifier que c'est un UUID valide
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!userId || !uuidRegex.test(userId)) {
      console.warn("Invalid userId for notifications:", userId);
      return;
    }

    try {
      const { data } = await supabase
        .from("agent_notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (data) {
        setNotifications(data);
      }
    } catch (err) {
      console.error("Erreur lors de la récupération des notifications:", err);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await supabase
        .from("agent_notifications")
        .update({ is_read: true })
        .eq("id", id);

      setNotifications(
        notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      console.error("Erreur lors de la mise à jour:", err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await supabase
        .from("agent_notifications")
        .update({ is_read: true })
        .eq("user_id", userId)
        .eq("is_read", false);

      setNotifications(notifications.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error("Erreur:", err);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "info":
        return "ℹ️";
      case "warning":
        return "⚠️";
      case "stop":
        return "🛑";
      case "report":
        return "✦";
      default:
        return "•";
    }
  };

  // Libellé accessible décrivant le type (l'emoji seul n'est pas annoncé).
  const getTypeLabel = (type: string) => {
    switch (type) {
      case "info":
        return "Information";
      case "warning":
        return "Avertissement";
      case "stop":
        return "Alerte critique";
      case "report":
        return "Rapport";
      default:
        return "Notification";
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case "info":
        return T.blue;
      case "warning":
        return T.amber;
      case "stop":
        return T.red;
      case "report":
        return T.purple;
      default:
        return T.textMut;
    }
  };

  const formatTime = (date: string) => {
    const now = new Date();
    const notifDate = new Date(date);
    const diffMs = now.getTime() - notifDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "à l'instant";
    if (diffMins < 60) return `il y a ${diffMins}m`;
    if (diffHours < 24) return `il y a ${diffHours}h`;
    return `il y a ${diffDays}j`;
  };

  const T = { ...BaseT };

  return (
    <div style={{ position: "relative" }}>
      {/* Bell icon */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} non lues)` : "Notifications"}
        aria-expanded={isOpen}
        style={{
          position: "relative",
          background: "none",
          border: "none",
          fontSize: 18,
          cursor: "pointer",
          padding: 0,
          minWidth: 44,
          minHeight: 44,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && (
          <div
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              background: T.red,
              color: T.white,
              width: 18,
              height: 18,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {unreadCount}
          </div>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: 36,
            right: -200,
            width: 320,
            background: T.white,
            border: `1px solid ${T.border}`,
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--elev-overlay)",
            zIndex: 1000,
            maxHeight: 400,
            overflowY: "auto",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: `1px solid ${T.border}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
              Notifications
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                style={{
                  fontSize: 11,
                  color: T.accent,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Tout marquer comme lu
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div
              style={{
                padding: "24px 16px",
                textAlign: "center",
                color: T.textSub,
                fontSize: 12,
              }}
            >
              Aucune notification
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => markAsRead(notif.id)}
                style={{
                  padding: "12px 16px",
                  borderBottom: `1px solid ${T.border}`,
                  cursor: "pointer",
                  background: notif.is_read ? "transparent" : T.accentBg,
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = T.accentBg;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = notif.is_read
                    ? "transparent"
                    : T.accentBg;
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginBottom: 4,
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{ fontSize: 14 }}
                    role="img"
                    aria-label={getTypeLabel(notif.notification_type)}
                  >
                    {getIcon(notif.notification_type)}
                  </span>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: getColor(notif.notification_type),
                      flex: 1,
                    }}
                  >
                    {notif.title}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: T.textSub,
                    marginBottom: 4,
                    paddingLeft: 22,
                    lineHeight: 1.4,
                  }}
                >
                  {notif.message}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: T.textMut,
                    paddingLeft: 22,
                  }}
                >
                  {formatTime(notif.created_at)}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
