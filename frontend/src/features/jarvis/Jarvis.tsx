import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bot,
  Check,
  Expand,
  Loader2,
  Mic,
  MicOff,
  Minimize2,
  RotateCcw,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  User,
  UserCheck,
  UserX,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { client, errorMessage } from '../../api';
import { useAuth } from '../../auth';
import { Page } from '../../ui/Page';
import { LoadingSkeleton } from '../../ui/States';
import { JarvisParticleCore } from './JarvisParticleCore';
import type { JarvisCard, JarvisPendingAction, JarvisSession, JarvisTurn, JarvisVisualState, JarvisWorkflowKind } from './jarvis.types';
import { dispatchJarvisUICommand } from './JarvisCommandDispatcher';
import './jarvis.css';

type RecognitionResultEvent = Event & { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> };
type RecognitionErrorEvent = Event & { error: string };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};
type RecognitionConstructor = new () => Recognition;
declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  }
}

type PresentationMode = 'closed' | 'dock' | 'workspace';
type HistoryItem = { id: string; userText: string; turn: JarvisTurn; timestamp: Date; feedback?: 'like' | 'dislike' };

type ContextValue = {
  mode: PresentationMode;
  state: JarvisVisualState;
  amplitude: number;
  text: string;
  setText(value: string): void;
  turn: JarvisTurn | null;
  history: HistoryItem[];
  busy: boolean;
  listening: boolean;
  muted: boolean;
  session: JarvisSession | null;
  activeWorkflow: JarvisWorkflowKind;
  openDock(): void;
  close(): void;
  openWorkspace(): void;
  send(message?: string): Promise<void>;
  startListening(): Promise<void>;
  stopListening(): void;
  confirm(action: JarvisPendingAction): Promise<void>;
  cancel(action: JarvisPendingAction): Promise<void>;
  setMuted(value: boolean): void;
  retry(): Promise<void>;
  clearHistory(): void;
  unbindPatient(): void;
  resetSession(): void;
  setFeedback(id: string, feedback: 'like' | 'dislike'): void;
};

const JarvisContext = createContext<ContextValue | null>(null);

export function useJarvis() {
  const value = useContext(JarvisContext);
  if (!value) throw new Error('JarvisProvider missing');
  return value;
}

function messageForAgentError(code: string | undefined, fallback: string | undefined) {
  if (code === 'JARVIS_DISABLED') return 'Friday is disabled for this environment. Continue with the manual clinic workflow.';
  if (code === 'JARVIS_NOT_CONFIGURED' || code === 'PROVIDER_NOT_CONFIGURED') return 'Friday is not configured yet. Add the server-side provider settings, then retry.';
  if (code === 'JARVIS_SESSION_EXPIRED' || code === 'JARVIS_SESSION_INVALID') return 'Your Friday session expired. A new secure session will be created when you retry.';
  if (code === 'BACKEND_TOOL_UNAVAILABLE' || code === 'BACKEND_TOOL_TIMEOUT') return 'Friday cannot reach the clinic tools right now. Your manual workflow is still available.';
  if (code === 'PROVIDER_TIMEOUT' || code === 'PROVIDER_RATE_LIMITED') return 'The AI provider is temporarily busy. Retry or continue manually.';
  return fallback || 'Friday could not complete the request. Retry or continue manually.';
}

async function readAgentResponse(response: Response): Promise<{ success?: boolean; data?: JarvisTurn; error?: { code?: string; message?: string } }> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return { success: false, error: { code: 'AGENT_INVALID_RESPONSE', message: 'Friday returned an invalid response.' } };
  return response.json() as Promise<{ success?: boolean; data?: JarvisTurn; error?: { code?: string; message?: string } }>;
}

