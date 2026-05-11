import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";
import { createRequire } from "node:module";

const modulePath = path.resolve("src/lib/agent/wishlist.ts");
const requireFromModule = createRequire(modulePath);

function loadModule() {
  const source = fs.readFileSync(modulePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const cjsModule = { exports: {} };
  vm.runInNewContext(
    outputText,
    { module: cjsModule, exports: cjsModule.exports, require: requireFromModule },
    { filename: modulePath }
  );
  return cjsModule.exports;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("extracts wishlist names from explore create prompt wording", () => {
  const { extractWishlistNamesFromContext } = loadModule();

  assert.deepEqual(
    plain(extractWishlistNamesFromContext("用户: 我想把这些心愿地点加入行程：外滩、豫园，武康路。直接帮我规划")),
    ["外滩", "豫园", "武康路"]
  );
});

test("does not treat planning commands as wishlist places", () => {
  const { extractWishlistNamesFromContext } = loadModule();

  assert.deepEqual(
    plain(extractWishlistNamesFromContext("想去上海，计划玩3天，我想把这些心愿地点加入行程：外滩、豫园，直接帮我规划")),
    ["外滩", "豫园"]
  );
});

test("turns wishlist names into must-go candidates before generated candidates", () => {
  const { mergeWishlistCandidates } = loadModule();

  const merged = mergeWishlistCandidates(["外滩", "豫园"], "上海", [
    { name: "外滩", city: "上海", category: "attraction", priorityTag: "nearby_optional", reason: "old", sourceRefs: [], qualityScore: 0.5 },
    { name: "上海博物馆", city: "上海", category: "attraction", priorityTag: "must_go", reason: "热门", sourceRefs: [], qualityScore: 0.8 },
  ]);

  assert.deepEqual(
    plain(merged.map((item) => ({ name: item.name, priorityTag: item.priorityTag, reason: item.reason }))),
    [
      { name: "外滩", priorityTag: "must_go", reason: "来自探索页心愿池，用户明确希望加入行程。" },
      { name: "豫园", priorityTag: "must_go", reason: "来自探索页心愿池，用户明确希望加入行程。" },
      { name: "上海博物馆", priorityTag: "must_go", reason: "热门" },
    ]
  );
});

test("marks wishlist notes for detail page display", () => {
  const { markWishlistNotes } = loadModule();

  assert.equal(markWishlistNotes("建议早上去"), "心愿地：建议早上去");
  assert.equal(markWishlistNotes("心愿地：来自探索页心愿池"), "心愿地：来自探索页心愿池");
});
