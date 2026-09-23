// Kanji reference sets for readings that don't follow a predictable
// pattern — the counters (days of the month, the native/Yamato つ counter
// for general objects, and the 人 counter for people). Flashcard drilling
// for these already happens in WaniKani; this file only backs the in-app
// reference table, so the whole irregular set can be seen at once and the
// exceptions (e.g. 一日 not ending in -ka, 十 dropping the つ) are easy to
// spot side by side.
//
// `id` follows the same permanent, explicit convention as kana.js/words.js
// (never recomputed from other fields) in case a flashcard/SRS scope is
// added for this pillar later.
//
// `root` is the number root shared across a set — the reason 二日/二つ both
// start with ふ, 三日/三つ both start with み, etc. It's the single most
// useful thing to memorize once instead of ten separate per-kanji
// mnemonics: everything else is that root plus a suffix, with a handful of
// genuine sound-shift exceptions (which is why some entries have no root —
// they aren't built from it at all).

export const DAY_COUNTERS = [
  { id: 'kanji-day-1', number: 1, kanji: '一日', reading: 'ついたち', romaji: 'tsuitachi', root: null, note: 'Irregular — unrelated to いち or か, unlike every other day below.' },
  { id: 'kanji-day-2', number: 2, kanji: '二日', reading: 'ふつか', romaji: 'futsuka', root: 'ふ' },
  { id: 'kanji-day-3', number: 3, kanji: '三日', reading: 'みっか', romaji: 'mikka', root: 'み', note: 'Small っ doubles the k — not み+か as you might expect.' },
  { id: 'kanji-day-4', number: 4, kanji: '四日', reading: 'よっか', romaji: 'yokka', root: 'よ', note: 'Same small-っ doubling as みっか.' },
  { id: 'kanji-day-5', number: 5, kanji: '五日', reading: 'いつか', romaji: 'itsuka', root: 'いつ' },
  { id: 'kanji-day-6', number: 6, kanji: '六日', reading: 'むいか', romaji: 'muika', root: 'む', note: '六 switches to its kun reading む here, not ろく — and gets an inserted い before か.' },
  { id: 'kanji-day-7', number: 7, kanji: '七日', reading: 'なのか', romaji: 'nanoka', root: 'なな', note: 'Naive root+か would be ななか — the second な becomes の instead.' },
  { id: 'kanji-day-8', number: 8, kanji: '八日', reading: 'ようか', romaji: 'youka', root: 'や', note: 'や stretches to よう — the biggest jump from its root of any day here.' },
  { id: 'kanji-day-9', number: 9, kanji: '九日', reading: 'ここのか', romaji: 'kokonoka', root: 'ここの' },
  { id: 'kanji-day-10', number: 10, kanji: '十日', reading: 'とおか', romaji: 'tooka', root: 'と', note: 'と lengthens to とお, loosely similar to how や stretches to よう above.' },
]

export const THING_COUNTERS = [
  { id: 'kanji-thing-1', number: 1, kanji: '一つ', reading: 'ひとつ', romaji: 'hitotsu', root: 'ひ' },
  { id: 'kanji-thing-2', number: 2, kanji: '二つ', reading: 'ふたつ', romaji: 'futatsu', root: 'ふ' },
  { id: 'kanji-thing-3', number: 3, kanji: '三つ', reading: 'みっつ', romaji: 'mittsu', root: 'み' },
  { id: 'kanji-thing-4', number: 4, kanji: '四つ', reading: 'よっつ', romaji: 'yottsu', root: 'よ' },
  { id: 'kanji-thing-5', number: 5, kanji: '五つ', reading: 'いつつ', romaji: 'itsutsu', root: 'いつ' },
  { id: 'kanji-thing-6', number: 6, kanji: '六つ', reading: 'むっつ', romaji: 'muttsu', root: 'む' },
  { id: 'kanji-thing-7', number: 7, kanji: '七つ', reading: 'ななつ', romaji: 'nanatsu', root: 'なな' },
  { id: 'kanji-thing-8', number: 8, kanji: '八つ', reading: 'やっつ', romaji: 'yattsu', root: 'や' },
  { id: 'kanji-thing-9', number: 9, kanji: '九つ', reading: 'ここのつ', romaji: 'kokonotsu', root: 'ここの' },
  { id: 'kanji-thing-10', number: 10, kanji: '十', reading: 'とお', romaji: 'too', root: 'と', note: 'Breaks the pattern — no つ suffix, and the kanji is bare 十 (same as the number ten).' },
]

// PEOPLE_COUNTERS uses a different `root` system than the two sets above:
// 3-10 are built on the ordinary Sino-Japanese cardinal numbers (さん, ご,
// ろく, ...) plus にん, not the native Yamato roots. 1 and 2 break from that
// pattern entirely (ひとり/ふたり are native-Japanese words with no にん at
// all) — this table's irregular zone sits at the start, unlike THING_COUNTERS
// where only 10 breaks the pattern.
export const PEOPLE_COUNTERS = [
  { id: 'kanji-people-1', number: 1, kanji: '一人', reading: 'ひとり', romaji: 'hitori', root: null, note: 'Irregular — native ひとり, not いち+にん.' },
  { id: 'kanji-people-2', number: 2, kanji: '二人', reading: 'ふたり', romaji: 'futari', root: null, note: 'Also irregular — native ふたり, not に+にん.' },
  { id: 'kanji-people-3', number: 3, kanji: '三人', reading: 'さんにん', romaji: 'sannin', root: 'さん' },
  { id: 'kanji-people-4', number: 4, kanji: '四人', reading: 'よにん', romaji: 'yonin', root: 'よん', note: 'Drops the ん from よん before にん — not よんにん.' },
  { id: 'kanji-people-5', number: 5, kanji: '五人', reading: 'ごにん', romaji: 'gonin', root: 'ご' },
  { id: 'kanji-people-6', number: 6, kanji: '六人', reading: 'ろくにん', romaji: 'rokunin', root: 'ろく' },
  { id: 'kanji-people-7', number: 7, kanji: '七人', reading: 'しちにん', romaji: 'shichinin', root: 'しち', note: 'ななにん (the なな reading instead of しち) is also common.' },
  { id: 'kanji-people-8', number: 8, kanji: '八人', reading: 'はちにん', romaji: 'hachinin', root: 'はち' },
  { id: 'kanji-people-9', number: 9, kanji: '九人', reading: 'きゅうにん', romaji: 'kyuunin', root: 'きゅう' },
  { id: 'kanji-people-10', number: 10, kanji: '十人', reading: 'じゅうにん', romaji: 'juunin', root: 'じゅう' },
]
