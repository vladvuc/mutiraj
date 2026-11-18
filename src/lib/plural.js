/**
 * A count with the right Serbian word form: 1 слика, 2 слике, 5 слика, 21 слика.
 * @param {number} n
 * @param {string} one   form for 1, 21, 31…
 * @param {string} few   form for 2-4, 22-24…
 * @param {string} many  form for 0, 5-20, 25-30…
 */
export function plural(n, one, few, many) {
  const lastTwo = Math.abs(n) % 100;
  const last = lastTwo % 10;
  let word = many;
  if (lastTwo < 11 || lastTwo > 14) {
    if (last === 1) word = one;
    else if (last >= 2 && last <= 4) word = few;
  }
  return `${n} ${word}`;
}
