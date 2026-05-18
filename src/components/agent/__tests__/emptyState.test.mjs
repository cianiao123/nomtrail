import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.resolve("src/components/agent/AgentPanel.tsx"), "utf8");

test("empty conversation shows a welcome state before messages exist", () => {
  assert.match(source, /isConversationEmpty/);
  assert.match(source, /准备好出发了吗/);
  assert.match(source, /我是 NomTrail/);
  assert.match(source, /timelineItems\.length === 0/);
});
