/**
 * Global and ambient type declarations for browser extensions & Web APIs.
 */

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
    onbeforeinstallprompt?: ((event: Event) => void) | null;
  }
}

declare module '*.css';
