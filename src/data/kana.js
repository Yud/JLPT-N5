// Canonical hiragana dataset. Every reference table, flashcard scope, and
// writing-exercise button set reads from KANA (directly or via the helpers
// below) so romaji/kana pairs can never disagree between features (FR-017).

const COLUMNS_5 = ['a', 'i', 'u', 'e', 'o']
const COLUMNS_3 = ['a', 'u', 'o']

// [row, label, table, [ [column, kana, romaji], ... ] ]
const ROW_DEFS = [
  // Base gojūon
  ['a', 'A', 'base', [['a', 'あ', 'a'], ['i', 'い', 'i'], ['u', 'う', 'u'], ['e', 'え', 'e'], ['o', 'お', 'o']]],
  ['k', 'K', 'base', [['a', 'か', 'ka'], ['i', 'き', 'ki'], ['u', 'く', 'ku'], ['e', 'け', 'ke'], ['o', 'こ', 'ko']]],
  ['s', 'S', 'base', [['a', 'さ', 'sa'], ['i', 'し', 'shi'], ['u', 'す', 'su'], ['e', 'せ', 'se'], ['o', 'そ', 'so']]],
  ['t', 'T', 'base', [['a', 'た', 'ta'], ['i', 'ち', 'chi'], ['u', 'つ', 'tsu'], ['e', 'て', 'te'], ['o', 'と', 'to']]],
  ['n', 'N', 'base', [['a', 'な', 'na'], ['i', 'に', 'ni'], ['u', 'ぬ', 'nu'], ['e', 'ね', 'ne'], ['o', 'の', 'no']]],
  ['h', 'H', 'base', [['a', 'は', 'ha'], ['i', 'ひ', 'hi'], ['u', 'ふ', 'fu'], ['e', 'へ', 'he'], ['o', 'ほ', 'ho']]],
  ['m', 'M', 'base', [['a', 'ま', 'ma'], ['i', 'み', 'mi'], ['u', 'む', 'mu'], ['e', 'め', 'me'], ['o', 'も', 'mo']]],
  ['y', 'Y', 'base', [['a', 'や', 'ya'], ['u', 'ゆ', 'yu'], ['o', 'よ', 'yo']]],
  ['r', 'R', 'base', [['a', 'ら', 'ra'], ['i', 'り', 'ri'], ['u', 'る', 'ru'], ['e', 'れ', 're'], ['o', 'ろ', 'ro']]],
  ['w', 'W', 'base', [['a', 'わ', 'wa'], ['o', 'を', 'wo']]],
  ['nn', 'ん', 'base', [['a', 'ん', 'n']]],

  // Dakuten (voiced) / Handakuten (semi-voiced)
  ['g', 'G', 'dakuten', [['a', 'が', 'ga'], ['i', 'ぎ', 'gi'], ['u', 'ぐ', 'gu'], ['e', 'げ', 'ge'], ['o', 'ご', 'go']]],
  ['z', 'Z', 'dakuten', [['a', 'ざ', 'za'], ['i', 'じ', 'ji'], ['u', 'ず', 'zu'], ['e', 'ぜ', 'ze'], ['o', 'ぞ', 'zo']]],
  ['d', 'D', 'dakuten', [['a', 'だ', 'da'], ['i', 'ぢ', 'di'], ['u', 'づ', 'du'], ['e', 'で', 'de'], ['o', 'ど', 'do']]],
  ['b', 'B', 'dakuten', [['a', 'ば', 'ba'], ['i', 'び', 'bi'], ['u', 'ぶ', 'bu'], ['e', 'べ', 'be'], ['o', 'ぼ', 'bo']]],
  ['p', 'P', 'dakuten', [['a', 'ぱ', 'pa'], ['i', 'ぴ', 'pi'], ['u', 'ぷ', 'pu'], ['e', 'ぺ', 'pe'], ['o', 'ぽ', 'po']]],

  // Combinations (yōon)
  ['kya', 'KY', 'combination', [['a', 'きゃ', 'kya'], ['u', 'きゅ', 'kyu'], ['o', 'きょ', 'kyo']]],
  ['sha', 'SH', 'combination', [['a', 'しゃ', 'sha'], ['u', 'しゅ', 'shu'], ['o', 'しょ', 'sho']]],
  ['cha', 'CH', 'combination', [['a', 'ちゃ', 'cha'], ['u', 'ちゅ', 'chu'], ['o', 'ちょ', 'cho']]],
  ['nya', 'NY', 'combination', [['a', 'にゃ', 'nya'], ['u', 'にゅ', 'nyu'], ['o', 'にょ', 'nyo']]],
  ['hya', 'HY', 'combination', [['a', 'ひゃ', 'hya'], ['u', 'ひゅ', 'hyu'], ['o', 'ひょ', 'hyo']]],
  ['mya', 'MY', 'combination', [['a', 'みゃ', 'mya'], ['u', 'みゅ', 'myu'], ['o', 'みょ', 'myo']]],
  ['rya', 'RY', 'combination', [['a', 'りゃ', 'rya'], ['u', 'りゅ', 'ryu'], ['o', 'りょ', 'ryo']]],
  ['gya', 'GY', 'combination', [['a', 'ぎゃ', 'gya'], ['u', 'ぎゅ', 'gyu'], ['o', 'ぎょ', 'gyo']]],
  ['ja', 'J', 'combination', [['a', 'じゃ', 'ja'], ['u', 'じゅ', 'ju'], ['o', 'じょ', 'jo']]],
  ['bya', 'BY', 'combination', [['a', 'びゃ', 'bya'], ['u', 'びゅ', 'byu'], ['o', 'びょ', 'byo']]],
  ['pya', 'PY', 'combination', [['a', 'ぴゃ', 'pya'], ['u', 'ぴゅ', 'pyu'], ['o', 'ぴょ', 'pyo']]],
]

