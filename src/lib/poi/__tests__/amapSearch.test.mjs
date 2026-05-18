import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const modulePath = path.resolve("src/lib/poi/amapSearch.ts");

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
      URLSearchParams,
    },
    { filename: modulePath }
  );
  return cjsModule.exports;
}

test("buildAmapPoiSearchParams limits results to the destination city", () => {
  const { buildAmapPoiSearchParams } = loadModule();

  const params = buildAmapPoiSearchParams({
    key: "test-key",
    keywords: "梵净山",
    city: "贵州",
    offset: 8,
    page: 1,
  });

  assert.equal(params.get("city"), "贵州");
  assert.equal(params.get("citylimit"), "true");
});
