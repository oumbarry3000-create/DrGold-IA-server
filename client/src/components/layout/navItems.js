// src/components/layout/navItems.js — entrees de navigation partagees
import { LayoutDashboard, SquarePlus, History, BarChart3, MessageSquare, Settings, Crown, ShieldCheck } from "lucide-react";

export const NAV_ITEMS = [
  { to: "/dashboard",   label: "Dashboard",   icon: LayoutDashboard },
  { to: "/positions",   label: "Positions",   icon: SquarePlus, badge: "positions" },
  { to: "/historique",  label: "Historique",  icon: History },
  { to: "/performance", label: "Performance", icon: BarChart3 },
  { to: "/messages",    label: "Messages",    icon: MessageSquare, badge: "messages" },
  { to: "/settings",    label: "Paramètres",  icon: Settings },
  { to: "/abonnement",  label: "Abonnement",  icon: Crown, gold: true },
];

export const ADMIN_ITEM = { to: "/admin", label: "Admin", icon: ShieldCheck };

export const MOBILE_ITEMS = ["/dashboard", "/positions", "/historique", "/messages", "/settings"]
  .map((to) => NAV_ITEMS.find((i) => i.to === to));
