import React, { useRef, useState, useEffect } from 'react';
import { AudioSegment, Speaker } from '../types';
import { Play, Pause, Volume2, VolumeX, Sliders, RefreshCw, Subtitles, Film, Download, Sparkles, Activity, ShieldCheck } from 'lucide-react';

interface VideoPlayerSyncProps {
  videoUrl: string;
  dubbedAudioUrl: string | null;
  segments: AudioSegment[];
  speaker: Speaker;
  originalVolume: number;
  dubbedVolume: number;
  onVolumeChange: (orig: number, dubbed: number) => void;
  onOpenExportModal: () => void;
}

type SubtitlePosition = 'bottom' | 'center' | 'top';
type SubtitleSize = 'small' | 'medium' | 'large' | 'xlarge';
type SubtitleLangMode = 'bambara' | 'original' | 'dual';
type SubtitleStylePreset = 'dark' | 'solid' | 'neon' | 'shadow';

export const VideoPlayerSync: React.FC<VideoPlayerSyncProps> = ({
  videoUrl,
  dubbedAudioUrl,
  segments,
  speaker,
  originalVolume,
  dubbedVolume,
  onVolumeChange,
  onOpenExportModal,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  
  // Subtitle Customization States
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [subPosition, setSubPosition] = useState<SubtitlePosition>('bottom');
  const [subSize, setSubSize] = useState<SubtitleSize>('medium');
  const [subLangMode, setSubLangMode] = useState<SubtitleLangMode>('bambara');
  const [subStylePreset, setSubStylePreset] = useState<SubtitleStylePreset>('dark');
  const [showSubSettings, setShowSubSettings] = useState(false);
  const [currentSeg, setCurrentSeg] = useState<AudioSegment | null>(null);

  // Web Audio API DSP Filter States & Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const highPassFilterRef = useRef<BiquadFilterNode | null>(null);
  const lowPassFilterRef = useRef<BiquadFilterNode | null>(null);
  const notchFilterRef = useRef<BiquadFilterNode | null>(null);
  const presenceFilterRef = useRef<BiquadFilterNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const makeupGainRef = useRef<GainNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const [dspEnabled, setDspEnabled] = useState(true);
  const [highPassFreq, setHighPassFreq] = useState(100); // 100Hz highpass cutoff for Bambara TTS glitch and hiss purification
  const [lowPassFreq, setLowPassFreq] = useState(8500); // 8.5kHz cutoff
  const [showDspPanel, setShowDspPanel] = useState(false);

  // Dynamics Compressor parameters for vocal leveling & consistent Bambara tone
  const [compressorEnabled, setCompressorEnabled] = useState(true);
  const [normalizeGainEnabled, setNormalizeGainEnabled] = useState(true); // Makeup Gain normalization
  const [compressorThreshold, setCompressorThreshold] = useState(-24); // -24 dB
  const [compressorRatio, setCompressorRatio] = useState(5); // 5:1 broadcast leveling ratio
  const [compressorKnee, setCompressorKnee] = useState(12); // 12 dB smooth knee
  const [compressorAttack, setCompressorAttack] = useState(0.003); // 3ms fast attack
  const [compressorRelease, setCompressorRelease] = useState(0.15); // 150ms natural release
  const [gainReduction, setGainReduction] = useState(0); // Live reduction in dB

  // Fast studio compressor presets
  const applyCompressorPreset = (preset: 'broadcast' | 'leveler' | 'smooth' | 'segment-normalizer') => {
    if (preset === 'segment-normalizer') {
      setCompressorThreshold(-26);
      setCompressorRatio(5);
      setCompressorKnee(10);
      setCompressorAttack(0.003);
      setCompressorRelease(0.14);
      setNormalizeGainEnabled(true);
    } else if (preset === 'broadcast') {
      setCompressorThreshold(-24);
      setCompressorRatio(4);
      setCompressorKnee(12);
      setCompressorAttack(0.003);
      setCompressorRelease(0.15);
      setNormalizeGainEnabled(true);
    } else if (preset === 'leveler') {
      setCompressorThreshold(-30);
      setCompressorRatio(6);
      setCompressorKnee(14);
      setCompressorAttack(0.002);
      setCompressorRelease(0.12);
      setNormalizeGainEnabled(true);
    } else if (preset === 'smooth') {
      setCompressorThreshold(-18);
      setCompressorRatio(2.5);
      setCompressorKnee(8);
      setCompressorAttack(0.008);
      setCompressorRelease(0.20);
      setNormalizeGainEnabled(false);
    }
  };

  // Live polling of compressor gain reduction during playback
  useEffect(() => {
    let animId: number;
    const pollReduction = () => {
      if (compressorRef.current && isPlaying && dspEnabled && compressorEnabled) {
        // compressor.reduction is negative decibels
        const red = Math.abs(compressorRef.current.reduction);
        setGainReduction(red);
      } else if (!isPlaying) {
        setGainReduction(0);
      }
      if (isPlaying && showDspPanel) {
        animId = requestAnimationFrame(pollReduction);
      }
    };

    if (isPlaying && showDspPanel) {
      animId = requestAnimationFrame(pollReduction);
    } else {
      setGainReduction(0);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlaying, showDspPanel, dspEnabled, compressorEnabled]);

  // Initialize Web Audio API AudioContext & DSP filter graph on audio element
  const setupAudioContext = () => {
    if (!audioRef.current) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }

      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      if (!mediaSourceRef.current && audioRef.current) {
        mediaSourceRef.current = ctx.createMediaElementSource(audioRef.current);

        // 1. High-Pass Filter (BiquadFilterNode type 'highpass' at 100Hz: purifies Bambara TTS output from rattle, rumble, DC pops, hiss & glitches)
        const highPass = ctx.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = dspEnabled ? highPassFreq : 10;
        highPass.Q.value = 0.707; // Optimal Butterworth Q factor
        highPassFilterRef.current = highPass;

        // 2. Low-Pass Filter (cuts harsh digital hiss and glitches above 8.5kHz)
        const lowPass = ctx.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.value = dspEnabled ? lowPassFreq : 20000;
        lowPass.Q.value = 0.707;
        lowPassFilterRef.current = lowPass;

        // 3. Notch Peaking Filter (suppresses metallic 6kHz synth hiss artifacts)
        const notch = ctx.createBiquadFilter();
        notch.type = 'peaking';
        notch.frequency.value = 6000;
        notch.Q.value = 2.0;
        notch.gain.value = dspEnabled ? -5.0 : 0;
        notchFilterRef.current = notch;

        // 4. Speech Presence Filter (+2dB at 2.5kHz for crisp Bambara speech clarity)
        const presence = ctx.createBiquadFilter();
        presence.type = 'peaking';
        presence.frequency.value = 2500;
        presence.Q.value = 1.0;
        presence.gain.value = dspEnabled ? 2.2 : 0;
        presenceFilterRef.current = presence;

        // 5. Dynamics Compressor (normalizes gain across generated Bambara audio segments, prevents volume spikes & ensures vocal consistency)
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = (dspEnabled && compressorEnabled) ? compressorThreshold : 0;
        compressor.knee.value = compressorKnee;
        compressor.ratio.value = (dspEnabled && compressorEnabled) ? compressorRatio : 1;
        compressor.attack.value = compressorAttack;
        compressor.release.value = compressorRelease;
        compressorRef.current = compressor;

        // 6. Normalization Makeup Gain Node (+3dB compensation to normalize overall Bambara vocal loudness)
        const makeupGain = ctx.createGain();
        makeupGain.gain.value = (dspEnabled && compressorEnabled && normalizeGainEnabled) ? 1.41 : 1.0;
        makeupGainRef.current = makeupGain;

        // 7. Master Gain Node
        const gainNode = ctx.createGain();
        gainNode.gain.value = dubbedVolume;
        gainNodeRef.current = gainNode;

        // Connect chain: Source -> HighPass -> LowPass -> Notch -> Presence -> Compressor -> MakeupGain -> MasterGain -> Destination
        mediaSourceRef.current
          .connect(highPass)
          .connect(lowPass)
          .connect(notch)
          .connect(presence)
          .connect(compressor)
          .connect(makeupGain)
          .connect(gainNode)
          .connect(ctx.destination);
      }
    } catch (err) {
      console.warn('[AudioContext DSP Notice]:', err);
    }
  };

  // Update DSP filter parameters dynamically
  useEffect(() => {
    const now = audioCtxRef.current ? audioCtxRef.current.currentTime : 0;
    if (highPassFilterRef.current) {
      if (audioCtxRef.current) {
        highPassFilterRef.current.frequency.setValueAtTime(dspEnabled ? highPassFreq : 10, now);
      } else {
        highPassFilterRef.current.frequency.value = dspEnabled ? highPassFreq : 10;
      }
    }
    if (lowPassFilterRef.current) {
      if (audioCtxRef.current) {
        lowPassFilterRef.current.frequency.setValueAtTime(dspEnabled ? lowPassFreq : 20000, now);
      } else {
        lowPassFilterRef.current.frequency.value = dspEnabled ? lowPassFreq : 20000;
      }
    }
    if (notchFilterRef.current) {
      if (audioCtxRef.current) {
        notchFilterRef.current.gain.setValueAtTime(dspEnabled ? -5.0 : 0, now);
      } else {
        notchFilterRef.current.gain.value = dspEnabled ? -5.0 : 0;
      }
    }
    if (presenceFilterRef.current) {
      if (audioCtxRef.current) {
        presenceFilterRef.current.gain.setValueAtTime(dspEnabled ? 2.2 : 0, now);
      } else {
        presenceFilterRef.current.gain.value = dspEnabled ? 2.2 : 0;
      }
    }
  }, [dspEnabled, highPassFreq, lowPassFreq]);

  // Update Dynamics Compressor parameters dynamically
  useEffect(() => {
    if (compressorRef.current && audioCtxRef.current) {
      const now = audioCtxRef.current.currentTime;
      if (dspEnabled && compressorEnabled) {
        compressorRef.current.threshold.setValueAtTime(compressorThreshold, now);
        compressorRef.current.knee.setValueAtTime(compressorKnee, now);
        compressorRef.current.ratio.setValueAtTime(compressorRatio, now);
        compressorRef.current.attack.setValueAtTime(compressorAttack, now);
        compressorRef.current.release.setValueAtTime(compressorRelease, now);
        if (makeupGainRef.current) {
          makeupGainRef.current.gain.setValueAtTime(normalizeGainEnabled ? 1.41 : 1.0, now);
        }
      } else {
        // Transparent bypass: threshold = 0 dB, ratio = 1 (no gain reduction)
        compressorRef.current.threshold.setValueAtTime(0, now);
        compressorRef.current.ratio.setValueAtTime(1, now);
        if (makeupGainRef.current) {
          makeupGainRef.current.gain.setValueAtTime(1.0, now);
        }
      }
    }
  }, [dspEnabled, compressorEnabled, compressorThreshold, compressorKnee, compressorRatio, compressorAttack, compressorRelease, normalizeGainEnabled]);

  // Apply volume controls: strictly mute original video audio when originalVolume is 0
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = originalVolume;
    }
    if (audioRef.current) {
      audioRef.current.volume = dubbedVolume;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = dubbedVolume;
    }
  }, [originalVolume, dubbedVolume]);

  // Sync audio playback whenever dubbedAudioUrl or isPlaying status updates
  useEffect(() => {
    if (dubbedAudioUrl && audioRef.current && videoRef.current) {
      setupAudioContext();
      audioRef.current.currentTime = videoRef.current.currentTime;
      if (isPlaying) {
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume().catch(() => {});
        }
        audioRef.current.play().catch((err) => {
          console.warn('Dubbed audio auto-play error:', err);
        });
      }
    }
  }, [dubbedAudioUrl, isPlaying]);

  // Native video event handlers for seamless audio-video sync
  const handleVideoPlay = () => {
    setIsPlaying(true);
    setupAudioContext();
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    if (audioRef.current && dubbedAudioUrl) {
      audioRef.current.currentTime = videoRef.current?.currentTime || 0;
      audioRef.current.play().catch((err) => console.warn('Dubbed audio play error:', err));
    }
  };

  const handleVideoPause = () => {
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
  };

  const handleVideoSeeking = () => {
    if (videoRef.current && audioRef.current && dubbedAudioUrl) {
      audioRef.current.currentTime = videoRef.current.currentTime;
    }
  };

  // Sync play/pause
  const togglePlayPause = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      if (audioRef.current) audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setupAudioContext();
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      if (audioRef.current && dubbedAudioUrl) {
        audioRef.current.currentTime = videoRef.current.currentTime;
      }
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            if (audioRef.current && dubbedAudioUrl) {
              audioRef.current.play().catch((err) => {
                console.warn('Dubbed audio play prevented:', err);
              });
            }
            setIsPlaying(true);
          })
          .catch((err) => {
            console.warn('Video play prevented:', err);
          });
      }
    }
  };

  // Sync seek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) videoRef.current.currentTime = time;
    if (audioRef.current) audioRef.current.currentTime = time;
  };

  // Time update listener & subtitle detection
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    // Keep audio in tight sync (if drift > 0.2s)
    if (audioRef.current && dubbedAudioUrl) {
      if (Math.abs(audioRef.current.currentTime - time) > 0.2) {
        audioRef.current.currentTime = time;
      }
    }

    // Find current active segment
    const activeSeg = segments.find((s) => time >= s.start && time <= s.end);
    setCurrentSeg(activeSeg || null);
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) videoRef.current.playbackRate = speed;
    if (audioRef.current) audioRef.current.playbackRate = speed;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Subtitle styling calculations
  const getSubtitlePositionClass = () => {
    switch (subPosition) {
      case 'top':
        return 'top-6 sm:top-8 inset-x-4';
      case 'center':
        return 'top-1/2 -translate-y-1/2 inset-x-4';
      case 'bottom':
      default:
        return 'bottom-6 sm:bottom-10 inset-x-4';
    }
  };

  const getSubtitleSizeClass = () => {
    switch (subSize) {
      case 'small':
        return 'text-xs sm:text-sm px-3 py-1.5 rounded-md';
      case 'medium':
        return 'text-sm sm:text-base px-4 py-2 rounded-lg';
      case 'large':
        return 'text-base sm:text-xl px-5 py-2.5 rounded-xl font-bold';
      case 'xlarge':
        return 'text-lg sm:text-2xl px-6 py-3 rounded-2xl font-extrabold';
      default:
        return 'text-sm sm:text-base px-4 py-2 rounded-lg';
    }
  };

  const getSubtitleStyleClass = () => {
    switch (subStylePreset) {
      case 'solid':
        return 'bg-black text-amber-300 border border-slate-700 shadow-2xl';
      case 'neon':
        return 'bg-amber-950/90 text-amber-200 border-2 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.4)] backdrop-blur-md';
      case 'shadow':
        return 'bg-transparent text-amber-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] [text-shadow:_0_2px_8px_rgb(0_0_0_/_90%)]';
      case 'dark':
      default:
        return 'bg-slate-950/85 text-amber-300 border border-amber-500/40 shadow-2xl backdrop-blur-md';
    }
  };

  return (
    <div id="video-player-sync-container" className="space-y-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <Film className="w-5 h-5 text-amber-400" />
            <h3 id="player-title" className="text-lg font-bold text-white">
              مشغل الفيديو المزامَن مع الصوت المدبلج للبامبارا
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            الصوت المدبلج: <strong className="text-amber-400">{speaker.name}</strong> • المزامنة التلقائية للمسار الصوتي والمرئي.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {dubbedAudioUrl ? (
            <button
              type="button"
              id="btn-test-dubbed-audio"
              onClick={() => {
                if (audioRef.current) {
                  setupAudioContext();
                  if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
                    audioCtxRef.current.resume().catch(() => {});
                  }
                  audioRef.current.currentTime = 0;
                  audioRef.current.volume = dubbedVolume || 1.0;
                  audioRef.current.play().catch((err) => console.warn('Direct audio play error:', err));
                } else {
                  const testAudio = new Audio(dubbedAudioUrl);
                  testAudio.volume = dubbedVolume || 1.0;
                  testAudio.play().catch((err) => console.warn('Direct audio play error:', err));
                }
              }}
              className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/50 font-bold rounded-xl text-xs flex items-center justify-center space-x-2 shadow-md transition-all"
              title="انقر هنا لسماع اختبار مباشر للصوت المدبلج بالبامبارا"
            >
              <Volume2 className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>🔊 تجربة الصوت المدبلج (اختبار الصوت)</span>
            </button>
          ) : (
            <div className="px-3 py-1.5 bg-slate-800 text-slate-400 border border-slate-700 rounded-xl text-xs flex items-center space-x-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
              <span>جاري تجهيز الصوت المدبلج...</span>
            </div>
          )}

          <button
            type="button"
            id="btn-open-export"
            onClick={onOpenExportModal}
            className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/10 transition-all self-start sm:self-auto"
          >
            <Download className="w-4 h-4" />
            <span>تصدير الفيديو والملفات</span>
          </button>
        </div>
      </div>

      {/* Main Video Screen with Subtitle Overlay */}
      <div className="relative aspect-video bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center group">
        <video
          ref={videoRef}
          src={videoUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={handleVideoPlay}
          onPause={handleVideoPause}
          onSeeking={handleVideoSeeking}
          onEnded={() => setIsPlaying(false)}
          playsInline
          className="w-full h-full object-contain"
        />

        {/* Hidden Audio Player for Dubbed Audio */}
        {dubbedAudioUrl && (
          <audio ref={audioRef} src={dubbedAudioUrl} preload="auto" />
        )}

        {/* Subtitles Overlay on Video */}
        {showSubtitles && currentSeg && (
          <div
            className={`absolute ${getSubtitlePositionClass()} text-center pointer-events-none transition-all duration-200 z-10 flex flex-col items-center justify-center`}
          >
            <div
              className={`inline-block max-w-[92%] transition-all ${getSubtitleStyleClass()} ${getSubtitleSizeClass()}`}
            >
              {(subLangMode === 'bambara' || subLangMode === 'dual') && (
                <div className="leading-relaxed font-bold tracking-wide">
                  {currentSeg.bambaraText}
                </div>
              )}
              {subLangMode === 'dual' && currentSeg.originalText && (
                <div className="text-xs sm:text-sm text-slate-300 font-normal border-t border-amber-500/30 pt-1 mt-1 opacity-90">
                  {currentSeg.originalText}
                </div>
              )}
              {subLangMode === 'original' && (
                <div className="leading-relaxed text-slate-100 font-medium">
                  {currentSeg.originalText}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Center Play Overlay Button */}
        <button
          type="button"
          id="btn-overlay-play"
          onClick={togglePlayPause}
          className="absolute w-16 h-16 rounded-full bg-amber-500/90 text-slate-950 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all scale-95 group-hover:scale-100 shadow-2xl"
        >
          {isPlaying ? (
            <Pause className="w-8 h-8 fill-slate-950" />
          ) : (
            <Play className="w-8 h-8 fill-slate-950 ml-1" />
          )}
        </button>
      </div>

      {/* Player Controls Timeline & Actions */}
      <div className="space-y-4 bg-slate-950/80 p-5 rounded-xl border border-slate-800">
        {/* Timeline Slider */}
        <div className="space-y-1">
          <input
            type="range"
            id="player-timeline-slider"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
          <div className="flex justify-between text-[11px] text-slate-400 font-mono">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Playback Controls & Settings Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800/80">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              type="button"
              id="btn-main-play-toggle"
              onClick={togglePlayPause}
              className="p-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-md flex items-center justify-center transition-colors"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-slate-950" /> : <Play className="w-5 h-5 fill-slate-950 ml-0.5" />}
            </button>

            {/* Subtitles Main Toggle Button */}
            <button
              type="button"
              id="btn-toggle-subtitles"
              onClick={() => setShowSubtitles(!showSubtitles)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                showSubtitles
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700'
              }`}
              title={showSubtitles ? 'إخفاء الترجمة النصية على الفيديو' : 'إظهار الترجمة النصية على الفيديو'}
            >
              <Subtitles className="w-4 h-4 text-amber-400" />
              <span>{showSubtitles ? 'الترجمة: مفعّلة' : 'الترجمة: معطّلة'}</span>
            </button>

            {/* Subtitle Customization Toggle Panel Button */}
            <button
              type="button"
              id="btn-subtitle-settings-toggle"
              onClick={() => {
                setShowSubSettings(!showSubSettings);
                setShowDspPanel(false);
              }}
              className={`p-2 rounded-lg text-xs flex items-center space-x-1.5 transition-all ${
                showSubSettings
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
              title="تعديل الخط والموقع والمظهر للترجمة النصية"
            >
              <Sliders className="w-4 h-4" />
              <span className="hidden sm:inline">تخصيص الترجمة</span>
            </button>

            {/* Audio DSP Filter Controls Toggle Button */}
            <button
              type="button"
              id="btn-dsp-panel-toggle"
              onClick={() => {
                setShowDspPanel(!showDspPanel);
                setShowSubSettings(false);
              }}
              className={`p-2 rounded-lg text-xs flex items-center space-x-1.5 transition-all ${
                showDspPanel
                  ? 'bg-teal-400 text-slate-950 font-bold shadow-md'
                  : dspEnabled
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                  : 'bg-slate-900 text-slate-400 border border-slate-800'
              }`}
              title="معالج الصوت المباشر AudioContext وترشيح الضجيج (High-Pass 100Hz & Dynamics Compressor)"
            >
              <Activity className="w-4 h-4 text-teal-400" />
              <span className="hidden sm:inline">تنقية الصوت DSP</span>
            </button>

            {/* Speed Selector */}
            <div className="flex items-center space-x-1 text-xs bg-slate-900 border border-slate-800 rounded-lg p-1">
              {[0.8, 1.0, 1.2, 1.5].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSpeedChange(s)}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    playbackSpeed === s ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Dual Volume Audio Mixer (Original vs Dubbed) */}
          <div id="volume-mixer-container" className="flex flex-col sm:flex-row items-center gap-3 bg-slate-900/90 px-4 py-3 rounded-xl border border-slate-800 text-xs">
            <div className="flex items-center space-x-4">
              {/* Original Audio Volume */}
              <div className="flex items-center space-x-2">
                <span className="text-slate-400 text-[11px]">الصوت الأصلي:</span>
                <input
                  type="range"
                  id="slider-orig-volume"
                  min={0}
                  max={1}
                  step={0.05}
                  value={originalVolume}
                  onChange={(e) => onVolumeChange(parseFloat(e.target.value), dubbedVolume)}
                  className="w-16 h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-slate-400"
                />
                <span className="text-slate-400 font-mono text-[10px] w-8">
                  {Math.round(originalVolume * 100)}%
                </span>
              </div>

              <div className="w-px h-4 bg-slate-800" />

              {/* Dubbed Bambara Audio Volume */}
              <div className="flex items-center space-x-2">
                <span className="text-amber-400 font-medium text-[11px]">صوت البامبارا:</span>
                <input
                  type="range"
                  id="slider-dubbed-volume"
                  min={0}
                  max={1}
                  step={0.05}
                  value={dubbedVolume}
                  onChange={(e) => onVolumeChange(originalVolume, parseFloat(e.target.value))}
                  className="w-20 h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-amber-400"
                />
                <span className="text-amber-400 font-mono text-[10px] w-8">
                  {Math.round(dubbedVolume * 100)}%
                </span>
              </div>
            </div>

            {/* Quick Audio Preset Buttons */}
            <div className="flex items-center gap-1.5 border-t sm:border-t-0 sm:border-r border-slate-800 pt-2 sm:pt-0 sm:pr-3">
              <button
                type="button"
                onClick={() => onVolumeChange(0.0, 1.0)}
                className="px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30 transition-colors"
                title="كتم الصوت الأصلي وتشغيل دبلجة البامبارا 100%"
              >
                🔊 البامبارا فقط
              </button>
              <button
                type="button"
                onClick={() => onVolumeChange(0.15, 1.0)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold transition-colors"
                title="تشغيل البامبارا مع خلفية خفيفة من الصوت الأصلي (15%)"
              >
                🎧 دمج متوازن
              </button>
              <button
                type="button"
                onClick={() => onVolumeChange(1.0, 0.0)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 text-[10px] font-semibold transition-colors"
                title="تشغيل الصوت الأصلي فقط 100%"
              >
                🔊 الأصلي فقط
              </button>
            </div>
          </div>
        </div>

        {/* Subtitles Customization Drawer Panel */}
        {showSubSettings && (
          <div id="subtitle-settings-panel" className="mt-4 p-4 bg-slate-900/95 rounded-xl border border-amber-500/30 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-bold text-amber-300">إعدادات الترجمة النصية على الفيديو (Subtitles)</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowSubSettings(false)}
                className="text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800"
              >
                إغلاق ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              {/* 1. Subtitle Position */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-300 block">موقع الترجمة على الشاشة:</label>
                <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSubPosition('bottom')}
                    className={`py-1.5 rounded text-[11px] font-medium transition-colors ${
                      subPosition === 'bottom' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    أسفل
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubPosition('center')}
                    className={`py-1.5 rounded text-[11px] font-medium transition-colors ${
                      subPosition === 'center' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    منتصف
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubPosition('top')}
                    className={`py-1.5 rounded text-[11px] font-medium transition-colors ${
                      subPosition === 'top' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    أعلى
                  </button>
                </div>
              </div>

              {/* 2. Subtitle Font Size */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-300 block">حجم خط الترجمة:</label>
                <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSubSize('small')}
                    className={`py-1.5 rounded text-[10px] font-medium transition-colors ${
                      subSize === 'small' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    صغير
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubSize('medium')}
                    className={`py-1.5 rounded text-[10px] font-medium transition-colors ${
                      subSize === 'medium' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    متوسط
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubSize('large')}
                    className={`py-1.5 rounded text-[10px] font-medium transition-colors ${
                      subSize === 'large' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    كبير
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubSize('xlarge')}
                    className={`py-1.5 rounded text-[10px] font-medium transition-colors ${
                      subSize === 'xlarge' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ضخم
                  </button>
                </div>
              </div>

              {/* 3. Subtitle Language Mode */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-300 block">لغة النص المعروض:</label>
                <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSubLangMode('bambara')}
                    className={`py-1.5 rounded text-[11px] font-medium transition-colors ${
                      subLangMode === 'bambara' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    بامبارا
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubLangMode('original')}
                    className={`py-1.5 rounded text-[11px] font-medium transition-colors ${
                      subLangMode === 'original' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    الأصلي
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubLangMode('dual')}
                    className={`py-1.5 rounded text-[11px] font-medium transition-colors ${
                      subLangMode === 'dual' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ثنائي
                  </button>
                </div>
              </div>

              {/* 4. Subtitle Style Preset */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-300 block">مظهر وخلفية الترجمة:</label>
                <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSubStylePreset('dark')}
                    className={`py-1.5 rounded text-[10px] font-medium transition-colors ${
                      subStylePreset === 'dark' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    شفاف
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubStylePreset('solid')}
                    className={`py-1.5 rounded text-[10px] font-medium transition-colors ${
                      subStylePreset === 'solid' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    أسود
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubStylePreset('neon')}
                    className={`py-1.5 rounded text-[10px] font-medium transition-colors ${
                      subStylePreset === 'neon' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    نيون
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubStylePreset('shadow')}
                    className={`py-1.5 rounded text-[10px] font-medium transition-colors ${
                      subStylePreset === 'shadow' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ظل فقط
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Audio DSP Real-time Filter Drawer Panel */}
        {showDspPanel && (
          <div id="dsp-filter-panel" className="mt-4 p-4 bg-slate-900/95 rounded-xl border border-teal-500/40 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-teal-400" />
                <h4 className="text-xs font-bold text-teal-300">معالج الصوت المباشر AudioContext وترشيح الضجيج (DSP Processor)</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowDspPanel(false)}
                className="text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800"
              >
                إغلاق ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              {/* Toggle DSP Filter */}
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 text-[11px]">مصفّي الضجيج المباشر (DSP):</span>
                  <button
                    type="button"
                    onClick={() => setDspEnabled(!dspEnabled)}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${
                      dspEnabled ? 'bg-teal-500 text-slate-950 shadow-md' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {dspEnabled ? 'مفعّل ⚡' : 'معطّل'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  يطبق مرشح High-Pass بتردد 100Hz لتنقية مخرجات TTS للبامبارا من القرقرة والتشوش (Hiss/Glitch)، مع معالج النبرة الديناميكي.
                </p>
              </div>

              {/* High-Pass Filter Slider (BiquadFilterNode highpass @ 100Hz) */}
              <div className="p-3 bg-slate-950 rounded-lg border border-teal-500/30 space-y-2">
                <div className="flex justify-between items-center text-[11px]">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-semibold text-teal-300">مرشح الترددات (High-Pass):</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 font-mono font-bold">
                      100Hz Biquad
                    </span>
                  </div>
                  <span className="font-mono text-teal-400 text-[10px] font-bold">{highPassFreq} Hz</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={250}
                  step={5}
                  value={highPassFreq}
                  onChange={(e) => setHighPassFreq(parseInt(e.target.value))}
                  disabled={!dspEnabled}
                  className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-teal-400 disabled:opacity-40"
                />
                <div className="flex items-center justify-between text-[9px] text-slate-400">
                  <span>تنقية نطق البامبارا من القرقرة والتشويش الرقمي</span>
                  {highPassFreq !== 100 && (
                    <button
                      type="button"
                      onClick={() => setHighPassFreq(100)}
                      className="text-teal-400 hover:text-teal-300 underline font-medium"
                      title="العودة للتردد المعياري 100Hz لتنقية مخرجات TTS"
                    >
                      ضبط 100Hz
                    </button>
                  )}
                </div>
              </div>

              {/* Low-Pass Filter Slider */}
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-2">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="font-medium text-teal-300">عزل الترددات العالية (Low-Pass):</span>
                  <span className="font-mono text-teal-400 text-[10px]">{lowPassFreq} Hz</span>
                </div>
                <input
                  type="range"
                  min={4000}
                  max={12000}
                  step={200}
                  value={lowPassFreq}
                  onChange={(e) => setLowPassFreq(parseInt(e.target.value))}
                  disabled={!dspEnabled}
                  className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-teal-400 disabled:opacity-40"
                />
                <p className="text-[9px] text-slate-400">يقص الصفير والأزيز الرقمي الحاد الأعلى من {lowPassFreq} هرتز</p>
              </div>
            </div>

            {/* Dynamics Compressor Node (تسوية الصوت والنبرة الثابتة) */}
            <div className="p-4 bg-slate-950/90 rounded-xl border border-teal-500/30 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-teal-200 text-xs">معالج تسوية الديناميكية (DynamicsCompressorNode):</span>
                      <span className="px-2 py-0.5 rounded text-[9px] bg-teal-500/20 text-teal-300 font-mono font-bold border border-teal-500/30">
                        {compressorEnabled && dspEnabled ? 'مُدمج ونَشِط 🟢' : 'تخطي (Bypass) ⚪'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      يسوّي تقلبات الصوت وتفاوت العلو بين الجمل ليمنح دبلجة البامبارا نبرة صوتية رصينة ومستقرة تماماً
                    </p>
                  </div>
                </div>

                {/* Compressor Mode Toggle & Studio Presets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setCompressorEnabled(!compressorEnabled)}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                      compressorEnabled
                        ? 'bg-teal-500 text-slate-950 shadow-sm'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {compressorEnabled ? 'الضاغط مفعّل ⚡' : 'تخطي الضاغط (Bypass)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => applyCompressorPreset('segment-normalizer')}
                    className="px-2.5 py-1 rounded bg-teal-500/25 hover:bg-teal-500/35 text-teal-200 text-[10px] font-bold border border-teal-500/40 shadow-sm"
                    title="تسوية وتطبيع الكسب الصوتي بين مقاطع البامبارا لمنع القفزات الصوتية وشد النبرة"
                  >
                    ⚖️ تسوية المقاطع (Normalizer)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyCompressorPreset('broadcast')}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-teal-300 text-[10px] font-semibold border border-teal-500/20"
                    title="إعداد إذاعي متوازن ومثالي للأفلام الوثائقية والتقارير"
                  >
                    🎙️ إذاعي متزن
                  </button>
                  <button
                    type="button"
                    onClick={() => applyCompressorPreset('leveler')}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-semibold border border-amber-500/20"
                    title="تسوية قوية لتثبيت المقاطع متفاوتة القوة جداً"
                  >
                    ⚡ تسوية مشددة
                  </button>
                  <button
                    type="button"
                    onClick={() => applyCompressorPreset('smooth')}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold border border-slate-700"
                    title="نبرة طبيعية هادئة ورصينة"
                  >
                    🌿 طبيعي رقيق
                  </button>
                </div>
              </div>

              {/* Live Gain Reduction & Normalization Compensation Meter */}
              <div className="p-2.5 bg-slate-900/80 rounded-lg border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center space-x-2 text-[11px]">
                  <span className="text-slate-400">كبح القمم اللحظي (Gain Reduction):</span>
                  <span className="font-mono font-bold text-teal-400 text-xs">
                    {gainReduction > 0.1 ? `-${gainReduction.toFixed(1)} dB` : '0.0 dB (مستقر)'}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
                    {normalizeGainEnabled ? 'تعويض الكسب +3dB نشط 🔊' : 'بدون تعويض'}
                  </span>
                </div>
                {/* Visual meter bar */}
                <div className="w-full sm:max-w-xs h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800 flex justify-end">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-teal-400 transition-all duration-75 rounded-full"
                    style={{ width: `${Math.min(100, (gainReduction / 15) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Sliders for Compressor Parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-1">
                {/* Threshold */}
                <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800/80 space-y-1.5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="font-medium text-teal-300">عتبة الضغط (Threshold):</span>
                    <span className="font-mono text-teal-400 text-[10px]">{compressorThreshold} dB</span>
                  </div>
                  <input
                    type="range"
                    min={-40}
                    max={-5}
                    step={1}
                    value={compressorThreshold}
                    onChange={(e) => setCompressorThreshold(parseInt(e.target.value))}
                    disabled={!dspEnabled || !compressorEnabled}
                    className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-teal-400 disabled:opacity-40"
                  />
                  <p className="text-[9px] text-slate-400">يبدأ التسوية عند تجاوز الصوت {compressorThreshold} dB</p>
                </div>

                {/* Ratio */}
                <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800/80 space-y-1.5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="font-medium text-teal-300">نسبة التسوية (Ratio):</span>
                    <span className="font-mono text-teal-400 text-[10px]">{compressorRatio}:1</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={12}
                    step={0.5}
                    value={compressorRatio}
                    onChange={(e) => setCompressorRatio(parseFloat(e.target.value))}
                    disabled={!dspEnabled || !compressorEnabled}
                    className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-teal-400 disabled:opacity-40"
                  />
                  <p className="text-[9px] text-slate-400">شدة كبح النبرات العالية لتثبيت وتجانس الصوت</p>
                </div>

                {/* Knee */}
                <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800/80 space-y-1.5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="font-medium text-teal-300">انحناء الانتقال (Knee):</span>
                    <span className="font-mono text-teal-400 text-[10px]">{compressorKnee} dB</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={30}
                    step={2}
                    value={compressorKnee}
                    onChange={(e) => setCompressorKnee(parseInt(e.target.value))}
                    disabled={!dspEnabled || !compressorEnabled}
                    className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-teal-400 disabled:opacity-40"
                  />
                  <p className="text-[9px] text-slate-400">نعومة الانتقال الصوتي حول نقطة العتبة</p>
                </div>

                {/* Attack & Release */}
                <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800/80 space-y-1.5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="font-medium text-teal-300">سرعة الاستجابة (Attack/Rel):</span>
                    <span className="font-mono text-teal-400 text-[10px]">{Math.round(compressorAttack * 1000)}ms / {Math.round(compressorRelease * 1000)}ms</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 pt-0.5">
                    <button
                      type="button"
                      onClick={() => { setCompressorAttack(0.002); setCompressorRelease(0.12); }}
                      className={`py-1 rounded text-[9px] font-medium transition-colors ${
                        compressorAttack === 0.002 ? 'bg-teal-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      سريع (2ms)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setCompressorAttack(0.008); setCompressorRelease(0.20); }}
                      className={`py-1 rounded text-[9px] font-medium transition-colors ${
                        compressorAttack === 0.008 ? 'bg-teal-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      طبيعي (8ms)
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-400">سرعة التقاط النبرات الحادة وإطلاقها بنعومة</p>
                </div>
              </div>
            </div>
          </div>
        )}
        {dubbedAudioUrl && (
          <div className="mt-4 p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                <Volume2 className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <span className="font-bold text-amber-300 block">مشغل الصوت المباشر (المسار الصوتي بالبامبارا):</span>
                <span className="text-[10px] text-slate-400">يمكنك الاستماع للصوت المولد مباشرة بدون فيديو في أي وقت</span>
              </div>
            </div>
            <audio
              controls
              src={dubbedAudioUrl}
              className="h-8 w-full sm:w-64 rounded-lg bg-slate-900 accent-amber-500"
            />
          </div>
        )}
      </div>
    </div>
  );
};