export function JarvisProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<PresentationMode>('closed');
  const [state, setState] = useState<JarvisVisualState>('idle');
  const [amplitude, setAmplitude] = useState(0);
  const [text, setText] = useState('');
  const [turn, setTurn] = useState<JarvisTurn | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [session, setSession] = useState<JarvisSession | null>(null);
  const [lastCommand, setLastCommand] = useState('');

  const recognitionRef = useRef<Recognition | null>(null);
  const transcriptRef = useRef('');
  const mediaRef = useRef<MediaStream | null>(null);
  const microphoneContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const amplitudeUpdateRef = useRef(0);
  const analyserFrameRef = useRef<number | null>(null);

  const activeWorkflow = useMemo<JarvisWorkflowKind>(() => {
    const path = location.pathname.toLowerCase();
    if (path.includes('prescription')) return 'prescription_consultation';
    if (path.includes('appointment')) return 'appointment_control';
    if (path.includes('inventory')) return 'inventory_control';
    if (path.includes('communication')) return 'communication_management';
    if (path.includes('analytics')) return 'operational_analytics';
    if (path.includes('patient')) return 'patient_access';
    return 'general_assistance';
  }, [location.pathname]);

  const stopMicrophoneAnalysis = useCallback(() => {
    if (analyserFrameRef.current !== null) {
      cancelAnimationFrame(analyserFrameRef.current);
      analyserFrameRef.current = null;
    }
    if (microphoneContextRef.current) {
      void microphoneContextRef.current.close();
      microphoneContextRef.current = null;
    }
    if (mediaRef.current) {
      for (const track of mediaRef.current.getTracks()) track.stop();
      mediaRef.current = null;
    }
    setAmplitude(0);
  }, []);

  const stopPlayback = useCallback(() => {
    if (playbackAudioRef.current) {
      playbackAudioRef.current.pause();
      playbackAudioRef.current = null;
    }
    if (playbackContextRef.current) {
      void playbackContextRef.current.close();
      playbackContextRef.current = null;
    }
  }, []);

  const revokeSession = useCallback(async (sessionToRevoke: JarvisSession | null) => {
    if (!sessionToRevoke) return;
    try {
      await client.post(`/jarvis/sessions/${sessionToRevoke.sessionId}/revoke`);
    } catch {
      // Ignore revocation cleanup errors
    }
  }, []);

  const ensureSession = useCallback(async (): Promise<JarvisSession> => {
    if (session && new Date(session.expiresAt).getTime() - Date.now() > 30_000) return session;
    const response = await client.post('/jarvis/sessions', {});
    const nextSession = response.data.data as JarvisSession;
    setSession(nextSession);
    return nextSession;
  }, [session]);

  const speak = useCallback(
    async (speechText: string, sessionState: JarvisSession, currentState: JarvisVisualState) => {
      if (muted || !speechText || currentState === 'disconnected' || currentState === 'warning') return;
      stopPlayback();

      let playedAudio = false;
      try {
        const response = await fetch(`${sessionState.agentUrl}/jarvis/speak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionState.token}` },
          body: JSON.stringify({ sessionId: sessionState.sessionId, text: speechText }),
        });
        if (response.ok) {
          const blob = await response.blob();
          if (blob.type === 'audio/mp3' || blob.type === 'audio/mpeg') {
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            playbackAudioRef.current = audio;

            audio.onplay = () => setState('speaking');
            audio.onended = () => {
              setState('idle');
              playbackAudioRef.current = null;
              URL.revokeObjectURL(audioUrl);
            };
            audio.onerror = () => {
              setState('idle');
              playbackAudioRef.current = null;
              URL.revokeObjectURL(audioUrl);
            };
            await audio.play();
            playedAudio = true;
          }
        }
      } catch {
        // Fall back to client browser TTS if server speech fetch fails
      }

      if (!playedAudio && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(speechText);
        utterance.lang = 'en-IN';
        utterance.rate = 1.0;

        utterance.onstart = () => setState('speaking');
        utterance.onend = () => setState('idle');
        utterance.onerror = () => setState('idle');

        window.speechSynthesis.speak(utterance);
      }
    },
    [muted, stopPlayback]
  );

  const tabId = useMemo(() => crypto.randomUUID(), []);
  const processedCommandIds = useRef<Set<string>>(new Set());
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  const executeTypedUICommand = useCallback(
    (uiCmd: any, isBroadcast = false) => {
      if (!uiCmd || typeof uiCmd !== 'object') return;
      
      const onApplyDraft = (draft: any) => {
        window.sessionStorage.setItem('rxflow:jarvis-pending-draft', JSON.stringify(draft));
        window.dispatchEvent(new CustomEvent('rxflow:jarvis-prescription-draft', { detail: draft }));
        navigate('/app/prescription/new');
      };

      const handled = dispatchJarvisUICommand(uiCmd, navigate, onApplyDraft);
      if (!handled && uiCmd.type === 'APPLY_PRESCRIPTION_DRAFT_FIELDS') {
        onApplyDraft(uiCmd.draftFields ?? uiCmd.draft ?? uiCmd.payload);
      }

      // Broadcast message to other tabs
      if (!isBroadcast && broadcastChannelRef.current) {
        const message = {
          version: '1.0',
          commandId: crypto.randomUUID(),
          tabId,
          sessionRef: session?.sessionId || 'none',
          patientQueueVersion: Date.now(),
          commandType: uiCmd.type,
          payload: uiCmd,
          timestamp: Date.now(),
        };
        broadcastChannelRef.current.postMessage(message);
      }
    },
    [navigate, tabId, session]
  );

  useEffect(() => {
    const channel = new BroadcastChannel('rxflow:jarvis-tab-sync');
    broadcastChannelRef.current = channel;

    channel.onmessage = (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.tabId === tabId) return;

      if (
        !data.version ||
        !data.commandId ||
        !data.sessionRef ||
        !data.commandType ||
        typeof data.patientQueueVersion !== 'number'
      ) {
        return;
      }

      if (processedCommandIds.current.has(data.commandId)) return;
      processedCommandIds.current.add(data.commandId);

      if (Date.now() - data.timestamp > 10_000) return;

      if (data.commandType === 'APPLY_PRESCRIPTION_DRAFT_FIELDS') {
        // Safe cross-tab execution of Level 3 action: populates editor/session state,
        // does NOT silently confirm/save. Confirmation remains visible.
        const fields = data.payload?.draftFields ?? data.payload?.payload;
        if (fields) {
          window.sessionStorage.setItem('rxflow:jarvis-pending-draft', JSON.stringify(fields));
          window.dispatchEvent(new CustomEvent('rxflow:jarvis-prescription-draft', { detail: fields }));
          navigate('/app/prescription/new');
        }
      } else {
        executeTypedUICommand(data.payload, true);
      }
    };

    return () => {
      channel.close();
      broadcastChannelRef.current = null;
    };
  }, [tabId, executeTypedUICommand, navigate]);

  const send = useCallback(
    async (overrideText?: string) => {
      const rawText = overrideText ?? text;
      const trimmed = rawText.trim();
      if (!trimmed || busy || (user?.role as string) === 'patient') return;

      setBusy(true);
      setState('thinking');
      setText('');
      setLastCommand(trimmed);

      const clientTurnId = crypto.randomUUID();
      const controller = new AbortController();
      requestRef.current = controller;

      try {
        let active = await ensureSession();
        const execute = async (activeSession: JarvisSession) => {
          const response = await fetch(`${activeSession.agentUrl}/jarvis/turn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeSession.token}` },
            body: JSON.stringify({ sessionId: activeSession.sessionId, message: trimmed, clientTurnId }),
            signal: controller.signal,
          });

          const result = await readAgentResponse(response);
          if (!response.ok || !result.success || !result.data) {
            const errCode = result.error?.code;
            const errMsg = messageForAgentError(errCode, result.error?.message);
            throw new Error(errMsg);
          }
          return { data: result.data, active: activeSession };
        };

        let result: { data: JarvisTurn; active: JarvisSession };
        try {
          result = await execute(active);
        } catch (error: any) {
          if (error.message?.includes('expired') || error.message?.includes('session')) {
            await revokeSession(active);
            setSession(null);
            active = await client.post('/jarvis/sessions', {}).then((res) => res.data.data as JarvisSession);
            setSession(active);
            result = await execute(active);
          } else throw error;
        }

        setTurn(result.data);
        setHistory((prev) => [...prev, { id: clientTurnId, userText: trimmed, turn: result.data, timestamp: new Date() }]);
        setState(result.data.state);

        if (result.data.uiCommand) {
          executeTypedUICommand(result.data.uiCommand);
        }

        void speak(result.data.assistantText, result.active, result.data.state);
      } catch (error) {
        if (controller.signal.aborted) return;
        const errTurn: JarvisTurn = { assistantText: errorMessage(error), state: 'disconnected', cards: [], pendingAction: null, clientTurnId };
        setState('disconnected');
        setTurn(errTurn);
        setHistory((prev) => [{ id: clientTurnId, userText: trimmed, turn: errTurn, timestamp: new Date() }, ...prev]);
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
        setBusy(false);
      }
    },
    [busy, ensureSession, executeTypedUICommand, speak, text, user?.role, revokeSession]
  );

  const startListening = useCallback(async () => {
    const Constructor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Constructor) {
      const warnTurn: JarvisTurn = { assistantText: 'Speech recognition is unavailable in this browser. Please check microphone permissions or use typed input.', state: 'warning', cards: [], pendingAction: null, clientTurnId: crypto.randomUUID() };
      setState('warning');
      setTurn(warnTurn);
      return;
    }
    stopMicrophoneAnalysis();
    stopPlayback();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      mediaRef.current = stream;
      const audioContext = new AudioContext();
      microphoneContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.84;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let smoothed = 0;
      const update = (now: number) => {
        analyser.getByteTimeDomainData(data);
        let squares = 0;
        for (const sample of data) {
          const normalized = (sample - 128) / 128;
          squares += normalized * normalized;
        }
        const rms = Math.sqrt(squares / data.length);
        const raw = Math.max(0, Math.min(1, (rms - 0.018) * 7.2));
        const factor = raw > smoothed ? 0.3 : 0.075;
        smoothed += (raw - smoothed) * factor;
        if (now - amplitudeUpdateRef.current > 45) {
          setAmplitude(smoothed);
          amplitudeUpdateRef.current = now;
        }
        analyserFrameRef.current = requestAnimationFrame(update);
      };
      analyserFrameRef.current = requestAnimationFrame(update);

      const recognition = new Constructor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-IN';
      recognitionRef.current = recognition;
      transcriptRef.current = '';
      recognition.onresult = (event) => {
        let complete = '';
        let interim = '';
        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          const value = result?.[0]?.transcript ?? '';
          if (result?.isFinal) complete += `${value} `;
          else interim += value;
        }
        const transcript = `${complete}${interim}`.trim();
        if (complete.trim()) transcriptRef.current = complete.trim();
        setText(transcript);
      };
      recognition.onerror = (event) => {
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        setListening(false);
        stopMicrophoneAnalysis();
        if (event.error === 'not-allowed') {
          setState('warning');
          setTurn({ assistantText: 'Microphone permission was denied.', state: 'warning', cards: [], pendingAction: null, clientTurnId: crypto.randomUUID() });
        }
      };
      recognition.onend = () => {
        const finalText = transcriptRef.current.trim();
        setListening(false);
        stopMicrophoneAnalysis();
        recognitionRef.current = null;

        if (!finalText) {
          setState('warning');
          setTurn({
            assistantText: 'Speech transcript was empty. Tap the orb to try speaking again or type your command below.',
            state: 'warning',
            cards: [],
            pendingAction: null,
            clientTurnId: crypto.randomUUID(),
          });
          return;
        }

        if (finalText.length < 3) {
          setState('warning');
          setTurn({
            assistantText: 'Speech input was too short to determine intent. Please speak in full commands.',
            state: 'warning',
            cards: [],
            pendingAction: null,
            clientTurnId: crypto.randomUUID(),
          });
          return;
        }

        const lower = finalText.toLowerCase();
        const hasInventoryMutation = /\b(increase stock|set stock|add stock|reduce stock)\b/.test(lower);
        const hasAppointmentMutation = /\b(create appointment|reschedule appointment|cancel appointment|confirm appointment)\b/.test(lower);
        const hasCommunicationMutation = /\b(send message|queue message|send whatsapp|queue whatsapp)\b/.test(lower);
        const hasTemplateMutation = /\b(save template|create template)\b/.test(lower);

        const activeMutationCount =
          (hasInventoryMutation ? 1 : 0) +
          (hasAppointmentMutation ? 1 : 0) +
          (hasCommunicationMutation ? 1 : 0) +
          (hasTemplateMutation ? 1 : 0);

        if (activeMutationCount > 1) {
          setState('warning');
          setTurn({
            assistantText: 'I detected multiple conflicting clinic actions in your speech. Please issue one command at a time.',
            state: 'warning',
            cards: [],
            pendingAction: null,
            clientTurnId: crypto.randomUUID(),
          });
          return;
        }

        setState('transcribing');
        void send(finalText);
      };
      setListening(true);
      setState('listening');
      await audioContext.resume();
      recognition.start();
    } catch (error) {
      setListening(false);
      stopMicrophoneAnalysis();
      setState('warning');
      setTurn({ assistantText: error instanceof DOMException && error.name === 'NotAllowedError' ? 'Microphone permission was denied.' : 'The microphone could not start. Tap the orb to retry or type input below.', state: 'warning', cards: [], pendingAction: null, clientTurnId: crypto.randomUUID() });
    }
  }, [send, stopMicrophoneAnalysis, stopPlayback]);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    try {
      recognition?.stop();
    } catch {
      recognition?.abort();
    }
    setListening(false);
    stopMicrophoneAnalysis();
  }, [stopMicrophoneAnalysis]);

  const confirm = useCallback(
    async (action: JarvisPendingAction) => {
      if (!session) return;
      setBusy(true);
      try {
        const response = await client.post(`/jarvis/sessions/${session.sessionId}/actions/${action.actionId}/confirm`);
        const updated = response.data.data as { token: string; expiresAt: string; boundPatientId: string | null; boundQueueEntryId: string | null; actionPayload?: unknown };
        setSession({ ...session, ...updated });
        if (action.type === 'review_prescription_draft') {
          const payload = updated.actionPayload ?? action.payload;
          window.sessionStorage.setItem('rxflow:jarvis-pending-draft', JSON.stringify(payload ?? {}));
          window.dispatchEvent(new CustomEvent('rxflow:jarvis-prescription-draft', { detail: payload }));
          setTurn((current) => current ? { ...current, assistantText: 'Draft verified and opened for your review. Clinician confirmation is still required.', state: 'success', pendingAction: null } : current);
          setState('success');
          navigate('/app/prescription/new');
          return;
        }
        setTurn((current) => current ? { ...current, assistantText: 'Action confirmed successfully. Clinical context updated.', state: 'success', pendingAction: null } : current);
        setState('success');
      } catch (error) {
        setState('error');
        setTurn((current) => ({ assistantText: errorMessage(error), state: 'error', cards: current?.cards ?? [], pendingAction: null, clientTurnId: current?.clientTurnId ?? crypto.randomUUID() }));
      } finally {
        setBusy(false);
      }
    },
    [navigate, session]
  );

  const cancel = useCallback(
    async (action: JarvisPendingAction) => {
      if (session) await client.post(`/jarvis/sessions/${session.sessionId}/actions/${action.actionId}/cancel`).catch(() => undefined);
      setTurn((current) => current ? { ...current, pendingAction: null } : current);
      setState('idle');
    },
    [session]
  );

  const clearHistory = useCallback(() => setHistory([]), []);

  const unbindPatient = useCallback(() => {
    if (session) {
      setSession({ ...session, boundPatientId: null, boundQueueEntryId: null });
    }
    setTurn(null);
    setState('idle');
  }, [session]);

  const resetSession = useCallback(() => {
    requestRef.current?.abort();
    stopListening();
    stopPlayback();
    setHistory([]);
    setTurn(null);
    setSession(null);
    setState('idle');
  }, [stopListening, stopPlayback]);

  const close = useCallback(() => {
    requestRef.current?.abort();
    stopListening();
    stopPlayback();
    revokeSession(session);
    setSession(null);
    setMode('closed');
    setState('idle');
  }, [revokeSession, session, stopListening, stopPlayback]);

  const openWorkspace = useCallback(() => {
    setMode('workspace');
    if (location.pathname !== '/app/jarvis') navigate('/app/jarvis');
  }, [location.pathname, navigate]);

  const openDock = useCallback(() => setMode('dock'), []);
  const retry = useCallback(async () => {
    if (lastCommand) await send(lastCommand);
    else {
      setSession(null);
      setState('idle');
    }
  }, [lastCommand, send]);

  useEffect(() => {
    if (location.pathname !== '/app/jarvis' && mode === 'workspace') setMode('closed');
  }, [location.pathname, mode]);

  useEffect(() => {
    if (user?.role === 'doctor' || user?.role === 'admin') return;
    requestRef.current?.abort();
    stopListening();
    stopPlayback();
    revokeSession(session);
    setSession(null);
    setMode('closed');
  }, [revokeSession, session, stopListening, stopPlayback, user?.role]);

  const setFeedback = useCallback((id: string, feedback: 'like' | 'dislike') => {
    setHistory((prev) => prev.map((item) => item.id === id ? { ...item, feedback: item.feedback === feedback ? undefined : feedback } : item));
  }, []);

  const value = useMemo<ContextValue>(
    () => ({
      mode, state, amplitude, text, setText, turn, history, busy, listening, muted, session, activeWorkflow,
      openDock, close, openWorkspace, send, startListening, stopListening,
      confirm, cancel, setMuted, retry, clearHistory, unbindPatient, resetSession, setFeedback,
    }),
    [amplitude, busy, cancel, clearHistory, close, confirm, history, listening, mode, muted, openDock, openWorkspace, retry, send, setFeedback, startListening, state, stopListening, text, turn, session, activeWorkflow, unbindPatient, resetSession]
  );

  return <JarvisContext.Provider value={value}>{children}</JarvisContext.Provider>;
}

