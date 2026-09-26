import React, { useState, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { VideoUploader } from './components/VideoUploader';
import { SpeakerSelector } from './components/SpeakerSelector';
import { DubbingProgress } from './components/DubbingProgress';
import { TranscriptEditor } from './components/TranscriptEditor';
import { VideoPlayerSync } from './components/VideoPlayerSync';
import { ExportModal } from './components/ExportModal';
import { VoiceCloningCard } from './components/VoiceCloningCard';
import { BAMBARA_SPEAKERS } from './data/speakers';
import { SAMPLE_VIDEOS } from './data/samples';
import { DubbingState, Speaker, SampleVideo, AudioSegment, ClonedVoiceProfile } from './types';
import { normalizeBambaraText, reviewBambaraGrammar } from './utils/bambaraNormalizer';
import { fetchTTSWithBackoff, fetchTranslateWithBackoff, fetchTranscribeWithBackoff } from './utils/apiClient';
import { extractAudioFromMedia } from './utils/audioExtractor';
import { Video, Mic, Languages, Film, Sparkles, RefreshCw, Zap, Play } from 'lucide-react';

export default function App() {
  const [state, setState] = useState<DubbingState>({
    step: 'upload',
    isProcessing: false,
    processingMessage: '',
    error: null,
    videoUrl: null,
    videoFileName: null,
    videoDuration: 12,
    mediaBase64: null,
    mimeType: 'video/mp4',
    selectedSpeaker: BAMBARA_SPEAKERS[0], // Auto Voice Clone Signature
    clonedVoiceProfile: {
      detectedGender: 'male',
      pitchHz: 145,
      pitchDescription: 'نبرة صوتية وقورة متزنة',
      speedFactor: 1.0,
      suggestedGeminiVoice: 'Puck',
      vocalTone: 'وقور ومتزن (Dignified)',
      timbreMatchScore: 98.6,
      acousticSignaturePrompt: 'Mirror reference speaker acoustic timbre and cadence',
      isCloningActive: true,
    },
    originalLanguage: 'English',
    fullOriginalText: '',
    fullBambaraText: '',
    segments: [],
    vocabularyNotes: [],
    dubbedAudioUrl: null,
    dubbedVolume: 1.0,
    originalVolume: 0.2, // Audibility before dubbing completes
    autoTranslate: true,
    customPrompt: '',
  });

  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isAnalyzingClone, setIsAnalyzingClone] = useState(false);
  const translationCacheRef = useRef<Map<string, any>>(new Map());
  // Granular segment-level cache for micro-translations & phrase memoization
  const segmentTranslationCacheRef = useRef<Map<string, string>>(new Map());

  // Re-Analyze Voice Cloning Audio Profile
  const handleReAnalyzeVoiceCloning = async () => {
    if (!state.mediaBase64) return;
    setIsAnalyzingClone(true);
    try {
      const res = await fetch('/api/voice-clone-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaBase64: state.mediaBase64, mimeType: state.mimeType }),
      });
      const data = await res.json();
      if (data.success && data.clonedVoiceProfile) {
        setState((prev) => ({
          ...prev,
          clonedVoiceProfile: data.clonedVoiceProfile,
          dubbedAudioUrl: null, // trigger re-synthesis with new acoustic profile
        }));
      }
    } catch (e) {
      console.warn('Voice clone re-analyze error:', e);
    } finally {
      setIsAnalyzingClone(false);
    }
  };

  // Prefetch TTS Speech
  const prefetchTTS = async (text: string, voiceName: string, speed: number, cloneProfile?: ClonedVoiceProfile | null) => {
    if (!text || text.trim() === '') return;
    const cleanBambara = normalizeBambaraText(text);
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanBambara,
          voiceName,
          speed,
          clonedVoiceProfile: cloneProfile || state.clonedVoiceProfile,
        }),
      });
      const data = await response.json();
      if (data.success && data.audioUrl) {
        setState((prev) => {
          if (!prev.dubbedAudioUrl) {
            return {
              ...prev,
              dubbedAudioUrl: data.audioUrl,
              originalVolume: 0.0,
              dubbedVolume: 1.0,
            };
          }
          return prev;
        });
      }
    } catch (e) {
      console.warn('Background TTS prefetch info:', e);
    }
  };

  // Run Bambara Translation with Batching for Long Texts, Granular Multi-Layer Caching & 429 Rate Limit Protection
  const runTranslation = async (
    customInstruction?: string,
    overrideText?: string,
    overrideSegments?: AudioSegment[]
  ): Promise<{ bambaraFullText: string; segments: AudioSegment[] } | null> => {
    const activeInstruction = customInstruction !== undefined ? customInstruction : (state.customPrompt || '');
    if (customInstruction !== undefined && customInstruction !== state.customPrompt) {
      setState((prev) => ({ ...prev, customPrompt: customInstruction }));
    }

    const inputSegments = overrideSegments && overrideSegments.length > 0 ? overrideSegments : state.segments;
    const textToTranslate = overrideText || state.fullOriginalText || inputSegments.map((s) => s.originalText).join(' ');

    let toneDialect: 'formal' | 'colloquial' | 'standard' = 'standard';
    if (/عامية|colloquial|kuma|شارع/i.test(activeInstruction)) {
      toneDialect = 'colloquial';
    } else if (/رسمية|فصحى|formal|sɛbɛn/i.test(activeInstruction)) {
      toneDialect = 'formal';
    }

    // 1. Primary Full-Request Cache Key (Exact match)
    const cacheKey = JSON.stringify({
      text: textToTranslate,
      segments: inputSegments.map((s) => ({ id: s.id, text: s.originalText })),
      instruction: activeInstruction,
      tone: toneDialect,
    });

    if (translationCacheRef.current.has(cacheKey)) {
      console.log('⚡ [Translation Cache Hit: Full Key] Reusing cached Bambara translation with Linguistic Review');
      const cached = translationCacheRef.current.get(cacheKey);

      const reviewedSegments: AudioSegment[] = inputSegments.map((seg, idx) => {
        const found = (cached.translatedSegments || []).find(
          (ts: any) => String(ts.id) === String(seg.id)
        ) || (cached.translatedSegments || [])[idx];

        const textVal = found?.bambaraText || found?.text || cached.bambaraFullText || seg.bambaraText || '';
        const reviewedText = reviewBambaraGrammar(textVal, toneDialect);

        return {
          ...seg,
          bambaraText: reviewedText,
        };
      });

      const reviewedFullText = reviewBambaraGrammar(
        cached.bambaraFullText || reviewedSegments.map((s) => s.bambaraText).join(' '),
        toneDialect
      );

      setState((prev) => ({
        ...prev,
        fullBambaraText: reviewedFullText,
        segments: reviewedSegments.length > 0 ? reviewedSegments : prev.segments,
        vocabularyNotes: cached.vocabularyNotes || [],
        isProcessing: false,
        processingMessage: '',
        step: 'synthesize',
      }));

      if (reviewedFullText) {
        prefetchTTS(reviewedFullText, state.selectedSpeaker.geminiVoice, state.selectedSpeaker.speed, state.clonedVoiceProfile);
      }
      return { bambaraFullText: reviewedFullText, segments: reviewedSegments };
    }

    setState((prev) => ({
      ...prev,
      isProcessing: true,
      processingMessage: '2️⃣.1️⃣ جاري الترجمة التامة والدقيقة إلى لغة البامبارا دون أي إنقاص (Bamanankan NMT)...',
      error: null,
    }));

    try {
      // 2. Granular Micro-Caching Check on Individual Segments
      // Check which segments are already translated & cached in memory
      const segmentsToProcess: AudioSegment[] = [];
      const resultMap = new Map<string, string>();
      const aggregatedVocabNotes: any[] = [];

      inputSegments.forEach((seg) => {
        const segText = (seg.originalText || '').trim();
        if (!segText) {
          resultMap.set(String(seg.id), '');
          return;
        }

        const segCacheKey = `${segText.toLowerCase()}::${activeInstruction}::${toneDialect}`;
        if (segmentTranslationCacheRef.current.has(segCacheKey)) {
          const cachedVal = segmentTranslationCacheRef.current.get(segCacheKey)!;
          resultMap.set(String(seg.id), cachedVal);
        } else {
          segmentsToProcess.push(seg);
        }
      });

      const cachedCount = inputSegments.length - segmentsToProcess.length;
      if (cachedCount > 0) {
        console.log(`⚡ [Granular Segment Cache] ${cachedCount} of ${inputSegments.length} segments retrieved from micro-cache`);
      }

      // If all segments were already cached, skip API completely!
      if (segmentsToProcess.length === 0 && inputSegments.length > 0) {
        const reviewedSegments: AudioSegment[] = inputSegments.map((seg) => {
          const textVal = resultMap.get(String(seg.id)) || seg.bambaraText || '';
          return {
            ...seg,
            bambaraText: reviewBambaraGrammar(textVal, toneDialect),
          };
        });

        const reviewedFullText = reviewBambaraGrammar(
          reviewedSegments.map((s) => s.bambaraText).join(' '),
          toneDialect
        );

        translationCacheRef.current.set(cacheKey, {
          success: true,
          bambaraFullText: reviewedFullText,
          translatedSegments: reviewedSegments,
          vocabularyNotes: [],
        });

        setState((prev) => ({
          ...prev,
          fullBambaraText: reviewedFullText,
          segments: reviewedSegments,
          isProcessing: false,
          processingMessage: '',
          step: 'synthesize',
        }));

        if (reviewedFullText) {
          prefetchTTS(reviewedFullText, state.selectedSpeaker.geminiVoice, state.selectedSpeaker.speed, state.clonedVoiceProfile);
        }
        return { bambaraFullText: reviewedFullText, segments: reviewedSegments };
      }

      // 3. Batching Logic: Divide long lists of uncached segments or text into smaller batches (3-5 segments per batch)
      // This eliminates payload limits and prevents Gemini 429 Rate Limit / token overflow
      const BATCH_SIZE = 4;
      const batches: AudioSegment[][] = [];

      if (segmentsToProcess.length > 0) {
        for (let i = 0; i < segmentsToProcess.length; i += BATCH_SIZE) {
          batches.push(segmentsToProcess.slice(i, i + BATCH_SIZE));
        }
      } else {
        // Fallback if no segments provided (raw long text)
        batches.push([{
          id: 1,
          start: 0,
          end: 10,
          originalText: textToTranslate,
          bambaraText: '',
        }]);
      }

      console.log(`📦 [Translation Batching] Splitting ${segmentsToProcess.length} segments into ${batches.length} batch(es) to avoid 429 limits`);

      for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        const currentBatch = batches[bIdx];
        const batchText = currentBatch.map((s) => s.originalText).join(' ');

        setState((prev) => ({
          ...prev,
          processingMessage: batches.length > 1
            ? `2️⃣.1️⃣ جاري ترجمة الدفعة (${bIdx + 1} من ${batches.length}) إلى البامبارا دون أي إنقاص...`
            : '2️⃣.1️⃣ جاري الترجمة التامة والدقيقة إلى لغة البامبارا دون أي إنقاص (Bamanankan NMT)...',
        }));

        const batchData = await fetchTranslateWithBackoff(
          {
            text: batchText,
            segments: currentBatch.map((s) => ({ id: s.id, start: s.start, end: s.end, text: s.originalText })),
            customInstructions: activeInstruction,
          },
          5, // 5 retries with exponential backoff
          1000,
          (attempt, delayMs) => {
            setState((prev) => ({
              ...prev,
              processingMessage: `⏳ استيعاب ضغط الطلبات وإعادة المحاولة للدفعة ${bIdx + 1} (${attempt}/5)... الانتظار ${(delayMs / 1000).toFixed(1)} ثانية`,
            }));
          }
        );

        if (batchData && batchData.translatedSegments) {
          batchData.translatedSegments.forEach((ts: any, sIdx: number) => {
            const corresponding = currentBatch[sIdx] || currentBatch.find((c) => String(c.id) === String(ts.id));
            const translatedVal = ts.bambaraText || ts.text || '';
            if (corresponding) {
              resultMap.set(String(corresponding.id), translatedVal);

              // Cache granular segment result
              const segKey = `${(corresponding.originalText || '').trim().toLowerCase()}::${activeInstruction}::${toneDialect}`;
              segmentTranslationCacheRef.current.set(segKey, translatedVal);
            }
          });
        } else if (batchData && batchData.bambaraFullText) {
          // If 1 item in batch or server returned full text only
          currentBatch.forEach((c) => {
            resultMap.set(String(c.id), batchData.bambaraFullText);
          });
        }

        if (batchData?.vocabularyNotes && Array.isArray(batchData.vocabularyNotes)) {
          aggregatedVocabNotes.push(...batchData.vocabularyNotes);
        }

        // Throttle pacing between batches if there are multiple to respect Gemini rate limits
        if (bIdx < batches.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }

      // 4. Phase 2: Linguistic Review Stage (مرحلة المراجعة اللغوية والنحوية)
      setState((prev) => ({
        ...prev,
        processingMessage: '🔍 2️⃣.2️⃣ مرحلة المراجعة اللغوية والنحوية: تدقيق الأرقام والمصطلحات البامبارية...',
      }));

      await new Promise((resolve) => setTimeout(resolve, 250));

      const reviewedSegments: AudioSegment[] = inputSegments.map((seg) => {
        const textVal = resultMap.get(String(seg.id)) || seg.bambaraText || '';
        const reviewedText = reviewBambaraGrammar(textVal, toneDialect);

        return {
          ...seg,
          bambaraText: reviewedText,
        };
      });

      const reviewedFullText = reviewBambaraGrammar(
        reviewedSegments.map((s) => s.bambaraText).join(' '),
        toneDialect
      );

      const finalResultData = {
        success: true,
        bambaraFullText: reviewedFullText,
        translatedSegments: reviewedSegments,
        vocabularyNotes: aggregatedVocabNotes,
      };

      // Store in full request cache
      translationCacheRef.current.set(cacheKey, finalResultData);

      setState((prev) => ({
        ...prev,
        fullBambaraText: reviewedFullText,
        segments: reviewedSegments.length > 0 ? reviewedSegments : prev.segments,
        vocabularyNotes: aggregatedVocabNotes,
        isProcessing: false,
        processingMessage: '',
        step: 'synthesize',
      }));

      if (reviewedFullText) {
        prefetchTTS(reviewedFullText, state.selectedSpeaker.geminiVoice, state.selectedSpeaker.speed, state.clonedVoiceProfile);
      }

      return { bambaraFullText: reviewedFullText, segments: reviewedSegments };
    } catch (err: any) {
      console.error('[Translation Pipeline Error]', err);
      setState((prev) => ({
        ...prev,
        isProcessing: false,
        processingMessage: '',
        error: err.message || 'خطأ في الترجمة والمراجعة اللغوية',
      }));
      return null;
    }
  };

  // 1. Handle File Selected (Video or Audio)
  const handleFileSelected = async (file: File) => {
    const url = URL.createObjectURL(file);

    setState((prev) => ({
      ...prev,
      videoUrl: url,
      videoFileName: file.name,
      step: 'translate',
      isProcessing: true,
      processingMessage: '⚡ جاري استخراج الصوت النقي وتفريغه بالذكاء الاصطناعي...',
      error: null,
    }));

    try {
      // Extract lightweight 16kHz mono WAV audio base64 to avoid HTTP 413 payload limits
      const { base64, mimeType: extractedMime } = await extractAudioFromMedia(file);

      setState((prev) => ({
        ...prev,
        mediaBase64: base64,
        mimeType: extractedMime,
      }));

      const data = await fetchTranscribeWithBackoff(
        { mediaBase64: base64, mimeType: extractedMime },
        4,
        1000,
        (attempt, delayMs) => {
          setState((prev) => ({
            ...prev,
            processingMessage: `⏳ استكمال التفريغ الصوتي وإعادة المحاولة (${attempt}/4)... الانتظار ${(delayMs / 1000).toFixed(1)} ثانية`,
          }));
        }
      );

      const fullText = data.fullTranscript || 'Uploaded Speech';
      const rawSegments = data.segments || [{ id: 1, start: 0, end: 10, text: fullText }];
      const cloneProfile = data.clonedVoiceProfile || null;

      const baseSegments: AudioSegment[] = rawSegments.map((s: any, idx: number) => ({
        id: s.id || idx + 1,
        start: s.start || 0,
        end: s.end || 5,
        speaker: s.speaker,
        originalText: s.text || '',
        bambaraText: '',
      }));

      setState((prev) => ({
        ...prev,
        originalLanguage: data.detectedLanguage || 'Auto-detected',
        fullOriginalText: fullText,
        segments: baseSegments,
        clonedVoiceProfile: cloneProfile || prev.clonedVoiceProfile,
      }));

      // Immediately translate with linguistic review
      await runTranslation(undefined, fullText, baseSegments);
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        isProcessing: false,
        processingMessage: '',
        error: `خطأ أثناء التفريغ والترجمة الفورية: ${err.message}`,
        step: 'translate',
      }));
    }
  };

  // 2. Handle 1-Click Sample Selected (Instant translation & background TTS prefetch)
  const handleSampleSelected = (sample: SampleVideo) => {
    setState((prev) => ({
      ...prev,
      videoUrl: sample.videoUrl,
      videoFileName: `${sample.id}.mp4`,
      videoDuration: sample.duration,
      originalLanguage: sample.language,
      fullOriginalText: sample.sampleTranscript,
      fullBambaraText: sample.sampleBambara,
      segments: [
        {
          id: 1,
          start: 0,
          end: sample.duration,
          originalText: sample.sampleTranscript,
          bambaraText: sample.sampleBambara,
        },
      ],
      step: 'translate',
      isProcessing: false,
      processingMessage: '',
      error: null,
    }));

    // Trigger instant background pre-fetch for TTS
    prefetchTTS(sample.sampleBambara, BAMBARA_SPEAKERS[0].geminiVoice, BAMBARA_SPEAKERS[0].speed);
  };

  // 3. Handle Mic Recording Complete (Instant Bambara Translation)
  const handleRecordingComplete = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const reader = new FileReader();

    reader.onload = async () => {
      const base64 = reader.result as string;

      setState((prev) => ({
        ...prev,
        videoUrl: url,
        videoFileName: fileName,
        mediaBase64: base64,
        mimeType: 'audio/webm',
        step: 'translate',
        isProcessing: true,
        processingMessage: '⚡ جاري تحويل صوت التسجيل فورياً إلى لغة البامبارا...',
        error: null,
      }));

      try {
        const data = await fetchTranscribeWithBackoff(
          { mediaBase64: base64, mimeType: 'audio/webm' },
          4,
          1000
        );

        const fullText = data.fullTranscript || 'Recorded Speech';
        const rawSegments = data.segments || [{ id: 1, start: 0, end: 5, text: fullText }];
        const baseSegments: AudioSegment[] = rawSegments.map((s: any, idx: number) => ({
          id: s.id || idx + 1,
          start: s.start || 0,
          end: s.end || 5,
          speaker: s.speaker,
          originalText: s.text || '',
          bambaraText: '',
        }));

        setState((prev) => ({
          ...prev,
          originalLanguage: data.detectedLanguage || 'Audio Recording',
          fullOriginalText: fullText,
          segments: baseSegments,
        }));

        await runTranslation(undefined, fullText, baseSegments);
      } catch (err: any) {
        setState((prev) => ({
          ...prev,
          isProcessing: false,
          processingMessage: '',
          error: `خطأ في التفريغ والترجمة الفورية: ${err.message}`,
          step: 'translate',
        }));
      }
    };

    reader.readAsDataURL(blob);
  };

  // 4. Run ASR Transcription
  const runTranscription = async (): Promise<{ fullTranscript: string; segments: AudioSegment[] } | null> => {
    if (state.fullOriginalText && !state.mediaBase64) {
      setState((prev) => ({
        ...prev,
        step: 'translate',
      }));
      if (!state.fullBambaraText) {
        await runTranslation(undefined, state.fullOriginalText, state.segments);
      }
      return { fullTranscript: state.fullOriginalText, segments: state.segments };
    }

    if (!state.mediaBase64 && !state.fullOriginalText) {
      if (state.segments.length > 0) {
        setState((prev) => ({ ...prev, step: 'translate' }));
        const text = state.segments.map((s) => s.originalText).join(' ');
        if (!state.fullBambaraText) {
          await runTranslation(undefined, text, state.segments);
        }
        return { fullTranscript: text, segments: state.segments };
      }
      setState((prev) => ({ ...prev, error: 'يرجى اختيار فيديو أو ملف صوتي أولاً' }));
      return null;
    }

    setState((prev) => ({
      ...prev,
      isProcessing: true,
      processingMessage: '1️⃣ تحويل الكلام إلى نص (Bambara ASR & Universal Transcription)...',
      error: null,
    }));

    try {
      if (state.mediaBase64) {
        const data = await fetchTranscribeWithBackoff(
          {
            mediaBase64: state.mediaBase64,
            mimeType: state.mimeType,
            originalLanguage: state.originalLanguage,
          },
          4,
          1000,
          (attempt, delayMs) => {
            setState((prev) => ({
              ...prev,
              processingMessage: `⏳ استكمال تفريغ الصوت بالذكاء الاصطناعي (${attempt}/4)... الانتظار ${(delayMs / 1000).toFixed(1)} ثانية`,
            }));
          }
        );

        const segments: AudioSegment[] = (data.segments || []).map((s: any) => ({
          id: s.id || Math.random(),
          start: s.start || 0,
          end: s.end || 5,
          speaker: s.speaker,
          originalText: s.text || '',
          bambaraText: '',
        }));

        const fullTranscript = data.fullTranscript || (segments.map((s) => s.originalText).join(' ')) || 'Speech';

        const newSegments = segments.length > 0 ? segments : [
          { id: 1, start: 0, end: state.videoDuration, originalText: fullTranscript, bambaraText: '' }
        ];

        setState((prev) => ({
          ...prev,
          originalLanguage: data.detectedLanguage || prev.originalLanguage,
          fullOriginalText: fullTranscript,
          segments: newSegments,
          isProcessing: false,
          processingMessage: '',
          step: 'translate',
        }));

        // Immediately follow up with Bambara translation passing exact transcribed data
        await runTranslation(undefined, fullTranscript, newSegments);

        return { fullTranscript, segments: newSegments };
      } else {
        setState((prev) => ({
          ...prev,
          isProcessing: false,
          processingMessage: '',
          step: 'translate',
        }));
        if (!state.fullBambaraText) {
          await runTranslation(undefined, state.fullOriginalText, state.segments);
        }
        return { fullTranscript: state.fullOriginalText, segments: state.segments };
      }
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        isProcessing: false,
        processingMessage: '',
        error: err.message || 'خطأ في عملية التفريغ',
      }));
      return null;
    }
  };

  // 6. Run Bambara Text-To-Speech Synthesis for All Segments / Edited Text
  const runSpeechSynthesis = async (
    forceRegenerate = false,
    overrideText?: string,
    overrideSegments?: AudioSegment[]
  ) => {
    // Instant completion if dubbed audio is already generated and text hasn't been edited
    if (state.dubbedAudioUrl && !forceRegenerate && !overrideText) {
      setState((prev) => ({
        ...prev,
        isProcessing: false,
        processingMessage: '',
        step: 'complete',
      }));
      return;
    }

    const inputSegments = overrideSegments && overrideSegments.length > 0 ? overrideSegments : state.segments;

    // Compile text directly from current segments
    const bambaraTextToSpeak =
      overrideText ||
      inputSegments.map((s) => s.bambaraText).filter(Boolean).join(' ') ||
      state.fullBambaraText ||
      'I ni sɔgɔma. Bambara video dubbing completed.';

    const normalizedText = normalizeBambaraText(bambaraTextToSpeak);

    setState((prev) => ({
      ...prev,
      isProcessing: true,
      processingMessage: `3️⃣ توليد الصوت بالبامبارا للنص المعدل عبر ${state.selectedSpeaker.name}...`,
      error: null,
    }));

    try {
      const data = await fetchTTSWithBackoff(
        {
          text: normalizedText,
          voiceName: state.selectedSpeaker.geminiVoice,
          speed: state.selectedSpeaker.speed,
          clonedVoiceProfile: state.clonedVoiceProfile,
        },
        5,
        1500,
        (attempt, delayMs) => {
          setState((prev) => ({
            ...prev,
            processingMessage: `⏳ إعادة المحاولة تلقائياً لتوليد الصوت (${attempt}/5) بسبب ضغط الطلبات... الانتظار ${(delayMs / 1000).toFixed(1)} ثانية`,
          }));
        }
      );

      setState((prev) => ({
        ...prev,
        dubbedAudioUrl: data.audioUrl,
        originalVolume: 0.0,
        dubbedVolume: 1.0,
        fullBambaraText: bambaraTextToSpeak,
        isProcessing: false,
        processingMessage: '',
        step: 'complete',
      }));
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        isProcessing: false,
        processingMessage: '',
        error: `تحذير TTS: ${err.message}`,
        step: 'complete',
      }));
    }
  };

  // Single Segment TTS Preview Playback
  const handleSynthesizeSingleSegment = async (segment: AudioSegment) => {
    if (!segment.bambaraText) return;
    const cleanText = normalizeBambaraText(segment.bambaraText);
    try {
      const data = await fetchTTSWithBackoff(
        {
          text: cleanText,
          voiceName: state.selectedSpeaker.geminiVoice,
          speed: state.selectedSpeaker.speed,
          clonedVoiceProfile: state.clonedVoiceProfile,
        },
        4,
        1000
      );
      if (data.success && data.audioUrl) {
        const audio = new Audio(data.audioUrl);
        audio.play().catch((e) => console.warn('Audio play block:', e));
      }
    } catch (e) {
      console.error('Segment TTS preview failed:', e);
    }
  };

  // 7. Full 1-Click Auto Dubbing
  const runFullPipeline = async () => {
    if (state.step === 'upload') {
      // Pick first sample if none selected
      handleSampleSelected(SAMPLE_VIDEOS[0]);
    }

    setState((prev) => ({
      ...prev,
      isProcessing: true,
      processingMessage: '🚀 جاري معالجة الفيديو بالكامل (تفريغ ⟵ ترجمة ⟵ توليد صوتي ⟵ مزامنة)...',
      error: null,
    }));

    try {
      const transcribeRes = await runTranscription();
      const fullText = transcribeRes?.fullTranscript || state.fullOriginalText;
      const segments = transcribeRes?.segments || state.segments;

      const translateRes = await runTranslation(undefined, fullText, segments);
      const bambaraText = translateRes?.bambaraFullText || state.fullBambaraText;
      const reviewedSegments = translateRes?.segments || segments;

      await runSpeechSynthesis(true, bambaraText, reviewedSegments);
    } catch (err: any) {
      console.error('Video translation pipeline error:', err);
      setState((prev) => ({
        ...prev,
        isProcessing: false,
        error: err?.message || 'حدث خطأ أثناء ترجمة ودبلجة الفيديو',
      }));
    }
  };

  const handleReset = () => {
    setState({
      step: 'upload',
      isProcessing: false,
      processingMessage: '',
      error: null,
      videoUrl: null,
      videoFileName: null,
      videoDuration: 12,
      mediaBase64: null,
      mimeType: 'video/mp4',
      selectedSpeaker: BAMBARA_SPEAKERS[0],
      originalLanguage: 'English',
      fullOriginalText: '',
      fullBambaraText: '',
      segments: [],
      vocabularyNotes: [],
      dubbedAudioUrl: null,
      dubbedVolume: 1.0,
      originalVolume: 0.15,
      autoTranslate: true,
      customPrompt: '',
    });
  };

  return (
    <div id="bambara-app-root" className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-amber-500 selection:text-slate-950">
      {/* Navigation Bar */}
      <Navbar currentStep={state.step} onReset={handleReset} />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Top Progress & Pipeline Bar */}
        <DubbingProgress
          currentStep={state.step}
          processingMessage={state.processingMessage}
          error={state.error}
        />

        {/* Step Navigation Tabs */}
        <div id="workflow-step-tabs" className="flex items-center space-x-2 border-b border-slate-800 pb-4 overflow-x-auto">
          <button
            type="button"
            id="tab-upload"
            onClick={() => setState((p) => ({ ...p, step: 'upload' }))}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all shrink-0 ${
              state.step === 'upload'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-900 hover:bg-slate-850 text-slate-400'
            }`}
          >
            <Video className="w-4 h-4" />
            <span>1. رفع الفيديو</span>
          </button>

          <button
            type="button"
            id="tab-speaker"
            disabled={!state.videoUrl}
            onClick={() => setState((p) => ({ ...p, step: 'speaker' }))}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all shrink-0 disabled:opacity-40 ${
              state.step === 'speaker'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-900 hover:bg-slate-850 text-slate-400'
            }`}
          >
            <Mic className="w-4 h-4" />
            <span>2. صوت المتحدث</span>
          </button>

          <button
            type="button"
            id="tab-transcribe"
            disabled={!state.videoUrl}
            onClick={() => setState((p) => ({ ...p, step: 'translate' }))}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all shrink-0 disabled:opacity-40 ${
              state.step === 'translate' || state.step === 'transcribe'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-900 hover:bg-slate-850 text-slate-400'
            }`}
          >
            <Languages className="w-4 h-4" />
            <span>3. الترجمة والتعديل</span>
          </button>

          <button
            type="button"
            id="tab-complete"
            disabled={!state.videoUrl}
            onClick={() => setState((p) => ({ ...p, step: 'complete' }))}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all shrink-0 disabled:opacity-40 ${
              state.step === 'complete'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'bg-slate-900 hover:bg-slate-850 text-slate-400'
            }`}
          >
            <Film className="w-4 h-4" />
            <span>4. مشغل الدبلجة</span>
          </button>
        </div>

        {/* Voice Cloning Acoustic Signature Card */}
        {state.videoUrl && (
          <VoiceCloningCard
            clonedProfile={state.clonedVoiceProfile}
            onToggleCloning={(active) =>
              setState((prev) => ({
                ...prev,
                clonedVoiceProfile: prev.clonedVoiceProfile
                  ? { ...prev.clonedVoiceProfile, isCloningActive: active }
                  : null,
                dubbedAudioUrl: null, // trigger re-synthesis with active state
              }))
            }
            onUpdateProfile={(updated) =>
              setState((prev) => ({
                ...prev,
                clonedVoiceProfile: updated,
                dubbedAudioUrl: null, // trigger re-synthesis with tuned voice profile
              }))
            }
            onReAnalyzeAudio={handleReAnalyzeVoiceCloning}
            isAnalyzing={isAnalyzingClone}
          />
        )}

        {/* Step 1: Upload View */}
        {state.step === 'upload' && (
          <div className="space-y-6">
            <VideoUploader
              onFileSelected={handleFileSelected}
              onSampleSelected={handleSampleSelected}
              onRecordingComplete={handleRecordingComplete}
              isProcessing={state.isProcessing}
            />
          </div>
        )}

        {/* Step 2: Speaker Selection View */}
        {state.step === 'speaker' && (
          <div className="space-y-6">
            <SpeakerSelector
              selectedSpeaker={state.selectedSpeaker}
              onSelectSpeaker={(spk) => setState((p) => ({ ...p, selectedSpeaker: spk }))}
            />

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                id="btn-next-to-transcribe"
                onClick={runTranscription}
                disabled={state.isProcessing}
                className="px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-xl text-sm flex items-center space-x-2 shadow-lg shadow-amber-500/10 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>متابعة لتفريغ وترجمة البامبارا ⟵</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Transcription & Translation Editor View */}
        {(state.step === 'transcribe' || state.step === 'translate' || state.step === 'synthesize') && (
          <div className="space-y-6">
            <TranscriptEditor
              segments={state.segments}
              fullOriginalText={state.fullOriginalText}
              fullBambaraText={state.fullBambaraText}
              vocabularyNotes={state.vocabularyNotes}
              onSegmentsChange={(segs) =>
                setState((p) => ({
                  ...p,
                  segments: segs,
                  fullBambaraText: segs.map((s) => s.bambaraText).filter(Boolean).join(' '),
                  dubbedAudioUrl: null, // Reset audio so edited text gets freshly synthesized
                }))
              }
              onRefineTranslation={runTranslation}
              onSynthesizeSegmentTTS={handleSynthesizeSingleSegment}
              handleSynthesizeSingleSegment={handleSynthesizeSingleSegment}
              isProcessing={state.isProcessing}
            />

            <div className="flex justify-between items-center pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setState((p) => ({ ...p, step: 'speaker' }))}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium rounded-lg"
              >
                ⟵ تغيير صوت المتحدث
              </button>

              <button
                type="button"
                id="btn-run-tts-synthesize"
                onClick={() => runSpeechSynthesis(true)}
                disabled={state.isProcessing}
                className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold rounded-xl text-sm flex items-center space-x-2 shadow-lg shadow-emerald-500/10 transition-all"
              >
                <Zap className="w-4 h-4 fill-slate-950" />
                <span>توليد صوت البامبارا بالنص المعدل ومزامنة الفيديو ⟵</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Final Dubbed Player View */}
        {state.step === 'complete' && state.videoUrl && (
          <div className="space-y-6">
            <VideoPlayerSync
              videoUrl={state.videoUrl}
              dubbedAudioUrl={state.dubbedAudioUrl}
              segments={state.segments}
              speaker={state.selectedSpeaker}
              originalVolume={state.originalVolume}
              dubbedVolume={state.dubbedVolume}
              onVolumeChange={(orig, dub) => setState((p) => ({ ...p, originalVolume: orig, dubbedVolume: dub }))}
              onOpenExportModal={() => setIsExportOpen(true)}
            />

            <div className="flex justify-between items-center pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setState((p) => ({ ...p, step: 'translate' }))}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium rounded-lg"
              >
                ✏️ تعديل النصوص المترجمة
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-amber-400 text-xs font-medium rounded-lg flex items-center space-x-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>دبلجة فيديو جديد</span>
              </button>
            </div>
          </div>
        )}

      </main>

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        dubbedAudioUrl={state.dubbedAudioUrl}
        videoUrl={state.videoUrl}
        segments={state.segments}
        speaker={state.selectedSpeaker}
        videoFileName={state.videoFileName || 'bambara_dubbed.mp4'}
      />
    </div>
  );
}
