import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const storePath = path.resolve("src/stores/agentStore.ts");

test("agent cards are kept in a timeline instead of being cleared on new runs", () => {
  const source = fs.readFileSync(storePath, "utf8");

  assert.ok(source.includes("timelineCards: []"), "timeline card state should exist");
  assert.ok(source.includes("upsertTimelineCards"), "SSE card payloads should be appended to the timeline");
  assert.equal(source.includes("transportPlan: null,\n          streamingContent"), false);
});

test("non-card complete events clear stale trip info draft cards", () => {
  const source = fs.readFileSync(storePath, "utf8");

  assert.ok(source.includes("clearTimelineCardsByKind"), "store should be able to remove stale draft cards");
  assert.ok(source.includes('clearTimelineCardsByKind(timelineCards, "question")'), "null questionCard should remove old trip-info cards");
});

test("complete events release pending confirmation so the composer stays usable", () => {
  const source = fs.readFileSync(storePath, "utf8");
  const completeStart = source.indexOf('case "complete":');
  assert.notEqual(completeStart, -1, "complete handler should exist");
  const completeEnd = source.indexOf('case "error":', completeStart);
  assert.notEqual(completeEnd, -1, "complete handler end should be findable");
  const completeBlock = source.slice(completeStart, completeEnd);

  assert.ok(completeBlock.includes("needsConfirmation: false"), "complete should clear confirmation lock");
  assert.ok(completeBlock.includes("confirmationType: null"), "complete should clear confirmation type");
  assert.ok(completeBlock.includes('confirmationMessage: ""'), "complete should clear confirmation copy");
});