function workflowLabel(workflow: JarvisWorkflowKind): string {
  if (workflow === 'prescription_consultation') return 'Prescription Consultation';
  if (workflow === 'appointment_control') return 'Appointment Control';
  if (workflow === 'inventory_control') return 'Inventory Control';
  if (workflow === 'communication_management') return 'Communication Management';
  if (workflow === 'operational_analytics') return 'Operational Analytics';
  if (workflow === 'patient_access') return 'Patient Access';
  return 'General Assistance';
}

function getFollowUpOrders(turn: JarvisTurn): string[] {
  const types = new Set(turn.cards.map((c) => c.type));
  if (types.has('low_stock') || types.has('inventory_result')) {
    return ['Search Paracetamol 500 mg in inventory', 'Show remaining queue count', 'Prepare prescription draft'];
  }
  if (types.has('queue_status')) {
    return ['Who is the next patient?', 'Show low stock medicines', 'Show operational summary'];
  }
  if (types.has('patient_match') || types.has('patient_summary')) {
    return ['Show recent prescriptions for patient', 'Prepare prescription draft', 'Check WhatsApp delivery status'];
  }
  if (types.has('prescription_draft')) {
    return ['Open my prescription template', 'Check appointment reminder status', 'Show low stock medicines'];
  }
  if (types.has('operational_summary')) {
    return ['How many patients did I see today?', 'How many are waiting?', 'Show low stock medicines'];
  }
  return ['Show remaining queue count', 'Show low stock medicines', 'Open my prescription template', 'Show operational summary'];
}

