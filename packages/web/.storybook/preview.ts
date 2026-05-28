import type { Preview, Decorator } from "@storybook/react";
import "../src/styles/global.css";

const withTheme: Decorator = (Story, context) => {
  const { theme } = context.globals as { theme?: string };
  const isDark = theme !== "light";

  // Apply class to document element for CSS variable resolution
  document.documentElement.className = isDark ? "dark" : "light";
  // Set canvas background to match the app bg token
  document.body.style.background = isDark
    ? "oklch(13% 0.010 260)"
    : "oklch(97% 0.004 260)";

  return Story();
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      name: "Theme",
      description: "Color theme",
      defaultValue: "dark",
      toolbar: {
        icon: "circlehollow",
        items: [
          { value: "dark", icon: "circle", title: "Dark" },
          { value: "light", icon: "circlehollow", title: "Light" },
        ],
        showName: true,
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    backgrounds: {
      disable: true, // We control bg via the theme decorator + CSS vars
      default: "dark",
      values: [
        { name: "dark", value: "oklch(13% 0.010 260)" },
        { name: "light", value: "oklch(97% 0.004 260)" },
      ],
    },
    layout: "centered",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
