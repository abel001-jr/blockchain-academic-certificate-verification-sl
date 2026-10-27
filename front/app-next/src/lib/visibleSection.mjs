/** Choose the section occupying the most visible space below the fixed header. */
export function visibleSection(sections, headerBottom, viewportHeight) {
  let active = "", largest = 0;
  for (const {anchor, top, bottom, hidden} of sections) {
    if (hidden || bottom <= top) continue;
    const visible = Math.max(0, Math.min(bottom, viewportHeight) - Math.max(top, headerBottom));
    if (visible > largest) {largest = visible; active = anchor;}
  }
  return active;
}
