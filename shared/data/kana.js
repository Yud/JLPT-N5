// Canonical hiragana dataset. Every reference table, flashcard scope, and
// writing-exercise button set reads from KANA (directly or via the helpers
// below) so romaji/kana pairs can never disagree between features (FR-017).

const COLUMNS_5 = ['a', 'i', 'u', 'e', 'o']
const COLUMNS_3 = ['a', 'u', 'o']

// [row, label, table, [ [column, kana, romaji, id], ... ] ]
// `id` is a permanent, explicit identifier — never recomputed from row/column
// or any other field — because it's the key spaced-repetition review state
// (stored elsewhere, outside this repo) is keyed on. Relabeling a row/column
// for display must never change a card's id, or existing users would lose
// review progress on that card.
const ROW_DEFS = [
  // Base gojūon
  ['a', 'A', 'base', [['a', 'あ', 'a', 'hiragana-a'], ['i', 'い', 'i', 'hiragana-i'], ['u', 'う', 'u', 'hiragana-u'], ['e', 'え', 'e', 'hiragana-e'], ['o', 'お', 'o', 'hiragana-o']]],
  ['k', 'K', 'base', [['a', 'か', 'ka', 'hiragana-ka'], ['i', 'き', 'ki', 'hiragana-ki'], ['u', 'く', 'ku', 'hiragana-ku'], ['e', 'け', 'ke', 'hiragana-ke'], ['o', 'こ', 'ko', 'hiragana-ko']]],
  ['s', 'S', 'base', [['a', 'さ', 'sa', 'hiragana-sa'], ['i', 'し', 'shi', 'hiragana-shi'], ['u', 'す', 'su', 'hiragana-su'], ['e', 'せ', 'se', 'hiragana-se'], ['o', 'そ', 'so', 'hiragana-so']]],
  ['t', 'T', 'base', [['a', 'た', 'ta', 'hiragana-ta'], ['i', 'ち', 'chi', 'hiragana-chi'], ['u', 'つ', 'tsu', 'hiragana-tsu'], ['e', 'て', 'te', 'hiragana-te'], ['o', 'と', 'to', 'hiragana-to']]],
  ['n', 'N', 'base', [['a', 'な', 'na', 'hiragana-na'], ['i', 'に', 'ni', 'hiragana-ni'], ['u', 'ぬ', 'nu', 'hiragana-nu'], ['e', 'ね', 'ne', 'hiragana-ne'], ['o', 'の', 'no', 'hiragana-no']]],
  ['h', 'H', 'base', [['a', 'は', 'ha', 'hiragana-ha'], ['i', 'ひ', 'hi', 'hiragana-hi'], ['u', 'ふ', 'fu', 'hiragana-fu'], ['e', 'へ', 'he', 'hiragana-he'], ['o', 'ほ', 'ho', 'hiragana-ho']]],
  ['m', 'M', 'base', [['a', 'ま', 'ma', 'hiragana-ma'], ['i', 'み', 'mi', 'hiragana-mi'], ['u', 'む', 'mu', 'hiragana-mu'], ['e', 'め', 'me', 'hiragana-me'], ['o', 'も', 'mo', 'hiragana-mo']]],
  ['y', 'Y', 'base', [['a', 'や', 'ya', 'hiragana-ya'], ['u', 'ゆ', 'yu', 'hiragana-yu'], ['o', 'よ', 'yo', 'hiragana-yo']]],
  ['r', 'R', 'base', [['a', 'ら', 'ra', 'hiragana-ra'], ['i', 'り', 'ri', 'hiragana-ri'], ['u', 'る', 'ru', 'hiragana-ru'], ['e', 'れ', 're', 'hiragana-re'], ['o', 'ろ', 'ro', 'hiragana-ro']]],
  ['w', 'W', 'base', [['a', 'わ', 'wa', 'hiragana-wa'], ['o', 'を', 'wo', 'hiragana-wo']]],
  ['nn', 'ん', 'base', [['a', 'ん', 'n', 'hiragana-n']]],

  // Dakuten (voiced) / Handakuten (semi-voiced)
  ['g', 'G', 'dakuten', [['a', 'が', 'ga', 'hiragana-ga'], ['i', 'ぎ', 'gi', 'hiragana-gi'], ['u', 'ぐ', 'gu', 'hiragana-gu'], ['e', 'げ', 'ge', 'hiragana-ge'], ['o', 'ご', 'go', 'hiragana-go']]],
  ['z', 'Z', 'dakuten', [['a', 'ざ', 'za', 'hiragana-za'], ['i', 'じ', 'ji', 'hiragana-ji'], ['u', 'ず', 'zu', 'hiragana-zu'], ['e', 'ぜ', 'ze', 'hiragana-ze'], ['o', 'ぞ', 'zo', 'hiragana-zo']]],
  ['d', 'D', 'dakuten', [['a', 'だ', 'da', 'hiragana-da'], ['i', 'ぢ', 'di', 'hiragana-di'], ['u', 'づ', 'du', 'hiragana-du'], ['e', 'で', 'de', 'hiragana-de'], ['o', 'ど', 'do', 'hiragana-do']]],
  ['b', 'B', 'dakuten', [['a', 'ば', 'ba', 'hiragana-ba'], ['i', 'び', 'bi', 'hiragana-bi'], ['u', 'ぶ', 'bu', 'hiragana-bu'], ['e', 'べ', 'be', 'hiragana-be'], ['o', 'ぼ', 'bo', 'hiragana-bo']]],
  ['p', 'P', 'dakuten', [['a', 'ぱ', 'pa', 'hiragana-pa'], ['i', 'ぴ', 'pi', 'hiragana-pi'], ['u', 'ぷ', 'pu', 'hiragana-pu'], ['e', 'ぺ', 'pe', 'hiragana-pe'], ['o', 'ぽ', 'po', 'hiragana-po']]],

  // Combinations (yōon)
  ['kya', 'KY', 'combination', [['a', 'きゃ', 'kya', 'hiragana-kya'], ['u', 'きゅ', 'kyu', 'hiragana-kyu'], ['o', 'きょ', 'kyo', 'hiragana-kyo']]],
  ['sha', 'SH', 'combination', [['a', 'しゃ', 'sha', 'hiragana-sha'], ['u', 'しゅ', 'shu', 'hiragana-shu'], ['o', 'しょ', 'sho', 'hiragana-sho']]],
  ['cha', 'CH', 'combination', [['a', 'ちゃ', 'cha', 'hiragana-cha'], ['u', 'ちゅ', 'chu', 'hiragana-chu'], ['o', 'ちょ', 'cho', 'hiragana-cho']]],
  ['nya', 'NY', 'combination', [['a', 'にゃ', 'nya', 'hiragana-nya'], ['u', 'にゅ', 'nyu', 'hiragana-nyu'], ['o', 'にょ', 'nyo', 'hiragana-nyo']]],
  ['hya', 'HY', 'combination', [['a', 'ひゃ', 'hya', 'hiragana-hya'], ['u', 'ひゅ', 'hyu', 'hiragana-hyu'], ['o', 'ひょ', 'hyo', 'hiragana-hyo']]],
  ['mya', 'MY', 'combination', [['a', 'みゃ', 'mya', 'hiragana-mya'], ['u', 'みゅ', 'myu', 'hiragana-myu'], ['o', 'みょ', 'myo', 'hiragana-myo']]],
  ['rya', 'RY', 'combination', [['a', 'りゃ', 'rya', 'hiragana-rya'], ['u', 'りゅ', 'ryu', 'hiragana-ryu'], ['o', 'りょ', 'ryo', 'hiragana-ryo']]],
  ['gya', 'GY', 'combination', [['a', 'ぎゃ', 'gya', 'hiragana-gya'], ['u', 'ぎゅ', 'gyu', 'hiragana-gyu'], ['o', 'ぎょ', 'gyo', 'hiragana-gyo']]],
  ['ja', 'J', 'combination', [['a', 'じゃ', 'ja', 'hiragana-ja'], ['u', 'じゅ', 'ju', 'hiragana-ju'], ['o', 'じょ', 'jo', 'hiragana-jo']]],
  ['bya', 'BY', 'combination', [['a', 'びゃ', 'bya', 'hiragana-bya'], ['u', 'びゅ', 'byu', 'hiragana-byu'], ['o', 'びょ', 'byo', 'hiragana-byo']]],
  ['pya', 'PY', 'combination', [['a', 'ぴゃ', 'pya', 'hiragana-pya'], ['u', 'ぴゅ', 'pyu', 'hiragana-pyu'], ['o', 'ぴょ', 'pyo', 'hiragana-pyo']]],
]

export const KANA = ROW_DEFS.flatMap(([row, , table, cells]) =>
  cells.map(([column, kana, romaji, id]) => ({ id, kana, romaji, table, row, column }))
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
