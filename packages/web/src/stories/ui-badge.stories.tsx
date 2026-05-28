import type { Meta, StoryObj } from "@storybook/react";
import { TypeBadge, TagBadge, BADGE_COLOR } from "~/components/ui/Badge";

const meta = {
  title: "UI/Badge",
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const TypeBadges: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <TypeBadge type="meal_plan" />
      <TypeBadge type="workout_plan" />
      <TypeBadge type="financial_summary" />
      <TypeBadge type="goal_review" />
      <TypeBadge type="reflection" />
      <TypeBadge type="unknown_type" />
    </div>
  ),
};

export const TagBadges: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {["running", "morning", "diet", "productivity", "finance", "sleep"].map((tag) => (
        <TagBadge key={tag} tag={tag} />
      ))}
    </div>
  ),
};

export const ColorPalette: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(BADGE_COLOR) as Array<keyof typeof BADGE_COLOR>).map((color) => (
        <span key={color} className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${BADGE_COLOR[color]}`}>
          {color}
        </span>
      ))}
    </div>
  ),
};
