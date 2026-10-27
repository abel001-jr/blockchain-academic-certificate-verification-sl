import test from "node:test";
import assert from "node:assert/strict";
import {addSuggestedFields, suggestionIsAdded} from "./templateSuggestions.mjs";

const field = (key, x, page = 1) => ({key, page, x, y: .2, width: .1, height: .1});
test("bulk addition skips duplicates and collisions, keeps other pages and existing fields", () => {
  const existing = [field("student_name", .1)];
  const result = addSuggestedFields(existing, [
    {field: field("student_name", .5)}, {field: field("degree_title", .15)},
    {field: field("vc_signature", .5)}, {field: field("student_name", .1, 2)},
  ]);
  assert.equal(result.added, 2);
  assert.equal(result.skipped, 1);
  assert.equal(existing.length, 1);
  assert.equal(result.fields.length, 3);
});
test("field cap is enforced and removal or undo restores a pending suggestion", () => {
  const suggestion = {field: field("degree_title", .5)};
  const original = [field("student_name", .1)];
  assert.equal(addSuggestedFields(original, [suggestion], 1).skipped, 1);
  const result = addSuggestedFields(original, [suggestion]);
  assert.equal(suggestionIsAdded(result.fields, suggestion), true);
  assert.equal(suggestionIsAdded(original, suggestion), false);
});

test("separate editable wording boxes can be added independently", () => {
  const first = {...field("static_text", .1), text: "This certifies that"};
  const second = {...field("static_text", .5), text: "Awarded the degree of"};
  const result = addSuggestedFields([], [{field: first}, {field: second}]);
  assert.equal(result.added, 2);
  assert.equal(suggestionIsAdded([first], {field: second}), false);
  assert.equal(suggestionIsAdded([first], {field: first}), true);
});
