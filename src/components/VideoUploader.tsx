import React, { useState, useRef } from 'react';
import { Upload, Video, Mic, MicOff, Sparkles, Play, FileVideo, Music, CheckCircle2 } from 'lucide-react';
import { SAMPLE_VIDEOS } from '../data/samples';
import { SampleVideo } from '../types';

interface VideoUploaderProps {
  onFileSelected: (file: File) => void;
  onSampleSelected: (sample: SampleVideo) => void;
  onRecordingComplete: (blob: Blob, fileName: string) => void;
  isProcessing: boolean;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({
  onFileSelected,
  onSampleSelected,
  onRecordingComplete,
  isProcessing,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
        onFileSelected(file);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelected(e.target.files[0]);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        onRecordingComplete(audioBlob, `mic_record_${Date.now()}.webm`);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Microphone access is required to record live audio.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  return (
    <div id="video-uploader-container" className="space-y-8">
      {/* Upload Dropzone */}
      <div
        id="upload-dropzone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all cursor-pointer ${
          isDragOver
            ? 'border-amber-400 bg-amber-500/10 shadow-xl shadow-amber-500/10 scale-[1.01]'
            : 'border-slate-700 bg-slate-900/60 hover:border-amber-500/60 hover:bg-slate-800/60'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/x-matroska,video/x-msvideo,audio/wav,audio/mp3,audio/webm"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center group-hover:scale-110 transition-transform shadow-md">
            <Upload className="w-8 h-8 text-amber-400" />
          </div>

          <div>
            <h3 id="dropzone-title" className="text-lg font-semibold text-white">
              ارفع ملف الفيديو أو الصوت
            </h3>
            <p id="dropzone-subtitle" className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
              يدعم الصيغ التالية: <strong className="text-slate-200">MP4, MOV, MKV, AVI, MP3, WAV</strong>
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <span className="text-xs px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 flex items-center">
              <FileVideo className="w-3.5 h-3.5 mr-1 text-emerald-400" /> MP4 Video
            </span>
            <span className="text-xs px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 flex items-center">
              <Music className="w-3.5 h-3.5 mr-1 text-teal-400" /> Audio Track
            </span>
            <span className="text-xs px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 flex items-center">
              <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-400" /> Auto Audio Extraction
            </span>
          </div>
        </div>
      </div>

      {/* Alternative Options Grid: Live Recording & Sample Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Live Mic Recorder Card */}
        <div id="mic-recorder-card" className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 text-amber-400 mb-2">
              <Mic className="w-5 h-5" />
              <h4 className="font-semibold text-sm text-white">تسجيل صوت مباشر</h4>
            </div>
            <p className="text-xs text-slate-400">
              سجّل صوتك مباشرة بدلاً من تحميل فيديو لتجربة الترجمة السريعة للبامبارا.
            </p>
          </div>

          <div className="mt-4">
            {!isRecording ? (
              <button
                id="btn-start-mic-record"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  startRecording();
                }}
                disabled={isProcessing}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-medium rounded-lg text-xs flex items-center justify-center space-x-2 transition-all shadow-md"
              >
                <Mic className="w-4 h-4" />
                <span>ابدأ التسجيل المباشر</span>
              </button>
            ) : (
              <button
                id="btn-stop-mic-record"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  stopRecording();
                }}
                className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg text-xs flex items-center justify-center space-x-2 transition-all shadow-md animate-pulse"
              >
                <MicOff className="w-4 h-4" />
                <span>إيقاف التسجيل ({recordingSeconds}s)</span>
              </button>
            )}
          </div>
        </div>

        {/* 1-Click Test Samples Title */}
        <div className="md:col-span-2 bg-slate-900/80 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h4 className="font-semibold text-sm text-white">أو اختر فيديو تجريبي جاهز (1-Click Sample)</h4>
            </div>
            <span className="text-[11px] text-slate-400">بدون تحميل ملفات</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SAMPLE_VIDEOS.map((sample) => (
              <div
                key={sample.id}
                id={`sample-card-${sample.id}`}
                onClick={() => onSampleSelected(sample)}
                className="group relative bg-slate-950 rounded-lg overflow-hidden border border-slate-800 hover:border-emerald-500/60 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="aspect-video relative overflow-hidden bg-slate-800">
                  <img
                    src={sample.thumbnail}
                    alt={sample.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-slate-950/40 group-hover:bg-slate-950/20 transition-colors flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                      <Play className="w-4 h-4 fill-slate-950 ml-0.5" />
                    </div>
                  </div>
                  <span className="absolute bottom-1 right-1 bg-slate-950/80 text-[10px] text-emerald-300 px-1.5 py-0.5 rounded">
                    {sample.duration}s
                  </span>
                </div>

                <div className="p-2.5">
                  <h5 className="text-xs font-medium text-white line-clamp-1 group-hover:text-emerald-400 transition-colors">
                    {sample.title}
                  </h5>
                  <p className="text-[11px] text-emerald-400/80 line-clamp-1 mt-0.5">
                    {sample.titleBambara}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
