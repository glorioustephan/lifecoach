import type { Meta, StoryObj } from "@storybook/react";
import { PaginationNav } from "~/components/ui/PaginationNav";

const meta = {
  title: "UI/PaginationNav",
  component: PaginationNav,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[600px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PaginationNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    currentPage: 1,
    totalPages: 5,
    itemsShown: 20,
    totalItems: 87,
    onLoadMore: () => {},
  },
};

export const LastPage: Story = {
  args: {
    currentPage: 5,
    totalPages: 5,
    itemsShown: 87,
    totalItems: 87,
    onLoadMore: () => {},
  },
};

export const Loading: Story = {
  args: {
    currentPage: 2,
    totalPages: 4,
    itemsShown: 40,
    totalItems: 73,
    onLoadMore: () => {},
    isLoading: true,
  },
};

export const SinglePage: Story = {
  args: {
    currentPage: 1,
    totalPages: 1,
    itemsShown: 12,
    totalItems: 12,
    onLoadMore: () => {},
  },
};
