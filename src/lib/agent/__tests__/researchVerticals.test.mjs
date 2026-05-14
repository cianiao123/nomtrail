import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const modulePath = path.resolve("src/lib/agent/agents/researchVerticals.ts");

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

test("defines scenic food and stay research vertical agents", () => {
  const { RESEARCH_VERTICALS } = loadModule();

  assert.equal(
    JSON.stringify(RESEARCH_VERTICALS.map((vertical) => vertical.nodeName)),
    JSON.stringify(["scenic_research", "food_research", "stay_research"])
  );
});

test("builds focused vertical search queries", () => {
  const { buildResearchQuery } = loadModule();

  assert.match(buildResearchQuery("杭州", ["美食探索"], 3, "scenic"), /杭州 3天/);
  assert.match(buildResearchQuery("杭州", ["美食探索"], 3, "scenic"), /景点|博物馆|街区/);
  assert.match(buildResearchQuery("杭州", ["美食探索"], 3, "food"), /餐厅|小吃|咖啡/);
  assert.match(buildResearchQuery("杭州", ["美食探索"], 3, "stay"), /住宿|酒店|商圈/);
});