function DataCards({ cards }: { cards: JarvisCard[] }) {
  const jarvis = useJarvis();
  const visibleCards = cards.filter((item) => {
    const data = (item.data ?? {}) as Record<string, unknown>;
    if ((item.type === 'inventory_result' || item.type === 'low_stock') && Array.isArray(data.items)) return data.items.length > 0;
    if (item.type === 'patient_matches' && Array.isArray(item.data)) return item.data.length > 0;
    if ((item.type === 'communication_status' || item.type === 'communication_status_list') && Array.isArray(data.messages)) return data.messages.length > 0;
    if (item.type === 'template_list' && Array.isArray(data.templates)) return data.templates.length > 0;
    if (Array.isArray(item.data)) return item.data.length > 0;
    if (item.type === 'warning' && Object.keys(data).length === 0) return false;
    return true;
  });
  if (visibleCards.length === 0) return null;

  const renderCard = (item: JarvisCard) => {
    const data = item.data as Record<string, unknown>;

    if (item.type === 'patient_matches' && Array.isArray(item.data)) {
      return (
        <div className="jarvis-match-list">
          {item.data.map((match) => {
            const value = match as { patientCode?: string; name?: string; age?: number; gender?: string; maskedPhone?: string };
            return (
              <button type="button" key={value.patientCode} onClick={() => void jarvis.send(`Open patient ${value.patientCode}`)}>
                <b>{value.name}</b>
                <span>{value.patientCode} · {value.age} years · {value.gender} · {value.maskedPhone}</span>
              </button>
            );
          })}
        </div>
      );
    }

    if (item.type === 'patient_match' || item.type === 'patient_summary') {
      return (
        <dl className="jarvis-data-grid">
          {Object.entries(data).filter(([, value]) => value !== undefined && typeof value !== 'object').map(([key, value]) => (
            <div key={key}>
              <dt>{key.replaceAll(/([A-Z])/g, ' $1').replaceAll('_', ' ')}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
      );
    }

    if (item.type === 'queue_status') {
      return (
        <div className="jarvis-metrics">
          <div><b>{String(data.remainingPatients ?? 0)}</b><span>Remaining</span></div>
          {data.current ? <div><b>{String((data.current as { queueNumber?: number }).queueNumber ?? '—')}</b><span>Current queue</span></div> : null}
        </div>
      );
    }

    if ((item.type === 'inventory_result' || item.type === 'low_stock') && Array.isArray(data.items)) {
      return (
        <div className="jarvis-list">
          {data.items.map((entry, index) => {
            const value = entry as { name?: string; strength?: string; dosageForm?: string; stockQuantity?: number; unit?: string; status?: string };
            return (
              <div key={`${value.name}-${index}`}>
                <span><b>{value.name}</b><small>{[value.strength, value.dosageForm].filter(Boolean).join(' · ')}</small></span>
                <i data-status={value.status}>{value.stockQuantity} {value.unit}<small>{value.status?.replaceAll('_', ' ')}</small></i>
              </div>
            );
          })}
        </div>
      );
    }

    if (item.type === 'prescription_draft') {
      const medicines = Array.isArray(data.medicines) ? (data.medicines as Array<Record<string, unknown>>) : [];
      const missing = Array.isArray(data.missingFields) ? data.missingFields : [];
      const warnings = Array.isArray(data.warnings) ? data.warnings : [];
      return (
        <div className="jarvis-draft-card">
          {data.diagnosis ? <p><strong>Diagnosis:</strong> {String(data.diagnosis)}</p> : null}
          {medicines.map((medicine, index) => (
            <div key={index}>
              <b>{String(medicine.name ?? 'Medicine')}</b>
              <span>{[medicine.dosage, medicine.frequency, medicine.duration, medicine.instructions].filter(Boolean).map(String).join(' · ')}</span>
            </div>
          ))}
          {missing.length > 0 && <p className="jarvis-field-missing"><strong>Missing Fields:</strong> {missing.map(String).join(', ')}</p>}
          {warnings.length > 0 && <p className="jarvis-warning-text"><strong>Warnings:</strong> {warnings.map(String).join(', ')}</p>}
        </div>
      );
    }

    if ((item.type === 'communication_status' || item.type === 'communication_status_list') && Array.isArray(data.messages)) {
      return (
        <div className="jarvis-list">
          {data.messages.map((entry, index) => {
            const value = entry as { templateName?: string; purpose?: string; status?: string; createdAt?: string };
            return (
              <div key={index}>
                <span><b>{value.templateName || value.purpose}</b><small>{value.createdAt ? new Date(value.createdAt).toLocaleString('en-IN') : 'Provider tracked'}</small></span>
                <i data-status={value.status}>{value.status}</i>
              </div>
            );
          })}
        </div>
      );
    }

    if (item.type === 'template_list' && Array.isArray(data.templates)) {
      return (
        <div className="jarvis-list">
          {data.templates.map((tpl, index) => {
            const value = tpl as { title?: string; diagnosis?: string; medicinesCount?: number };
            return (
              <div key={index} className="jarvis-clickable-row" onClick={() => void jarvis.send(`Use template ${value.title}`)}>
                <span><b>{value.title}</b><small>{value.diagnosis}</small></span>
                <i data-status="template">{value.medicinesCount ?? 0} meds</i>
              </div>
            );
          })}
        </div>
      );
    }

    if (item.type === 'operational_summary') {
      const summaryData = (data.data ?? data) as Record<string, unknown>;
      return (
        <div className="jarvis-metrics-grid">
          <div><b>{String(summaryData.completedCount ?? 0)}</b><span>Patients Seen Today</span></div>
          <div><b>{String(summaryData.waitingCount ?? 0)}</b><span>Patients Waiting</span></div>
          <div><b>{String(summaryData.totalVolume ?? 0)}</b><span>Total Daily Volume</span></div>
          <div><b>{summaryData.averageWaitMinutes !== null && summaryData.averageWaitMinutes !== undefined ? `${Math.round(Number(summaryData.averageWaitMinutes))} min` : 'N/A'}</b><span>Avg Wait Time</span></div>
        </div>
      );
    }

    if (Array.isArray(item.data)) {
      return (
        <div className="jarvis-command-chips">
          {item.data.map((value, index) => (
            <button type="button" className="jarvis-command-chip" key={index} onClick={() => void jarvis.send(String(value))}>
              👉 {String(value)}
            </button>
          ))}
        </div>
      );
    }

    return <pre>{JSON.stringify(item.data, null, 2)}</pre>;
  };

  return (
    <div className="jarvis-cards">
      {visibleCards.map((item, index) => (
        <article className={`jarvis-card jarvis-card-${item.type}`} key={`${item.type}-${index}`}>
          <strong>{item.title}</strong>
          {renderCard(item)}
        </article>
      ))}
    </div>
  );
}

function stateLabel(state: JarvisVisualState) {
  if (state === 'listening') return 'Listening... (Speak Now)';
  if (state === 'speaking') return 'Friday Responding';
  if (state === 'thinking') return 'Understanding request';
  if (state === 'transcribing') return 'Transcribing Speech';
  if (state === 'tool_running') return 'Running clinic tool';
  if (state === 'needs_confirmation') return 'Doctor Confirmation Required';
  if (state === 'disconnected' || state === 'error') return 'Connection unavailable';
  if (state === 'warning') return 'Action Required';
  if (state === 'idle') return 'Ready';
  if (state === 'success') return 'Active';
  return state.replaceAll('_', ' ');
}

function JarvisPanel({ workspace = false }: { workspace?: boolean }) {
  const jarvis = useJarvis();
  const navigate = useNavigate();
  const { user } = useAuth();
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [jarvis.history, jarvis.state]);

  const handleMinimize = useCallback(() => {
    jarvis.openDock();
    navigate('/app');
  }, [jarvis, navigate]);

  const handleClose = useCallback(() => {
    jarvis.close();
    if (workspace) navigate('/app');
  }, [jarvis, navigate, workspace]);

  const handleToggleListen = useCallback(() => {
    if (jarvis.listening) jarvis.stopListening();
    else void jarvis.startListening();
  }, [jarvis]);

  const handleFormSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      if (jarvis.text.trim()) {
        void jarvis.send();
      }
    },
    [jarvis]
  );

  return (
    <section className={workspace ? 'jarvis-workspace jarvis-fullscreen' : 'jarvis-dock'} aria-label="Friday clinical assistant control center">
      {/* 1. Header Bar with Patient Binding Indicator, Workflow Indicator, & Controls */}
      <header className="jarvis-header">
        <div className="jarvis-header-left">
          <span className="jarvis-brand-mark"><Bot size={18}/></span>
          <div>
            <span>Friday Control Center <small>{stateLabel(jarvis.state)}</small></span>
          </div>
        </div>

        {/* Status Indicators & Session Controls Bar */}
        <div className="jarvis-header-center">
          {/* Patient Binding Indicator */}
          <div className={`jarvis-patient-indicator ${jarvis.session?.boundPatientId ? 'bound' : 'unbound'}`} title={jarvis.session?.boundPatientId ? `Bound to patient ID ${jarvis.session.boundPatientId}` : 'No active patient bound'}>
            {jarvis.session?.boundPatientId ? (
              <>
                <UserCheck size={14} className="jarvis-icon-bound" />
                <span>Patient Bound: <strong>{jarvis.session.boundPatientCode || jarvis.session.boundPatientId.slice(-6)}</strong></span>
                <button type="button" className="jarvis-mini-unbind-btn" aria-label="Unbind patient session" title="Unbind active patient" onClick={jarvis.unbindPatient}>
                  <UserX size={12} />
                </button>
              </>
            ) : (
              <>
                <User size={14} />
                <span>No Patient Bound</span>
              </>
            )}
          </div>

          {/* Current Workflow Indicator */}
          <div className="jarvis-workflow-indicator" title={`Active Workflow: ${workflowLabel(jarvis.activeWorkflow)}`}>
            <Zap size={13} />
            <span>{workflowLabel(jarvis.activeWorkflow)}</span>
          </div>
        </div>

        <div className="jarvis-header-actions">
          {workspace ? (
            <button type="button" aria-label="Return to compact Friday" onClick={handleMinimize}><Minimize2 size={17}/></button>
          ) : (
            <button type="button" aria-label="Open full-screen Friday" onClick={jarvis.openWorkspace}><Expand size={17}/></button>
          )}
          <button type="button" aria-label={jarvis.muted ? 'Enable voice playback' : 'Mute voice playback'} onClick={() => jarvis.setMuted(!jarvis.muted)}>
            {jarvis.muted ? <VolumeX size={17}/> : <Volume2 size={17}/>}
          </button>
          <button type="button" aria-label="Reset session history and clear session" title="Reset Session" onClick={jarvis.resetSession}>
            <RotateCcw size={17}/>
          </button>
          <button type="button" aria-label="Close Friday" onClick={handleClose}><X size={18}/></button>
        </div>
      </header>

      {/* 2. Central Jarvis Visualization Orb & Live Transcript */}
      <div className={`jarvis-visual jarvis-visual-${jarvis.state}`}>
        <div className="jarvis-ambient-grid"/>

        {/* Clickable Orb Sphere for Voice Recording */}
        <button
          type="button"
          className={`jarvis-orb-button ${jarvis.listening ? 'listening' : ''}`}
          aria-label={jarvis.listening ? 'Stop recording voice' : 'Start voice interaction'}
          onClick={handleToggleListen}
        >
          <JarvisParticleCore state={jarvis.state} amplitude={jarvis.amplitude} compact={!workspace}/>
        </button>

        {/* Floating Orb Interaction Prompt */}
        <div className="jarvis-orb-control" onClick={handleToggleListen}>
          <div className={`jarvis-orb-badge ${jarvis.listening ? 'active' : ''}`}>
            {jarvis.listening ? <MicOff size={22}/> : <Mic size={22}/>}
          </div>
          <span className="jarvis-orb-text">
            {jarvis.listening
              ? 'Listening... Tap sphere or badge to finish'
              : 'Tap sphere orb to speak'}
          </span>
        </div>

        <div className="jarvis-status" aria-live="polite">
          <b>{stateLabel(jarvis.state)}</b>
          {jarvis.text && <p className="jarvis-live-transcript">"{jarvis.text}"</p>}
        </div>
      </div>

      {/* 3. Chat Session History, Cards, Pending Action Confirmation, & Input Control Bar */}
      <div className="jarvis-content">
        <div className="jarvis-chat-stream">
          {jarvis.history.length === 0 ? (
            <div className="jarvis-empty-state">
              <p className="jarvis-welcome-title">Greetings Dr. {user?.name?.split(' ')?.[0] ?? ''}! 👋</p>
              <p className="jarvis-welcome-sub">I am <strong>Friday</strong>, your AI clinical assistant control center. Tap the orb above to speak, or select a command below:</p>

              {/* 4. Manual Fallback & Quick Command Chips */}
              <div className="jarvis-suggestion-chips">
                <button type="button" onClick={() => void jarvis.send('Show remaining queue count')}>
                  👥 Queue status
                </button>
                <button type="button" onClick={() => void jarvis.send('Show low stock medicines')}>
                  ⚠️ Low stock
                </button>
                <button type="button" onClick={() => void jarvis.send('Search Paracetamol 500 mg in inventory')}>
                  🔍 Search Paracetamol
                </button>
                <button type="button" onClick={() => void jarvis.send('Open my prescription template')}>
                  📝 Templates
                </button>
                <button type="button" onClick={() => void jarvis.send('Show operational summary')}>
                  📊 Operational Summary
                </button>
                <button type="button" onClick={() => void jarvis.send('Help')}>
                  💡 Show commands
                </button>
              </div>
            </div>
          ) : (
            jarvis.history.map((item) => (
              <div className="jarvis-chat-turn" key={item.id}>
                {/* Doctor Message Bubble */}
                <div className="jarvis-user-msg-bubble">
                  <div className="jarvis-msg-header">
                    <span>You</span>
                    <small>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                  </div>
                  <p>"{item.userText}"</p>
                </div>

                {/* Assistant Message & Contextual Data Cards */}
                <div className="jarvis-agent-msg-bubble">
                  <div className="jarvis-msg-header">
                    <span className="jarvis-agent-tag"><Bot size={13}/> Friday</span>
                  </div>
                  <p className="jarvis-response-text">{item.turn.assistantText}</p>

                  {/* Contextual Result Cards */}
                  <DataCards cards={item.turn.cards}/>

                  {/* 5. Pending Action Confirmation Control Box (Risk Level 3 Proposals) */}
                  {item.turn.pendingAction && (
                    <div className="jarvis-confirm-card">
                      <div className="jarvis-confirm-header">
                        <AlertTriangle size={16} className="jarvis-alert-icon" />
                        <span>Doctor Confirmation Required (Risk Level 3)</span>
                      </div>
                      <p className="jarvis-confirm-summary">
                        {item.turn.pendingAction.purpose
                          ? `Queue WhatsApp ${item.turn.pendingAction.purpose} notification`
                          : item.turn.pendingAction.title
                          ? `Save template '${item.turn.pendingAction.title}'`
                          : 'Review and execute protected clinical action'}
                      </p>
                      <div className="jarvis-confirm-actions">
                        <button
                          type="button"
                          className="button small primary"
                          disabled={jarvis.busy}
                          aria-label="Confirm pending action"
                          onClick={() => void jarvis.confirm(item.turn.pendingAction!)}
                        >
                          <Check size={15}/> Confirm Action
                        </button>
                        <button
                          type="button"
                          className="button small ghost"
                          disabled={jarvis.busy}
                          aria-label="Cancel pending action"
                          onClick={() => void jarvis.cancel(item.turn.pendingAction!)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Interactive Response Feedback */}
                  <div className="jarvis-msg-footer">
                    <div className="jarvis-feedback-actions">
                      <button
                        type="button"
                        className={`jarvis-feedback-btn ${item.feedback === 'like' ? 'active-like' : ''}`}
                        aria-label="Like response"
                        title="Helpful response"
                        onClick={() => jarvis.setFeedback(item.id, 'like')}
                      >
                        <ThumbsUp size={13} />
                      </button>
                      <button
                        type="button"
                        className={`jarvis-feedback-btn ${item.feedback === 'dislike' ? 'active-dislike' : ''}`}
                        aria-label="Dislike response"
                        title="Needs improvement"
                        onClick={() => jarvis.setFeedback(item.id, 'dislike')}
                      >
                        <ThumbsDown size={13} />
                      </button>
                    </div>
                    {item.feedback === 'like' && <small className="jarvis-feedback-note positive">✓ Thank you for your feedback!</small>}
                    {item.feedback === 'dislike' && <small className="jarvis-feedback-note negative">Feedback recorded. We'll improve Friday.</small>}
                  </div>

                  {/* Follow-up Recommended Next Orders */}
                  <div className="jarvis-next-orders">
                    <div className="jarvis-next-orders-header">
                      <Zap size={12} className="jarvis-zap-icon" />
                      <span>Recommended Next Orders:</span>
                    </div>
                    <div className="jarvis-command-chips">
                      {getFollowUpOrders(item.turn).map((cmd, idx) => (
                        <button key={idx} type="button" className="jarvis-command-chip" onClick={() => void jarvis.send(cmd)}>
                          👉 {cmd}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}

          {(jarvis.busy || jarvis.state === 'thinking' || jarvis.state === 'tool_running' || jarvis.state === 'transcribing') && (
            <div className="jarvis-chat-turn jarvis-loading-turn">
              <div className="jarvis-agent-msg-bubble jarvis-cinematic-loading">
                <div className="jarvis-msg-header">
                  <span className="jarvis-agent-tag"><Sparkles size={13} className="jarvis-spin-icon"/> Friday Executing Order</span>
                </div>
                <div className="jarvis-cinematic-bar">
                  <Loader2 size={16} className="jarvis-spin-icon" />
                  <span>Executing clinical task... Accessing MongoDB & tools...</span>
                </div>
              </div>
            </div>
          )}

          {(jarvis.state === 'disconnected' || jarvis.state === 'error') && (
            <button type="button" className="jarvis-retry" onClick={() => void jarvis.retry()}>
              <RotateCcw size={15}/> Retry command
            </button>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* 6. Transcript / Typed Command Input Box (Manual Fallback Region) */}
        <form className="jarvis-input-bar" onSubmit={handleFormSubmit}>
          <input
            type="text"
            className="jarvis-input-field"
            value={jarvis.text}
            onChange={(e) => jarvis.setText(e.target.value)}
            placeholder="Type command for Friday (e.g. 'Show remaining queue count', 'Use template Fever')..."
            aria-label="Type a command for Friday"
            disabled={jarvis.busy}
          />
          <button
            type="submit"
            className="jarvis-send-btn"
            disabled={jarvis.busy || !jarvis.text.trim()}
            aria-label="Send command"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </section>
  );
}

export function JarvisLauncher() {
  const { user } = useAuth();
  const jarvis = useJarvis();
  if ((user?.role !== 'doctor' && user?.role !== 'admin') || jarvis.mode !== 'closed') return null;
  return (
    <button type="button" className="jarvis-launcher" aria-label="Open Friday assistant control center" onClick={jarvis.openDock}>
      <span className="jarvis-launcher-core"/>
      <span className="jarvis-launcher-label">Friday</span>
    </button>
  );
}

export function JarvisDock() {
  const { user } = useAuth();
  const jarvis = useJarvis();
  if ((user?.role !== 'doctor' && user?.role !== 'admin') || jarvis.mode !== 'dock') return null;
  return <JarvisPanel/>;
}

export function JarvisWorkspace() {
  const { user } = useAuth();
  const jarvis = useJarvis();

  useEffect(() => {
    if ((user?.role === 'doctor' || user?.role === 'admin') && jarvis.mode !== 'workspace') {
      jarvis.openWorkspace();
    }
  }, [jarvis.mode, jarvis.openWorkspace, user?.role]);

  const diagnostics = useQuery({
    queryKey: ['jarvis-diagnostics'],
    enabled: user?.role === 'admin',
    queryFn: async () => (await client.get('/jarvis/diagnostics')).data.data as {
      enabled: boolean;
      agentReachable: boolean;
      agentReady: boolean;
      providerConfigured: boolean;
      internalToolContract: boolean;
      sessionSigning: boolean;
    },
  });

  if (user?.role === 'admin') {
    const data = diagnostics.data;
    return (
      <Page title="Friday Assistant — Admin Control & Preview" subtitle="Agent health, provider modes, and clinical tools.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <section className="panel">
            <h2>Friday System Diagnostics</h2>
            {diagnostics.isLoading ? (
              <LoadingSkeleton label="Checking agent status..." rows={3} />
            ) : diagnostics.isError ? (
              <div className="field-error" style={{ color: 'var(--color-error)' }}>
                Could not load Friday diagnostics. Ensure the backend server is active.
              </div>
            ) : data ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginTop: '16px' }}>
                <div className="mock-card" style={{ padding: '16px' }}>
                  <small style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)' }}>Friday Feature</small>
                  <h3 style={{ margin: '8px 0', color: data.enabled ? '#059669' : '#dc2626' }}>{data.enabled ? 'Enabled' : 'Disabled'}</h3>
                  <small>JARVIS_ENABLED environment flag</small>
                </div>
                <div className="mock-card" style={{ padding: '16px' }}>
                  <small style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)' }}>Agent Reachability</small>
                  <h3 style={{ margin: '8px 0', color: data.agentReachable ? '#059669' : '#dc2626' }}>{data.agentReachable ? 'Reachable' : 'Unreachable'}</h3>
                  <small>{data.agentReady ? 'Agent ready endpoint OK' : 'Agent not responding'}</small>
                </div>
                <div className="mock-card" style={{ padding: '16px' }}>
                  <small style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)' }}>Security Contracts</small>
                  <h3 style={{ margin: '8px 0', color: data.internalToolContract && data.sessionSigning ? '#059669' : '#d97706' }}>
                    {data.internalToolContract && data.sessionSigning ? 'Verified' : 'Incomplete'}
                  </h3>
                  <small>JWT & HMAC secrets configured</small>
                </div>
              </div>
            ) : null}
          </section>

          <section className="panel">
            <h2>Live Assistant Preview</h2>
            <p style={{ color: 'var(--color-muted)', marginBottom: '16px' }}>
              As a clinic administrator, you can test and preview the Friday assistant control center below.
            </p>
            <div style={{ minHeight: '400px', border: '1px solid var(--color-border)', borderRadius: '12px', overflow: 'hidden' }}>
              <JarvisPanel workspace />
            </div>
          </section>
        </div>
      </Page>
    );
  }

  return <JarvisPanel workspace />;
}
