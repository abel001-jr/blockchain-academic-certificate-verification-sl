import test from "node:test";
import assert from "node:assert/strict";
import { moveField, resizeField, drawField, overlappingFields, nextFieldArea } from "./templateGeometry.mjs";
const field = { key: "student_name", page: 1, x: .2, y: .3, width: .4, height: .1 };

test("moving clamps the entire field inside the page and retains its content", () => {
  const result = moveField(field, 2, -2);
  assert.equal(result.x, .6); assert.equal(result.y, 0);
  assert.equal(result.key, "student_name"); assert.equal(result.width, .4);
  assert.deepEqual(field, { key: "student_name", page: 1, x: .2, y: .3, width: .4, height: .1 });
});
test("resizing handles stop at page bounds and minimum dimensions", () => {
  const enlarged = resizeField(field, 2, 2, "se");
  assert.equal(enlarged.x + enlarged.width, 1); assert.equal(enlarged.y + enlarged.height, 1);
  const small = resizeField(field, 2, 2, "nw");
  assert.ok(small.width >= .009999); assert.ok(small.height >= .004999);
});
test("drawing works in any direction and clamps outside coordinates", () => {
  const result = drawField(field, {x: .8, y: .6}, {x: -.5, y: -.2}, 2);
  assert.equal(result.x, 0); assert.equal(result.y, 0);
  assert.equal(result.width, .8); assert.equal(result.height, .6); assert.equal(result.page, 2);
});
test("overlap warnings only concern intersecting areas on the same page", () => {
  assert.deepEqual(overlappingFields([field, {...field, x: .3}, {...field, page: 2}, {...field, x: .6}]), [[0,1],[1,3]]);
});
test("new fields use a free area instead of stacking on existing fields", () => {
  const first = nextFieldArea([], 1);
  const next = nextFieldArea([first], 1);
  assert.notEqual(first.y, next.y);
  assert.deepEqual(overlappingFields([first, next]), []);
});
