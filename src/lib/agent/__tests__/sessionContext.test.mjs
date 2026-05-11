import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";
import { createRequire } from "node:module";

const modulePath = path.resolve("src/lib/agent/sessionContext.ts");
const requireFromModule = createRequire(modulePath);

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

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

test("drops trip-scoped session state when a thread is reused for another trip", () => {
  const { createInitialAgentState } = loadModule();
  const prevState = {
    userId: "u1",
    tripId: "old-trip",
    conversationHistory: [{ role: "user", content: "old" }],
    parsedTripRequirements: { destination: "北京" },
    missingInfo: ["dates"],
    parsedPlaces: [{ id: "p1" }],
    confirmedPlaces: [{ id: "c1" }],
    inspirationItems: [{ title: "old" }],
    savedPlaceCandidates: [{ name: "old" }],
    selectedSavedPlaces: [{ name: "old-selected" }],
    itineraryDraft: { days: [{ id: "old-day", activities: [{ id: "old-act" }] }] },
    versions: [{ tripId: "old-trip", versionNumber: 3 }],
    currentVersionNumber: 3,
    critiqueResult: { overallScore: 1 },
  };

  const state = createInitialAgentState({
    threadId: "thread-1",
    message: "第二天加一个景点",
    tripId: "new-trip",
    userId: "u1",
    prevState,
    requestStartedAt: 100,
    requestDeadlineAt: 200,
  });

  assert.equal(state.tripId, "new-trip");
  assert.deepEqual(plain(state.conversationHistory), [{ role: "user", content: "第二天加一个景点" }]);
  assert.equal(state.parsedTripRequirements, null);
  assert.deepEqual(plain(state.missingInfo), []);
  assert.deepEqual(plain(state.parsedPlaces), []);
  assert.deepEqual(plain(state.confirmedPlaces), []);
  assert.deepEqual(plain(state.inspirationItems), []);
  assert.deepEqual(plain(state.savedPlaceCandidates), []);
  assert.deepEqual(plain(state.selectedSavedPlaces), []);
  assert.equal(state.itineraryDraft, null);
  assert.deepEqual(plain(state.versions), []);
  assert.equal(state.currentVersionNumber, 0);
  assert.equal(state.critiqueResult, null);
});

test("keeps trip-scoped session state for another turn on the same trip", () => {
  const { createInitialAgentState } = loadModule();
  const prevState = {
    userId: "u1",
    tripId: "same-trip",
    conversationHistory: [{ role: "user", content: "old" }],
    itineraryDraft: { days: [{ id: "day-1", activities: [] }] },
    versions: [{ tripId: "same-trip", versionNumber: 1 }],
    currentVersionNumber: 1,
  };

  const state = createInitialAgentState({
    threadId: "thread-1",
    message: "放松一点",
    tripId: "same-trip",
    prevState,
    requestStartedAt: 100,
    requestDeadlineAt: 200,
  });

  assert.equal(state.tripId, "same-trip");
  assert.deepEqual(plain(state.conversationHistory), [
    { role: "user", content: "old" },
    { role: "user", content: "放松一点" },
  ]);
  assert.equal(state.itineraryDraft, prevState.itineraryDraft);
  assert.equal(state.versions, prevState.versions);
  assert.equal(state.currentVersionNumber, 1);
});
