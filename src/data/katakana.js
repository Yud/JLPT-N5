// Canonical katakana dataset. Mirrors kana.js's shape and conventions exactly
// (see that file's header) so KanaTable.vue, useCardSession.js, and the
// spaced-repetition review API work unmodified across both scripts.

const COLUMNS_5 = ['a', 'i', 'u', 'e', 'o']
const COLUMNS_3 = ['a', 'u', 'o']

// [row, label, table, [ [column, kana, romaji, id], ... ] ]
// `id` is a permanent, explicit identifier distinct from kana.js's
// `hiragana-*` ids — never recomputed from row/column or any other field —
// because it's the key spaced-repetition review state is keyed on.
const ROW_DEFS = [
  // Base gojūon
  ['a', 'A', 'base', [['a', 'ア', 'a', 'katakana-a'], ['i', 'イ', 'i', 'katakana-i'], ['u', 'ウ', 'u', 'katakana-u'], ['e', 'エ', 'e', 'katakana-e'], ['o', 'オ', 'o', 'katakana-o']]],
  ['k', 'K', 'base', [['a', 'カ', 'ka', 'katakana-ka'], ['i', 'キ', 'ki', 'katakana-ki'], ['u', 'ク', 'ku', 'katakana-ku'], ['e', 'ケ', 'ke', 'katakana-ke'], ['o', 'コ', 'ko', 'katakana-ko']]],
  ['s', 'S', 'base', [['a', 'サ', 'sa', 'katakana-sa'], ['i', 'シ', 'shi', 'katakana-shi'], ['u', 'ス', 'su', 'katakana-su'], ['e', 'セ', 'se', 'katakana-se'], ['o', 'ソ', 'so', 'katakana-so']]],
  ['t', 'T', 'base', [['a', 'タ', 'ta', 'katakana-ta'], ['i', 'チ', 'chi', 'katakana-chi'], ['u', 'ツ', 'tsu', 'katakana-tsu'], ['e', 'テ', 'te', 'katakana-te'], ['o', 'ト', 'to', 'katakana-to']]],
  ['n', 'N', 'base', [['a', 'ナ', 'na', 'katakana-na'], ['i', 'ニ', 'ni', 'katakana-ni'], ['u', 'ヌ', 'nu', 'katakana-nu'], ['e', 'ネ', 'ne', 'katakana-ne'], ['o', 'ノ', 'no', 'katakana-no']]],
  ['h', 'H', 'base', [['a', 'ハ', 'ha', 'katakana-ha'], ['i', 'ヒ', 'hi', 'katakana-hi'], ['u', 'フ', 'fu', 'katakana-fu'], ['e', 'ヘ', 'he', 'katakana-he'], ['o', 'ホ', 'ho', 'katakana-ho']]],
  ['m', 'M', 'base', [['a', 'マ', 'ma', 'katakana-ma'], ['i', 'ミ', 'mi', 'katakana-mi'], ['u', 'ム', 'mu', 'katakana-mu'], ['e', 'メ', 'me', 'katakana-me'], ['o', 'モ', 'mo', 'katakana-mo']]],
  ['y', 'Y', 'base', [['a', 'ヤ', 'ya', 'katakana-ya'], ['u', 'ユ', 'yu', 'katakana-yu'], ['o', 'ヨ', 'yo', 'katakana-yo']]],
  ['r', 'R', 'base', [['a', 'ラ', 'ra', 'katakana-ra'], ['i', 'リ', 'ri', 'katakana-ri'], ['u', 'ル', 'ru', 'katakana-ru'], ['e', 'レ', 're', 'katakana-re'], ['o', 'ロ', 'ro', 'katakana-ro']]],
  ['w', 'W', 'base', [['a', 'ワ', 'wa', 'katakana-wa'], ['o', 'ヲ', 'wo', 'katakana-wo']]],
  ['nn', 'ン', 'base', [['a', 'ン', 'n', 'katakana-n']]],

  // Dakuten (voiced) / Handakuten (semi-voiced)
  ['g', 'G', 'dakuten', [['a', 'ガ', 'ga', 'katakana-ga'], ['i', 'ギ', 'gi', 'katakana-gi'], ['u', 'グ', 'gu', 'katakana-gu'], ['e', 'ゲ', 'ge', 'katakana-ge'], ['o', 'ゴ', 'go', 'katakana-go']]],
  ['z', 'Z', 'dakuten', [['a', 'ザ', 'za', 'katakana-za'], ['i', 'ジ', 'ji', 'katakana-ji'], ['u', 'ズ', 'zu', 'katakana-zu'], ['e', 'ゼ', 'ze', 'katakana-ze'], ['o', 'ゾ', 'zo', 'katakana-zo']]],
  ['d', 'D', 'dakuten', [['a', 'ダ', 'da', 'katakana-da'], ['i', 'ヂ', 'di', 'katakana-di'], ['u', 'ヅ', 'du', 'katakana-du'], ['e', 'デ', 'de', 'katakana-de'], ['o', 'ド', 'do', 'katakana-do']]],
  ['b', 'B', 'dakuten', [['a', 'バ', 'ba', 'katakana-ba'], ['i', 'ビ', 'bi', 'katakana-bi'], ['u', 'ブ', 'bu', 'katakana-bu'], ['e', 'ベ', 'be', 'katakana-be'], ['o', 'ボ', 'bo', 'katakana-bo']]],
  ['p', 'P', 'dakuten', [['a', 'パ', 'pa', 'katakana-pa'], ['i', 'ピ', 'pi', 'katakana-pi'], ['u', 'プ', 'pu', 'katakana-pu'], ['e', 'ペ', 'pe', 'katakana-pe'], ['o', 'ポ', 'po', 'katakana-po']]],

  // Combinations (yōon)
  ['kya', 'KY', 'combination', [['a', 'キャ', 'kya', 'katakana-kya'], ['u', 'キュ', 'kyu', 'katakana-kyu'], ['o', 'キョ', 'kyo', 'katakana-kyo']]],
  ['sha', 'SH', 'combination', [['a', 'シャ', 'sha', 'katakana-sha'], ['u', 'シュ', 'shu', 'katakana-shu'], ['o', 'ショ', 'sho', 'katakana-sho']]],
  ['cha', 'CH', 'combination', [['a', 'チャ', 'cha', 'katakana-cha'], ['u', 'チュ', 'chu', 'katakana-chu'], ['o', 'チョ', 'cho', 'katakana-cho']]],
  ['nya', 'NY', 'combination', [['a', 'ニャ', 'nya', 'katakana-nya'], ['u', 'ニュ', 'nyu', 'katakana-nyu'], ['o', 'ニョ', 'nyo', 'katakana-nyo']]],
  ['hya', 'HY', 'combination', [['a', 'ヒャ', 'hya', 'katakana-hya'], ['u', 'ヒュ', 'hyu', 'katakana-hyu'], ['o', 'ヒョ', 'hyo', 'katakana-hyo']]],
  ['mya', 'MY', 'combination', [['a', 'ミャ', 'mya', 'katakana-mya'], ['u', 'ミュ', 'myu', 'katakana-myu'], ['o', 'ミョ', 'myo', 'katakana-myo']]],
  ['rya', 'RY', 'combination', [['a', 'リャ', 'rya', 'katakana-rya'], ['u', 'リュ', 'ryu', 'katakana-ryu'], ['o', 'リョ', 'ryo', 'katakana-ryo']]],
  ['gya', 'GY', 'combination', [['a', 'ギャ', 'gya', 'katakana-gya'], ['u', 'ギュ', 'gyu', 'katakana-gyu'], ['o', 'ギョ', 'gyo', 'katakana-gyo']]],
  ['ja', 'J', 'combination', [['a', 'ジャ', 'ja', 'katakana-ja'], ['u', 'ジュ', 'ju', 'katakana-ju'], ['o', 'ジョ', 'jo', 'katakana-jo']]],
  ['bya', 'BY', 'combination', [['a', 'ビャ', 'bya', 'katakana-bya'], ['u', 'ビュ', 'byu', 'katakana-byu'], ['o', 'ビョ', 'byo', 'katakana-byo']]],
  ['pya', 'PY', 'combination', [['a', 'ピャ', 'pya', 'katakana-pya'], ['u', 'ピュ', 'pyu', 'katakana-pyu'], ['o', 'ピョ', 'pyo', 'katakana-pyo']]],
]

