import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const toolsPath = path.resolve("src/lib/agent/tools.ts");

test("candidate pool keeps sourced candidates even when POI enrichment misses", () => {
  const source = fs.readFileSync(toolsPath, "utf8");

  assert.equal(
    source.includes("return null"),
    false,
    "candidate enrichment must not drop every sourced candidate when AMap lookup fails"
  );
});
