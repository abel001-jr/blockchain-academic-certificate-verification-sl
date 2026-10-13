const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function moveField(field, dx, dy) {
  return { ...field, x: clamp(field.x + dx, 0, 1 - field.width), y: clamp(field.y + dy, 0, 1 - field.height) };
}

export function resizeField(field, dx, dy, handle = "se") {
  let left = field.x, top = field.y, right = left + field.width, bottom = top + field.height;
  if (handle.includes("w")) left = clamp(left + dx, 0, right - .01);
  if (handle.includes("e")) right = clamp(right + dx, left + .01, 1);
  if (handle.includes("n")) top = clamp(top + dy, 0, bottom - .005);
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + .005, 1);
  return { ...field, x: left, y: top, width: right - left, height: bottom - top };
}

export function drawField(field, start, end, page) {
  const left = clamp(Math.min(start.x, end.x), 0, 1), top = clamp(Math.min(start.y, end.y), 0, 1);
  return { ...field, page, x: left, y: top, width: Math.max(0, clamp(Math.max(start.x, end.x), 0, 1) - left), height: Math.max(0, clamp(Math.max(start.y, end.y), 0, 1) - top) };
}

export function overlappingFields(fields) {
  const pairs = [];
  fields.forEach((a, i) => fields.slice(i + 1).forEach((b, offset) => {
    if (a.page === b.page && Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > .001 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > .001) pairs.push([i, i + offset + 1]);
  }));
  return pairs;
}

export function nextFieldArea(fields, page) {
  for (let row = 0; row < 9; row++) {
    const candidate = { page, x: .2, y: .08 + row * .1, width: .6, height: .07 };
    if (!overlappingFields([...fields, candidate]).some(pair => pair.includes(fields.length))) return candidate;
  }
  return {page, x: .2, y: .4, width: .6, height: .07};
}
