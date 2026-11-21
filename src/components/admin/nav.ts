import {
  BadgeCheck,
  ClipboardCheck,
  History,
  Home,
  LayoutDashboard,
  ListTree,
  MenuSquare,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Store,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import type { Session } from "@/lib/session";

export type NavItem = {
  section: "monitoring" | "setup" | "asuh" | "aksi" | "system" | null;
  key: string; // messages: nav.<key>
  href: string;
  icon: LucideIcon;
  visible: (s: Session) => boolean;
  /** Pages still to build are shown as "Soon". */
  built: boolean;
};

/** Each entry shows only to people holding the permission behind it. */
export const NAV: NavItem[] = [
  { section: null, key: "home", href: "/", icon: Home, visible: () => true, built: true },
  { section: "monitoring", key: "dashboards", href: "/dashboards", icon: LayoutDashboard, visible: (s) => s.hasAny("dashboard.view"), built: false },
  { section: "monitoring", key: "issues", href: "/issues", icon: TriangleAlert, visible: (s) => s.hasAny("issue.view"), built: false },
  { section: "setup", key: "org", href: "/org", icon: ListTree, visible: (s) => s.hasGroup("org.manage"), built: false },
  { section: "setup", key: "users", href: "/users", icon: BadgeCheck, visible: (s) => s.hasAny("user.view") || s.hasGroup("user.manage"), built: false },
  { section: "setup", key: "roles", href: "/roles", icon: ShieldCheck, visible: (s) => s.hasGroup("role.manage"), built: false },
  { section: "setup", key: "outlets", href: "/outlets", icon: Store, visible: (s) => s.hasGroup("outlet.manage"), built: false },
  { section: "asuh", key: "modules", href: "/modules", icon: MenuSquare, visible: (s) => s.hasGroup("module.author") || s.hasGroup("module.review"), built: false },
  { section: "asuh", key: "paths", href: "/paths", icon: Route, visible: (s) => s.hasGroup("path.manage"), built: false },
  { section: "asuh", key: "ratings", href: "/ratings", icon: Star, visible: (s) => s.hasGroup("mentor_rating.view_raters"), built: false },
  { section: "aksi", key: "checklists", href: "/checklists", icon: ClipboardCheck, visible: (s) => s.hasGroup("checklist_template.manage"), built: true },
  { section: "system", key: "auditLog", href: "/audit-log", icon: History, visible: (s) => s.hasGroup("audit_log.view"), built: false },
  { section: "system", key: "settings", href: "/settings", icon: SlidersHorizontal, visible: (s) => s.hasGroup("settings.manage"), built: false },
];

export const visibleNav = (s: Session) => NAV.filter((i) => i.visible(s));
