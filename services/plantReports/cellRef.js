/** Excel A1-style cell references */

function colLettersToNumber(letters) {
  let n = 0;
  const s = String(letters).toUpperCase();
  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return n;
}

function colNumberToLetters(n) {
  let num = n;
  let s = '';
  while (num > 0) {
    const rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s || 'A';
}

function parseCellRef(ref) {
  const m = /^([A-Za-z]+)(\d+)$/.exec(String(ref || '').trim());
  if (!m) return null;
  return {
    col: colLettersToNumber(m[1]),
    row: parseInt(m[2], 10),
    colLetter: m[1].toUpperCase(),
  };
}

function cellRef(col, row) {
  return `${colNumberToLetters(col)}${row}`;
}

module.exports = {
  colLettersToNumber,
  colNumberToLetters,
  parseCellRef,
  cellRef,
};
