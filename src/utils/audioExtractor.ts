/**
 * Utility to extract compressed 16kHz mono WAV audio from any video or audio File using Web Audio API.
 * Drastically reduces payload size for Gemini Transcription API (e.g. 100MB video -> 3MB audio).
 */

export async function extractAudioFromMedia(file: File): Promise<{ base64: string; mimeType: string }> {
  // If file is small (< 8MB) and already audio, we can send directly
  if (file.size < 8 * 1024 * 1024 && file.type.startsWith('audio/')) {
    const base64 = await fileToBase64(file);
    return { base64, mimeType: file.type || 'audio/mp3' };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('AudioContext unavailable');
    }

    const audioContext = new AudioContextClass();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Target sample rate: 16000 Hz mono (ideal for Gemini ASR / Speech Recognition)
    const targetSampleRate = 16000;
    const numberOfChannels = 1;
    const duration = audioBuffer.duration;

    const offlineCtx = new OfflineAudioContext(
      numberOfChannels,
      Math.ceil(duration * targetSampleRate),
      targetSampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    const renderedBuffer = await offlineCtx.startRendering();
    audioContext.close();

    // Convert OfflineAudioBuffer to WAV PCM Blob
    const pcmChannel = renderedBuffer.getChannelData(0);
    const wavBlob = createWavBlobFromPCM(pcmChannel, targetSampleRate);

    const base64 = await blobToBase64(wavBlob);
    return {
      base64,
      mimeType: 'audio/wav',
    };
  } catch (err) {
    console.warn('[AudioExtractor] WebAudio extraction fallback to direct file:', err);
    const base64 = await fileToBase64(file);
    return {
      base64,
      mimeType: file.type || 'video/mp4',
    };
  }
}

function createWavBlobFromPCM(pcmData: Float32Array, sampleRate: number): Blob {
  const numSamples = pcmData.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + numSamples * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw PCM) */
  view.setUint16(20, 1, true);
  /* channel count (mono) */
  view.setUint16(22, 1, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sampleRate * 2) */
  view.setUint32(28, sampleRate * 2, true);
  /* block align (mono 16-bit) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, numSamples * 2, true);

  // Convert Float32 [-1.0, 1.0] to Int16 PCM
  let offset = 44;
  for (let i = 0; i < numSamples; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, pcmData[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      const base64 = res.includes(',') ? res.split(',')[1] : res;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      const base64 = res.includes(',') ? res.split(',')[1] : res;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
