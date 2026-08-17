// Curated vocabulary. Originally just romaji+kana pairs for the writing
// exercise (US3); now also the source of the Vocabulary reference/flashcard
// pillar, so every entry additionally carries a permanent `id`, the
// conventional `kanji` form (equal to the kana string for words normally
// written in kana only — no null-check needed at render time), an English
// `meaning`, and a thematic `category`.
//
// Every glyph in `kana` must exist in KANA (src/data/kana.js) — enforced by
// words.test.js. KANA has no small-っ (sokuon) entry, so words requiring one
// (e.g. がっこう) are deliberately excluded from this list for now.
//
// `id` follows the same permanent, explicit convention as kana.js's card
// ids (`vocab-<romaji>`) — never recomputed from other fields, since it's
// what spaced-repetition review state is keyed on (see src/data/decks.js).
// A few words are true homophones with unrelated kanji (e.g. はな "flower"
// 花 vs はな "nose" 鼻); those get a disambiguated id suffix since `romaji`
// alone isn't required to be unique, but `id` must be.

export const WORDS = [
  // Greetings
  { id: 'vocab-ohayou', kanji: 'おはよう', kana: ['お', 'は', 'よ', 'う'], romaji: 'ohayou', meaning: 'good morning', category: 'greetings' },
  { id: 'vocab-konnichiwa', kanji: 'こんにちは', kana: ['こ', 'ん', 'に', 'ち', 'は'], romaji: 'konnichiwa', meaning: 'hello / good afternoon', category: 'greetings' },
  { id: 'vocab-konbanwa', kanji: 'こんばんは', kana: ['こ', 'ん', 'ば', 'ん', 'は'], romaji: 'konbanwa', meaning: 'good evening', category: 'greetings' },
  { id: 'vocab-oyasuminasai', kanji: 'おやすみなさい', kana: ['お', 'や', 'す', 'み', 'な', 'さ', 'い'], romaji: 'oyasuminasai', meaning: 'good night', category: 'greetings' },
  { id: 'vocab-sayounara', kanji: 'さようなら', kana: ['さ', 'よ', 'う', 'な', 'ら'], romaji: 'sayounara', meaning: 'goodbye', category: 'greetings' },
  { id: 'vocab-arigatou', kanji: 'ありがとう', kana: ['あ', 'り', 'が', 'と', 'う'], romaji: 'arigatou', meaning: 'thank you', category: 'greetings' },
  { id: 'vocab-sumimasen', kanji: 'すみません', kana: ['す', 'み', 'ま', 'せ', 'ん'], romaji: 'sumimasen', meaning: 'excuse me / sorry', category: 'greetings' },
  { id: 'vocab-hajimemashite', kanji: 'はじめまして', kana: ['は', 'じ', 'め', 'ま', 'し', 'て'], romaji: 'hajimemashite', meaning: 'nice to meet you', category: 'greetings' },
  { id: 'vocab-itadakimasu', kanji: 'いただきます', kana: ['い', 'た', 'だ', 'き', 'ま', 'す'], romaji: 'itadakimasu', meaning: '(said before eating)', category: 'greetings' },
  { id: 'vocab-tadaima', kanji: 'ただいま', kana: ['た', 'だ', 'い', 'ま'], romaji: 'tadaima', meaning: "I'm home", category: 'greetings' },

  // Numbers
  { id: 'vocab-ichi', kanji: '一', kana: ['い', 'ち'], romaji: 'ichi', meaning: 'one', category: 'numbers' },
  { id: 'vocab-ni', kanji: '二', kana: ['に'], romaji: 'ni', meaning: 'two', category: 'numbers' },
  { id: 'vocab-san', kanji: '三', kana: ['さ', 'ん'], romaji: 'san', meaning: 'three', category: 'numbers' },
  { id: 'vocab-yon', kanji: '四', kana: ['よ', 'ん'], romaji: 'yon', meaning: 'four', category: 'numbers' },
  { id: 'vocab-go', kanji: '五', kana: ['ご'], romaji: 'go', meaning: 'five', category: 'numbers' },
  { id: 'vocab-roku', kanji: '六', kana: ['ろ', 'く'], romaji: 'roku', meaning: 'six', category: 'numbers' },
  { id: 'vocab-nana', kanji: '七', kana: ['な', 'な'], romaji: 'nana', meaning: 'seven', category: 'numbers' },
  { id: 'vocab-hachi', kanji: '八', kana: ['は', 'ち'], romaji: 'hachi', meaning: 'eight', category: 'numbers' },
  { id: 'vocab-kyuu', kanji: '九', kana: ['きゅ', 'う'], romaji: 'kyuu', meaning: 'nine', category: 'numbers' },
  { id: 'vocab-juu', kanji: '十', kana: ['じゅ', 'う'], romaji: 'juu', meaning: 'ten', category: 'numbers' },
  { id: 'vocab-hyaku', kanji: '百', kana: ['ひゃ', 'く'], romaji: 'hyaku', meaning: 'hundred', category: 'numbers' },
  { id: 'vocab-sen', kanji: '千', kana: ['せ', 'ん'], romaji: 'sen', meaning: 'thousand', category: 'numbers' },

  // Family
  { id: 'vocab-kazoku', kanji: '家族', kana: ['か', 'ぞ', 'く'], romaji: 'kazoku', meaning: 'family', category: 'family' },
  { id: 'vocab-chichi', kanji: '父', kana: ['ち', 'ち'], romaji: 'chichi', meaning: 'father (own)', category: 'family' },
  { id: 'vocab-haha', kanji: '母', kana: ['は', 'は'], romaji: 'haha', meaning: 'mother (own)', category: 'family' },
  { id: 'vocab-ani', kanji: '兄', kana: ['あ', 'に'], romaji: 'ani', meaning: 'older brother (own)', category: 'family' },
  { id: 'vocab-ane', kanji: '姉', kana: ['あ', 'ね'], romaji: 'ane', meaning: 'older sister (own)', category: 'family' },
  { id: 'vocab-otouto', kanji: '弟', kana: ['お', 'と', 'う', 'と'], romaji: 'otouto', meaning: 'younger brother', category: 'family' },
  { id: 'vocab-imouto', kanji: '妹', kana: ['い', 'も', 'う', 'と'], romaji: 'imouto', meaning: 'younger sister', category: 'family' },
  { id: 'vocab-kodomo', kanji: '子供', kana: ['こ', 'ど', 'も'], romaji: 'kodomo', meaning: 'child', category: 'family' },

  // People
  { id: 'vocab-hito', kanji: '人', kana: ['ひ', 'と'], romaji: 'hito', meaning: 'person', category: 'people' },
  { id: 'vocab-tomodachi', kanji: '友達', kana: ['と', 'も', 'だ', 'ち'], romaji: 'tomodachi', meaning: 'friend', category: 'people' },
  { id: 'vocab-sensei', kanji: '先生', kana: ['せ', 'ん', 'せ', 'い'], romaji: 'sensei', meaning: 'teacher', category: 'people' },
  { id: 'vocab-gakusei', kanji: '学生', kana: ['が', 'く', 'せ', 'い'], romaji: 'gakusei', meaning: 'student', category: 'people' },
  { id: 'vocab-watashi', kanji: '私', kana: ['わ', 'た', 'し'], romaji: 'watashi', meaning: 'I / me', category: 'people' },
  { id: 'vocab-anata', kanji: 'あなた', kana: ['あ', 'な', 'た'], romaji: 'anata', meaning: 'you', category: 'people' },

  // Time
  { id: 'vocab-kyou', kanji: '今日', kana: ['きょ', 'う'], romaji: 'kyou', meaning: 'today', category: 'time' },
  { id: 'vocab-ashita', kanji: '明日', kana: ['あ', 'し', 'た'], romaji: 'ashita', meaning: 'tomorrow', category: 'time' },
  { id: 'vocab-kinou', kanji: '昨日', kana: ['き', 'の', 'う'], romaji: 'kinou', meaning: 'yesterday', category: 'time' },
  { id: 'vocab-ima', kanji: '今', kana: ['い', 'ま'], romaji: 'ima', meaning: 'now', category: 'time' },
  { id: 'vocab-gogo', kanji: '午後', kana: ['ご', 'ご'], romaji: 'gogo', meaning: 'afternoon / p.m.', category: 'time' },
  { id: 'vocab-gozen', kanji: '午前', kana: ['ご', 'ぜ', 'ん'], romaji: 'gozen', meaning: 'morning / a.m.', category: 'time' },
  { id: 'vocab-asa', kanji: '朝', kana: ['あ', 'さ'], romaji: 'asa', meaning: 'morning', category: 'time' },
  { id: 'vocab-hiru', kanji: '昼', kana: ['ひ', 'る'], romaji: 'hiru', meaning: 'noon / daytime', category: 'time' },
  { id: 'vocab-yoru', kanji: '夜', kana: ['よ', 'る'], romaji: 'yoru', meaning: 'night', category: 'time' },
  { id: 'vocab-mainichi', kanji: '毎日', kana: ['ま', 'い', 'に', 'ち'], romaji: 'mainichi', meaning: 'every day', category: 'time' },
  { id: 'vocab-jikan', kanji: '時間', kana: ['じ', 'か', 'ん'], romaji: 'jikan', meaning: 'time / hour(s)', category: 'time' },
  { id: 'vocab-tokei', kanji: '時計', kana: ['と', 'け', 'い'], romaji: 'tokei', meaning: 'clock / watch', category: 'time' },

  // Food & Drink
  { id: 'vocab-sushi', kanji: '寿司', kana: ['す', 'し'], romaji: 'sushi', meaning: 'sushi', category: 'food' },
  { id: 'vocab-gohan', kanji: 'ご飯', kana: ['ご', 'は', 'ん'], romaji: 'gohan', meaning: 'rice / meal', category: 'food' },
  { id: 'vocab-tabemono', kanji: '食べ物', kana: ['た', 'べ', 'も', 'の'], romaji: 'tabemono', meaning: 'food', category: 'food' },
  { id: 'vocab-nomimono', kanji: '飲み物', kana: ['の', 'み', 'も', 'の'], romaji: 'nomimono', meaning: 'drink', category: 'food' },
  { id: 'vocab-ocha', kanji: 'お茶', kana: ['お', 'ちゃ'], romaji: 'ocha', meaning: 'tea', category: 'food' },
  { id: 'vocab-mizu', kanji: '水', kana: ['み', 'ず'], romaji: 'mizu', meaning: 'water', category: 'food' },
  { id: 'vocab-tamago', kanji: '卵', kana: ['た', 'ま', 'ご'], romaji: 'tamago', meaning: 'egg', category: 'food' },
  { id: 'vocab-ringo', kanji: 'りんご', kana: ['り', 'ん', 'ご'], romaji: 'ringo', meaning: 'apple', category: 'food' },
  { id: 'vocab-gyoza', kanji: '餃子', kana: ['ぎょ', 'う', 'ざ'], romaji: 'gyoza', meaning: 'dumpling', category: 'food' },
  { id: 'vocab-jagaimo', kanji: 'じゃがいも', kana: ['じゃ', 'が', 'い', 'も'], romaji: 'jagaimo', meaning: 'potato', category: 'food' },
  { id: 'vocab-asagohan', kanji: '朝ご飯', kana: ['あ', 'さ', 'ご', 'は', 'ん'], romaji: 'asagohan', meaning: 'breakfast', category: 'food' },
  { id: 'vocab-hashi', kanji: '箸', kana: ['は', 'し'], romaji: 'hashi', meaning: 'chopsticks', category: 'food' },

  // Body
  { id: 'vocab-karada', kanji: '体', kana: ['か', 'ら', 'だ'], romaji: 'karada', meaning: 'body', category: 'body' },
  { id: 'vocab-atama', kanji: '頭', kana: ['あ', 'た', 'ま'], romaji: 'atama', meaning: 'head', category: 'body' },
  { id: 'vocab-me', kanji: '目', kana: ['め'], romaji: 'me', meaning: 'eye', category: 'body' },
  { id: 'vocab-mimi', kanji: '耳', kana: ['み', 'み'], romaji: 'mimi', meaning: 'ear', category: 'body' },
  { id: 'vocab-hana-nose', kanji: '鼻', kana: ['は', 'な'], romaji: 'hana', meaning: 'nose', category: 'body' },
  { id: 'vocab-kuchi', kanji: '口', kana: ['く', 'ち'], romaji: 'kuchi', meaning: 'mouth', category: 'body' },
  { id: 'vocab-te', kanji: '手', kana: ['て'], romaji: 'te', meaning: 'hand', category: 'body' },
  { id: 'vocab-ashi', kanji: '足', kana: ['あ', 'し'], romaji: 'ashi', meaning: 'foot / leg', category: 'body' },

  // Nature & Weather
  { id: 'vocab-sakura', kanji: '桜', kana: ['さ', 'く', 'ら'], romaji: 'sakura', meaning: 'cherry blossom', category: 'nature' },
  { id: 'vocab-umi', kanji: '海', kana: ['う', 'み'], romaji: 'umi', meaning: 'sea', category: 'nature' },
  { id: 'vocab-yama', kanji: '山', kana: ['や', 'ま'], romaji: 'yama', meaning: 'mountain', category: 'nature' },
  { id: 'vocab-kawa', kanji: '川', kana: ['か', 'わ'], romaji: 'kawa', meaning: 'river', category: 'nature' },
  { id: 'vocab-hana', kanji: '花', kana: ['は', 'な'], romaji: 'hana', meaning: 'flower', category: 'nature' },
  { id: 'vocab-tenki', kanji: '天気', kana: ['て', 'ん', 'き'], romaji: 'tenki', meaning: 'weather', category: 'nature' },
  { id: 'vocab-ame', kanji: '雨', kana: ['あ', 'め'], romaji: 'ame', meaning: 'rain', category: 'nature' },
  { id: 'vocab-yuki', kanji: '雪', kana: ['ゆ', 'き'], romaji: 'yuki', meaning: 'snow', category: 'nature' },
  { id: 'vocab-kaze', kanji: '風', kana: ['か', 'ぜ'], romaji: 'kaze', meaning: 'wind', category: 'nature' },

  // Animals
  { id: 'vocab-inu', kanji: '犬', kana: ['い', 'ぬ'], romaji: 'inu', meaning: 'dog', category: 'animals' },
  { id: 'vocab-neko', kanji: '猫', kana: ['ね', 'こ'], romaji: 'neko', meaning: 'cat', category: 'animals' },
  { id: 'vocab-tori', kanji: '鳥', kana: ['と', 'り'], romaji: 'tori', meaning: 'bird', category: 'animals' },
  { id: 'vocab-kaeru', kanji: 'かえる', kana: ['か', 'え', 'る'], romaji: 'kaeru', meaning: 'frog', category: 'animals' },
  { id: 'vocab-sakana', kanji: '魚', kana: ['さ', 'か', 'な'], romaji: 'sakana', meaning: 'fish', category: 'animals' },

  // Everyday Things
  { id: 'vocab-tsukue', kanji: '机', kana: ['つ', 'く', 'え'], romaji: 'tsukue', meaning: 'desk', category: 'things' },
  { id: 'vocab-denwa', kanji: '電話', kana: ['で', 'ん', 'わ'], romaji: 'denwa', meaning: 'telephone', category: 'things' },
  { id: 'vocab-tegami', kanji: '手紙', kana: ['て', 'が', 'み'], romaji: 'tegami', meaning: 'letter', category: 'things' },
  { id: 'vocab-kaban', kanji: 'かばん', kana: ['か', 'ば', 'ん'], romaji: 'kaban', meaning: 'bag', category: 'things' },
  { id: 'vocab-jisho', kanji: '辞書', kana: ['じ', 'しょ'], romaji: 'jisho', meaning: 'dictionary', category: 'things' },
  { id: 'vocab-shashin', kanji: '写真', kana: ['しゃ', 'し', 'ん'], romaji: 'shashin', meaning: 'photo', category: 'things' },
  { id: 'vocab-enpitsu', kanji: '鉛筆', kana: ['え', 'ん', 'ぴ', 'つ'], romaji: 'enpitsu', meaning: 'pencil', category: 'things' },
  { id: 'vocab-ie', kanji: '家', kana: ['い', 'え'], romaji: 'ie', meaning: 'house', category: 'things' },
  { id: 'vocab-heya', kanji: '部屋', kana: ['へ', 'や'], romaji: 'heya', meaning: 'room', category: 'things' },
  { id: 'vocab-mado', kanji: '窓', kana: ['ま', 'ど'], romaji: 'mado', meaning: 'window', category: 'things' },
  { id: 'vocab-densha', kanji: '電車', kana: ['で', 'ん', 'しゃ'], romaji: 'densha', meaning: 'train', category: 'things' },
  { id: 'vocab-kuruma', kanji: '車', kana: ['く', 'る', 'ま'], romaji: 'kuruma', meaning: 'car', category: 'things' },

  // School
  { id: 'vocab-hon', kanji: '本', kana: ['ほ', 'ん'], romaji: 'hon', meaning: 'book', category: 'school' },
  { id: 'vocab-benkyou', kanji: '勉強', kana: ['べ', 'ん', 'きょ', 'う'], romaji: 'benkyou', meaning: 'study', category: 'school' },
  { id: 'vocab-kyoushitsu', kanji: '教室', kana: ['きょ', 'う', 'し', 'つ'], romaji: 'kyoushitsu', meaning: 'classroom', category: 'school' },
  { id: 'vocab-kyoukasho', kanji: '教科書', kana: ['きょ', 'う', 'か', 'しょ'], romaji: 'kyoukasho', meaning: 'textbook', category: 'school' },

  // Colors
  { id: 'vocab-aka', kanji: '赤', kana: ['あ', 'か'], romaji: 'aka', meaning: 'red', category: 'colors' },
  { id: 'vocab-ao', kanji: '青', kana: ['あ', 'お'], romaji: 'ao', meaning: 'blue', category: 'colors' },
  { id: 'vocab-shiro', kanji: '白', kana: ['し', 'ろ'], romaji: 'shiro', meaning: 'white', category: 'colors' },
  { id: 'vocab-kuro', kanji: '黒', kana: ['く', 'ろ'], romaji: 'kuro', meaning: 'black', category: 'colors' },
  { id: 'vocab-kiiro', kanji: '黄色', kana: ['き', 'い', 'ろ'], romaji: 'kiiro', meaning: 'yellow', category: 'colors' },
  { id: 'vocab-midori', kanji: '緑', kana: ['み', 'ど', 'り'], romaji: 'midori', meaning: 'green', category: 'colors' },

  // Verbs
  { id: 'vocab-taberu', kanji: '食べる', kana: ['た', 'べ', 'る'], romaji: 'taberu', meaning: 'to eat', category: 'verbs' },
  { id: 'vocab-nomu', kanji: '飲む', kana: ['の', 'む'], romaji: 'nomu', meaning: 'to drink', category: 'verbs' },
  { id: 'vocab-iku', kanji: '行く', kana: ['い', 'く'], romaji: 'iku', meaning: 'to go', category: 'verbs' },
  { id: 'vocab-kuru', kanji: '来る', kana: ['く', 'る'], romaji: 'kuru', meaning: 'to come', category: 'verbs' },
  { id: 'vocab-miru', kanji: '見る', kana: ['み', 'る'], romaji: 'miru', meaning: 'to see / watch', category: 'verbs' },
  { id: 'vocab-kiku', kanji: '聞く', kana: ['き', 'く'], romaji: 'kiku', meaning: 'to listen / ask', category: 'verbs' },
  { id: 'vocab-yomu', kanji: '読む', kana: ['よ', 'む'], romaji: 'yomu', meaning: 'to read', category: 'verbs' },
  { id: 'vocab-kaku', kanji: '書く', kana: ['か', 'く'], romaji: 'kaku', meaning: 'to write', category: 'verbs' },
  { id: 'vocab-hanasu', kanji: '話す', kana: ['は', 'な', 'す'], romaji: 'hanasu', meaning: 'to speak', category: 'verbs' },
  { id: 'vocab-wakaru', kanji: '分かる', kana: ['わ', 'か', 'る'], romaji: 'wakaru', meaning: 'to understand', category: 'verbs' },

  // Adjectives
  { id: 'vocab-ookii', kanji: '大きい', kana: ['お', 'お', 'き', 'い'], romaji: 'ookii', meaning: 'big', category: 'adjectives' },
  { id: 'vocab-chiisai', kanji: '小さい', kana: ['ち', 'い', 'さ', 'い'], romaji: 'chiisai', meaning: 'small', category: 'adjectives' },
  { id: 'vocab-atarashii', kanji: '新しい', kana: ['あ', 'た', 'ら', 'し', 'い'], romaji: 'atarashii', meaning: 'new', category: 'adjectives' },
  { id: 'vocab-furui', kanji: '古い', kana: ['ふ', 'る', 'い'], romaji: 'furui', meaning: 'old', category: 'adjectives' },
  { id: 'vocab-ii', kanji: 'いい', kana: ['い', 'い'], romaji: 'ii', meaning: 'good', category: 'adjectives' },
  { id: 'vocab-warui', kanji: '悪い', kana: ['わ', 'る', 'い'], romaji: 'warui', meaning: 'bad', category: 'adjectives' },
  { id: 'vocab-takai', kanji: '高い', kana: ['た', 'か', 'い'], romaji: 'takai', meaning: 'expensive / tall', category: 'adjectives' },
  { id: 'vocab-yasui', kanji: '安い', kana: ['や', 'す', 'い'], romaji: 'yasui', meaning: 'cheap', category: 'adjectives' },
  { id: 'vocab-oishii', kanji: 'おいしい', kana: ['お', 'い', 'し', 'い'], romaji: 'oishii', meaning: 'delicious', category: 'adjectives' },
  { id: 'vocab-samui', kanji: '寒い', kana: ['さ', 'む', 'い'], romaji: 'samui', meaning: 'cold (weather)', category: 'adjectives' },
  { id: 'vocab-atsui', kanji: '暑い', kana: ['あ', 'つ', 'い'], romaji: 'atsui', meaning: 'hot (weather)', category: 'adjectives' },
]