export const KATAKANA = ROW_DEFS.flatMap(([row, , table, cells]) =>
  cells.map(([column, kana, romaji, id]) => ({ id, kana, romaji, table, row, column })),
)

// Precomputed grid layout for KanaTable.vue: which rows/columns each
// reference table has, and where the gaps are. See kana.js's TABLE_LAYOUTS.
export const TABLE_LAYOUTS = {
  base: {
    columns: COLUMNS_5,
    rows: ROW_DEFS.filter(([, , table]) => table === 'base').map(([row, label]) => ({
      row,
      label,
      cells: COLUMNS_5.map((column) => KATAKANA.find((c) => c.table === 'base' && c.row === row && c.column === column) || null),
    })),
  },
  dakuten: {
    columns: COLUMNS_5,
    rows: ROW_DEFS.filter(([, , table]) => table === 'dakuten').map(([row, label]) => ({
      row,
      label,
      cells: COLUMNS_5.map((column) => KATAKANA.find((c) => c.table === 'dakuten' && c.row === row && c.column === column) || null),
    })),
  },
  combination: {
    columns: COLUMNS_3,
    rows: ROW_DEFS.filter(([, , table]) => table === 'combination').map(([row, label]) => ({
      row,
      label,
      cells: COLUMNS_3.map((column) => KATAKANA.find((c) => c.table === 'combination' && c.row === row && c.column === column) || null),
    })),
  },
}

const ROW_ORDER = ROW_DEFS.map(([row]) => row)

/**
 * Selectable flashcard scopes: one per row, one per table, plus "all".
 * Derived from KATAKANA/ROW_DEFS so scopes never drift out of sync with the
 * reference tables. See kana.js's getPracticeGroups.
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
 * Returns every KatakanaCharacter belonging to a row id, a table id, or
 * "all". `groupId` may also be an array of ids, in which case the union of
 * their characters is returned (deduplicated). See kana.js's
 * getCharactersForGroup.
 */
export function getCharactersForGroup(groupId) {
  const ids = Array.isArray(groupId) ? groupId : [groupId]
  if (ids.includes('all')) return KATAKANA

  const seen = new Set()
  const result = []
  for (const id of ids) {
    const matches =
      id === 'base' || id === 'dakuten' || id === 'combination'
        ? KATAKANA.filter((c) => c.table === id)
        : KATAKANA.filter((c) => c.row === id)
    for (const c of matches) {
      if (!seen.has(c)) {
        seen.add(c)
        result.push(c)
      }
    }
  }
  return result
}
