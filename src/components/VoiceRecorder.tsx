import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Play, Pause, Trash2, Send, AlertCircle, Settings, RefreshCw, CheckCircle, Volume2 } from 'lucide-react';
import Button from './ui/Button';

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
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [browserInfo, setBrowserInfo] = useState<string>('');

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

  // Get browser information for troubleshooting
  useEffect(() => {
    const getBrowserInfo = () => {
      const ua = navigator.userAgent;
      const isChrome = ua.includes('Chrome');
      const isFirefox = ua.includes('Firefox');
      const isSafari = ua.includes('Safari') && !isChrome;
      const isEdge = ua.includes('Edge');
      
      let browser = 'Unknown';
      if (isChrome) browser = 'Chrome';
      else if (isFirefox) browser = 'Firefox';
      else if (isSafari) browser = 'Safari';
      else if (isEdge) browser = 'Edge';
      
      const info = [
        `Browser: ${browser}`,
        `HTTPS: ${location.protocol === 'https:'}`,
        `MediaDevices: ${!!navigator.mediaDevices}`,
        `getUserMedia: ${!!navigator.mediaDevices?.getUserMedia}`,
        `MediaRecorder: ${!!window.MediaRecorder}`,
        `Host: ${location.hostname}`
      ].join('\n');
      
      setBrowserInfo(info);
    };
    
    getBrowserInfo();
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
   * Check if browser supports audio recording
   */
  const checkBrowserSupport = useCallback((): { supported: boolean; issues: string[] } => {
    const issues: string[] = [];
    
    if (!navigator.mediaDevices) {
      issues.push('MediaDevices API not supported');
    }
    
    if (!navigator.mediaDevices?.getUserMedia) {
      issues.push('getUserMedia not supported');
    }
    
    if (!window.MediaRecorder) {
      issues.push('MediaRecorder API not supported');
    }
    
    if (location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(location.hostname)) {
      issues.push('HTTPS required for microphone access');
    }
    
    return {
      supported: issues.length === 0,
      issues
    };
  }, []);

  /**
   * Get the best supported audio MIME type
   */
  const getBestSupportedMimeType = useCallback((): string => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/wav'
    ];
    
    for (const type of types) {
      try {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
          return type;
        }
      } catch (error) {
        console.warn(`Error checking MIME type ${type}:`, error);
      }
    }
    
    return 'audio/webm'; // Fallback
  }, []);

  /**
   * Request microphone permission with comprehensive error handling
   */
  const requestMicrophonePermission = useCallback(async (): Promise<boolean> => {
    // Check browser support first
    const support = checkBrowserSupport();
    if (!support.supported) {
      setPermissionState({
        status: 'denied',
        error: `Browser not supported: ${support.issues.join(', ')}. Please use Chrome, Firefox, Safari, or Edge with HTTPS.`,
        isChecking: false,
        hasBeenRequested: true
      });
      return false;
    }

    setPermissionState(prev => ({ 
      ...prev, 
      isChecking: true, 
      error: null,
      hasBeenRequested: true
    }));

    try {
      // Request microphone access with specific constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 44100, min: 8000 },
          channelCount: { ideal: 1, max: 2 }
        }
      });

      // Verify we got valid audio tracks
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks available');
      }

      const track = audioTracks[0];
      if (track.readyState !== 'live') {
        throw new Error('Microphone not ready');
      }

      // Test MediaRecorder with the stream
      const mimeType = getBestSupportedMimeType();
      try {
        const testRecorder = new MediaRecorder(stream, { mimeType });
        testRecorder.stop(); // Stop immediately, we just wanted to test creation
      } catch (recorderError) {
        console.warn('MediaRecorder test failed:', recorderError);
        // Continue anyway, might work during actual recording
      }

      // Success! Clean up test stream
      stream.getTracks().forEach(track => track.stop());
      
      setPermissionState({
        status: 'granted',
        error: null,
        isChecking: false,
        hasBeenRequested: true
      });

      return true;

    } catch (error) {
      console.error('Microphone permission failed:', error);
      
      let errorMessage = 'Microphone access failed. ';
      
      if (error instanceof Error) {
        switch (error.name) {
          case 'NotAllowedError':
            errorMessage = 'Microphone access denied. Please click the microphone icon in your browser\'s address bar and select "Allow", then try again.';
            break;
          case 'NotFoundError':
            errorMessage = 'No microphone found. Please connect a microphone and try again.';
            break;
          case 'NotSupportedError':
            errorMessage = 'Audio recording is not supported in this browser. Please use Chrome, Firefox, Safari, or Edge.';
            break;
          case 'NotReadableError':
            errorMessage = 'Microphone is already in use by another application. Please close other apps using the microphone and try again.';
            break;
          case 'OverconstrainedError':
            errorMessage = 'Your microphone doesn\'t meet the required specifications. Please try with a different microphone.';
            break;
          case 'SecurityError':
            errorMessage = 'Microphone access blocked due to security restrictions. Please ensure you\'re using HTTPS.';
            break;
          default:
            errorMessage += error.message || 'Please check your microphone settings and try again.';
        }
      }
      
      setPermissionState({
        status: 'denied',
        error: errorMessage,
        isChecking: false,
        hasBeenRequested: true
      });
      
      return false;
    }
  }, [checkBrowserSupport, getBestSupportedMimeType]);

  /**
   * Start audio recording
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
      
      // Create MediaRecorder
      const mimeType = getBestSupportedMimeType();
      let recorder: MediaRecorder;
      
      try {
        recorder = new MediaRecorder(stream, { 
          mimeType,
          audioBitsPerSecond: 128000
        });
      } catch (mimeError) {
        console.warn('Failed with preferred settings, trying defaults:', mimeError);
        recorder = new MediaRecorder(stream);
      }
      
      mediaRecorderRef.current = recorder;

      // Set up event handlers
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { 
            type: recorder.mimeType || mimeType 
          });
          
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
              error: 'Recording failed - no audio data captured. Please check your microphone.'
            }));
          }
        }
        cleanup();
      };

      recorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setPermissionState(prev => ({
          ...prev,
          error: 'Recording failed. Please try again.'
        }));
        stopRecording();
      };

      // Start recording
      recorder.start(1000);
      
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
        error: 'Failed to start recording. Please check your microphone and try again.'
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
   * Reset permission state
   */
  const resetPermissionState = () => {
    setPermissionState({
      status: 'unknown',
      error: null,
      isChecking: false,
      hasBeenRequested: false
    });
  };

  /**
   * Open browser settings help
   */
  const showBrowserHelp = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    let instructions = '';
    
    if (userAgent.includes('chrome')) {
      instructions = '1. Click the microphone icon in the address bar\n2. Select "Allow"\n3. Or go to Settings > Privacy and security > Site Settings > Microphone';
    } else if (userAgent.includes('firefox')) {
      instructions = '1. Click the microphone icon in the address bar\n2. Select "Allow"\n3. Or go to Preferences > Privacy & Security > Permissions > Microphone';
    } else if (userAgent.includes('safari')) {
      instructions = '1. Go to Safari > Preferences > Websites > Microphone\n2. Set this site to "Allow"';
    } else if (userAgent.includes('edge')) {
      instructions = '1. Click the microphone icon in the address bar\n2. Select "Allow"\n3. Or go to Settings > Site permissions > Microphone';
    } else {
      instructions = '1. Look for a microphone icon in your browser\'s address bar\n2. Click it and select "Allow"\n3. Check your browser\'s privacy/security settings';
    }
    
    alert(`To enable microphone access:\n\n${instructions}\n\nAfter changing permissions, refresh this page and try again.`);
  };

  // Show error state with troubleshooting
  if (permissionState.error) {
    return (
      <div className={`bg-red-900/20 border border-red-700 rounded-lg p-4 ${className}`}>
        <div className="flex items-center space-x-2 mb-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-400 font-medium">Audio System Error</span>
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
            {permissionState.isChecking ? 'Checking...' : 'Request Permission'}
          </Button>
          
          <Button
            onClick={resetPermissionState}
            variant="secondary"
            size="sm"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Retry
          </Button>
          
          <Button
            onClick={showBrowserHelp}
            variant="secondary"
            size="sm"
          >
            <Settings className="w-4 h-4 mr-1" />
            Settings Help
          </Button>
        </div>
        
        <button
          onClick={() => setShowTroubleshooting(!showTroubleshooting)}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          {showTroubleshooting ? 'Hide' : 'Show'} troubleshooting info
        </button>
        
        {showTroubleshooting && (
          <div className="mt-4 p-3 bg-gray-800 rounded border border-gray-600">
            <h4 className="text-sm font-medium text-white mb-2">Troubleshooting Steps:</h4>
            <div className="text-xs text-gray-300 space-y-2">
              <div>
                <p className="font-medium">1. Check browser permissions:</p>
                <ul className="list-disc list-inside ml-4">
                  <li>Look for a microphone icon in the address bar</li>
                  <li>Click it and select "Allow"</li>
                  <li>Refresh the page after changing permissions</li>
                </ul>
              </div>
              
              <div>
                <p className="font-medium">2. Check system settings:</p>
                <ul className="list-disc list-inside ml-4">
                  <li>Ensure your microphone is connected and working</li>
                  <li>Close other apps that might be using the microphone</li>
                  <li>Try a different microphone if available</li>
                </ul>
              </div>
              
              <div>
                <p className="font-medium">3. Browser requirements:</p>
                <ul className="list-disc list-inside ml-4">
                  <li>Use Chrome, Firefox, Safari, or Edge</li>
                  <li>Ensure you're on HTTPS (secure connection)</li>
                  <li>Update your browser to the latest version</li>
                </ul>
              </div>
              
              <div className="mt-3 pt-2 border-t border-gray-600">
                <p className="font-medium">System Information:</p>
                <pre className="text-xs text-gray-400 mt-1 whitespace-pre-wrap">{browserInfo}</pre>
              </div>
            </div>
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