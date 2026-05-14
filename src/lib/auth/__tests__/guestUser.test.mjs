import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const modulePath = path.resolve("src/lib/auth/guestUser.ts");

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

function loadModule(context = {}) {
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
      crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000001" },
      Date: { now: () => 1710000000000 },
      Math,
      ...context,
    },
    { filename: modulePath }
  );
  return cjsModule.exports;
}

test("creates and reuses a stable guest user id in localStorage", () => {
  const localStorage = createStorage();
  const { getOrCreateGuestUserId } = loadModule({ window: { localStorage } });

  const first = getOrCreateGuestUserId();
  const second = getOrCreateGuestUserId();

  assert.equal(first, "guest_00000000-0000-4000-8000-000000000001");
  assert.equal(second, first);
});

test("prefers authenticated user id over guest id", () => {
  const localStorage = createStorage();
  const { resolveClientUserId } = loadModule({ window: { localStorage } });

  assert.equal(resolveClientUserId("user_123"), "user_123");
});

test("does not treat an anonymous browser as guest mode until explicitly enabled", () => {
  const localStorage = createStorage();
  const { isGuestModeEnabled, resolveClientUserId } = loadModule({ window: { localStorage } });

  assert.equal(isGuestModeEnabled(), false);
  assert.equal(resolveClientUserId(), "anonymous-server-user");
});

test("enables guest mode and resolves to the browser guest id", () => {
  const localStorage = createStorage();
  const { enableGuestMode, isGuestModeEnabled, resolveClientUserId } = loadModule({ window: { localStorage } });

  const guestId = enableGuestMode();

  assert.equal(isGuestModeEnabled(), true);
  assert.equal(guestId, "guest_00000000-0000-4000-8000-000000000001");
  assert.equal(resolveClientUserId(), guestId);
});

test("does not access browser storage during server rendering", () => {
  const { resolveClientUserId } = loadModule();

  assert.equal(resolveClientUserId(), "anonymous-server-user");
});
