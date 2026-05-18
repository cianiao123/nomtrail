import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.resolve("src/app/api/agent/run/route.ts"), "utf8");
const agentPanelSource = fs.readFileSync(path.resolve("src/components/agent/AgentPanel.tsx"), "utf8");
const reasoningSource = fs.readFileSync(path.resolve("src/components/agent/ReasoningProgress.tsx"), "utf8");

test("recommendation queries use lightweight progress instead of full trip planning progress", () => {
  assert.match(source, /function isLightweightRecommendationMessage/);
  assert.match(source, /buildProgressEvents\(message\)/);
  assert.match(source, /recommend_destinations/);
  assert.match(source, /正在整理好玩的地方/);
  assert.doesNotMatch(source, /const progressEvents: Array<\{ node: string; message: string \}> = \[/);
});

test("recommendation progress renders as recommendation UI rather than trip planning stages", () => {
  assert.match(agentPanelSource, /research_agent\.recommend_destinations/);
  assert.match(agentPanelSource, /recommend_destinations/);
  assert.match(reasoningSource, /AI RECOMMEND/);
  assert.match(reasoningSource, /recommend_destinations/);
});

test("planning progress uses registered icons and animated active markers", () => {
  const iconSource = fs.readFileSync(path.resolve("src/components/shared/Icon.tsx"), "utf8");

  for (const icon of ["manage_search", "sync_alt", "location_on", "fact_check", "route", "bookmark_added", "rule", "play_arrow", "check"]) {
    assert.match(iconSource, new RegExp(`${icon}:`), `${icon} should be registered in shared Icon`);
  }
  assert.match(reasoningSource, /motion-safe:animate-/);
  assert.doesNotMatch(reasoningSource, /stage\.icon\} className="text-\[12px\]"/);
});

test("agent-prefixed progress nodes normalize before phase mapping", () => {
  assert.match(agentPanelSource, /function normalizeAgentStep/);
  assert.match(agentPanelSource, /currentStepName === "research_inspiration"/);
  assert.match(agentPanelSource, /currentStepName === "extract_places"/);
  assert.match(agentPanelSource, /currentStepName === "generate_itinerary"/);
});
