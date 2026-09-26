import React, { useState, useMemo } from 'react';
import { AudioSegment, VocabularyNote } from '../types';
import {
  Languages,
  Plus,
  Trash2,
  Sparkles,
  Check,
  CheckCheck,
  Edit3,
  Volume2,
  BookOpen,
  AlertCircle,
  Wand2,
  Sliders,
  RotateCcw,
  Loader2,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  reviewBambaraGrammar,
  normalizeBambaraText,
  detectSegmentLinguisticIssues,
  LinguisticIssue,
} from '../utils/bambaraNormalizer';

interface TranscriptEditorProps {
  segments: AudioSegment[];
  fullOriginalText: string;
  fullBambaraText: string;
  vocabularyNotes: VocabularyNote[];
  onSegmentsChange: (segments: AudioSegment[]) => void;
  onRefineTranslation: (customPrompt?: string) => void;
  onSynthesizeSegmentTTS?: (segment: AudioSegment) => void;
  handleSynthesizeSingleSegment?: (segment: AudioSegment) => void;
  isProcessing: boolean;
}

export const TranscriptEditor: React.FC<TranscriptEditorProps> = ({
  segments,
  fullOriginalText,
  fullBambaraText,
  vocabularyNotes,
  onSegmentsChange,
  onRefineTranslation,
  onSynthesizeSegmentTTS,
  handleSynthesizeSingleSegment,
  isProcessing,
}) => {
  const [customInstruction, setCustomInstruction] = useState('');
  const [showVocab, setShowVocab] = useState(false);
  const [showReviewLayer, setShowReviewLayer] = useState(true);
  const [autoResynthesizeOnFix, setAutoResynthesizeOnFix] = useState(true);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'numbers' | 'terms'>('all');
  const [customFindTerm, setCustomFindTerm] = useState('');
  const [customReplaceTerm, setCustomReplaceTerm] = useState('');
  const [synthesizingSegmentId, setSynthesizingSegmentId] = useState<number | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Unify audio synthesis handler between prop names
  const synthesizeFn = handleSynthesizeSingleSegment || onSynthesizeSegmentTTS;

  // Trigger segment audio synthesis with loading state & toast
  const triggerSegmentSynthesis = async (segment: AudioSegment, feedbackMessage?: string) => {
    if (!synthesizeFn) return;
    setSynthesizingSegmentId(segment.id);
    if (feedbackMessage) {
      setFeedbackToast(feedbackMessage);
      setTimeout(() => setFeedbackToast(null), 3500);
    }
    try {
      await synthesizeFn(segment);
    } catch (e) {
      console.warn('Audio synthesis trigger error:', e);
    } finally {
      setTimeout(() => {
        setSynthesizingSegmentId(null);
      }, 800);
    }
  };

  const handleTextChange = (id: number, field: 'originalText' | 'bambaraText', value: string) => {
    const updated = segments.map((seg) => {
      if (seg.id === id) {
        return { ...seg, [field]: value };
      }
      return seg;
    });
    onSegmentsChange(updated);
  };

  const handleAddSegment = () => {
    const newId = segments.length > 0 ? Math.max(...segments.map((s) => s.id)) + 1 : 1;
    const lastEnd = segments.length > 0 ? segments[segments.length - 1].end : 0;
    const newSeg: AudioSegment = {
      id: newId,
      start: lastEnd,
      end: lastEnd + 4,
      originalText: 'New phrase segment...',
      bambaraText: 'Segment kura Bamanankan la...',
    };
    onSegmentsChange([...segments, newSeg]);
  };

  const handleDeleteSegment = (id: number) => {
    onSegmentsChange(segments.filter((s) => s.id !== id));
  };

  // Analyze all segments for linguistic issues (numbers, loanwords, grammar particles)
  const allDetectedIssues = useMemo(() => {
    const list: { segment: AudioSegment; issues: LinguisticIssue[] }[] = [];
    segments.forEach((seg) => {
      const issues = detectSegmentLinguisticIssues(seg.bambaraText || '');
      if (issues.length > 0) {
        list.push({ segment: seg, issues });
      }
    });
    return list;
  }, [segments]);

  const totalIssueCount = useMemo(() => {
    return allDetectedIssues.reduce((acc, curr) => acc + curr.issues.length, 0);
  }, [allDetectedIssues]);

  const totalNumbersCount = useMemo(() => {
    return allDetectedIssues.reduce(
      (acc, curr) => acc + curr.issues.filter((i) => i.type === 'number' || i.type === 'time' || i.type === 'percent').length,
      0
    );
  }, [allDetectedIssues]);

  const totalTermsCount = useMemo(() => {
    return allDetectedIssues.reduce(
      (acc, curr) => acc + curr.issues.filter((i) => i.type === 'term' || i.type === 'particle').length,
      0
    );
  }, [allDetectedIssues]);

  // Apply single correction to a segment, update state, and re-synthesize audio
  const applySingleCorrection = async (
    segmentId: number,
    originalMatch: string,
    suggestedBambara: string,
    issueType: string
  ) => {
    let targetUpdatedSeg: AudioSegment | null = null;

    const updated = segments.map((seg) => {
      if (seg.id === segmentId) {
        // Regex word boundary replace
        const escaped = originalMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const reg = new RegExp(`\\b${escaped}\\b`, 'gi');
        const newText = seg.bambaraText.replace(reg, suggestedBambara);
        const updatedSeg = { ...seg, bambaraText: newText };
        targetUpdatedSeg = updatedSeg;
        return updatedSeg;
      }
      return seg;
    });

    onSegmentsChange(updated);

    if (autoResynthesizeOnFix && targetUpdatedSeg) {
      const typeLabel = issueType === 'number' ? 'الرقم' : 'المصطلح';
      await triggerSegmentSynthesis(
        targetUpdatedSeg,
        `✓ تم تصحيح ${typeLabel} "${originalMatch}" إلى "${suggestedBambara}" وجاري الاستماع للنطق 🔊`
      );
    }
  };

  // Batch: Apply full grammatical review & number normalization across ALL segments
  const applyBatchLinguisticReview = async () => {
    let firstModified: AudioSegment | null = null;

    const updated = segments.map((seg) => {
      const current = seg.bambaraText || '';
      const normalized = normalizeBambaraText(current);
      const reviewed = reviewBambaraGrammar(normalized);

      const modified = { ...seg, bambaraText: reviewed };
      if (reviewed !== current && !firstModified) {
        firstModified = modified;
      }
      return modified;
    });

    onSegmentsChange(updated);

    if (autoResynthesizeOnFix && (firstModified || segments[0])) {
      const targetToPlay = firstModified || segments[0];
      await triggerSegmentSynthesis(
        targetToPlay,
        `✓ تم تدقيق وتصحيح كافة الأرقام والمصطلحات في جميع المقاطع! جاري الاستماع للمقطع #${targetToPlay.id} 🔊`
      );
    } else {
      setFeedbackToast('✓ تم تدقيق وضبط جميع المقاطع بنجاح');
      setTimeout(() => setFeedbackToast(null), 3000);
    }
  };

  // Custom Find & Replace rule across all segments
  const handleApplyCustomReplacement = async () => {
    if (!customFindTerm.trim()) return;

    let modifiedCount = 0;
    let firstChangedSeg: AudioSegment | null = null;

    const updated = segments.map((seg) => {
      const escaped = customFindTerm.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reg = new RegExp(escaped, 'gi');
      if (reg.test(seg.bambaraText)) {
        modifiedCount++;
        const newText = seg.bambaraText.replace(reg, customReplaceTerm.trim());
        const modified = { ...seg, bambaraText: newText };
        if (!firstChangedSeg) firstChangedSeg = modified;
        return modified;
      }
      return seg;
    });

    if (modifiedCount > 0) {
      onSegmentsChange(updated);
      setCustomFindTerm('');
      setCustomReplaceTerm('');

      if (autoResynthesizeOnFix && firstChangedSeg) {
        await triggerSegmentSynthesis(
          firstChangedSeg,
          `✓ تم استبدال المصطلح في ${modifiedCount} مقطع/مقاطع! جاري الاستماع للمقطع المعدل 🔊`
        );
      } else {
        setFeedbackToast(`✓ تم تطبيق الاستبدال في ${modifiedCount} مقطع/مقاطع بنجاح`);
        setTimeout(() => setFeedbackToast(null), 3000);
      }
    } else {
      setFeedbackToast(`لم يتم العثور على مصطلح "${customFindTerm}" في المقاطع`);
      setTimeout(() => setFeedbackToast(null), 3000);
    }
  };

  return (
    <div id="transcript-editor-container" className="space-y-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8">
      {/* Toast Notification */}
      {feedbackToast && (
        <div className="p-3 bg-amber-500 text-slate-950 rounded-xl font-bold text-xs flex items-center justify-between shadow-xl animate-in fade-in duration-200 border border-amber-300">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>{feedbackToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackToast(null)}
            className="text-slate-950 hover:opacity-75 text-xs font-mono px-1.5 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Editor Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <Languages className="w-5 h-5 text-amber-400" />
            <h3 id="transcript-editor-title" className="text-lg font-bold text-white">
              محرر النصوص المترجمة (النص الأصلي ⟷ البامبارا)
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            لجنة مراجعة لغوية متكاملة تتيح تدقيق الأرقام والمصطلحات مع توليد صوتي فوري للتحقق من سلامة النطق البامباري.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            id="btn-toggle-review-layer"
            onClick={() => setShowReviewLayer(!showReviewLayer)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all shadow-sm ${
              showReviewLayer
                ? 'bg-amber-500 text-slate-950 shadow-amber-500/20'
                : 'bg-slate-800 text-amber-400 hover:bg-slate-750 border border-amber-500/30'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>لجنة المراجعة اللغوية</span>
            {totalIssueCount > 0 && (
              <span className="mr-1 px-1.5 py-0.2 bg-slate-950 text-amber-300 rounded-full text-[10px] font-mono">
                {totalIssueCount}
              </span>
            )}
          </button>

          <button
            type="button"
            id="btn-quick-download-srt"
            onClick={() => {
              const srt = segments
                .map((seg, idx) => {
                  const hrs = Math.floor(seg.start / 3600);
                  const mins = Math.floor((seg.start % 3600) / 60);
                  const secs = Math.floor(seg.start % 60);
                  const millis = Math.floor((seg.start % 1) * 1000);
                  const ehrs = Math.floor(seg.end / 3600);
                  const emins = Math.floor((seg.end % 3600) / 60);
                  const esecs = Math.floor(seg.end % 60);
                  const emillis = Math.floor((seg.end % 1) * 1000);
                  const t1 = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
                  const t2 = `${String(ehrs).padStart(2, '0')}:${String(emins).padStart(2, '0')}:${String(esecs).padStart(2, '0')},${String(emillis).padStart(3, '0')}`;
                  return `${idx + 1}\n${t1} --> ${t2}\n${seg.bambaraText}\n`;
                })
                .join('\n');
              const blob = new Blob([srt], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `bambara_subtitles_${Date.now()}.srt`;
              a.click();
            }}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold flex items-center space-x-1 transition-colors border border-slate-700"
          >
            <span>📥 تنزيل SRT</span>
          </button>

          <button
            type="button"
            id="btn-add-segment"
            onClick={handleAddSegment}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-medium flex items-center space-x-1 transition-colors border border-slate-700"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>إضافة مقطع</span>
          </button>

          <button
            type="button"
            id="btn-toggle-vocab"
            onClick={() => setShowVocab(!showVocab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1 transition-colors ${
              showVocab
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-750 border border-slate-700'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
            <span>القاموس ({vocabularyNotes.length})</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 🌟 LINGUISTIC REVIEW LAYER (لجنة المراجعة اللغوية والنحوية) 🌟 */}
      {/* ============================================================== */}
      {showReviewLayer && (
        <div
          id="linguistic-review-layer"
          className="bg-gradient-to-br from-amber-950/40 via-slate-950 to-slate-950 border border-amber-500/40 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xl"
        >
          {/* Header & Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-500/20 pb-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shadow-md shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-white">لجنة المراجعة اللغوية والتدقيق الصوتي الفوري</h4>
                  <span className="px-2 py-0.5 rounded text-[9px] bg-amber-500 text-slate-950 font-extrabold shadow-sm">
                    Linguistic Review Layer
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  رصد فوري للأرقام والصيغ الزمنية والمصطلحات الدخيلة، مع إعادة توليد الصوت ونطقه تلقائياً عند أي تعديل لضمان دقة اللفظ البامباري.
                </p>
              </div>
            </div>

            {/* Auto Re-synthesize Audio Switch */}
            <div className="flex items-center gap-2 self-start sm:self-center bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                <span>إعادة توليد ونطق الصوت فوراً:</span>
              </span>
              <button
                type="button"
                id="toggle-auto-resynthesize"
                onClick={() => setAutoResynthesizeOnFix(!autoResynthesizeOnFix)}
                className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                  autoResynthesizeOnFix ? 'bg-amber-500 justify-end' : 'bg-slate-700 justify-start'
                }`}
                title="تفعيل التوليد والنطق الفوري للمقطع الصوتي عند تطبيق أي تصحيح"
              >
                <div className="w-4 h-4 rounded-full bg-slate-950 shadow-md transform transition-transform" />
              </button>
            </div>
          </div>

          {/* Quick Metrics & Batch Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Metric 1: Numbers & Times */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] text-slate-400 font-medium">أرقام وتوقيتات بحاجة للنطق:</div>
                <div className="text-lg font-bold font-mono text-amber-300 mt-0.5">
                  {totalNumbersCount} <span className="text-[10px] font-normal text-slate-400">حالة</span>
                </div>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                🔢 حسابي
              </span>
            </div>

            {/* Metric 2: Specialized Terms */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] text-slate-400 font-medium">مصطلحات مقترح توحيدها:</div>
                <div className="text-lg font-bold font-mono text-teal-300 mt-0.5">
                  {totalTermsCount} <span className="text-[10px] font-normal text-slate-400">مصطلح</span>
                </div>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 font-bold">
                📖 معجم
              </span>
            </div>

            {/* Metric 3: Overall Status & Batch Fix Button */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-2.5 flex flex-col justify-center">
              <button
                type="button"
                id="btn-batch-apply-linguistic-review"
                onClick={applyBatchLinguisticReview}
                className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center space-x-1.5 shadow-md shadow-amber-500/10 transition-all cursor-pointer"
                title="تطبيق قواعد النحو البامباري وتحويل كافة الأرقام لصيغ منطوقة في جميع المقاطع دفعة واحدة"
              >
                <Wand2 className="w-3.5 h-3.5 shrink-0" />
                <span>تدقيق وتصحيح الكل دفعة واحدة ⚡</span>
              </button>
            </div>
          </div>

          {/* Custom Terminology Quick Replacement Bar */}
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 space-y-2">
            <div className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
              <Edit3 className="w-3.5 h-3.5 text-amber-400" />
              <span>استبدال مصطلح مخصص في كامل النص مع توليد النطق تلقائياً:</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
              <div className="sm:col-span-3">
                <input
                  type="text"
                  id="input-find-term"
                  value={customFindTerm}
                  onChange={(e) => setCustomFindTerm(e.target.value)}
                  placeholder="المصطلح الحالي (مثال: video أو 2026)..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="sm:col-span-3">
                <input
                  type="text"
                  id="input-replace-term"
                  value={customReplaceTerm}
                  onChange={(e) => setCustomReplaceTerm(e.target.value)}
                  placeholder="البديل بالبامبارا (مثال: Ja tɛmɛnen أو ba fila...)..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="sm:col-span-1">
                <button
                  type="button"
                  id="btn-apply-custom-term"
                  onClick={handleApplyCustomReplacement}
                  disabled={!customFindTerm.trim()}
                  className="w-full h-full py-1.5 px-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center transition-all cursor-pointer"
                >
                  <span>استبدال 🔊</span>
                </button>
              </div>
            </div>
          </div>

          {/* Detected Issues Details Accordion / List */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>الملاحظات اللغوية المكتشفة في المقاطع:</span>
              </span>
              <div className="flex gap-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => setReviewFilter('all')}
                  className={`px-2 py-0.5 rounded ${
                    reviewFilter === 'all' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  الكل ({totalIssueCount})
                </button>
                <button
                  type="button"
                  onClick={() => setReviewFilter('numbers')}
                  className={`px-2 py-0.5 rounded ${
                    reviewFilter === 'numbers' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  الأرقام ({totalNumbersCount})
                </button>
                <button
                  type="button"
                  onClick={() => setReviewFilter('terms')}
                  className={`px-2 py-0.5 rounded ${
                    reviewFilter === 'terms' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  المصطلحات ({totalTermsCount})
                </button>
              </div>
            </div>

            {totalIssueCount === 0 ? (
              <div className="p-4 bg-emerald-950/30 border border-emerald-800/40 rounded-xl text-center space-y-1">
                <div className="flex items-center justify-center space-x-1.5 text-emerald-400 font-bold text-xs">
                  <CheckCheck className="w-4 h-4" />
                  <span>جميع النصوص ومصطلحات البامبارا والأرقام سليمة ومنسجمة 100%!</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  لا توجد أي أرقام خام أو مصطلحات دخيلة غير معيارية في المقاطع الحالية.
                </p>
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {allDetectedIssues.map(({ segment, issues }) => {
                  const filteredIssues = issues.filter((iss) => {
                    if (reviewFilter === 'numbers') return iss.type === 'number' || iss.type === 'time' || iss.type === 'percent';
                    if (reviewFilter === 'terms') return iss.type === 'term' || iss.type === 'particle';
                    return true;
                  });

                  if (filteredIssues.length === 0) return null;

                  return (
                    <div
                      key={segment.id}
                      className="bg-slate-900/90 rounded-xl border border-slate-800 p-3 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1.5">
                        <span className="font-bold text-amber-400">
                          مقطع #{segment.id} (⏱ {segment.start.toFixed(1)}s - {segment.end.toFixed(1)}s)
                        </span>
                        <span className="text-[10px] text-slate-400 italic truncate max-w-[240px]">
                          "{segment.originalText}"
                        </span>
                      </div>

                      {/* Issues in this segment */}
                      <div className="space-y-1.5">
                        {filteredIssues.map((iss, iIdx) => (
                          <div
                            key={iIdx}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-slate-950/70 rounded-lg border border-slate-800/80"
                          >
                            <div className="flex items-center space-x-2">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                {iss.type === 'number' ? 'رقم' : iss.type === 'time' ? 'توقيت' : iss.type === 'percent' ? 'نسبة' : 'مصطلح'}
                              </span>
                              <span className="line-through text-rose-400 font-mono text-[11px]">{iss.originalMatch}</span>
                              <ArrowRight className="w-3 h-3 text-slate-500" />
                              <span className="text-emerald-400 font-bold text-xs">{iss.suggestedBambara}</span>
                              <span className="text-[10px] text-slate-400 hidden sm:inline">({iss.explanation})</span>
                            </div>

                            <button
                              type="button"
                              id={`btn-apply-fix-${segment.id}-${iIdx}`}
                              onClick={() =>
                                applySingleCorrection(
                                  segment.id,
                                  iss.originalMatch,
                                  iss.suggestedBambara,
                                  iss.type
                                )
                              }
                              disabled={synthesizingSegmentId === segment.id}
                              className="self-end sm:self-center px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-md text-[10px] flex items-center space-x-1 transition-all cursor-pointer disabled:opacity-50"
                              title="تصحيح الكلمة في المقطع وإعادة توليد النطق فوراً"
                            >
                              {synthesizingSegmentId === segment.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Volume2 className="w-3 h-3" />
                              )}
                              <span>تصحيح واستماع فوري 🔊</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Refine Panel (Tone & Dialect Selection) */}
      <div id="ai-refine-box" className="bg-slate-950/80 border border-amber-500/30 rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
          <label className="block text-xs font-bold text-amber-300">
            أسلوب ولهجة الترجمة (Dialect & Custom Prompt):
          </label>
          {/* Quick Tone Selector Buttons */}
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <button
              type="button"
              id="btn-tone-formal"
              onClick={() => setCustomInstruction('لهجة رسمية معيارية (Bamanankan Sɛbɛn) مع المحافظة على دقة القواعد النحوية')}
              className={`px-2.5 py-1 rounded-md font-medium border transition-all ${
                customInstruction.includes('رسمية')
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              📜 رسمية (Formal)
            </button>

            <button
              type="button"
              id="btn-tone-colloquial"
              onClick={() => setCustomInstruction('لهجة عامية يومية (Bamanankan Kuma) بأسلوب الشارع الشائع والمبسط')}
              className={`px-2.5 py-1 rounded-md font-medium border transition-all ${
                customInstruction.includes('عامية')
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              🗣️ عامية (Colloquial)
            </button>

            <button
              type="button"
              id="btn-tone-journalistic"
              onClick={() => setCustomInstruction('لهجة إعلامية وصحفية رصينة مخصصة للتقارير والأخبار')}
              className={`px-2.5 py-1 rounded-md font-medium border transition-all ${
                customInstruction.includes('إعلامية')
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              📰 إعلامية (Journalistic)
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1">
            <input
              type="text"
              id="input-custom-prompt"
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              placeholder="مثال: استخدم لهجة باماكو الرسمية مع تبسيط المصطلحات التقنية..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            type="button"
            id="btn-retranslate-ai"
            onClick={() => onRefineTranslation(customInstruction)}
            disabled={isProcessing}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center space-x-1.5 shadow-md self-end sm:self-auto transition-all cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>إعادة الترجمة + المراجعة اللغوية</span>
          </button>
        </div>
      </div>

      {/* Segments List */}
      <div id="segments-list" className="space-y-4 max-h-[520px] overflow-y-auto pr-2">
        {segments.map((seg, idx) => {
          // Detect issues specific to this segment's text for inline chips
          const segIssues = detectSegmentLinguisticIssues(seg.bambaraText || '');

          return (
            <div
              key={seg.id}
              id={`segment-row-${seg.id}`}
              className={`bg-slate-950/60 border rounded-xl p-4 transition-all ${
                segIssues.length > 0 ? 'border-amber-500/40 hover:border-amber-500/60' : 'border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2 border-b border-slate-800/60 pb-2">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-amber-400">#{idx + 1}</span>
                  <span className="bg-slate-800 px-2 py-0.5 rounded text-[11px] text-slate-300 font-mono">
                    ⏱ {seg.start.toFixed(1)}s - {seg.end.toFixed(1)}s
                  </span>
                  {seg.speaker && <span className="text-slate-400 text-[11px]">[{seg.speaker}]</span>}
                  {segIssues.length > 0 && (
                    <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[10px] font-bold">
                      💡 {segIssues.length} تنبيه لغوي
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    id={`btn-tts-segment-${seg.id}`}
                    onClick={() => triggerSegmentSynthesis(seg, `🔊 جاري تشغيل مقطع #${seg.id}`)}
                    disabled={synthesizingSegmentId === seg.id}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded text-[11px] flex items-center space-x-1 cursor-pointer transition-colors"
                  >
                    {synthesizingSegmentId === seg.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Volume2 className="w-3 h-3" />
                    )}
                    <span>{synthesizingSegmentId === seg.id ? 'جاري التوليد...' : 'معاينة الصوت'}</span>
                  </button>

                  <button
                    type="button"
                    id={`btn-delete-segment-${seg.id}`}
                    onClick={() => handleDeleteSegment(seg.id)}
                    className="p-1 hover:bg-rose-950 text-slate-500 hover:text-rose-400 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {/* Original Text */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    النص الأصلي (Original Language)
                  </label>
                  <textarea
                    id={`input-orig-text-${seg.id}`}
                    rows={2}
                    value={seg.originalText}
                    onChange={(e) => handleTextChange(seg.id, 'originalText', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-slate-600 resize-none"
                  />
                </div>

                {/* Bambara Text */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-medium text-amber-400">
                      النص بالبامبارا (Bamanankan Translation)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const fixed = reviewBambaraGrammar(seg.bambaraText);
                        handleTextChange(seg.id, 'bambaraText', fixed);
                        if (autoResynthesizeOnFix) {
                          triggerSegmentSynthesis({ ...seg, bambaraText: fixed }, `✓ تم تدقيق المقطع #${seg.id} ونطقه`);
                        }
                      }}
                      className="text-[10px] text-amber-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                    >
                      <Wand2 className="w-2.5 h-2.5" />
                      <span>تدقيق نحوي فوري</span>
                    </button>
                  </div>
                  <textarea
                    id={`input-bambara-text-${seg.id}`}
                    rows={2}
                    value={seg.bambaraText}
                    onChange={(e) => handleTextChange(seg.id, 'bambaraText', e.target.value)}
                    className="w-full bg-slate-900/90 border border-amber-500/40 rounded-lg p-2 text-xs text-amber-200 font-medium focus:outline-none focus:border-amber-400 resize-none"
                  />

                  {/* Inline Quick Fix Chips for detected issues in this segment */}
                  {segIssues.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-1 border-t border-slate-800/60">
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-amber-400" />
                        <span>اقتراحات اللجنة:</span>
                      </span>
                      {segIssues.map((iss, issIdx) => (
                        <button
                          key={issIdx}
                          type="button"
                          onClick={() =>
                            applySingleCorrection(seg.id, iss.originalMatch, iss.suggestedBambara, iss.type)
                          }
                          className="px-2 py-0.5 bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-md text-[10px] flex items-center space-x-1 transition-all cursor-pointer"
                          title={`استبدال "${iss.originalMatch}" بـ "${iss.suggestedBambara}" ونطق المقطع فورياً`}
                        >
                          <span className="line-through text-rose-400 text-[9px]">{iss.originalMatch}</span>
                          <span>➔</span>
                          <span className="font-bold text-emerald-300">{iss.suggestedBambara}</span>
                          <Volume2 className="w-2.5 h-2.5 text-amber-400" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Vocabulary Breakdown (Optional) */}
      {showVocab && vocabularyNotes.length > 0 && (
        <div id="vocab-breakdown-card" className="bg-emerald-950/40 border border-emerald-800/60 rounded-xl p-5 space-y-3">
          <div className="flex items-center space-x-2 text-emerald-400">
            <BookOpen className="w-4 h-4" />
            <h4 className="font-bold text-xs uppercase tracking-wider">
              قاموس كلمات البامبارا وسياقها الثقافي (Vocabulary Notes)
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {vocabularyNotes.map((note, index) => (
              <div key={index} className="bg-slate-950/80 rounded-lg p-3 border border-emerald-900/60 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-300 text-sm">{note.bambara}</span>
                  {note.phonetic && (
                    <span className="text-[10px] text-slate-400 font-mono">[{note.phonetic}]</span>
                  )}
                </div>
                <p className="text-emerald-300 text-xs mt-1">EN: {note.english}</p>
                {note.french && <p className="text-slate-400 text-[11px]">FR: {note.french}</p>}
                {note.context && (
                  <p className="text-[10px] text-slate-400 italic mt-1 border-t border-slate-800 pt-1">
                    💡 {note.context}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
