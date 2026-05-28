import type { Meta, StoryObj } from "@storybook/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Composer } from "~/components/chat/Composer";
import { IngestProvider } from "~/components/ingest/IngestProvider";
import { makeStoryQueryClient } from "./providers";

const meta = {
  title: "Chat/Composer",
  component: Composer,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => {
      const qc = makeStoryQueryClient();
      return (
        <div className="w-[640px] bg-bg py-4">
          <QueryClientProvider client={qc}>
            <IngestProvider>
              <Story />
            </IngestProvider>
          </QueryClientProvider>
        </div>
      );
    },
  ],
} satisfies Meta<typeof Composer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    disabled: false,
    onSubmit: (text) => console.log("submitted:", text),
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    onSubmit: () => {},
  },
};
