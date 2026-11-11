import assert from "node:assert/strict";
import test from "node:test";
import { castApplicationId, castPairingFromPath, parseCastMessage, TV_CAST_NAMESPACE } from "../lib/tv-cast.ts";
import { pairCastSession, type CastSession } from "../components/tv/cast-sdk.ts";

const token = "a".repeat(43);
const message = { type: "PAIR" as const, requestId: "request-1", displayId: "display-1", token };

test("Cast: rejects URLs, traversal and malformed capabilities from external messages", () => {
  assert.deepEqual(parseCastMessage(message), message);
  for (const override of [{ displayId: "../admin" }, { token: "short" }, { type: "LOAD" }, { requestId: "" }, { displayId: "https://example.org" }]) {
    assert.equal(parseCastMessage({ ...message, ...override }), null);
  }
  assert.equal(parseCastMessage(JSON.stringify(message)), null);
  assert.equal(parseCastMessage(null), null);
  assert.deepEqual(castPairingFromPath(`/tv/display-1#token=${token}`, "request-1"), message);
  for (const path of [`https://example.org/tv/display-1#token=${token}`, `/tv/display-1?token=${token}`, `/tv/../admin#token=${token}`]) {
    assert.throws(() => castPairingFromPath(path, "request-1"));
  }
});

test("Cast: invalid or absent receiver configuration never falls back to a different app", () => {
  assert.equal(castApplicationId("ab12ef34"), "AB12EF34");
  for (const value of [undefined, "", "YOUR_REGISTERED_APP_ID", "https://example.org", "ABCD"]) assert.equal(castApplicationId(value), null);
});

function session(reply: string | "transport-failure") {
  let listener: (namespace: string, data: string) => void;
  let removed = 0;
  const sdk: CastSession = {
    getCastDevice: () => ({ friendlyName: "TCL test" }),
    addMessageListener(namespace, handler) { assert.equal(namespace, TV_CAST_NAMESPACE); listener = handler; },
    removeMessageListener() { removed++; },
    async sendMessage(namespace, data) {
      assert.equal(namespace, TV_CAST_NAMESPACE); assert.deepEqual(data, message);
      if (reply === "transport-failure") throw Error("transport");
      listener(namespace, "invalid json");
      listener(namespace, JSON.stringify({ requestId: "other", type: "ERROR" }));
      listener(namespace, JSON.stringify({ requestId: message.requestId, type: reply }));
    },
  };
  return { sdk, removed: () => removed };
}

test("Cast: success requires matching receiver acknowledgement and cleans listener", async () => {
  const fake = session("PAIRED");
  await pairCastSession(fake.sdk, message);
  assert.equal(fake.removed(), 1);
});

test("Cast: receiver rejection and transport failure cannot report success", async () => {
  for (const reason of ["ERROR", "transport-failure"]) {
    const fake = session(reason);
    await assert.rejects(pairCastSession(fake.sdk, message));
    assert.equal(fake.removed(), 1);
  }
});
