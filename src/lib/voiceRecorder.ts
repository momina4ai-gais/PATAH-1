// Audio recording and speech recognition utilities for PATAH

export interface AudioRecordingResult {
  blob: Blob;
  audioUrl: string;
  base64: string;
  durationSeconds: number;
}

export class VoiceRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private startTime: number = 0;
  private stream: MediaStream | null = null;
  private recognition: any = null;
  public transcriptSoFar: string = '';

  constructor() {
    this.initSpeechRecognition();
  }

  private initSpeechRecognition() {
    if (typeof window === 'undefined') return;

    // Check for standard Web Speech API
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US'; // Can adapt to ur-PK or en-US
      } catch (e) {
        console.warn('SpeechRecognition not supported or disabled', e);
      }
    }
  }

  public async startRecording(onTranscriptUpdate?: (text: string) => void): Promise<boolean> {
    this.audioChunks = [];
    this.transcriptSoFar = '';

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.stream);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.startTime = Date.now();
      this.mediaRecorder.start(200);

      // Start speech recognition if supported
      if (this.recognition) {
        try {
          this.recognition.onresult = (event: any) => {
            let currentTranscript = '';
            for (let i = 0; i < event.results.length; i++) {
              currentTranscript += event.results[i][0].transcript + ' ';
            }
            this.transcriptSoFar = currentTranscript.trim();
            if (onTranscriptUpdate) {
              onTranscriptUpdate(this.transcriptSoFar);
            }
          };
          this.recognition.start();
        } catch (e) {
          console.warn('Failed to start speech recognition:', e);
        }
      }

      return true;
    } catch (err: any) {
      console.warn('Microphone permission denied or unavailable:', err?.message);
      return false;
    }
  }

  public async stopRecording(): Promise<AudioRecordingResult> {
    return new Promise((resolve) => {
      const durationSeconds = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));

      if (this.recognition) {
        try {
          this.recognition.stop();
        } catch (e) {
          // ignore
        }
      }

      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        const dummyBlob = new Blob([], { type: 'audio/webm' });
        resolve({
          blob: dummyBlob,
          audioUrl: '',
          base64: '',
          durationSeconds: durationSeconds || 5,
        });
        return;
      }

      this.mediaRecorder.onstop = async () => {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.audioChunks, { type: mimeType });
        const audioUrl = URL.createObjectURL(blob);

        // Convert blob to base64
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = (reader.result as string) || '';
          resolve({
            blob,
            audioUrl,
            base64: base64data.split(',')[1] || '',
            durationSeconds,
          });
        };
        reader.readAsDataURL(blob);

        // Clean up tracks
        if (this.stream) {
          this.stream.getTracks().forEach((track) => track.stop());
          this.stream = null;
        }
      };

      this.mediaRecorder.stop();
    });
  }

  public cancelRecording(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore
      }
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }
}
