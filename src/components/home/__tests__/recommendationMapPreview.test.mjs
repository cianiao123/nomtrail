import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../MindtripWorkspace.tsx", import.meta.url), "utf8");

test("destination recommendation cards feed the map preview", () => {
  assert.match(source, /destinationRecommendationCard/);
  assert.match(source, /buildPreviewPlacesFromRecommendations/);
  assert.match(source, /recommendationPreviewPlaces\.length > 0/);
  assert.match(source, /setCandidatePreviewPlaces\(candidatePreviewPlaces\)/);
});

test("fresh conversations do not show stale trip header data", () => {
  assert.match(source, /isFreshConversation/);
  assert.match(source, /headerSourceInfo/);
  assert.match(source, /isFreshConversation \? \{\} :/);
  assert.match(source, /const headerTitle = isFreshConversation \? "新对话"/);
});
