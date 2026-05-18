import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const nodesPath = path.resolve("src/lib/agent/nodes.ts");
const graphPath = path.resolve("src/lib/agent/graph.ts");

test("submitted trip info autostarts planning without a second confirmation card", () => {
  const nodesSource = fs.readFileSync(nodesPath, "utf8");
  const graphSource = fs.readFileSync(graphPath, "utf8");

  assert.ok(nodesSource.includes("form submitted, continue planning"), "form submit should not stop at a confirm card");
  assert.ok(nodesSource.includes("responsePayload: undefined"), "form submit should clear question-card response payload");
  assert.ok(graphSource.includes("const isFormSubmit"), "graph should recognize submitted trip-info messages");
  assert.ok(graphSource.includes("wantsGeneration || isFormSubmit"), "form submit should route into planning");
});

test("question card includes parsed natural-language values for all visible trip fields", () => {
  const source = fs.readFileSync(nodesPath, "utf8");

  assert.ok(source.includes('field === "startDate"'), "startDate should be read from parsed requirements");
  assert.ok(source.includes('field === "endDate"'), "endDate should be read from parsed requirements");
  assert.ok(source.includes("questionCardFields"), "question card should use a full set of visible fields");
  assert.ok(source.includes("buildFormItems(questionCardFields, true)"), "question card should include parsed values");
  assert.ok(!source.includes("sorted.length === 0 && !isEditRequest"), "complete parsed info should still render a review card");
  assert.ok(source.includes('`¥${parsed.budget.max}以下`'), "zero-min budgets should render as under-budget text");
});