export const KANA = ROW_DEFS.flatMap(([row, , table, cells]) =>
  cells.map(([column, kana, romaji]) => ({ kana, romaji, table, row, column }))
)

// Precomputed grid layout for KanaTable.vue: which rows/columns each
// reference table has, and where the gaps are (FR-004).
export const TABLE_LAYOUTS = {
  base: {
    columns: COLUMNS_5,
    rows: ROW_DEFS.filter(([, , table]) => table === 'base').map(([row, label]) => ({
      row,
      label,
      cells: COLUMNS_5.map((column) => KANA.find((c) => c.table === 'base' && c.row === row && c.column === column) || null),
    })),
  },
  dakuten: {
    columns: COLUMNS_5,
    rows: ROW_DEFS.filter(([, , table]) => table === 'dakuten').map(([row, label]) => ({
      row,
      label,
      cells: COLUMNS_5.map((column) => KANA.find((c) => c.table === 'dakuten' && c.row === row && c.column === column) || null),
    })),
  },
  combination: {
    columns: COLUMNS_3,
    rows: ROW_DEFS.filter(([, , table]) => table === 'combination').map(([row, label]) => ({
      row,
      label,
      cells: COLUMNS_3.map((column) => KANA.find((c) => c.table === 'combination' && c.row === row && c.column === column) || null),
    })),
  },
}

const ROW_ORDER = ROW_DEFS.map(([row]) => row)

/**
 * Selectable flashcard scopes: one per row, one per table, plus "all".
 * Derived from KANA/ROW_DEFS so scopes never drift out of sync with the
 * reference tables (FR-017).
 */
export function getPracticeGroups() {
  const rowGroups = ROW_ORDER.map((row) => {
    const [, label, table] = ROW_DEFS.find(([r]) => r === row)
    return { id: row, label: `${label} row`, kind: 'row', table }
  })
  const tableGroups = [
    { id: 'base', label: 'Base', kind: 'table' },
    { id: 'dakuten', label: 'Dakuten / Handakuten', kind: 'table' },
    { id: 'combination', label: 'Combinations', kind: 'table' },
  ]
  return [...rowGroups, ...tableGroups, { id: 'all', label: 'All characters', kind: 'all' }]
}

/**
 * Returns every HiraganaCharacter belonging to a row id, a table id, or
 * "all". `groupId` may also be an array of ids, in which case the union of
 * their characters is returned (deduplicated, e.g. when a row and its table
 * are both selected).
 */
export function getCharactersForGroup(groupId) {
  const ids = Array.isArray(groupId) ? groupId : [groupId]
  if (ids.includes('all')) return KANA

  const seen = new Set()
  const result = []
  for (const id of ids) {
    const matches =
      id === 'base' || id === 'dakuten' || id === 'combination'
        ? KANA.filter((c) => c.table === id)
        : KANA.filter((c) => c.row === id)
    for (const c of matches) {
      if (!seen.has(c)) {
        seen.add(c)
        result.push(c)
      }
    }
  }
  return result
}
