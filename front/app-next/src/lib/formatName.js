/** Capitalize the first letter of every name part without altering the rest. */
export function capitalizeName(value = "") {
  return value.replace(/(^|[\s'-])(\p{L})/gu, (match, separator, letter) => (
    `${separator}${letter.toUpperCase()}`
  ));
}
