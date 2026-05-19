import {
  MessageCircle,
  Inbox,
  Brain,
  CheckCircle2,
  Radio,
  Settings,
  Target,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  /** Show in the bottom tab bar on mobile (5 slots — Sources is rail-only). */
  inTabBar: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "chat", label: "Chat", to: "/", icon: MessageCircle, inTabBar: true },
  { id: "inbox", label: "Inbox", to: "/inbox", icon: Inbox, inTabBar: true },
  { id: "goals", label: "Goals", to: "/goals", icon: Target, inTabBar: false },
  { id: "memory", label: "Memory", to: "/memory", icon: Brain, inTabBar: true },
  { id: "tasks", label: "Tasks", to: "/tasks", icon: CheckCircle2, inTabBar: true },
  { id: "sources", label: "Sources", to: "/sources", icon: Radio, inTabBar: false },
  { id: "settings", label: "Settings", to: "/settings", icon: Settings, inTabBar: true },
];
