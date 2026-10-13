// Ordered to match the landing page sections.
export const publicNavigation = [
  { label: "Why Web3", anchor: "why" },
  { label: "How it works", anchor: "lifecycle" },
  { label: "Get started", anchor: "get-started" },
  { label: "Who it's for", anchor: "stakeholders" },
  { label: "Verify a credential", anchor: "verify" },
];

export function publicNavigationHref(item, isHome = false) {
  return item.destination || `${isHome ? "" : "/"}#${item.anchor}`;
}
