import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Play, Pause, Trash2, Send, AlertCircle, Settings, RefreshCw, CheckCircle, Volume2, Bug } from 'lucide-react';
import Button from './ui/Button';
import AudioDiagnostics from './AudioDiagnostics';

interface VoiceRecorderProps {
  onSendAudio: (audioBlob: Blob, duration: number) => void;
  disabled?: boolean;
  className?: string;
}

interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
}

interface PermissionState {
  status: 'unknown' | 'granted' | 'denied' | 'prompt';
  error: string | null;
  isChecking: boolean;
  hasBeenRequested: boolean;
}

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ 
  onSendAudio, 
  disabled = false, 
  className = '' 
}) => {
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    audioBlob: null,
    audioUrl: null
  });

  const [permissionState, setPermissionState] = useState<PermissionState>({
    status: 'unknown',
    error: null,
    isChecking: false,
    hasBeenRequested: false
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Refs for managing recording resources
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number>();
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      audioStreamRef.current = null;
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = undefined;
    }
    
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.src = '';
      audioElementRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (error) {
        console.warn('Error stopping media recorder:', error);
      }
      mediaRecorderRef.current = null;
    }
  }, []);

  // Timer effect for recording duration
  useEffect(() => {
    if (recordingState.isRecording && !recordingState.isPaused) {
      timerRef.current = window.setInterval(() => {
        setRecordingState(prev => ({
          ...prev,
          duration: prev.duration + 1
        }));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = undefined;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = undefined;
      }
    };
  }, [recordingState.isRecording, recordingState.isPaused]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  /**
   * Enhanced microphone permission request with better error handling
   */
  const requestMicrophonePermission = useCallback(async (): Promise<boolean> => {
    setPermissionState(prev => ({ 
      ...prev, 
      isChecking: true, 
      error: null,
      hasBeenRequested: true
    }));

    try {
      // First, check if we're in a secure context
      if (location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(location.hostname)) {
        throw new Error('HTTPS required for microphone access. Please use a secure connection.');
      }

      // Check basic API support
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Your browser does not support audio recording. Please use Chrome, Firefox, Safari, or Edge.');
      }

      // Try to get microphone access with comprehensive constraints
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 44100, min: 8000 },
          channelCount: { ideal: 1, max: 2 }
        }
      };

      console.log('Requesting microphone access with constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Verify we got valid audio tracks
      const audioTracks = stream.getAudioTracks();
      console.log('Audio tracks received:', audioTracks.length);
      
      if (audioTracks.length === 0) {
        stream.getTracks().forEach(track => track.stop());
        throw new Error('No audio tracks available. Please check your microphone connection.');
      }

      const track = audioTracks[0];
      console.log('Audio track settings:', track.getSettings());
      
      if (track.readyState !== 'live') {
        stream.getTracks().forEach(track => track.stop());
        throw new Error('Microphone is not ready. Please check your microphone settings.');
      }

      // Test MediaRecorder creation
      const supportedMimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/wav'
      ];

      let workingMimeType = '';
      for (const mimeType of supportedMimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          workingMimeType = mimeType;
          break;
        }
      }

      if (!workingMimeType) {
        console.warn('No supported MIME types found, using default');
        workingMimeType = 'audio/webm';
      }

      console.log('Using MIME type:', workingMimeType);

      // Test MediaRecorder creation
      try {
        const testRecorder = new MediaRecorder(stream, { mimeType: workingMimeType });
        console.log('MediaRecorder created successfully');
        testRecorder.stop(); // Stop immediately
      } catch (recorderError) {
        console.error('MediaRecorder test failed:', recorderError);
        // Continue anyway, might work during actual recording
      }

      // Clean up test stream
      stream.getTracks().forEach(track => track.stop());
      
      setPermissionState({
        status: 'granted',
        error: null,
        isChecking: false,
        hasBeenRequested: true
      });

      setRetryCount(0); // Reset retry count on success
      return true;

    } catch (error) {
      console.error('Microphone permission failed:', error);
      setRetryCount(prev => prev + 1);
      
      let errorMessage = 'Microphone access failed. ';
      let suggestion = '';
      
      if (error instanceof Error) {
        switch (error.name) {
          case 'NotAllowedError':
            errorMessage = 'Microphone access denied.';
            suggestion = 'Please click the microphone icon in your browser\'s address bar and select "Allow", then try again.';
            break;
          case 'NotFoundError':
            errorMessage = 'No microphone found.';
            suggestion = 'Please connect a microphone and try again.';
            break;
          case 'NotSupportedError':
            errorMessage = 'Audio recording not supported.';
            suggestion = 'Please use Chrome, Firefox, Safari, or Edge.';
            break;
          case 'NotReadableError':
            errorMessage = 'Microphone is already in use.';
            suggestion = 'Please close other applications using the microphone and try again.';
            break;
          case 'OverconstrainedError':
            errorMessage = 'Microphone constraints not met.';
            suggestion = 'Please try with a different microphone or check your audio settings.';
            break;
          case 'SecurityError':
            errorMessage = 'Security restriction.';
            suggestion = 'Please ensure you\'re using HTTPS and try again.';
            break;
          default:
            if (error.message.includes('HTTPS')) {
              errorMessage = error.message;
              suggestion = 'Please access this site using HTTPS.';
            } else if (error.message.includes('browser')) {
              errorMessage = error.message;
              suggestion = 'Please update your browser or try a different one.';
            } else {
              errorMessage += error.message;
              suggestion = 'Please check your microphone settings and try again.';
            }
        }
      }
      
      setPermissionState({
        status: 'denied',
        error: `${errorMessage} ${suggestion}`,
        isChecking: false,
        hasBeenRequested: true
      });
      
      return false;
    }
  }, []);

  /**
   * Start audio recording with enhanced error handling
   */
  const startRecording = async () => {
    // Request permission if not already granted
    if (permissionState.status !== 'granted') {
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) return;
    }

    try {
      setPermissionState(prev => ({ ...prev, error: null }));
      
      // Get fresh audio stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 44100, min: 8000 },
          channelCount: { ideal: 1 }
        }
      });
      
      // Verify stream
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0 || audioTracks[0].readyState !== 'live') {
        throw new Error('Invalid audio stream');
      }
      
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      
      // Create MediaRecorder with fallback MIME types
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/wav'
      ];

      let recorder: MediaRecorder;
      let usedMimeType = '';

      for (const mimeType of mimeTypes) {
        try {
          if (MediaRecorder.isTypeSupported(mimeType)) {
            recorder = new MediaRecorder(stream, { 
              mimeType,
              audioBitsPerSecond: 128000
            });
            usedMimeType = mimeType;
            break;
          }
        } catch (error) {
          console.warn(`Failed to create recorder with ${mimeType}:`, error);
        }
      }

      // Fallback to default if no specific type worked
      if (!recorder!) {
        try {
          recorder = new MediaRecorder(stream);
          usedMimeType = 'default';
        } catch (error) {
          throw new Error('Failed to create MediaRecorder with any configuration');
        }
      }
      
      mediaRecorderRef.current = recorder;
      console.log('Recording started with MIME type:', usedMimeType);

      // Set up event handlers
      recorder.ondataavailable = (event) => {
        console.log('Data available:', event.data.size, 'bytes');
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        console.log('Recording stopped, chunks:', audioChunksRef.current.length);
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { 
            type: recorder.mimeType || usedMimeType || 'audio/webm'
          });
          
          console.log('Created blob:', audioBlob.size, 'bytes');
          
          if (audioBlob.size > 0) {
            const audioUrl = URL.createObjectURL(audioBlob);
            
            setRecordingState(prev => ({
              ...prev,
              audioBlob,
              audioUrl,
              isRecording: false,
              isPaused: false
            }));
          } else {
            setPermissionState(prev => ({
              ...prev,
              error: 'Recording failed - no audio data captured. Please check your microphone and try again.'
            }));
          }
        } else {
          setPermissionState(prev => ({
            ...prev,
            error: 'Recording failed - no audio data received. Please check your microphone settings.'
          }));
        }
        cleanup();
      };

      recorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setPermissionState(prev => ({
          ...prev,
          error: 'Recording failed due to an internal error. Please try again.'
        }));
        stopRecording();
      };

      // Start recording with data collection every 100ms
      recorder.start(100);
      
      setRecordingState(prev => ({
        ...prev,
        isRecording: true,
        isPaused: false,
        duration: 0,
        audioBlob: null,
        audioUrl: null
      }));
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      setPermissionState(prev => ({
        ...prev,
        error: `Failed to start recording: ${error instanceof Error ? error.message : 'Unknown error'}. Please check your microphone and try again.`
      }));
      cleanup();
    }
  };

  /**
   * Stop audio recording
   */
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (error) {
        console.error('Error stopping recording:', error);
      }
    }
  };

  /**
   * Play recorded audio
   */
  const playAudio = () => {
    if (recordingState.audioUrl) {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
      
      const audio = new Audio(recordingState.audioUrl);
      audioElementRef.current = audio;
      
      audio.onplay = () => setIsPlaying(true);
      audio.onpause = () => setIsPlaying(false);
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => setIsPlaying(false);
      
      audio.play().catch(() => setIsPlaying(false));
    }
  };

  /**
   * Pause audio playback
   */
  const pauseAudio = () => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
    }
  };

  /**
   * Delete recorded audio
   */
  const deleteRecording = () => {
    if (recordingState.audioUrl) {
      URL.revokeObjectURL(recordingState.audioUrl);
    }
    
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current = null;
    }
    
    setRecordingState({
      isRecording: false,
      isPaused: false,
      duration: 0,
      audioBlob: null,
      audioUrl: null
    });
    
    setIsPlaying(false);
  };

  /**
   * Send recorded audio
   */
  const sendAudio = () => {
    if (recordingState.audioBlob) {
      onSendAudio(recordingState.audioBlob, recordingState.duration);
      deleteRecording();
    }
  };

  /**
   * Format duration in MM:SS format
   */
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * Reset permission state and retry
   */
  const resetAndRetry = () => {
    setPermissionState({
      status: 'unknown',
      error: null,
      isChecking: false,
      hasBeenRequested: false
    });
    setRetryCount(0);
  };

  // Show diagnostics if requested
  if (showDiagnostics) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Audio System Diagnostics</h3>
          <Button
            onClick={() => setShowDiagnostics(false)}
            variant="secondary"
            size="sm"
          >
            Back to Recorder
          </Button>
        </div>
        <AudioDiagnostics />
      </div>
    );
  }

  // Show error state with enhanced troubleshooting
  if (permissionState.error) {
    return (
      <div className={`bg-red-900/20 border border-red-700 rounded-lg p-4 ${className}`}>
        <div className="flex items-center space-x-2 mb-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-400 font-medium">Audio System Error</span>
          {retryCount > 0 && (
            <span className="text-xs text-gray-400">(Attempt {retryCount})</span>
          )}
        </div>
        
        <p className="text-red-300 text-sm mb-4">{permissionState.error}</p>
        
        <div className="flex flex-wrap gap-2 mb-4">
          <Button
            onClick={requestMicrophonePermission}
            variant="secondary"
            size="sm"
            disabled={permissionState.isChecking}
            isLoading={permissionState.isChecking}
          >
            <Mic className="w-4 h-4 mr-1" />
            {permissionState.isChecking ? 'Checking...' : 'Try Again'}
          </Button>
          
          <Button
            onClick={resetAndRetry}
            variant="secondary"
            size="sm"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Reset
          </Button>
          
          <Button
            onClick={() => setShowDiagnostics(true)}
            variant="secondary"
            size="sm"
          >
            <Bug className="w-4 h-4 mr-1" />
            Diagnostics
          </Button>
        </div>

        {retryCount >= 2 && (
          <div className="bg-yellow-900/20 border border-yellow-700 rounded p-3 mb-4">
            <p className="text-yellow-300 text-sm font-medium mb-2">
              Multiple attempts failed. Try these steps:
            </p>
            <ul className="text-yellow-200 text-xs space-y-1">
              <li>1. Refresh the page completely</li>
              <li>2. Check browser permissions in settings</li>
              <li>3. Try a different browser or device</li>
              <li>4. Run full diagnostics for detailed analysis</li>
            </ul>
          </div>
        )}
      </div>
    );
  }

  // Show permission granted status
  if (permissionState.status === 'granted' && !recordingState.audioBlob && !recordingState.isRecording) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center space-x-3">
          <Button
            onClick={startRecording}
            disabled={disabled}
            className="flex items-center space-x-2"
          >
            <Mic className="w-4 h-4" />
            <span>Record Voice Message</span>
          </Button>
          
          <div className="flex items-center space-x-2 text-green-400 text-sm">
            <CheckCircle className="w-4 h-4" />
            <span>Microphone ready</span>
          </div>

          <Button
            onClick={() => setShowDiagnostics(true)}
            variant="secondary"
            size="sm"
          >
            <Bug className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Show initial state (permission not requested yet)
  if (permissionState.status === 'unknown' && !permissionState.hasBeenRequested) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center space-x-3">
          <Button
            onClick={requestMicrophonePermission}
            disabled={disabled || permissionState.isChecking}
            isLoading={permissionState.isChecking}
            className="flex items-center space-x-2"
          >
            <Mic className="w-4 h-4" />
            <span>{permissionState.isChecking ? 'Checking...' : 'Enable Voice Messages'}</span>
          </Button>
          
          <div className="flex items-center space-x-2 text-gray-400 text-sm">
            <Volume2 className="w-4 h-4" />
            <span>Click to enable microphone</span>
          </div>

          <Button
            onClick={() => setShowDiagnostics(true)}
            variant="secondary"
            size="sm"
          >
            <Bug className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Recording Controls */}
      {!recordingState.audioBlob && (
        <div className="flex items-center space-x-3">
          {!recordingState.isRecording ? (
            <Button
              onClick={startRecording}
              disabled={disabled || permissionState.isChecking}
              isLoading={permissionState.isChecking}
              className="flex items-center space-x-2"
            >
              <Mic className="w-4 h-4" />
              <span>{permissionState.isChecking ? 'Checking...' : 'Record'}</span>
            </Button>
          ) : (
            <>
              <Button
                onClick={stopRecording}
                variant="danger"
                className="flex items-center space-x-2"
              >
                <Square className="w-4 h-4" />
                <span>Stop</span>
              </Button>
              <div className="flex items-center space-x-2 text-red-400">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className="font-mono text-sm">
                  {formatDuration(recordingState.duration)}
                </span>
              </div>
            </>
          )}

          <Button
            onClick={() => setShowDiagnostics(true)}
            variant="secondary"
            size="sm"
          >
            <Bug className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Playback Controls */}
      {recordingState.audioBlob && (
        <div className="bg-gray-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">
              Recorded Audio ({formatDuration(recordingState.duration)})
            </span>
          </div>
          
          <div className="flex items-center space-x-3">
            <Button
              onClick={isPlaying ? pauseAudio : playAudio}
              variant="secondary"
              size="sm"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            
            <Button
              onClick={deleteRecording}
              variant="danger"
              size="sm"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            
            <Button
              onClick={sendAudio}
              disabled={disabled}
              className="flex items-center space-x-2"
            >
              <Send className="w-4 h-4" />
              <span>Send</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceRecorder;