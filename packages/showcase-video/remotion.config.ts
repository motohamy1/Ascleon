import { Config } from "@remotion/cli/config";

/**
 * Ascleon showcase video — Remotion configuration.
 *
 * Design surface: 1920x1080 @ 30fps. The whole piece is 120s.
 * Render a language variant with:
 *   npx remotion render src/index.ts Showcase out/en.mp4 --props='{"language":"en"}'
 */

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(90);
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("angle");
Config.setChromiumHeadlessMode(true);

// Use the locally installed Playwright Chrome when present (avoids a second
// browser download). Remotion falls back to its own bundled Chrome otherwise.
Config.setConcurrency(4);
