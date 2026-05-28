import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { FilterBar, FilterChip } from "~/components/ui/FilterBar";

const meta = {
  title: "UI/FilterBar",
  component: FilterBar,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof FilterBar>;

export default meta;
type Story = StoryObj<typeof  FilterBar>;

export const Default: Story = {
  render: () => {
    const [search, setSearch] = useState("");
    return (
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search goals…"
      />
    );
  },
};

export const WithChips: Story = {
  render: () => {
    const [search, setSearch] = useState("");
    const [activeFilter, setActiveFilter] = useState<string>("all");

    return (
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search artifacts…"
      >
        {["all", "meal_plan", "workout", "finance", "reflection"].map((f) => (
          <FilterChip
            key={f}
            active={activeFilter === f}
            onClick={() => setActiveFilter(f)}
          >
            {f === "all" ? "All" : f.replace("_", " ")}
          </FilterChip>
        ))}
      </FilterBar>
    );
  },
};

export const WithValue: Story = {
  render: () => {
    const [search, setSearch] = useState("exercise");
    return (
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search…"
      />
    );
  },
};
