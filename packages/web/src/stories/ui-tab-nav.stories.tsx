import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { TabNav } from "~/components/ui/TabNav";

const SETTINGS_TABS = [
  { id: "profile", label: "Profile" },
  { id: "notifications", label: "Notifications" },
  { id: "integrations", label: "Integrations" },
  { id: "sources", label: "Sources" },
] as const;

type Tab = (typeof SETTINGS_TABS)[number]["id"];

const meta = {
  title: "UI/TabNav",
  component: TabNav,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof TabNav>;

export default meta;
type Story = StoryObj<typeof  TabNav>;

export const Underline: Story = {
  render: () => {
    const [active, setActive] = useState<Tab>("profile");
    return (
      <TabNav
        tabs={[...SETTINGS_TABS]}
        active={active}
        onChange={setActive}
        variant="underline"
      />
    );
  },
};

export const Pill: Story = {
  render: () => {
    const [active, setActive] = useState<Tab>("notifications");
    return (
      <TabNav
        tabs={[...SETTINGS_TABS]}
        active={active}
        onChange={setActive}
        variant="pill"
      />
    );
  },
};
