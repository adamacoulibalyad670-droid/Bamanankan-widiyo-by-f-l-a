export interface AudioSegment {
  id: number;
  start: number; // in seconds
  end: number;   // in seconds
  speaker?: string;
  originalText: string;
  bambaraText: string;
}

export interface VocabularyNote {
  bambara: string;
  phonetic?: string;
  french?: string;
  english: string;
  context?: string;
}

export interface Speaker {
  id: string;
  name: string;
  bambaraName: string;
  gender: 'female' | 'male';
  archetype: string;
  accent: string;
  pitch: number;
  speed: number;
  description: string;
  geminiVoice: string;
  avatarColor: string;
}

export interface SampleVideo {
  id: string;
  title: string;
  titleBambara: string;
  language: string;
  duration: number; // in seconds
  videoUrl: string;
  thumbnail: string;
  sampleTranscript: string;
  sampleBambara: string;
}

export interface ClonedVoiceProfile {
  detectedGender: 'female' | 'male';
  pitchHz: number;
  pitchDescription: string;
  speedFactor: number;
  suggestedGeminiVoice: string;
  vocalTone: string;
  timbreMatchScore: number;
  acousticSignaturePrompt: string;
  isCloningActive: boolean;
}

export interface DubbingState {
  step: 'upload' | 'speaker' | 'transcribe' | 'translate' | 'synthesize' | 'complete';
  isProcessing: boolean;
  processingMessage: string;
  error: string | null;
  videoUrl: string | null;
  videoFileName: string | null;
  videoDuration: number;
  mediaBase64: string | null;
  mimeType: string;
  selectedSpeaker: Speaker;
  clonedVoiceProfile?: ClonedVoiceProfile | null;
  originalLanguage: string;
  fullOriginalText: string;
  fullBambaraText: string;
  segments: AudioSegment[];
  vocabularyNotes: VocabularyNote[];
  dubbedAudioUrl: string | null;
  dubbedVolume: number; // 0 to 1
  originalVolume: number; // 0 to 1
  autoTranslate: boolean;
  customPrompt: string;
}
