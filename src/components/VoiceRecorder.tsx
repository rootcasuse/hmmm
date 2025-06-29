import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Play, Pause, Trash2, Send, AlertCircle, Settings, RefreshCw, CheckCircle } from 'lucide-react';
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
  lastChecked: number;
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
    isChecking: false,
    lastChecked: 0
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [audioDevices, setAudioDevices] = useState<AudioDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [supportedMimeTypes, setSupportedMimeTypes] = useState<string[]>([]);
  const [systemInfo, setSystemInfo] = useState<string>('');

  // Refs for managing recording resources
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number>();
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
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

  // Get system information for debugging
  const getSystemInfo = useCallback((): string => {
    const info = [];
    info.push(`Browser: ${navigator.userAgent}`);
    info.push(`Protocol: ${location.protocol}`);
    info.push(`Host: ${location.hostname}`);
    info.push(`MediaDevices: ${!!navigator.mediaDevices}`);
    info.push(`getUserMedia: ${!!navigator.mediaDevices?.getUserMedia}`);
    info.push(`MediaRecorder: ${!!window.MediaRecorder}`);
    info.push(`WebCrypto: ${!!window.crypto?.subtle}`);
    return info.join('\n');
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
      'audio/wav'
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
    
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
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

      // Get system info for debugging
      const sysInfo = getSystemInfo();
      setSystemInfo(sysInfo);

      // Check browser compatibility
      const compatibility = checkBrowserCompatibility();
      if (!compatibility.compatible) {
        throw new Error(`Browser compatibility issues: ${compatibility.issues.join(', ')}`);
      }

      // Get supported MIME types
      const mimeTypes = getSupportedMimeTypes();
      setSupportedMimeTypes(mimeTypes);

      if (mimeTypes.length === 0) {
        throw new Error('No supported audio recording formats found in this browser');
      }

      // Try to get initial device list (may be limited without permission)
      const devices = await getAudioDevices();
      setAudioDevices(devices);

      // Set default device if available
      if (devices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(devices[0].deviceId);
      }

      setPermissionState(prev => ({ 
        ...prev, 
        isChecking: false,
        lastChecked: Date.now()
      }));

    } catch (error) {
      console.error('Audio system initialization failed:', error);
      setPermissionState({
        status: 'denied',
        error: error instanceof Error ? error.message : 'Audio system initialization failed',
        isChecking: false,
        lastChecked: Date.now()
      });
    } finally {
      setIsInitializing(false);
    }
  }, [checkBrowserCompatibility, getSupportedMimeTypes, getAudioDevices, getSystemInfo, selectedDeviceId]);

  // Check microphone permission with actual access test
  const checkMicrophonePermission = useCallback(async (forceCheck: boolean = false): Promise<boolean> => {
    const now = Date.now();
    
    // Don't check too frequently unless forced
    if (!forceCheck && (now - permissionState.lastChecked) < 5000) {
      return permissionState.status === 'granted';
    }

    try {
      setPermissionState(prev => ({ ...prev, isChecking: true, error: null }));

      // First try the Permissions API if available
      if (navigator.permissions && !forceCheck) {
        try {
          const permission = await navigator.permissions.query({ 
            name: 'microphone' as PermissionName 
          });
          
          if (permission.state === 'granted') {
            // Even if permission API says granted, we should test actual access
            // Fall through to actual access test
          } else if (permission.state === 'denied') {
            setPermissionState({
              status: 'denied',
              error: 'Microphone access denied. Please allow microphone access in your browser settings.',
              isChecking: false,
              lastChecked: now
            });
            return false;
          }
        } catch (permError) {
          console.log('Permission API not supported or failed, testing direct access');
        }
      }

      // Test actual microphone access
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 44100 },
          channelCount: { ideal: 1 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Verify we got valid audio tracks
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks available');
      }

      const track = audioTracks[0];
      if (track.readyState !== 'live') {
        throw new Error('Microphone not ready');
      }

      // Success! Clean up test stream
      stream.getTracks().forEach(track => track.stop());
      
      // Update device list now that we have permission
      const devices = await getAudioDevices();
      setAudioDevices(devices);
      
      // Set default device if we don't have one
      if (devices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(devices[0].deviceId);
      }

      setPermissionState({
        status: 'granted',
        error: null,
        isChecking: false,
        lastChecked: now
      });

      return true;

    } catch (error) {
      console.error('Microphone access test failed:', error);
      
      let errorMessage = 'Microphone access failed. ';
      let status: PermissionState['status'] = 'denied';
      
      if (error instanceof Error) {
        switch (error.name) {
          case 'NotAllowedError':
            status = 'denied';
            errorMessage = 'Microphone access denied. Please click the microphone icon in your browser\'s address bar and allow access, then try again.';
            break;
          case 'NotFoundError':
            errorMessage = 'No microphone found. Please connect a microphone and refresh the page.';
            break;
          case 'NotSupportedError':
            errorMessage = 'Audio recording is not supported in this browser. Please use Chrome, Firefox, Safari, or Edge.';
            break;
          case 'NotReadableError':
            errorMessage = 'Microphone is already in use by another application. Please close other apps using the microphone.';
            break;
          case 'OverconstrainedError':
            errorMessage = 'Microphone does not meet the required specifications. Try a different microphone.';
            break;
          case 'SecurityError':
            errorMessage = 'Microphone access blocked due to security restrictions. Please ensure you\'re using HTTPS.';
            break;
          default:
            errorMessage += error.message || 'Please check your microphone settings and try again.';
        }
      }
      
      setPermissionState({
        status,
        error: errorMessage,
        isChecking: false,
        lastChecked: now
      });
      
      return false;
    }
  }, [permissionState.lastChecked, permissionState.status, getAudioDevices, selectedDeviceId]);

  // Initialize on mount
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      await initializeAudioSystem();
      if (mounted) {
        // Don't automatically check permission on mount - wait for user interaction
        console.log('Audio system initialized, waiting for user interaction to check microphone permission');
      }
    };

    initialize();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [initializeAudioSystem, cleanup]);

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
    
    // Ultimate fallback
    return 'audio/webm';
  }, [supportedMimeTypes]);

  /**
   * Request microphone permission with user-friendly flow
   */
  const requestMicrophonePermission = async (): Promise<boolean> => {
    return await checkMicrophonePermission(true);
  };

  /**
   * Start audio recording with comprehensive error handling
   */
  const startRecording = async () => {
    // Check permission first
    const hasPermission = await checkMicrophonePermission(true);
    if (!hasPermission) {
      return;
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
          ...(selectedDeviceId && selectedDeviceId !== 'default' && { 
            deviceId: { exact: selectedDeviceId } 
          })
        }
      };

      // Get fresh audio stream
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Verify stream is valid
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0 || audioTracks[0].readyState !== 'live') {
        throw new Error('Invalid audio stream - microphone may be in use by another application');
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
        try {
          recorder = new MediaRecorder(stream);
        } catch (fallbackError) {
          throw new Error('MediaRecorder not supported with any audio format');
        }
      }
      
      mediaRecorderRef.current = recorder;

      // Set up comprehensive event handlers
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log(`Audio chunk received: ${event.data.size} bytes`);
        }
      };

      recorder.onstop = () => {
        console.log(`Recording stopped, total chunks: ${audioChunksRef.current.length}`);
        
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { 
            type: recorder.mimeType || mimeType 
          });
          
          console.log(`Final audio blob size: ${audioBlob.size} bytes`);
          
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

      recorder.onstart = () => {
        console.log('Recording started successfully');
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
      
      let errorMessage = 'Failed to start recording. ';
      if (error instanceof Error) {
        if (error.message.includes('Invalid audio stream')) {
          errorMessage = error.message;
        } else if (error.message.includes('MediaRecorder not supported')) {
          errorMessage = error.message;
        } else {
          errorMessage += 'Please check your microphone and try again.';
        }
      }
      
      setPermissionState(prev => ({
        ...prev,
        error: errorMessage
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
      console.log(`Stopping recording, current state: ${state}`);
      
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
    initializationRef.current = false;
    setPermissionState({ 
      status: 'unknown', 
      error: null, 
      isChecking: false,
      lastChecked: 0
    });
    await initializeAudioSystem();
  };

  /**
   * Open browser settings (best effort)
   */
  const openBrowserSettings = () => {
    // This will vary by browser, but we can provide instructions
    const userAgent = navigator.userAgent.toLowerCase();
    let instructions = '';
    
    if (userAgent.includes('chrome')) {
      instructions = 'Click the microphone icon in the address bar, or go to Settings > Privacy and security > Site Settings > Microphone';
    } else if (userAgent.includes('firefox')) {
      instructions = 'Click the microphone icon in the address bar, or go to Preferences > Privacy & Security > Permissions > Microphone';
    } else if (userAgent.includes('safari')) {
      instructions = 'Go to Safari > Preferences > Websites > Microphone';
    } else if (userAgent.includes('edge')) {
      instructions = 'Click the microphone icon in the address bar, or go to Settings > Site permissions > Microphone';
    } else {
      instructions = 'Look for a microphone icon in your browser\'s address bar, or check your browser\'s privacy/security settings';
    }
    
    alert(`To enable microphone access:\n\n${instructions}\n\nThen refresh this page and try again.`);
  };

  // Show permission error with helpful instructions
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
            onClick={openBrowserSettings}
            variant="secondary"
            size="sm"
          >
            <Settings className="w-4 h-4 mr-1" />
            Settings
          </Button>
        </div>
        
        {/* Troubleshooting section */}
        <details className="mt-4">
          <summary className="text-sm text-gray-400 cursor-pointer hover:text-white">
            Troubleshooting Steps
          </summary>
          <div className="mt-2 p-3 bg-gray-800 rounded border border-gray-600 text-xs text-gray-300">
            <div className="space-y-2">
              <p><strong>1. Check browser permissions:</strong></p>
              <ul className="list-disc list-inside ml-4 space-y-1">
                <li>Look for a microphone icon in the address bar</li>
                <li>Click it and select "Allow"</li>
                <li>Refresh the page after changing permissions</li>
              </ul>
              
              <p><strong>2. Check system settings:</strong></p>
              <ul className="list-disc list-inside ml-4 space-y-1">
                <li>Ensure your microphone is connected and working</li>
                <li>Check that no other apps are using the microphone</li>
                <li>Try a different microphone if available</li>
              </ul>
              
              <p><strong>3. Browser requirements:</strong></p>
              <ul className="list-disc list-inside ml-4 space-y-1">
                <li>Use Chrome, Firefox, Safari, or Edge</li>
                <li>Ensure you're on HTTPS (secure connection)</li>
                <li>Update your browser to the latest version</li>
              </ul>
            </div>
            
            {showDeviceSettings && (
              <div className="mt-4 pt-3 border-t border-gray-600">
                <p><strong>System Information:</strong></p>
                <pre className="text-xs text-gray-400 mt-1 whitespace-pre-wrap">{systemInfo}</pre>
                
                <p className="mt-2"><strong>Supported Formats:</strong></p>
                <p className="text-gray-400">
                  {supportedMimeTypes.length > 0 
                    ? supportedMimeTypes.join(', ')
                    : 'No supported formats found'
                  }
                </p>
                
                <p className="mt-2"><strong>Available Devices:</strong></p>
                <p className="text-gray-400">
                  {audioDevices.length > 0 
                    ? audioDevices.map(d => d.label).join(', ')
                    : 'No devices found (may require permission)'
                  }
                </p>
              </div>
            )}
          </div>
        </details>
        
        <button
          onClick={() => setShowDeviceSettings(!showDeviceSettings)}
          className="text-xs text-gray-400 hover:text-white mt-2"
        >
          {showDeviceSettings ? 'Hide' : 'Show'} technical details
        </button>
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
            disabled={disabled || isInitializing}
            isLoading={isInitializing}
            className="flex items-center space-x-2"
          >
            <Mic className="w-4 h-4" />
            <span>Record Voice Message</span>
          </Button>
          
          <div className="flex items-center space-x-2 text-green-400 text-sm">
            <CheckCircle className="w-4 h-4" />
            <span>Microphone ready</span>
          </div>
          
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
          
          {audioDevices.length > 1 && permissionState.status === 'granted' && (
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