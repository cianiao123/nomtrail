import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const panelPath = path.resolve("src/components/agent/AgentPanel.tsx");

test("trip info card renders before transport plan card", () => {
  const source = fs.readFileSync(panelPath, "utf8");
  const tripInfoIndex = source.indexOf('card.kind === "question"');
  const transportIndex = source.indexOf('card.kind === "transport"');

  assert.ok(tripInfoIndex !== -1, "question card timeline branch not found");
  assert.ok(transportIndex !== -1, "transport card timeline branch not found");
  assert.ok(tripInfoIndex < transportIndex, "question card should render before transport card");
  assert.ok(source.includes("const timelineItems = ["), "messages and cards should be merged into one timeline");
  assert.ok(source.includes("...timelineCards.map"), "timeline cards should render as conversation items");
});
