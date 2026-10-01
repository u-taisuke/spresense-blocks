import toolboxCategories from "../toolbox.json" with { type: "json" };

export { installMessages, installBlocks } from "./blocks.js";
export { registerGenerators, generateSketch } from "./generators.js";

/** このパックが提供するツールボックス・カテゴリの定義(JSON)の配列。 */
export const toolbox = toolboxCategories;
