// Speaks Japanese text via the browser's built-in Web Speech API — no audio
// files, no server, just whatever TTS voice the visitor's OS/browser
// provides. Prefers macOS's "Kyoko" voice (every device this app is used on
// has it installed and it's noticeably better than the alternatives), falls
// back to any other Japanese voice, and finally to just requesting ja-JP by
// lang if no matching voice is installed at all.
function pickVoice() {
  const voices = window.speechSynthesis.getVoices()
  return voices.find((v) => v.name === 'Kyoko') || voices.find((v) => v.lang.startsWith('ja')) || null
}

export function useSpeech() {
  function speak(text) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    window.speechSynthesis.cancel() // stop anything already playing
    const utterance = new SpeechSynthesisUtterance(text)
    const voice = pickVoice()
    if (voice) utterance.voice = voice
    else utterance.lang = 'ja-JP'
    window.speechSynthesis.speak(utterance)
  }

  return { speak }
}
