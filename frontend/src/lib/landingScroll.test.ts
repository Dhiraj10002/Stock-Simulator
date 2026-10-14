import test from "node:test";
import assert from "node:assert/strict";
import { landingChapterOffset, landingScrollFrame } from "./landingScroll";

test("scroll chapters remain at their endpoints before entry and after exit", () => {
  assert.deepEqual(landingScrollFrame(1000, 3000, 700, 96, 3), { progress: 0, index: 0 });
  assert.deepEqual(landingScrollFrame(-4000, 3000, 700, 96, 3), { progress: 1, index: 2 });
  assert.deepEqual(landingScrollFrame(0, 600, 700, 96, 3), { progress: 0, index: 0 });
});

test("five feature chapters stay reachable with differing chrome and pin heights", () => {
  for (const offset of [80, 96, 112]) for (const pinnedHeight of [600, 799]) {
    const height = 4200, travel = height - pinnedHeight;
    for (let chapter = 0; chapter < 5; chapter++) {
      const top = offset - landingChapterOffset(chapter, 5, travel);
      assert.equal(landingScrollFrame(top, height, pinnedHeight, offset, 5).index, chapter);
    }
  }
  assert.equal(landingChapterOffset(-4, 3, 1000), 0);
  assert.equal(landingChapterOffset(99, 3, 1000), 1000);
});
