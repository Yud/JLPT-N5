// Kanji reference sets for readings that don't follow a predictable
// pattern — the counters (days of the month, and the native/Yamato つ
// counter for general objects). Flashcard drilling for these already
// happens in WaniKani; this file only backs the in-app reference table,
// so the whole irregular set can be seen at once and the exceptions (e.g.
// 一日 not ending in -ka, 十 dropping the つ) are easy to spot side by side.
//
// `id` follows the same permanent, explicit convention as kana.js/words.js
// (never recomputed from other fields) in case a flashcard/SRS scope is
// added for this pillar later.

export const DAY_COUNTERS = [
  { id: 'kanji-day-1', number: 1, kanji: '一日', reading: 'ついたち', romaji: 'tsuitachi', note: 'Irregular — unrelated to いち or か, unlike every other day below.' },
  { id: 'kanji-day-2', number: 2, kanji: '二日', reading: 'ふつか', romaji: 'futsuka' },
  { id: 'kanji-day-3', number: 3, kanji: '三日', reading: 'みっか', romaji: 'mikka', note: 'Small っ doubles the k — not み+か as you might expect.' },
  { id: 'kanji-day-4', number: 4, kanji: '四日', reading: 'よっか', romaji: 'yokka' },
  { id: 'kanji-day-5', number: 5, kanji: '五日', reading: 'いつか', romaji: 'itsuka' },
  { id: 'kanji-day-6', number: 6, kanji: '六日', reading: 'むいか', romaji: 'muika', note: '六 switches to its kun reading む here, not ろく.' },
  { id: 'kanji-day-7', number: 7, kanji: '七日', reading: 'なのか', romaji: 'nanoka' },
  { id: 'kanji-day-8', number: 8, kanji: '八日', reading: 'ようか', romaji: 'youka', note: 'はち becomes よう, same shift as 八 in some other date/counter words.' },
  { id: 'kanji-day-9', number: 9, kanji: '九日', reading: 'ここのか', romaji: 'kokonoka' },
  { id: 'kanji-day-10', number: 10, kanji: '十日', reading: 'とおか', romaji: 'tooka' },
]

export const THING_COUNTERS = [
  { id: 'kanji-thing-1', number: 1, kanji: '一つ', reading: 'ひとつ', romaji: 'hitotsu' },
  { id: 'kanji-thing-2', number: 2, kanji: '二つ', reading: 'ふたつ', romaji: 'futatsu' },
  { id: 'kanji-thing-3', number: 3, kanji: '三つ', reading: 'みっつ', romaji: 'mittsu' },
  { id: 'kanji-thing-4', number: 4, kanji: '四つ', reading: 'よっつ', romaji: 'yottsu' },
  { id: 'kanji-thing-5', number: 5, kanji: '五つ', reading: 'いつつ', romaji: 'itsutsu' },
  { id: 'kanji-thing-6', number: 6, kanji: '六つ', reading: 'むっつ', romaji: 'muttsu' },
  { id: 'kanji-thing-7', number: 7, kanji: '七つ', reading: 'ななつ', romaji: 'nanatsu' },
  { id: 'kanji-thing-8', number: 8, kanji: '八つ', reading: 'やっつ', romaji: 'yattsu' },
  { id: 'kanji-thing-9', number: 9, kanji: '九つ', reading: 'ここのつ', romaji: 'kokonotsu' },
  { id: 'kanji-thing-10', number: 10, kanji: '十', reading: 'とお', romaji: 'too', note: 'Breaks the pattern — no つ suffix, and the kanji is bare 十 (same as the number ten).' },
]
