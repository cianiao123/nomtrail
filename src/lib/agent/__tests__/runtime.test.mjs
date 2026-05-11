import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";
import { createRequire } from "node:module";

const modulePath = path.resolve("src/lib/agent/runtime.ts");
const requireFromModule = createRequire(modulePath);

function loadModule(env = {}) {
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
      process: { env },
    },
    { filename: modulePath }
  );
  return cjsModule.exports;
}

test("treats EdgeOne and production as constrained serverless runtime", () => {
  assert.equal(loadModule({ EDGEONE: "1" }).isConstrainedServerlessRuntime(), true);
  assert.equal(loadModule({ EDGEONE_PAGES: "1" }).isConstrainedServerlessRuntime(), true);
  assert.equal(loadModule({ NODE_ENV: "production" }).isConstrainedServerlessRuntime(), true);
  assert.equal(loadModule({ NODE_ENV: "development" }).isConstrainedServerlessRuntime(), false);
});

test("treats fetch termination as an abort-style error", () => {
  const { isRequestTerminationError } = loadModule();

  assert.equal(isRequestTerminationError(new TypeError("terminated")), true);
  assert.equal(isRequestTerminationError(new Error("fetch failed: other")), false);
});
