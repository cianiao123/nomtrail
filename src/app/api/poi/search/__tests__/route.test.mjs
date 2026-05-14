import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const modulePath = path.resolve("src/lib/poi/searchLimit.ts");

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
      Number,
    },
    { filename: modulePath }
  );
  return cjsModule.exports;
}

test("parsePoiLimit caps explore result limit at 50", () => {
  const { parsePoiLimit } = loadModule();

  assert.equal(parsePoiLimit("50"), 50);
  assert.equal(parsePoiLimit("500"), 50);
  assert.equal(parsePoiLimit("0"), 20);
  assert.equal(parsePoiLimit("abc"), 20);
});
