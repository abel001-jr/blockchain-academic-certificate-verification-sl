/**
 * Parse-only syntax check for the mobile app's source files.
 *
 * The mobile app has no linter configured, so this stands in for one: it runs
 * Babel's parser over each file and reports syntax errors. It does not resolve
 * imports or type-check — it catches the class of mistake that would otherwise
 * only surface as a red screen at runtime.
 *
 * Uses @babel/parser with the JSX/flow plugins directly rather than
 * `babel-preset-expo`, which is not a dependency of this project; the preset
 * only contributes transform plugins, and none of them are needed to decide
 * whether a file parses.
 *
 * Usage: node scripts/parse-check.js <file...>
 */
const parser = require("@babel/parser");
const fs = require("fs");
const path = require("path");

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/parse-check.js <file...>");
  process.exit(2);
}

let failed = 0;
for (const file of files) {
  const full = path.resolve(file);
  try {
    parser.parse(fs.readFileSync(full, "utf8"), {
      sourceType: "module",
      plugins: ["jsx", "flow", "classProperties", "optionalChaining", "nullishCoalescingOperator"],
    });
    console.log(`  ok  ${file}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  ${file}`);
    console.error(`      ${err.message.split("\n")[0]}`);
  }
}

console.log(
  failed === 0
    ? `\nparsed ${files.length} file(s), no syntax errors`
    : `\n${failed} of ${files.length} file(s) failed`,
);
process.exit(failed === 0 ? 0 : 1);
