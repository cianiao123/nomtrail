import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const promptsPath = path.resolve("src/lib/agent/prompts.ts");
const panelPath = path.resolve("src/components/agent/AgentPanel.tsx");

test("city-scoped recommendation asks for local places instead of other destinations", () => {
  const source = fs.readFileSync(promptsPath, "utf8");

  assert.ok(source.includes("已明确指定城市"), "classifier should distinguish city-scoped place recommendation");
  assert.ok(source.includes("城市内的景点"), "recommendation prompt should support in-city POI recommendations");
  assert.ok(source.includes("不要推荐其他城市"), "city-scoped recommendations must not drift to nearby cities");
});

test("city-scoped place recommendations surface POI candidate cards", () => {
  const source = fs.readFileSync(path.resolve("src/lib/agent/nodes.ts"), "utf8");

  assert.ok(source.includes("isCityPlaceRecommendationQuery"), "city place questions should be detected before generic guide cards");
  assert.ok(source.includes("recommendationsToSavedPlaceCandidates"), "recommended places should be converted to candidate POIs");
  assert.ok(source.includes('pendingConfirmationType: "candidates"'), "candidate POIs should use the existing POI selection component");
});

test("recommendation card pick text is neutral for both cities and places", () => {
  const source = fs.readFileSync(panelPath, "utf8");

  assert.ok(source.includes("我想去${item.city}"), "card pick text should work for POI names, not only destination cities");
  assert.equal(source.includes("我正在路上${item.city}"), false, "card pick text should not treat local POIs as destinations");
});

test("trip duration advice does not open trip planning form", () => {
  const nodesSource = fs.readFileSync(path.resolve("src/lib/agent/nodes.ts"), "utf8");
  const promptsSource = fs.readFileSync(promptsPath, "utf8");

  assert.ok(nodesSource.includes("isTripDurationAdviceQuery"), "classifier should detect duration advice questions before LLM routing");
  assert.ok(nodesSource.includes('intent: "recommendDestinations"'), "duration advice should be grouped into destination and play recommendations");
  assert.ok(nodesSource.includes("duration advice summary"), "duration advice should produce a concise recommendation summary");
  assert.ok(promptsSource.includes("适合玩几天/建议玩几天/几天合适/要留多久"), "LLM classifier prompt should preserve the duration-advice rule");
});

test("origin follow-up after destination recommendation keeps recommendation context", () => {
  const nodesSource = fs.readFileSync(path.resolve("src/lib/agent/nodes.ts"), "utf8");
  const promptsSource = fs.readFileSync(promptsPath, "utf8");

  assert.ok(nodesSource.includes("isRecommendationFollowUp"), "classifier should detect follow-up constraints after recommendation answers");
  assert.ok(nodesSource.includes("我人在北京"), "regression examples should cover origin-only follow-up phrasing");
  assert.ok(nodesSource.includes("buildRecommendationUserMessage"), "recommendation prompt should include prior conversation context");
  assert.ok(nodesSource.includes("buildConversationContext(state)"), "recommendation generation should not use only the latest short message");
  assert.ok(promptsSource.includes("用户可能在多轮对话里补充出发地"), "recommendation prompt should preserve multi-turn constraints");
});
