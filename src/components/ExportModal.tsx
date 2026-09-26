import React, { useState, useEffect } from 'react';
import { AudioSegment, Speaker } from '../types';
import {
  X,
  Download,
  FileText,
  FileVideo,
  Music,
  Check,
  Sparkles,
  Subtitles,
  Loader2,
  Zap,
  Eye,
  Settings2,
  Sliders,
  Type,
  Layout,
  Palette,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlignCenter,
  AlignRight,
  AlignLeft,
  Edit3,
  Upload,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
} from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  dubbedAudioUrl: string | null;
  videoUrl: string | null;
  segments: AudioSegment[];
  speaker: Speaker;
  videoFileName?: string;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  dubbedAudioUrl,
  videoUrl,
  segments,
  speaker,
  videoFileName = 'bambara_dubbed_video.mp4',
}) => {
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusText, setExportStatusText] = useState('');

  // Primary SRT Burn-in Option
  const [enableSrtBurn, setEnableSrtBurn] = useState(true);

  // Subtitle Customization States
  const [fontSize, setFontSize] = useState<number>(24);
  const [subtitleSizePreset, setSubtitleSizePreset] = useState<'small' | 'medium' | 'large' | 'xlarge'>('large');
  const [subtitlePosition, setSubtitlePosition] = useState<'bottom' | 'center' | 'top'>('bottom');
  const [marginV, setMarginV] = useState<number>(28);
  const [horizontalAlign, setHorizontalAlign] = useState<'center' | 'right' | 'left'>('center');
  const [subtitleMode, setSubtitleMode] = useState<'bambara' | 'dual' | 'original'>('bambara');
  const [subtitleColor, setSubtitleColor] = useState<'gold' | 'white' | 'yellow' | 'cyan'>('gold');

  // Custom / Editable SRT state
  const [customSrtText, setCustomSrtText] = useState<string>('');
  const [showSrtEditor, setShowSrtEditor] = useState<boolean>(false);
  const [previewSegmentIndex, setPreviewSegmentIndex] = useState<number>(0);

  // Keep size preset and numeric font size in sync
  const handleSizePreset = (preset: 'small' | 'medium' | 'large' | 'xlarge') => {
    setSubtitleSizePreset(preset);
    const map = { small: 18, medium: 22, large: 26, xlarge: 32 };
    setFontSize(map[preset]);
  };

  const handleNumericFontSize = (val: number) => {
    setFontSize(val);
    if (val <= 19) setSubtitleSizePreset('small');
    else if (val <= 23) setSubtitleSizePreset('medium');
    else if (val <= 29) setSubtitleSizePreset('large');
    else setSubtitleSizePreset('xlarge');
  };

  const handlePositionChange = (pos: 'bottom' | 'center' | 'top') => {
    setSubtitlePosition(pos);
    if (pos === 'top' && marginV < 30) {
      setMarginV(36);
    } else if (pos === 'bottom' && marginV > 45) {
      setMarginV(28);
    }
  };

  // Helper to convert blob: URLs or remote URLs to base64 data string
  const blobUrlToBase64 = async (urlStr: string): Promise<string> => {
    if (urlStr.startsWith('data:')) return urlStr;
    const response = await fetch(urlStr);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Generate SRT Subtitle File string based on selected subtitleMode
  const generateSRT = (): string => {
    if (customSrtText && customSrtText.trim().length > 0) {
      return customSrtText;
    }
    return segments
      .map((seg, idx) => {
        const formatSrtTime = (sec: number) => {
          const hrs = Math.floor(sec / 3600);
          const mins = Math.floor((sec % 3600) / 60);
          const secs = Math.floor(sec % 60);
          const millis = Math.floor((sec % 1) * 1000);
          return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
        };
        let text = seg.bambaraText || seg.text || '';
        if (subtitleMode === 'dual' && seg.originalText && seg.bambaraText) {
          text = `${seg.bambaraText}\n(${seg.originalText})`;
        } else if (subtitleMode === 'original' && seg.originalText) {
          text = seg.originalText;
        }
        return `${idx + 1}\n${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n${text}\n`;
      })
      .join('\n');
  };

  // Dedicated High-Clarity FFmpeg Server Processing Video Download
  const downloadDubbedVideoFFmpeg = async (mode: 'hardsub' | 'softsub' | 'nosub' = enableSrtBurn ? 'hardsub' : 'nosub') => {
    if (!videoUrl) return;
    setIsExportingVideo(true);
    setExportProgress(12);

    if (mode === 'hardsub') {
      setExportStatusText('1/3: جاري تجهيز ملف SRT وضبط إحداثيات ومقاسات الترجمة...');
    } else if (mode === 'softsub') {
      setExportStatusText('1/3: جاري تجهيز مسار ترجمة SRT لحقنه كمسار برمجي في MP4...');
    } else {
      setExportStatusText('1/3: جاري استخراج مسارات الصوت والفيديو عالية الدقة...');
    }

    try {
      setExportProgress(28);
      setExportStatusText('2/3: جاري إرسال البيانات لمعالجة FFmpeg الخلفية...');
      const videoBase64 = await blobUrlToBase64(videoUrl);
      const audioBase64 = dubbedAudioUrl ? await blobUrlToBase64(dubbedAudioUrl) : '';

      setExportProgress(50);
      setExportStatusText('3/3: جاري دمج ملف SRT فوق إطارات الفيديو عبر فلتر subtitles في FFmpeg...');

      // Calculate ASS alignment number based on position & horizontal alignment
      // ASS Alignment standard (NumPad layout):
      // 1: Bottom-Left, 2: Bottom-Center, 3: Bottom-Right
      // 9: Center-Left, 10: Center-Center, 11: Center-Right
      // 5: Top-Left, 6: Top-Center, 7: Top-Right
      let assAlignment = 2;
      if (subtitlePosition === 'top') {
        assAlignment = horizontalAlign === 'right' ? 7 : horizontalAlign === 'left' ? 5 : 6;
      } else if (subtitlePosition === 'center') {
        assAlignment = horizontalAlign === 'right' ? 11 : horizontalAlign === 'left' ? 9 : 10;
      } else {
        assAlignment = horizontalAlign === 'right' ? 3 : horizontalAlign === 'left' ? 1 : 2;
      }

      const activeSrt = generateSRT();

      const resp = await fetch('/api/render-video-ffmpeg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoDataUrl: videoBase64,
          audioDataUrl: audioBase64,
          burnSubtitles: mode === 'hardsub',
          embedSoftSubtitles: mode === 'softsub',
          segments,
          customSrtContent: activeSrt,
          fontSize,
          marginV: subtitlePosition === 'center' ? 0 : marginV,
          alignment: assAlignment,
          subtitleSize: subtitleSizePreset,
          subtitlePosition,
          subtitleMode,
          subtitleColor,
        }),
      });

      setExportProgress(88);
      const data = await resp.json();

      if (data.success && data.videoDataUrl) {
        setExportProgress(98);
        setExportStatusText('تم دمج الفيديو والترجمة بنجاح عبر FFmpeg! جاري بدء التنزيل...');

        const a = document.createElement('a');
        a.href = data.videoDataUrl;
        const subSuffix = mode === 'hardsub' ? 'srt_burned_' : mode === 'softsub' ? 'srt_soft_' : '';
        a.download = `bambara_dubbed_${subSuffix}${Date.now()}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => {
          setIsExportingVideo(false);
          setExportProgress(100);
          setExportStatusText('');
        }, 1200);
      } else {
        throw new Error(data.error || 'Server FFmpeg processing error');
      }
    } catch (e: any) {
      console.warn('FFmpeg server render fallback to canvas player:', e);
      setExportStatusText('جاري التصدير عبر المشغل المحلي البديل...');
      await downloadDubbedVideoFallback();
    }
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Client-Side Canvas MediaRecorder Fallback in case server connection fails
  const downloadDubbedVideoFallback = async () => {
    if (!videoUrl) return;
    setIsExportingVideo(true);
    setExportProgress(10);
    setExportStatusText('جاري إعداد مسجل الفيديو في المتصفح...');

    try {
      const video = document.createElement('video');
      video.src = videoUrl;
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playbackRate = 2.0;

      const audio = document.createElement('audio');
      if (dubbedAudioUrl) {
        audio.src = dubbedAudioUrl;
        audio.crossOrigin = 'anonymous';
        audio.playbackRate = 2.0;
      }

      await new Promise((resolve) => {
        video.onloadedmetadata = resolve;
        setTimeout(resolve, 800);
      });

      setExportProgress(25);

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');

      const videoStream = canvas.captureStream(60);
      let combinedStream = videoStream;

      if (dubbedAudioUrl && (window.AudioContext || (window as any).webkitAudioContext)) {
        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const dest = audioCtx.createMediaStreamDestination();
          const audioSource = audioCtx.createMediaElementSource(audio);
          audioSource.connect(dest);
          combinedStream = new MediaStream([
            ...videoStream.getVideoTracks(),
            ...dest.stream.getAudioTracks(),
          ]);
        } catch (e) {
          console.warn('Web Audio capture fallback:', e);
        }
      }

      const mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm';
      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 3500000,
      });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const videoBlob = new Blob(chunks, { type: mimeType });
        const blobUrl = URL.createObjectURL(videoBlob);
        const a = document.createElement('a');
        a.href = blobUrl;
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        a.download = `bambara_dubbed_video_${Date.now()}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);

        setIsExportingVideo(false);
        setExportProgress(100);
        setExportStatusText('');
      };

      recorder.start();
      video.play().catch(() => {});
      if (dubbedAudioUrl) audio.play().catch(() => {});

      const duration = video.duration || 10;
      const renderInterval = setInterval(() => {
        if (ctx && video) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          if (enableSrtBurn) {
            const currentTime = video.currentTime;
            const currentSeg = segments.find((s) => currentTime >= s.start && currentTime <= s.end);

            if (currentSeg && (currentSeg.bambaraText || currentSeg.originalText)) {
              let primaryText = currentSeg.bambaraText || '';
              let secondaryText = '';

              if (subtitleMode === 'dual') {
                primaryText = currentSeg.bambaraText || '';
                secondaryText = currentSeg.originalText || '';
              } else if (subtitleMode === 'original') {
                primaryText = currentSeg.originalText || currentSeg.bambaraText || '';
              }

              const fontPx = fontSize;
              ctx.font = `bold ${fontPx}px sans-serif`;
              const bMetrics = ctx.measureText(primaryText);
              const boxWidth = Math.min(canvas.width - 60, Math.max(bMetrics.width + 50, 260));
              const boxHeight = secondaryText ? fontPx + 38 : fontPx + 20;

              let boxX = (canvas.width - boxWidth) / 2;
              if (horizontalAlign === 'right') boxX = canvas.width - boxWidth - 40;
              if (horizontalAlign === 'left') boxX = 40;

              let boxY = canvas.height - boxHeight - marginV;
              if (subtitlePosition === 'top') boxY = marginV;
              else if (subtitlePosition === 'center') boxY = (canvas.height - boxHeight) / 2;

              ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
              ctx.beginPath();
              ctx.roundRect ? ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 12) : ctx.rect(boxX, boxY, boxWidth, boxHeight);
              ctx.fill();

              const textColors: Record<string, string> = {
                gold: '#f59e0b',
                white: '#ffffff',
                yellow: '#facc15',
                cyan: '#38bdf8',
              };
              ctx.textAlign = 'center';
              ctx.fillStyle = textColors[subtitleColor] || '#f59e0b';
              ctx.fillText(primaryText, boxX + boxWidth / 2, boxY + fontPx + 2);

              if (secondaryText) {
                ctx.fillStyle = '#cbd5e1';
                ctx.font = `${Math.max(12, fontPx - 6)}px sans-serif`;
                ctx.fillText(secondaryText, boxX + boxWidth / 2, boxY + fontPx + 24);
              }
            }
          }
        }
        const p = Math.min(99, Math.round((video.currentTime / duration) * 100));
        setExportProgress(p);

        if (video.ended || video.currentTime >= duration || isNaN(video.currentTime)) {
          clearInterval(renderInterval);
          recorder.stop();
          video.pause();
          if (dubbedAudioUrl) audio.pause();
        }
      }, 1000 / 60);
    } catch (e) {
      console.error('Video fallback error:', e);
      setIsExportingVideo(false);
    }
  };

  const downloadSRT = () => {
    const srtContent = generateSRT();
    downloadFile(srtContent, `bambara_subtitles_${subtitleMode}_${Date.now()}.srt`, 'text/plain');
  };

  const downloadVTT = () => {
    const vttHeader = "WEBVTT - Bambara Subtitles\n\n";
    const srt = generateSRT();
    // Convert SRT to VTT timings
    const vttBody = srt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    downloadFile(vttHeader + vttBody, `bambara_subtitles_${subtitleMode}_${Date.now()}.vtt`, 'text/vtt');
  };

  const downloadDubbedAudio = () => {
    if (!dubbedAudioUrl) return;
    const a = document.createElement('a');
    a.href = dubbedAudioUrl;
    a.download = `bambara_audio_${speaker.id}_${Date.now()}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Handle external SRT file upload
  const handleUploadSrtFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setCustomSrtText(text);
        setShowSrtEditor(true);
      }
    };
    reader.readAsText(file);
  };

  // Preview segment helpers
  const activeSegment = segments[previewSegmentIndex] || segments[0];
  const previewSampleText = activeSegment?.bambaraText || activeSegment?.text || 'I ni ce, Bamanankan dɔnniya kura';
  const previewOriginalText = activeSegment?.originalText || 'Welcome, modern science in Bambara';

  const previewColorClasses: Record<string, string> = {
    gold: 'text-amber-400 border-amber-500/50',
    white: 'text-white border-white/40',
    yellow: 'text-yellow-300 border-yellow-400/50',
    cyan: 'text-cyan-300 border-cyan-400/50',
  };

  const previewPositionClass =
    subtitlePosition === 'top' ? 'items-start pt-3' : subtitlePosition === 'center' ? 'items-center' : 'items-end pb-3';

  const previewAlignClass =
    horizontalAlign === 'right' ? 'self-end' : horizontalAlign === 'left' ? 'self-start' : 'self-center';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div
        id="export-modal-card"
        className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl relative space-y-5 my-auto max-h-[92vh] overflow-y-auto"
      >
        {/* Close Button */}
        <button
          type="button"
          id="btn-close-export-modal"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div>
          <div className="flex items-center space-x-2 text-amber-400 mb-1">
            <Sparkles className="w-5 h-5" />
            <h3 className="text-lg font-bold text-white">تصدير ودمج الترجمة النصية (SRT) عبر FFmpeg</h3>
          </div>
          <p className="text-xs text-slate-400">
            دمج ترجمة البامبارا كملف SRT محروق مباشرة فوق الفيديو بدقة عالية أو استخراجه كملف مستقل، بصوت <strong className="text-amber-400">{speaker.name}</strong>
          </p>
        </div>

        {/* Section 1: Main SRT Burn-In & FFmpeg Background Processing Control */}
        <div className="bg-gradient-to-r from-amber-950/80 via-slate-950 to-slate-950 p-4 sm:p-5 rounded-2xl border border-amber-500/40 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            <div className="flex items-center space-x-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shadow-md shrink-0">
                <Subtitles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-white">دمج الترجمة النصية (SRT) فوق الفيديو عبر FFmpeg</h4>
                  <span className="px-2 py-0.5 rounded text-[9px] bg-amber-500 text-slate-950 font-extrabold shadow-sm">
                    FFmpeg Engine
                  </span>
                </div>
                <p className="text-[11px] text-slate-300">
                  حرق ملف الـ SRT مباشرة على إطارات الفيديو لضمان ظهور الترجمة على جميع المنصات والشاشات
                </p>
              </div>
            </div>

            {/* Toggle Burn-in Switch */}
            <div className="flex items-center gap-2 self-end sm:self-center bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800">
              <span className="text-xs font-semibold text-slate-300">
                {enableSrtBurn ? 'مُفعّل (دمج SRT)' : 'تصدير بدون ترجمة'}
              </span>
              <button
                type="button"
                id="toggle-srt-burn-in"
                onClick={() => setEnableSrtBurn(!enableSrtBurn)}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                  enableSrtBurn ? 'bg-amber-500 justify-end' : 'bg-slate-700 justify-start'
                }`}
                title="تفعيل أو تعطيل دمج ملف الترجمة SRT فوق الفيديو النهائي"
              >
                <div className="w-4 h-4 rounded-full bg-slate-950 shadow-md transform transition-transform" />
              </button>
            </div>
          </div>

          {/* Subtitle Customization Panel (Directly Before FFmpeg Merge) */}
          {enableSrtBurn && (
            <div
              id="subtitle-customization-panel"
              className="bg-slate-950/90 p-4 rounded-xl border border-amber-500/30 space-y-4 shadow-inner"
            >
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <div className="flex items-center space-x-2">
                  <Settings2 className="w-4 h-4 text-amber-400" />
                  <h4 className="text-xs font-bold text-amber-300">
                    تخصيص الترجمة قبل الدمج (موضع الشاشة وحجم الخط)
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-amber-400/90 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  {fontSize}px • {subtitlePosition === 'top' ? 'أعلى الشاشة ⬆️' : subtitlePosition === 'center' ? 'وسط ⏹️' : 'أسفل الشاشة ⬇️'} • Margin: {marginV}px
                </span>
              </div>

              {/* Grid: 1. Screen Position (Top / Bottom) & 2. Font Size */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Screen Position (Top / Bottom Focus) */}
                <div className="space-y-2 p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between text-[11px]">
                    <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <Layout className="w-3.5 h-3.5 text-amber-400" />
                      <span>موقع الترجمة على الشاشة (Position):</span>
                    </label>
                    <span className="text-[10px] text-amber-400 font-bold">
                      {subtitlePosition === 'top' ? 'أعلى الشاشة' : subtitlePosition === 'center' ? 'وسط الشاشة' : 'أسفل الشاشة'}
                    </span>
                  </div>

                  {/* Primary Top / Bottom Segmented Cards */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      id="btn-pos-bottom"
                      onClick={() => handlePositionChange('bottom')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all border cursor-pointer ${
                        subtitlePosition === 'bottom'
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <ArrowDown className="w-3.5 h-3.5" />
                        <span>أسفل الشاشة (Bottom)</span>
                      </div>
                      <span className={`text-[9px] font-normal ${subtitlePosition === 'bottom' ? 'text-slate-900' : 'text-slate-500'}`}>
                        الوضع القياسي المعتمد
                      </span>
                    </button>

                    <button
                      type="button"
                      id="btn-pos-top"
                      onClick={() => handlePositionChange('top')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all border cursor-pointer ${
                        subtitlePosition === 'top'
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <ArrowUp className="w-3.5 h-3.5" />
                        <span>أعلى الشاشة (Top)</span>
                      </div>
                      <span className={`text-[9px] font-normal ${subtitlePosition === 'top' ? 'text-slate-900' : 'text-slate-500'}`}>
                        لتجنب حجب المحتوى أو الأشرطة
                      </span>
                    </button>
                  </div>

                  {/* Vertical Margin Slider */}
                  <div className="space-y-1 pt-1 border-t border-slate-800/60">
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>الهامش من الحافة (Vertical Margin):</span>
                      <span className="font-mono text-amber-300 font-bold">{subtitlePosition === 'center' ? '0px (توسيط)' : `${marginV}px`}</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={80}
                      step={2}
                      disabled={subtitlePosition === 'center'}
                      value={marginV}
                      onChange={(e) => setMarginV(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-amber-400 disabled:opacity-40"
                    />
                    <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                      <span>10px (ملامس)</span>
                      <span>{subtitlePosition === 'top' ? '40px (موصى به)' : '28px (موصى به)'}</span>
                      <span>80px (عميق)</span>
                    </div>
                  </div>
                </div>

                {/* 2. Font Size Controls */}
                <div className="space-y-2 p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between text-[11px]">
                    <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <Type className="w-3.5 h-3.5 text-amber-400" />
                      <span>حجم خط الترجمة (Font Size):</span>
                    </label>
                    <span className="font-mono text-amber-400 font-bold text-xs bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      {fontSize} px
                    </span>
                  </div>

                  {/* Preset Buttons */}
                  <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                    {(['small', 'medium', 'large', 'xlarge'] as const).map((sz) => {
                      const labels = { small: 'صغير 18', medium: 'وسط 22', large: 'كبير 26', xlarge: 'ضخم 32' };
                      return (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => handleSizePreset(sz)}
                          className={`py-1.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                            subtitleSizePreset === sz
                              ? 'bg-amber-500 text-slate-950 shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {labels[sz]}
                        </button>
                      );
                    })}
                  </div>

                  {/* Fine Adjustment Slider */}
                  <div className="space-y-1 pt-1 border-t border-slate-800/60">
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>تعديل المقاس بالبكسل:</span>
                      <span className="font-mono text-amber-300 font-bold">{fontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min={14}
                      max={46}
                      step={1}
                      value={fontSize}
                      onChange={(e) => handleNumericFontSize(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-amber-400"
                    />
                    <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                      <span>14px (دقيق)</span>
                      <span>26px (إذاعي قياسي)</span>
                      <span>46px (عريض)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Secondary Appearance Row: Mode, Color, Horizontal Alignment */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                {/* Horizontal Alignment */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-slate-300 flex items-center gap-1">
                    <AlignCenter className="w-3.5 h-3.5 text-amber-400" />
                    <span>المحاذاة الأفقية:</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setHorizontalAlign('right')}
                      className={`py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                        horizontalAlign === 'right' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                      }`}
                      title="محاذاة لليمين"
                    >
                      <AlignRight className="w-3 h-3" />
                      <span>يمين</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setHorizontalAlign('center')}
                      className={`py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                        horizontalAlign === 'center' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                      }`}
                      title="توسيط"
                    >
                      <AlignCenter className="w-3 h-3" />
                      <span>وسط</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setHorizontalAlign('left')}
                      className={`py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                        horizontalAlign === 'left' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                      }`}
                      title="محاذاة لليسار"
                    >
                      <AlignLeft className="w-3 h-3" />
                      <span>يسار</span>
                    </button>
                  </div>
                </div>

                {/* Subtitle Mode */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-slate-300 flex items-center gap-1">
                    <Subtitles className="w-3.5 h-3.5 text-amber-400" />
                    <span>لغة الترجمة:</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                    {(['bambara', 'dual', 'original'] as const).map((m) => {
                      const labels = { bambara: 'بامبارا', dual: 'ثنائي', original: 'الأصلي' };
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setSubtitleMode(m)}
                          className={`py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                            subtitleMode === m ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {labels[m]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Subtitle Color */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-slate-300 flex items-center gap-1">
                    <Palette className="w-3.5 h-3.5 text-amber-400" />
                    <span>لون النص:</span>
                  </label>
                  <div className="grid grid-cols-4 gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                    {(['gold', 'white', 'yellow', 'cyan'] as const).map((col) => {
                      const labels = { gold: 'ذهبي', white: 'أبيض', yellow: 'أصفر', cyan: 'سماوي' };
                      const dotColors = {
                        gold: 'bg-amber-400',
                        white: 'bg-white',
                        yellow: 'bg-yellow-300',
                        cyan: 'bg-cyan-400',
                      };
                      return (
                        <button
                          key={col}
                          type="button"
                          onClick={() => setSubtitleColor(col)}
                          className={`py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                            subtitleColor === col ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${dotColors[col]}`} />
                          <span>{labels[col]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Interactive Live Subtitle Visual Preview Box */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center space-x-1.5">
                    <Eye className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-semibold text-slate-300">
                      معاينة تفاعلية فورية لشكل وموضع الترجمة على شاشة الفيديو ({subtitlePosition === 'top' ? 'أعلى الشاشة ⬆️' : 'أسفل الشاشة ⬇️'}):
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setPreviewSegmentIndex((prev) => Math.max(0, prev - 1))}
                      disabled={previewSegmentIndex === 0}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 cursor-pointer"
                      title="الجملة السابقة"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                    <span className="font-mono text-slate-400">
                      {previewSegmentIndex + 1} / {segments.length || 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreviewSegmentIndex((prev) => Math.min((segments.length || 1) - 1, prev + 1))}
                      disabled={previewSegmentIndex >= (segments.length || 1) - 1}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 cursor-pointer"
                      title="الجملة التالية"
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Mock Screen Frame */}
                <div
                  className={`relative w-full h-32 bg-slate-950 rounded-xl border border-slate-800 flex flex-col px-6 overflow-hidden shadow-inner ${previewPositionClass}`}
                  style={{
                    paddingTop: subtitlePosition === 'top' ? `${Math.max(8, marginV / 2)}px` : undefined,
                    paddingBottom: subtitlePosition === 'bottom' ? `${Math.max(8, marginV / 2)}px` : undefined,
                  }}
                >
                  <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

                  {/* Indicator tag inside preview */}
                  <span className="absolute left-2 top-2 text-[9px] font-mono text-slate-500 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800">
                    {subtitlePosition === 'top' ? '⬆️ Top View' : '⬇️ Bottom View'} • {fontSize}px
                  </span>

                  {/* Subtitle Pill Box */}
                  <div
                    className={`bg-slate-950/92 rounded-xl border shadow-2xl backdrop-blur-md text-center max-w-[90%] transition-all duration-200 z-10 py-1.5 px-4 ${previewAlignClass} ${previewColorClasses[subtitleColor]}`}
                    style={{ fontSize: `${Math.max(12, Math.min(22, fontSize * 0.75))}px` }}
                  >
                    <div className="font-bold leading-snug">
                      {subtitleMode === 'original' ? previewOriginalText : previewSampleText}
                    </div>
                    {subtitleMode === 'dual' && (
                      <div className="text-[10px] text-slate-300 font-normal mt-0.5 opacity-90">
                        ({previewOriginalText})
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Primary Action Button: Render with FFmpeg */}
          <div>
            <button
              type="button"
              id="btn-primary-export-ffmpeg"
              onClick={() => downloadDubbedVideoFFmpeg(enableSrtBurn ? 'hardsub' : 'nosub')}
              disabled={!videoUrl || isExportingVideo}
              className={`w-full py-3 px-4 rounded-xl flex items-center justify-center space-x-2 font-bold text-sm shadow-xl transition-all cursor-pointer ${
                enableSrtBurn
                  ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:brightness-110 text-slate-950 shadow-amber-500/25 border border-amber-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title="بدء معالجة FFmpeg في الخلفية وتنزيل الفيديو النهائي المدمج"
            >
              {isExportingVideo ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <FileVideo className="w-5 h-5" />
              )}
              <span>
                {isExportingVideo
                  ? 'جاري المعالجة والدمج عبر FFmpeg...'
                  : enableSrtBurn
                  ? `🎬 دمج ترجمة SRT في الفيديو وتصديره عبر FFmpeg (${fontSize}px • ${subtitlePosition === 'top' ? 'أعلى الشاشة ⬆️' : 'أسفل الشاشة ⬇️'})`
                  : '🎬 تصدير الفيديو والصوت المدبلج فقط عبر FFmpeg'}
              </span>
            </button>
          </div>

          {/* Progress Status Bar */}
          {isExportingVideo && (
            <div className="space-y-1.5 pt-1 animate-in fade-in duration-200">
              <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-amber-500/40">
                <div
                  className="bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-400 h-full transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-amber-300 font-mono">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {exportStatusText || 'جاري معالجة وتركيب الفيديو عبر FFmpeg في الخلفية...'}
                </span>
                <span className="font-bold">{exportProgress}%</span>
              </div>
            </div>
          )}

          {/* Quick Alternative Actions */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
            <button
              type="button"
              id="btn-download-ffmpeg-softsub"
              onClick={() => downloadDubbedVideoFFmpeg('softsub')}
              disabled={!videoUrl || isExportingVideo}
              className="py-1.5 px-2 bg-slate-900 hover:bg-slate-850 text-amber-300 rounded-lg flex items-center justify-center space-x-1 border border-slate-800 hover:border-amber-500/30 transition-all text-[11px] cursor-pointer"
              title="تضمين ملف SRT كمسار داخلي في MP4 (يمكن تفعيله أو إخفاؤه في المشغل)"
            >
              <Zap className="w-3 h-3 text-amber-400" />
              <span>مسار Softsub</span>
            </button>

            <button
              type="button"
              id="btn-download-srt-file"
              onClick={downloadSRT}
              className="py-1.5 px-2 bg-slate-900 hover:bg-slate-850 text-slate-200 rounded-lg flex items-center justify-center space-x-1 border border-slate-800 hover:border-slate-700 transition-all text-[11px] cursor-pointer"
              title="تنزيل ملف SRT بشكل مستقل للاستخدام مع برامج المونتاج أو يوتيوب"
            >
              <Download className="w-3 h-3 text-teal-400" />
              <span>تنزيل ملف SRT</span>
            </button>

            <button
              type="button"
              id="btn-download-vtt-file"
              onClick={downloadVTT}
              className="py-1.5 px-2 bg-slate-900 hover:bg-slate-850 text-slate-200 rounded-lg flex items-center justify-center space-x-1 border border-slate-800 hover:border-slate-700 transition-all text-[11px] cursor-pointer"
              title="تنزيل ملف VTT متوافق مع مواقع الويب"
            >
              <Download className="w-3 h-3 text-cyan-400" />
              <span>تنزيل VTT</span>
            </button>

            <button
              type="button"
              id="btn-open-srt-editor"
              onClick={() => {
                if (!customSrtText) setCustomSrtText(generateSRT());
                setShowSrtEditor(!showSrtEditor);
              }}
              className="py-1.5 px-2 bg-slate-900 hover:bg-slate-850 text-slate-200 rounded-lg flex items-center justify-center space-x-1 border border-slate-800 hover:border-slate-700 transition-all text-[11px] cursor-pointer"
              title="معاينة وتحرير محتوى كود SRT مباشرة"
            >
              <Edit3 className="w-3 h-3 text-amber-400" />
              <span>{showSrtEditor ? 'إخفاء محرر SRT' : 'تحرير SRT'}</span>
            </button>
          </div>
        </div>

        {/* SRT Editor Drawer (if opened) */}
        {showSrtEditor && (
          <div className="p-3.5 bg-slate-950 rounded-xl border border-amber-500/30 space-y-2.5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-amber-300 flex items-center gap-1.5">
                <FileText className="w-4 h-4" />
                <span>محتوى ملف الترجمة SRT المخصص للدمج:</span>
              </span>
              <div className="flex gap-2">
                <label className="text-[10px] text-teal-300 hover:underline flex items-center gap-1 cursor-pointer bg-slate-900 px-2 py-1 rounded border border-slate-800">
                  <Upload className="w-3 h-3" />
                  <span>رفع SRT مخصص</span>
                  <input type="file" accept=".srt,.txt" onChange={handleUploadSrtFile} className="hidden" />
                </label>
                <button
                  type="button"
                  onClick={() => setCustomSrtText('')}
                  className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 bg-slate-900 px-2 py-1 rounded border border-slate-800"
                  title="إعادة توليد الـ SRT تلقائياً من نصوص المقاطع"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>استعادة التلقائي</span>
                </button>
              </div>
            </div>
            <textarea
              dir="ltr"
              value={customSrtText || generateSRT()}
              onChange={(e) => setCustomSrtText(e.target.value)}
              rows={6}
              className="w-full bg-slate-900 text-slate-200 text-xs font-mono p-2.5 rounded-lg border border-slate-800 focus:outline-none focus:border-amber-500 resize-y"
              placeholder="1&#10;00:00:00,000 --> 00:00:03,500&#10;Bambara subtitle line..."
            />
            <p className="text-[10px] text-slate-400">
              * سيقوم FFmpeg بقراءة هذا الملف مباشرة وحرقه على الفيديو بدقة زمنية متناهية.
            </p>
          </div>
        )}

        {/* Section 3: Audio & Separate Downloads */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-300">المسار الصوتي المستقل ومحتويات الدبلجة:</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* WAV Audio */}
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-950 text-emerald-400 flex items-center justify-center shrink-0">
                  <Music className="w-4 h-4" />
                </div>
                <div>
                  <h5 className="text-[11px] font-bold text-white">صوت WAV (24kHz)</h5>
                  <p className="text-[9px] text-slate-400">مسار الدبلجة الصوتي النقي للبامبارا</p>
                </div>
              </div>
              <button
                type="button"
                id="btn-download-wav-track"
                onClick={downloadDubbedAudio}
                disabled={!dubbedAudioUrl}
                className="py-1 px-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-[11px] rounded-lg flex items-center space-x-1 transition-colors cursor-pointer"
              >
                <Download className="w-3 h-3" />
                <span>تنزيل WAV</span>
              </button>
            </div>

            {/* Direct SRT Download */}
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-teal-950 text-teal-400 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h5 className="text-[11px] font-bold text-white">ملف SRT القياسي</h5>
                  <p className="text-[9px] text-slate-400">ملف توقيتات وترجمة مستقل</p>
                </div>
              </div>
              <button
                type="button"
                id="btn-download-srt-direct"
                onClick={downloadSRT}
                className="py-1 px-3 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-[11px] rounded-lg flex items-center space-x-1 transition-colors cursor-pointer"
              >
                <Download className="w-3 h-3" />
                <span>تنزيل SRT</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
          <span className="text-[11px] text-slate-500">
            تصدير احترافي بترميز H.264 وAAC عبر FFmpeg • متوافق مع كافة المشغلات والهواتف
          </span>
          <button
            type="button"
            id="btn-done-export"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
