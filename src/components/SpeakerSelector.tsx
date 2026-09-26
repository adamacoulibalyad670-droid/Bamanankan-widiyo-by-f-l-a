import React, { useState } from 'react';
import { BAMBARA_SPEAKERS } from '../data/speakers';
import { Speaker } from '../types';
import { Volume2, Check, User, Mic, Play, Pause, Sliders, Sparkles } from 'lucide-react';

interface SpeakerSelectorProps {
  selectedSpeaker: Speaker;
  onSelectSpeaker: (speaker: Speaker) => void;
  onAudioTestPreview?: (speaker: Speaker) => void;
}

export const SpeakerSelector: React.FC<SpeakerSelectorProps> = ({
  selectedSpeaker,
  onSelectSpeaker,
  onAudioTestPreview,
}) => {
  const [filterGender, setFilterGender] = useState<'all' | 'female' | 'male'>('all');
  const [playingId, setPlayingId] = useState<string | null>(null);

  const filteredSpeakers = BAMBARA_SPEAKERS.filter((s) => {
    if (filterGender === 'all') return true;
    return s.gender === filterGender;
  });

  const handlePreviewAudio = (e: React.MouseEvent, speaker: Speaker) => {
    e.stopPropagation();
    setPlayingId(speaker.id);

    // Synthesize sample preview phrase using browser TTS or server preview audio
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const textToSay = `I ni sɔgɔma. Ne tɔgɔ ko ${speaker.name}. Bambara fɔli kura ye.`;
      const utterance = new SpeechSynthesisUtterance(textToSay);
      utterance.rate = speaker.speed;
      utterance.pitch = speaker.pitch;

      utterance.onend = () => setPlayingId(null);
      utterance.onerror = () => setPlayingId(null);

      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => setPlayingId(null), 2000);
    }

    if (onAudioTestPreview) {
      onAudioTestPreview(speaker);
    }
  };

  return (
    <div id="speaker-selector-container" className="space-y-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <User className="w-5 h-5 text-amber-400" />
            <h3 id="speaker-select-title" className="text-lg font-bold text-white">
              اختر صوت المتحدث بالبامبارا (MALIBA Speakers)
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            اختر الصوت الأنسب لنوع الفيديو: نشرة أخبار، وثائقي، إعلانات، أو حوار تعليمي.
          </p>
        </div>

        {/* Gender Filter Buttons */}
        <div id="gender-filter-group" className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
          <button
            id="filter-gender-all"
            type="button"
            onClick={() => setFilterGender('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filterGender === 'all'
                ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            الكل ({BAMBARA_SPEAKERS.length})
          </button>
          <button
            id="filter-gender-female"
            type="button"
            onClick={() => setFilterGender('female')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filterGender === 'female'
                ? 'bg-rose-500 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            إناث ♀
          </button>
          <button
            id="filter-gender-male"
            type="button"
            onClick={() => setFilterGender('male')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filterGender === 'male'
                ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            ذكور ♂
          </button>
        </div>
      </div>

      {/* Speaker Cards Grid */}
      <div id="speaker-cards-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSpeakers.map((speaker) => {
          const isSelected = selectedSpeaker.id === speaker.id;
          const isPlaying = playingId === speaker.id;

          return (
            <div
              key={speaker.id}
              id={`speaker-card-${speaker.id}`}
              onClick={() => onSelectSpeaker(speaker)}
              className={`relative rounded-xl p-5 border transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-slate-850 border-amber-500 shadow-xl shadow-amber-500/10 ring-1 ring-amber-500/50'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-850/50'
              }`}
            >
              {isSelected && (
                <span className="absolute top-3 right-3 w-6 h-6 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow-md">
                  <Check className="w-4 h-4 stroke-[3]" />
                </span>
              )}

              <div>
                <div className="flex items-center space-x-3 mb-3">
                  <div className={`w-11 h-11 rounded-full bg-gradient-to-tr ${speaker.avatarColor} p-0.5 flex items-center justify-center shadow-md`}>
                    <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center font-bold text-amber-300 text-sm">
                      {speaker.name.charAt(0)}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                      {speaker.name}
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                        {speaker.gender === 'female' ? '♀' : '♂'}
                      </span>
                    </h4>
                    <p className="text-xs text-amber-400 font-medium">{speaker.bambaraName}</p>
                  </div>
                </div>

                <div className="space-y-1.5 my-3">
                  <span className="inline-block text-[11px] px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                    {speaker.archetype}
                  </span>
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {speaker.description}
                  </p>
                </div>
              </div>

              {/* Card Footer: Accent & Preview */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-500">لهجة: <strong className="text-slate-300">{speaker.accent}</strong></span>

                <button
                  type="button"
                  id={`btn-preview-audio-${speaker.id}`}
                  onClick={(e) => handlePreviewAudio(e, speaker)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors ${
                    isPlaying
                      ? 'bg-amber-500 text-slate-950 animate-pulse'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-amber-400" />}
                  <span>{isPlaying ? 'جاري العرض' : 'استمع للصوت'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Speaker Voice Details */}
      <div id="selected-speaker-meta" className="bg-slate-950/90 rounded-xl p-4 border border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center space-x-3">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-slate-300">
            الصوت المعتمد حالياً: <strong className="text-amber-400 font-bold">{selectedSpeaker.name}</strong> ({selectedSpeaker.geminiVoice} Model Core)
          </span>
        </div>

        <div className="flex items-center space-x-4 text-slate-400">
          <span>Speed: <strong className="text-slate-200">{selectedSpeaker.speed}x</strong></span>
          <span>Pitch: <strong className="text-slate-200">{selectedSpeaker.pitch}</strong></span>
        </div>
      </div>
    </div>
  );
};
