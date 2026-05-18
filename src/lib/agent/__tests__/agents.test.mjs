import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const modulePath = path.resolve("src/lib/agent/agents/registry.ts");

function loadModule() {
  const source = fs.readFileSync(modulePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const cjsModule = { exports: {} };
  vm.runInNewContext(
    outputText,
    {
      module: cjsModule,
      exports: cjsModule.exports,
    },
    { filename: modulePath }
  );
  return cjsModule.exports;
}

test("maps workflow nodes to specialist agents", () => {
  const { getSpecialistAgentForNode } = loadModule();

  assert.equal(getSpecialistAgentForNode("parse_trip").id, "requirement_agent");
  assert.equal(getSpecialistAgentForNode("research_inspiration").id, "research_agent");
  assert.equal(getSpecialistAgentForNode("scenic_research").id, "scenic_research_agent");
  assert.equal(getSpecialistAgentForNode("food_research").id, "food_research_agent");
  assert.equal(getSpecialistAgentForNode("stay_research").id, "stay_research_agent");
  assert.equal(getSpecialistAgentForNode("poi_enrich").id, "geo_resolver_agent");
  assert.equal(getSpecialistAgentForNode("plan_transport").id, "transport_agent");
  assert.equal(getSpecialistAgentForNode("generate_itinerary").id, "planner_agent");
  assert.equal(getSpecialistAgentForNode("critique_itinerary").id, "validator_agent");
  assert.equal(getSpecialistAgentForNode("create_trip").id, "persistence_agent");
});

test("formats action log node names with agent ownership", () => {
  const { formatAgentNodeName } = loadModule();

  assert.equal(formatAgentNodeName("web_search"), "research_agent.web_search");
  assert.equal(formatAgentNodeName("plan_transport"), "transport_agent.plan_transport");
  assert.equal(formatAgentNodeName("food_research"), "food_research_agent.food_research");
  assert.equal(formatAgentNodeName("normalize_activities"), "validator_agent.normalize_activities");
});
