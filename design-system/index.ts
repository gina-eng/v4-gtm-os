/**
 * V4 Design System — entrypoint de componentes React.
 *
 * Este barrel só expõe os componentes. Os tokens CSS e o preset do Tailwind
 * são importados por caminhos próprios (subpath exports do package.json):
 *
 *   import "@v4/design-system/tokens.css";          // tokens (light + dark)
 *   import v4Preset from "@v4/design-system/tailwind"; // preset do Tailwind
 *   import { V4Logo } from "@v4/design-system";      // componentes
 *
 * Obs.: os arquivos são distribuídos como código-fonte (.ts/.tsx, sem build).
 * Em Next, adicione `transpilePackages: ["@v4/design-system"]` no next.config.
 */
export { V4Logo } from "./components/V4Logo";
