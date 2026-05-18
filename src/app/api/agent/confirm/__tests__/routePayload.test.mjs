import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const routePath = path.resolve("src/app/api/agent/confirm/route.ts");

test("confirm complete payload includes visual response cards", () => {
  const source = fs.readFileSync(routePath, "utf8");

  assert.ok(source.includes("tripCard:"), "confirm route must send tripCard on complete");
  assert.ok(source.includes("questionCard:"), "confirm route must send questionCard on complete");
  assert.ok(source.includes("destinationRecommendationCard:"), "confirm route must send destinationRecommendationCard on complete");
  assert.ok(source.includes("exportPayload:"), "confirm route must send exportPayload on complete");
});
