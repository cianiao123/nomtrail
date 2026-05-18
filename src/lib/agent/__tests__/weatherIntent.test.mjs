import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";
import { createRequire } from "node:module";

const modulePath = path.resolve("src/lib/agent/weatherIntent.ts");
const requireFromModule = createRequire(modulePath);

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
      require: requireFromModule,
      URLSearchParams,
    },
    { filename: modulePath }
  );
  return cjsModule.exports;
}

test("detects direct weather questions without treating the city as a trip destination", () => {
  const { parseWeatherQuery } = loadModule();
  const query = parseWeatherQuery("明天北京什么天气");

  assert.equal(query?.city, "北京");
  assert.equal(query?.days, 2);
  assert.equal(parseWeatherQuery("想去北京玩3天，帮我规划一下"), null);
});

test("formats weather replies without a travel-planning follow-up", () => {
  const { formatWeatherAnswer } = loadModule();

  const answer = formatWeatherAnswer("明天北京什么天气", {
    location: "北京市 北京市",
    forecasts: [
      { date: "2026-05-18", condition: "晴", tempHigh: 26, tempLow: 14 },
      { date: "2026-05-19", condition: "多云", tempHigh: 25, tempLow: 16 },
    ],
  });

  assert.match(answer, /明天北京.*多云.*16°.*25°/);
  assert.doesNotMatch(answer, /计划去|去.*玩|旅行|行程/);
});
