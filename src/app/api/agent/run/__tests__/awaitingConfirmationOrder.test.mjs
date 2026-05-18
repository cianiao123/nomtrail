import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const runRoutePath = path.resolve("src/app/api/agent/run/route.ts");
const confirmRoutePath = path.resolve("src/app/api/agent/confirm/route.ts");

function humanConfirmationBlock(source) {
  const start = source.indexOf("if (result.needsHumanConfirmation)");
  assert.notEqual(start, -1, "human confirmation block not found");
  const end = source.indexOf("controller.close();", start);
  assert.notEqual(end, -1, "human confirmation block close not found");
  return source.slice(start, end);
}

test("awaiting confirmation emits the message before timeline card data", () => {
  for (const routePath of [runRoutePath, confirmRoutePath]) {
    const block = humanConfirmationBlock(fs.readFileSync(routePath, "utf8"));

    assert.ok(block.includes('type: "awaiting_confirmation"'), `${routePath} should emit awaiting confirmation`);
    assert.ok(!block.includes('type: "chunk"'), `${routePath} should not pre-emit card chunks before the message`);
  }
});
