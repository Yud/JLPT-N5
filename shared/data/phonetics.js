// Hebrew-anchored pronunciation notes for the handful of kana that map
// poorly onto Hebrew phonology if read at face value from their romaji.
// Most kana map cleanly enough to a Hebrew letter/sound that no note is
// needed; these are the known exceptions. Keyed by the card's permanent id
// (see kana.js/katakana.js) so a note travels with a character regardless
// of which script's reference table renders it.

const RA_ROW_NOTE =
  "Not a Lamed, not a Resh — it's a single light tap. Relax your tongue into the vowel shape you're about to make, then let the tongue tip flick the ridge once and release straight into the vowel. No lateral airflow (that's what makes a Lamed a Lamed) and no rolling or throat friction (that's Resh)."

const CHI_NOTE =
  "Like the \"ch\" in צ'יפס (chips) or צ'ק (check) — tsadi + geresh. Not related to plain צ, which is the sound in つ (tsu)."

const WA_NOTE =
  'Like English "w" in "water", but keep your lips loose and flat — Hebrew has no real equivalent (ו is a buzzy v-sound, not this), and English over-rounds the lips more than Japanese does.'

export const PHONETIC_NOTES = {
  'hiragana-ra': RA_ROW_NOTE,
  'hiragana-ri': RA_ROW_NOTE,
  'hiragana-ru': RA_ROW_NOTE,
  'hiragana-re': RA_ROW_NOTE,
  'hiragana-ro': RA_ROW_NOTE,
  'katakana-ra': RA_ROW_NOTE,
  'katakana-ri': RA_ROW_NOTE,
  'katakana-ru': RA_ROW_NOTE,
  'katakana-re': RA_ROW_NOTE,
  'katakana-ro': RA_ROW_NOTE,
  'hiragana-chi': CHI_NOTE,
  'katakana-chi': CHI_NOTE,
  'hiragana-wa': WA_NOTE,
  'katakana-wa': WA_NOTE,
}
