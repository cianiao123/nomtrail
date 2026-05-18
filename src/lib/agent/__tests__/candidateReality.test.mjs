import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const toolsPath = path.resolve("src/lib/agent/tools.ts");

test("candidate fallbacks must not synthesize generic destination placeholders", () => {
  const source = fs.readFileSync(toolsPath, "utf8");

  for (const placeholder of [
    "历史文化街区",
    "城市地标",
    "夜景区",
    "美食街区",
    "近郊景点",
  ]) {
    assert.equal(
      source.includes("${destination}" + placeholder),
      false,
      `found generic destination placeholder: ${placeholder}`
    );
  }

  assert.equal(source.includes('"基础候选池"'), false);
});