const CATEGORY_LABELS = {
  greetings: 'Greetings',
  numbers: 'Numbers',
  family: 'Family',
  people: 'People',
  time: 'Time',
  food: 'Food & Drink',
  body: 'Body',
  nature: 'Nature & Weather',
  animals: 'Animals',
  things: 'Everyday Things',
  school: 'School',
  colors: 'Colors',
  verbs: 'Verbs',
  adjectives: 'Adjectives',
}

/**
 * Selectable vocab flashcard scopes: one per category (in the order
 * categories first appear in WORDS), plus "all". Mirrors kana.js's
 * getPracticeGroups so the vocab scope picker behaves identically to the
 * hiragana one.
 */
export function getVocabCategories() {
  const seen = new Set()
  const categoryGroups = []
  for (const word of WORDS) {
    if (seen.has(word.category)) continue
    seen.add(word.category)
    categoryGroups.push({ id: word.category, label: CATEGORY_LABELS[word.category] ?? word.category, kind: 'category' })
  }
  return [...categoryGroups, { id: 'all', label: 'All words', kind: 'all' }]
}

/**
 * Returns every word belonging to a category id or "all". `categoryId` may
 * also be an array of ids, in which case the union of their words is
 * returned (deduplicated) — same contract as kana.js's getCharactersForGroup.
 */
export function getWordsForCategory(categoryId) {
  const ids = Array.isArray(categoryId) ? categoryId : [categoryId]
  if (ids.includes('all')) return WORDS

  const seen = new Set()
  const result = []
  for (const id of ids) {
    for (const word of WORDS.filter((w) => w.category === id)) {
      if (!seen.has(word)) {
        seen.add(word)
        result.push(word)
      }
    }
  }
  return result
}
