import test from "node:test";
import assert from "node:assert/strict";
import { nextRemoteControl, readRemoteControl, remoteActionSchema } from "../lib/tv-remote-model.ts";

test("remote next clicks advance from pending target until device confirms", () => {
  const report = { itemId: "a", playing: true, muted: true, volume: 1, position: 0, appliedVersion: 0, navigationVersion: 0, audioBlocked: false };
  const first = nextRemoteControl(readRemoteControl({}), { action: "next" }, ["a","b","c"], report);
  const second = nextRemoteControl(first, { action: "next" }, ["a","b","c"], report);
  assert.equal(first.itemId,"b"); assert.equal(second.itemId,"c");
  assert.equal(nextRemoteControl(second, { action: "next" }, ["a","b","c"], report).itemId,"a");
  assert.equal(nextRemoteControl(second, { action: "previous" }, ["a","b","c"], report).itemId,"b");
  const acknowledged = { ...report, itemId: "a", appliedVersion: second.version, navigationVersion: second.navigationVersion };
  assert.equal(nextRemoteControl(second, { action: "next" }, ["a","b","c"], acknowledged).itemId,"b");
});
test("pause and sound commands do not replay navigation", () => {
  const control = { ...readRemoteControl({}), version: 4, navigationVersion: 3, itemId: "b" };
  const paused = nextRemoteControl(control, { action: "play", value: false }, ["a","b"], null);
  assert.equal(paused.playing,false); assert.equal(paused.navigationVersion,3); assert.equal(paused.itemId,"b");
  const quiet = nextRemoteControl(paused, { action: "volume", value: 0 }, [], null);
  assert.equal(quiet.muted,true); assert.equal(quiet.playing,false);
  assert.equal(nextRemoteControl(quiet, { action: "volume", value: .5 }, [], null).muted,false);
  assert.equal(remoteActionSchema.safeParse({ action: "volume", value: 10 }).success,false);
  assert.equal(remoteActionSchema.safeParse({ action: "next", establishmentId: "other" }).success,false);
});
