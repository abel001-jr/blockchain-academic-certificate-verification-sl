export const suggestionIsAdded = (fields, suggestion) => fields.some(field => field.key === suggestion.field.key && field.page === suggestion.field.page && (field.key !== "static_text" || (field.text === suggestion.field.text && field.x === suggestion.field.x && field.y === suggestion.field.y)));

export function addSuggestedFields(fields, suggestions, limit = 60) {
  const next = [...fields];
  let added = 0, skipped = 0;
  for (const suggestion of suggestions) {
    if (suggestionIsAdded(next, suggestion)) continue;
    const field = suggestion.field;
    const overlaps = next.some(item => item.page === field.page && item.x < field.x + field.width && item.x + item.width > field.x && item.y < field.y + field.height && item.y + item.height > field.y);
    if (next.length >= limit || overlaps) { skipped++; continue; }
    next.push({...field});
    added++;
  }
  return {fields: next, added, skipped};
}
