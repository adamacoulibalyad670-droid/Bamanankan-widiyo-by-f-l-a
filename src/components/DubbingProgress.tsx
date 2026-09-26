import React from 'react';
import { Video, Mic, Languages, Volume2, Film, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

interface DubbingProgressProps {
  currentStep: 'upload' | 'speaker' | 'transcribe' | 'translate' | 'synthesize' | 'complete';
  processingMessage: string;
  error: string | null;
}

export const DubbingProgress: React.FC<DubbingProgressProps> = ({
  currentStep,
  processingMessage,
  error,
}) => {
  const steps = [
    { id: 'upload', label: '1. الملف', icon: Video },
    { id: 'speaker', label: '2. الصوت', icon: Mic },
    { id: 'transcribe', label: '3. تفريغ ASR', icon: Mic },
    { id: 'translate', label: '4. ترجمة البامبارا', icon: Languages },
    { id: 'synthesize', label: '5. توليد TTS', icon: Volume2 },
    { id: 'complete', label: '6. الفيديو المدبلج', icon: Film },
  ];

  const getStepStatus = (stepId: string) => {
    const order = ['upload', 'speaker', 'transcribe', 'translate', 'synthesize', 'complete'];
    const currentIndex = order.indexOf(currentStep);
    const stepIndex = order.indexOf(stepId);

    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'upcoming';
  };

  return (
    <div id="dubbing-progress-pipeline" className="space-y-4">
      {/* Step Indicator Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {steps.map((s) => {
          const status = getStepStatus(s.id);
          const Icon = s.icon;

          return (
            <div
              key={s.id}
              className={`p-3 rounded-xl border flex items-center space-x-2 text-xs transition-all ${
                status === 'completed'
                  ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                  : status === 'current'
                  ? 'bg-amber-950/60 border-amber-500/80 text-amber-300 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/40'
                  : 'bg-slate-900/40 border-slate-800 text-slate-500'
              }`}
            >
              <div className="flex-shrink-0">
                {status === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : status === 'current' ? (
                  <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                ) : (
                  <Icon className="w-4 h-4 text-slate-500" />
                )}
              </div>
              <span className="font-semibold truncate">{s.label}</span>
            </div>
          );
        })}
      </div>

      {/* Processing Message Banner */}
      {processingMessage && (
        <div id="processing-banner" className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center space-x-3 text-xs">
          <Loader2 className="w-4 h-4 text-amber-400 animate-spin flex-shrink-0" />
          <span className="text-slate-300 font-medium">{processingMessage}</span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div id="error-banner" className="bg-rose-950/80 border border-rose-800/80 rounded-xl p-4 flex items-center space-x-3 text-xs text-rose-200">
          <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
          <div>
            <strong className="block font-bold">حدث خطأ أثناء المعالجة:</strong>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
};
