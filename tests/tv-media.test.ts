import assert from "node:assert/strict";
import test from "node:test";
import { matchesTvFileSignature, parseTvByteRange } from "../lib/tv-upload.ts";
import { activeStories, type TvPlaylistItem } from "../lib/tv-model.ts";

test("TV: os intervalos HTTP preservam os bytes esperados e limitam o final ao arquivo", () => {
  assert.equal(parseTvByteRange(null, 100), null);
  assert.deepEqual(parseTvByteRange("bytes=0-0", 100), { offset: 0, length: 1 });
  assert.deepEqual(parseTvByteRange("bytes=8-15", 100), { offset: 8, length: 8 });
  assert.deepEqual(parseTvByteRange("bytes=90-", 100), { offset: 90, length: 10 });
  assert.deepEqual(parseTvByteRange("bytes=90-999", 100), { offset: 90, length: 10 });
  assert.deepEqual(parseTvByteRange("bytes=-6", 100), { offset: 94, length: 6 });
  assert.deepEqual(parseTvByteRange("bytes=-999", 100), { offset: 0, length: 100 });
});

test("TV: rejeita intervalos múltiplos, vazios, invertidos e números imprecisos", () => {
  for (const value of ["bytes=", "bytes=-", "bytes=-0", "bytes=100-", "bytes=20-10", "bytes=0-1,3-4", "items=0-1", "bytes=0-9007199254740993", "bytes=9007199254740993-"]) {
    assert.equal(parseTvByteRange(value, 100), "invalid", value);
  }
  assert.equal(parseTvByteRange("bytes=0-1", 0), "invalid");
});

test("TV: um arquivo precisa corresponder à assinatura do tipo declarado", () => {
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
  const jpeg = Uint8Array.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1]);
  const webp = new TextEncoder().encode("RIFF0000WEBP");
  const mp4 = new TextEncoder().encode("0000ftypisom");
  const webm = Uint8Array.from([26, 69, 223, 163, 159, 66, 134, 129, 1, 66, 247, 129]);
  for (const [bytes, mime] of [[png,"image/png"], [jpeg,"image/jpeg"], [webp,"image/webp"], [mp4,"video/mp4"], [webm,"video/webm"]] as const) {
    assert.equal(matchesTvFileSignature(bytes,mime),true,mime);
  }
  assert.equal(matchesTvFileSignature(png,"video/mp4"),false);
  assert.equal(matchesTvFileSignature(new TextEncoder().encode("<svg onload='x'>"),"image/png"),false);
  assert.equal(matchesTvFileSignature(new Uint8Array(8),"image/png"),false);
  assert.equal(matchesTvFileSignature(png,"image/svg+xml"),false);
});

test("TV: stories expirados nunca voltam à programação a partir do cache", () => {
  const now = Date.parse("2026-11-10T15:00:00.000Z");
  const base: TvPlaylistItem = { id:"ig:12345",source:"instagram",type:"IMAGE",url:"https://cdninstagram.com/story.jpg",name:"Story",createdAt:"2026-11-09T16:00:00.000Z",enabled:true };
  const valid = { ...base, expiresAt:"2026-11-10T16:00:00.000Z" };
  const items: TvPlaylistItem[] = [
    valid,
    {...base,id:"expired",expiresAt:"2026-11-10T14:59:59.999Z"},
    {...base,id:"boundary",expiresAt:"2026-11-10T15:00:00.000Z"},
    {...base,id:"invalid",expiresAt:"invalid"},
    {...base,id:"missing"},
    {...base,id:"upload",source:"upload",expiresAt:"2026-11-11T15:00:00.000Z"},
  ];
  assert.deepEqual(activeStories(items,now),[valid]);
});
