import {
  MessageCircle,
  Inbox,
  Brain,
  CheckCircle2,
  Settings,
  Target,
  FileStack,
  Wallet,
  Repeat2,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  /** Show in the bottom tab bar on mobile. */
  inTabBar: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "chat", label: "Chat", to: "/", icon: MessageCircle, inTabBar: true },
  { id: "inbox", label: "Inbox", to: "/inbox", icon: Inbox, inTabBar: true },
  { id: "goals", label: "Goals", to: "/goals", icon: Target, inTabBar: false },
  { id: "habits", label: "Habits", to: "/habits", icon: Repeat2, inTabBar: false },
  { id: "finances", label: "Finances", to: "/finances", icon: Wallet, inTabBar: false },
  { id: "memory", label: "Memory", to: "/memory", icon: Brain, inTabBar: true },
  { id: "artifacts", label: "Artifacts", to: "/artifacts", icon: FileStack, inTabBar: false },
  { id: "tasks", label: "Tasks", to: "/tasks", icon: CheckCircle2, inTabBar: true },
  { id: "settings", label: "Settings", to: "/settings", icon: Settings, inTabBar: false },
];
