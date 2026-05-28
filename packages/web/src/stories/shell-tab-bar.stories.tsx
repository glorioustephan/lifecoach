/**
 * TabBar story — minimal router shim to satisfy useRouterState + Link.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { TabBar } from "~/components/shell/TabBar";
import { withTanStackRouter } from "./providers";

const meta = {
  title: "Shell/TabBar",
  component: TabBar,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="relative h-32 w-full bg-bg">
        {withTanStackRouter(<TabBar />)}
      </div>
    ),
  ],
} satisfies Meta<typeof TabBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
