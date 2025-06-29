import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Play, Pause, Trash2, Send, AlertCircle, Settings, RefreshCw } from 'lucide-react';
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
}

interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  kind: string;
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
    isChecking: false
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [audioDevices, setAudioDevices] = useState<AudioDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [supportedMimeTypes, setSupportedMimeTypes] = useState<string[]>([]);

  // Refs for managing recording resources
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number>();
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const permissionCheckRef = useRef<boolean>(false);
  const initializationRef = useRef<boolean>(false);

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

    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (error) {
          console.warn('Error stopping media recorder:', error);
        }
      }
      mediaRecorderRef.current = null;
    }
  }, []);

  // Get supported MIME types
  const getSupportedMimeTypes = useCallback((): string[] => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm;codecs=vp8,opus',
      'audio/webm',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/wav',
      'audio/mpeg'
    ];
    
    return types.filter(type => {
      try {
        return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type);
      } catch (error) {
        return false;
      }
    });
  }, []);

  // Get available audio devices
  const getAudioDevices = useCallback(async (): Promise<AudioDeviceInfo[]> => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return [];
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
          kind: device.kind
        }));
    } catch (error) {
      console.error('Failed to enumerate audio devices:', error);
      return [];
    }
  }, []);

  // Check browser compatibility
  const checkBrowserCompatibility = useCallback((): { compatible: boolean; issues: string[] } => {
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
    
    if (!window.crypto || !window.crypto.subtle) {
      issues.push('Web Crypto API not supported');
    }
    
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      issues.push('HTTPS required for microphone access');
    }
    
    return {
      compatible: issues.length === 0,
      issues
    };
  }, []);

  // Initialize audio system
  const initializeAudioSystem = useCallback(async () => {
    if (initializationRef.current) return;
    initializationRef.current = true;

    try {
      setIsInitializing(true);
      setPermissionState(prev => ({ ...prev, error: null, isChecking: true }));

      // Check browser compatibility
      const compatibility = checkBrowserCompatibility();
      if (!compatibility.compatible) {
        throw new Error(`Browser not compatible: ${compatibility.issues.join(', ')}`);
      }

      // Get supported MIME types
      const mimeTypes = getSupportedMimeTypes();
      setSupportedMimeTypes(mimeTypes);

      if (mimeTypes.length === 0) {
        throw new Error('No supported audio recording formats found');
      }

      // Get available audio devices
      const devices = await getAudioDevices();
      setAudioDevices(devices);

      // Set default device
      if (devices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(devices[0].deviceId);
      }

      setPermissionState(prev => ({ ...prev, isChecking: false }));

    } catch (error) {
      console.error('Audio system initialization failed:', error);
      setPermissionState({
        status: 'denied',
        error: error instanceof Error ? error.message : 'Audio system initialization failed',
        isChecking: false
      });
    } finally {
      setIsInitializing(false);
    }
  }, [checkBrowserCompatibility, getSupportedMimeTypes, getAudioDevices, selectedDeviceId]);

  // Check microphone permission
  const checkMicrophonePermission = useCallback(async (): Promise<void> => {
    if (permissionCheckRef.current) return;
    permissionCheckRef.current = true;

    try {
      setPermissionState(prev => ({ ...prev, isChecking: true, error: null }));

      // Check permission API if available
      if (navigator.permissions) {
        try {
          const permission = await navigator.permissions.query({ 
            name: 'microphone' as PermissionName 
          });
          
          setPermissionState(prev => ({
            ...prev,
            status: permission.state as any,
            isChecking: false
          }));

          permission.onchange = () => {
            setPermissionState(prev => ({
              ...prev,
              status: permission.state as any
            }));
          };

          return;
        } catch (permError) {
          console.log('Permission API not supported, will check on first use');
        }
      }

      setPermissionState(prev => ({ ...prev, status: 'unknown', isChecking: false }));

    } catch (error) {
      console.error('Permission check failed:', error);
      setPermissionState({
        status: 'unknown',
        error: null,
        isChecking: false
      });
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      await initializeAudioSystem();
      if (mounted) {
        await checkMicrophonePermission();
      }
    };

    initialize();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [initializeAudioSystem, checkMicrophonePermission, cleanup]);

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

  /**
   * Get the best supported audio MIME type
   */
  const getBestSupportedMimeType = useCallback((): string => {
    if (supportedMimeTypes.length > 0) {
      return supportedMimeTypes[0];
    }
    
    // Fallback
    return 'audio/webm';
  }, [supportedMimeTypes]);

  /**
   * Request microphone permission with comprehensive error handling
   */
  const requestMicrophonePermission = async (): Promise<boolean> => {
    if (isInitializing || permissionState.isChecking) return false;
    
    setPermissionState(prev => ({ ...prev, isChecking: true, error: null }));
    
    try {
      // Get audio constraints
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 44100, min: 8000, max: 48000 },
          channelCount: { ideal: 1 },
          ...(selectedDeviceId && { deviceId: { exact: selectedDeviceId } })
        }
      };

      // Test microphone access
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Verify we actually got audio tracks
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks available');
      }

      // Check if tracks are enabled and ready
      const track = audioTracks[0];
      if (track.readyState !== 'live') {
        throw new Error('Microphone not ready');
      }
      
      setPermissionState({
        status: 'granted',
        error: null,
        isChecking: false
      });
      
      // Stop the test stream
      stream.getTracks().forEach(track => track.stop());
      
      // Update device list with labels now that we have permission
      const devices = await getAudioDevices();
      setAudioDevices(devices);
      
      return true;
      
    } catch (error) {
      console.error('Microphone permission/access failed:', error);
      
      let errorMessage = 'Microphone access failed. ';
      let status: PermissionState['status'] = 'denied';
      
      if (error instanceof Error) {
        switch (error.name) {
          case 'NotAllowedError':
            status = 'denied';
            errorMessage += 'Please allow microphone access in your browser settings and refresh the page.';
            break;
          case 'NotFoundError':
            errorMessage += 'No microphone found. Please connect a microphone and try again.';
            break;
          case 'NotSupportedError':
            errorMessage += 'Audio recording is not supported in this browser.';
            break;
          case 'NotReadableError':
            errorMessage += 'Microphone is already in use by another application.';
            break;
          case 'OverconstrainedError':
            errorMessage += 'Microphone does not meet the required specifications.';
            break;
          case 'SecurityError':
            errorMessage += 'Microphone access blocked due to security restrictions.';
            break;
          default:
            errorMessage += `${error.message || 'Please check your microphone settings.'}`;
        }
      }
      
      setPermissionState({
        status,
        error: errorMessage,
        isChecking: false
      });
      
      return false;
    }
  };

  /**
   * Start audio recording with robust error handling
   */
  const startRecording = async () => {
    // Check permission first
    if (permissionState.status !== 'granted') {
      const hasPermission = await requestMicrophonePermission();
      if (!hasPermission) return;
    }

    try {
      setPermissionState(prev => ({ ...prev, error: null }));
      
      // Get audio constraints
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 44100, min: 8000, max: 48000 },
          channelCount: { ideal: 1 },
          ...(selectedDeviceId && { deviceId: { exact: selectedDeviceId } })
        }
      };

      // Get fresh audio stream
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Verify stream is valid
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0 || audioTracks[0].readyState !== 'live') {
        throw new Error('Invalid audio stream');
      }
      
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      
      // Determine best MIME type
      const mimeType = getBestSupportedMimeType();

      // Create MediaRecorder with error handling
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { 
          mimeType,
          audioBitsPerSecond: 128000
        });
      } catch (mimeError) {
        console.warn('Failed with preferred MIME type, trying default:', mimeError);
        recorder = new MediaRecorder(stream);
      }
      
      mediaRecorderRef.current = recorder;

      // Set up comprehensive event handlers
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
              error: 'Recording failed - no audio data captured'
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

      // Start recording with data collection interval
      recorder.start(1000); // Collect data every second
      
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
    if (mediaRecorderRef.current) {
      const state = mediaRecorderRef.current.state;
      
      if (state === 'recording' || state === 'paused') {
        try {
          mediaRecorderRef.current.stop();
        } catch (error) {
          console.error('Error stopping recording:', error);
        }
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
      audio.onerror = (e) => {
        console.error('Audio playback error:', e);
        setIsPlaying(false);
      };
      
      audio.play().catch(error => {
        console.error('Failed to play audio:', error);
        setIsPlaying(false);
      });
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
   * Retry initialization
   */
  const retryInitialization = async () => {
    permissionCheckRef.current = false;
    initializationRef.current = false;
    setPermissionState({ status: 'unknown', error: null, isChecking: false });
    await initializeAudioSystem();
    await checkMicrophonePermission();
  };

  // Render permission error dialog
  if (permissionState.error) {
    return (
      <div className={`bg-red-900/20 border border-red-700 rounded-lg p-4 ${className}`}>
        <div className="flex items-center space-x-2 mb-2">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-400 font-medium">Audio System Error</span>
        </div>
        <p className="text-red-300 text-sm mb-3">{permissionState.error}</p>
        <div className="flex flex-wrap gap-2">
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
            onClick={retryInitialization}
            variant="secondary"
            size="sm"
            disabled={isInitializing}
            isLoading={isInitializing}
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Retry
          </Button>
          <Button
            onClick={() => setShowDeviceSettings(!showDeviceSettings)}
            variant="secondary"
            size="sm"
          >
            <Settings className="w-4 h-4 mr-1" />
            Settings
          </Button>
        </div>
        
        {showDeviceSettings && (
          <div className="mt-4 p-3 bg-gray-800 rounded border border-gray-600">
            <h4 className="text-sm font-medium text-white mb-2">Audio Devices</h4>
            {audioDevices.length > 0 ? (
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
              >
                {audioDevices.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-gray-400 text-sm">No audio devices found</p>
            )}
            
            <div className="mt-2">
              <h5 className="text-xs font-medium text-gray-300 mb-1">Supported Formats</h5>
              <div className="text-xs text-gray-400">
                {supportedMimeTypes.length > 0 
                  ? supportedMimeTypes.join(', ')
                  : 'No supported formats found'
                }
              </div>
            </div>
          </div>
        )}
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
              disabled={disabled || isInitializing || permissionState.isChecking}
              isLoading={isInitializing || permissionState.isChecking}
              className="flex items-center space-x-2"
            >
              <Mic className="w-4 h-4" />
              <span>
                {isInitializing ? 'Initializing...' : 
                 permissionState.isChecking ? 'Checking...' : 'Record'}
              </span>
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
          
          {audioDevices.length > 1 && (
            <Button
              onClick={() => setShowDeviceSettings(!showDeviceSettings)}
              variant="secondary"
              size="sm"
              className="p-2"
              title="Audio Settings"
            >
              <Settings className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}

      {/* Device Settings */}
      {showDeviceSettings && audioDevices.length > 1 && (
        <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
          <h4 className="text-sm font-medium text-white mb-2">Select Microphone</h4>
          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
          >
            {audioDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
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