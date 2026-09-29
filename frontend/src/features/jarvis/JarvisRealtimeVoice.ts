export interface RealtimeVoiceCallbacks {
  onPartialTranscript?: (text: string) => void;
  onCommittedTranscript?: (text: string) => void;
  onAmplitude?: (amplitude: number) => void;
  onError?: (err: string) => void;
  onStateChange?: (state: string) => void;
}

export class JarvisRealtimeVoice {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private websocket: WebSocket | null = null;
  private animFrameId: number | null = null;
  private isListening = false;
  private jarvisApiBase: string;
  private sessionToken: string;

  constructor(jarvisApiBase = 'http://localhost:5001', sessionToken = '') {
    this.jarvisApiBase = jarvisApiBase;
    this.sessionToken = sessionToken;
  }

  public setSessionToken(token: string) {
    this.sessionToken = token;
  }

  public async startListening(callbacks: RealtimeVoiceCallbacks): Promise<void> {
    if (this.isListening) return;

    try {
      callbacks.onStateChange?.('listening');

      // 1. Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // 2. Setup AudioAnalyser for Particle Orb visualization
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      this.monitorAmplitude(callbacks.onAmplitude);

      // 3. Fetch single-use ElevenLabs STT token from jarvis-v2 backend
      let token = 'mock-realtime-token';
      try {
        const tokenRes = await fetch(`${this.jarvisApiBase}/v1/voice/realtime-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.sessionToken}`,
          },
        });
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          if (tokenData?.data?.token) {
            token = tokenData.data.token;
          }
        }
      } catch (e) {
        console.warn('[JarvisVoice] Token API call failed, falling back to WebSpeech / local input', e);
      }

      this.isListening = true;

      // 4. Try ElevenLabs Scribe WebSocket connection or browser MediaRecorder audio stream
      if (token && token !== 'mock-realtime-token') {
        const wsUrl = `wss://api.elevenlabs.io/v1/realtime-scribe?token=${encodeURIComponent(token)}&model_id=scribe_v2_realtime`;
        try {
          this.websocket = new WebSocket(wsUrl);
          this.websocket.onmessage = (evt) => {
            try {
              const data = JSON.parse(evt.data);
              if (data.message_type === 'partial_transcript' || data.text) {
                callbacks.onPartialTranscript?.(data.text || data.partial_transcript);
              }
              if (data.message_type === 'committed_transcript' || data.is_final) {
                callbacks.onCommittedTranscript?.(data.text || data.committed_transcript);
              }
            } catch {
              // Ignore non-json websocket frames
            }
          };

          this.websocket.onerror = (_err) => {
            console.warn('[JarvisVoice] ElevenLabs WebSocket error, using browser fallback');
          };
        } catch {
          // Ignore connection errors
        }
      }

      // Standard web speech fallback if WebSocket is not available
      this.setupBrowserSpeechFallback(callbacks);

    } catch (err: any) {
      callbacks.onError?.(err?.message || 'Microphone permission denied');
      this.stopListening();
    }
  }

  public stopListening() {
    this.isListening = false;

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
  }

  private monitorAmplitude(onAmplitude?: (amp: number) => void) {
    if (!this.analyser || !onAmplitude) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    const update = () => {
      if (!this.isListening || !this.analyser) return;
      this.analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      const normalized = Math.min(1, average / 128);
      onAmplitude(normalized);
      this.animFrameId = requestAnimationFrame(update);
    };
    update();
  }

  private setupBrowserSpeechFallback(callbacks: RealtimeVoiceCallbacks) {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US'; // Supports multi-lingual detection

      recognition.onresult = (event: any) => {
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalText += transcript;
          } else {
            interimText += transcript;
          }
        }

        if (interimText) {
          callbacks.onPartialTranscript?.(interimText);
        }
        if (finalText) {
          callbacks.onCommittedTranscript?.(finalText);
        }
      };

      recognition.onerror = (e: any) => {
        if (e.error !== 'no-speech') {
          callbacks.onError?.(e.error);
        }
      };

      recognition.start();
    } catch {
      // Speech recognition already started or unavailable
    }
  }
}
