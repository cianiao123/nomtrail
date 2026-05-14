import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const modulePath = path.resolve("src/lib/utils/async.ts");

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
      setTimeout,
      Promise,
    },
    { filename: modulePath }
  );
  return cjsModule.exports;
}

test("mapConcurrent preserves input order while limiting active work", async () => {
  const { mapConcurrent } = loadModule();
  let active = 0;
  let maxActive = 0;

  const result = await mapConcurrent([1, 2, 3, 4], 2, async (value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5 - value));
    active -= 1;
    return value * 10;
  });

  assert.equal(JSON.stringify(result), JSON.stringify([10, 20, 30, 40]));
  assert.equal(maxActive, 2);
});

test("mapConcurrent treats non-positive limits as sequential work", async () => {
  const { mapConcurrent } = loadModule();
  let active = 0;
  let maxActive = 0;

  const result = await mapConcurrent(["a", "b", "c"], 0, async (value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active -= 1;
    return value.toUpperCase();
  });

  assert.equal(JSON.stringify(result), JSON.stringify(["A", "B", "C"]));
  assert.equal(maxActive, 1);
});
