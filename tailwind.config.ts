import type { Config } from "tailwindcss";
import v4Config from "./design-system/tailwind.config";

/**
 * Tailwind config do app — estende o do V4 Design System.
 * Toda mudança em design-system/tailwind.config.ts propaga aqui.
 */
const config: Config = {
  ...v4Config,
  content: [
    "./src/**/*.{ts,tsx,mdx}",
    "./design-system/**/*.{ts,tsx,html,md,mdx}",
  ],
};

export default config;
