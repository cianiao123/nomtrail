import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const panelPath = path.resolve("src/components/agent/AgentPanel.tsx");

test("submitted trip info cards do not keep submit buttons", () => {
  const source = fs.readFileSync(panelPath, "utf8");

  assert.ok(source.includes("const isInteractive ="), "TripInfoPanel should know whether it is active");
  assert.ok(source.includes("{isInteractive && ("), "TripInfoPanel actions should only render while active");
  assert.ok(source.includes("!isInteractive"), "TripInfoPanel inputs should become read-only when inactive");
});
