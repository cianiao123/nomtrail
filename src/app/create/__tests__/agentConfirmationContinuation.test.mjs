import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const createPagePath = path.resolve("src/app/create/page.tsx");

test("create page continues agent confirmations until a complete event is received", () => {
  const source = fs.readFileSync(createPagePath, "utf8");

  assert.ok(source.includes("awaitingConfirmationEvent"), "stream reader should expose awaiting confirmations");
  assert.ok(source.includes("confirmationRound"), "create flow should guard confirmation continuation rounds");
  assert.ok(source.includes("streamResult.awaitingConfirmationEvent"), "create flow should continue when the agent pauses for confirmation");
});
