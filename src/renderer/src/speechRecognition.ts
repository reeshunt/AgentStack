/**
 * Minimal typing for the (still non-standardized-in-lib.dom) Web Speech API
 * constructor, feature-detected at runtime — Chromium/Electron ships it as
 * `webkitSpeechRecognition`; some builds also expose the unprefixed name.
 */
export interface SpeechRecognitionInstance {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  onresult: ((event: { results: SpeechRecognitionResultList }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

export function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}
