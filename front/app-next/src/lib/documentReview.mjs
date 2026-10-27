export function nextDocumentReview(kinds, viewed) {
  for (const kind of kinds) {
    const total = viewed[kind]?.total || 1;
    for (let page = 1; page <= total; page++) {
      if (!viewed[kind]?.pages?.includes(page)) return { kind, page };
    }
  }
  return null;
}
