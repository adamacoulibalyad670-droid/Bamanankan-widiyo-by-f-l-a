const clientTranslateCache = new Map<string, any>();
const clientTranscribeCache = new Map<string, any>();

async function safeResponseJson(response: Response): Promise<any> {
  try {
    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try {
        return JSON.parse(text);
      } catch (e) {
        // Fallback for json parse error
      }
    }
    return {
      success: false,
      error: `تنبيه الخادم: استجابة مؤقتة غير مكتملة (HTTP ${response.status}). يرجى المحاولة مجدداً.`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `خطأ في الاتصال بالخادم: ${err?.message || 'الشبكة غير مستقرة'}`,
    };
  }
}

export async function fetchTranscribeWithBackoff(
  bodyObj: Record<string, any>,
  maxRetries = 6,
  initialDelayMs = 1200,
  onRetry?: (attempt: number, delayMs: number) => void
): Promise<{ success: boolean; detectedLanguage: string; fullTranscript: string; segments: any[]; clonedVoiceProfile?: any; error?: string }> {
  const cacheKey = typeof bodyObj.mediaBase64 === 'string' ? bodyObj.mediaBase64.substring(0, 100) + bodyObj.mediaBase64.length : JSON.stringify(bodyObj);
  if (clientTranscribeCache.has(cacheKey)) {
    console.log("⚡ Returning instant cached transcription from client memory");
    return clientTranscribeCache.get(cacheKey);
  }

  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj),
      });

      const data = await safeResponseJson(response);

      if (response.ok && data.success) {
        clientTranscribeCache.set(cacheKey, data);
        return data;
      }

      const errorMessage = data.error || data.message || `HTTP ${response.status}`;
      const isRateLimited =
        response.status === 429 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504 ||
        /429|502|503|RESOURCE_EXHAUSTED|Quota exceeded|الحد الأقصى/i.test(errorMessage);

      if (isRateLimited && attempt < maxRetries) {
        const delayMs = initialDelayMs * Math.pow(1.6, attempt - 1);
        console.warn(`[Transcribe API Backoff] Rate limit hit (Attempt ${attempt}/${maxRetries}). Waiting ${delayMs}ms...`);
        if (onRetry) {
          onRetry(attempt, delayMs);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      throw new Error(errorMessage || 'فشل التفريغ الصوتي');
    } catch (err: any) {
      lastError = err;
      const isRateLimited = /429|502|503|RESOURCE_EXHAUSTED|Quota exceeded|الحد الأقصى/i.test(err?.message || '');
      if (isRateLimited && attempt < maxRetries) {
        const delayMs = initialDelayMs * Math.pow(1.6, attempt - 1);
        console.warn(`[Transcribe API Network Retry] Rate limit hit (Attempt ${attempt}/${maxRetries}). Waiting ${delayMs}ms...`);
        if (onRetry) {
          onRetry(attempt, delayMs);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      if (attempt >= maxRetries) {
        throw err;
      }
    }
  }

  throw lastError || new Error('فشل التفريغ الصوتي بعد عدة محاولات.');
}

export async function fetchTranslateWithBackoff(
  bodyObj: Record<string, any>,
  maxRetries = 6,
  initialDelayMs = 1200,
  onRetry?: (attempt: number, delayMs: number) => void
): Promise<{ success: boolean; bambaraFullText: string; translatedSegments: any[]; vocabularyNotes: any[]; error?: string }> {
  const cacheKey = JSON.stringify(bodyObj);
  if (clientTranslateCache.has(cacheKey)) {
    console.log("⚡ Returning instant cached translation from client memory");
    return clientTranslateCache.get(cacheKey);
  }

  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj),
      });

      const data = await safeResponseJson(response);

      if (response.ok && data.success) {
        clientTranslateCache.set(cacheKey, data);
        return data;
      }

      const errorMessage = data.error || data.message || `HTTP ${response.status}`;
      const isRateLimited =
        response.status === 429 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504 ||
        /429|502|503|RESOURCE_EXHAUSTED|Quota exceeded|الحد الأقصى/i.test(errorMessage);

      if (isRateLimited && attempt < maxRetries) {
        const delayMs = initialDelayMs * Math.pow(1.6, attempt - 1);
        console.warn(`[Translate API Backoff] Rate limit hit (Attempt ${attempt}/${maxRetries}). Waiting ${delayMs}ms...`);
        if (onRetry) {
          onRetry(attempt, delayMs);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      throw new Error(errorMessage || 'فشلت الترجمة إلى البامبارا');
    } catch (err: any) {
      lastError = err;
      const isRateLimited = /429|502|503|RESOURCE_EXHAUSTED|Quota exceeded|الحد الأقصى/i.test(err?.message || '');
      if (isRateLimited && attempt < maxRetries) {
        const delayMs = initialDelayMs * Math.pow(1.6, attempt - 1);
        console.warn(`[Translate API Network Retry] Rate limit hit (Attempt ${attempt}/${maxRetries}). Waiting ${delayMs}ms...`);
        if (onRetry) {
          onRetry(attempt, delayMs);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      if (attempt >= maxRetries) {
        throw err;
      }
    }
  }

  throw lastError || new Error('فشلت الترجمة إلى البامبارا بعد عدة محاولات.');
}

export async function fetchTTSWithBackoff(
  bodyObj: Record<string, any>,
  maxRetries = 4,
  initialDelayMs = 1000,
  onRetry?: (attempt: number, delayMs: number) => void
): Promise<{ success: boolean; audioUrl: string; duration?: number; error?: string }> {
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj),
      });

      const data = await safeResponseJson(response);

      if (response.ok && data.success) {
        return data;
      }

      const errorMessage = data.error || data.message || `HTTP ${response.status}`;
      const isRateLimited =
        response.status === 429 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504 ||
        /429|502|503|RESOURCE_EXHAUSTED|Quota exceeded|الحد الأقصى/i.test(errorMessage);

      if (isRateLimited && attempt < maxRetries) {
        const delayMs = initialDelayMs * Math.pow(1.8, attempt - 1);
        console.warn(`[TTS API Backoff] Rate limit hit (Attempt ${attempt}/${maxRetries}). Waiting ${delayMs}ms...`);
        if (onRetry) {
          onRetry(attempt, delayMs);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      throw new Error(errorMessage || 'فشل توليد الصوت بالبامبارا');
    } catch (err: any) {
      lastError = err;
      const isRateLimited = /429|502|503|RESOURCE_EXHAUSTED|Quota exceeded|الحد الأقصى/i.test(err?.message || '');
      if (isRateLimited && attempt < maxRetries) {
        const delayMs = initialDelayMs * Math.pow(1.8, attempt - 1);
        console.warn(`[TTS API Network Retry] Rate limit hit (Attempt ${attempt}/${maxRetries}). Waiting ${delayMs}ms...`);
        if (onRetry) {
          onRetry(attempt, delayMs);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      if (attempt >= maxRetries) {
        throw err;
      }
    }
  }

  throw lastError || new Error('فشل توليد الصوت بالبامبارا بعد عدة محاولات.');
}
