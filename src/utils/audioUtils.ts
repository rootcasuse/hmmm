/**
 * Audio Utilities
 * 
 * Comprehensive utility functions for audio processing, format detection,
 * codec management, and permission handling for the voice messaging system.
 */

/**
 * Supported audio MIME types in order of preference
 */
export const SUPPORTED_AUDIO_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/wav'
] as const;

/**
 * Audio recording configuration
 */
export const AUDIO_CONFIG = {
  sampleRate: 44100,
  audioBitsPerSecond: 128000, // 128 kbps
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1
} as const;

/**
 * Audio permission states
 */
export type AudioPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

/**
 * Audio error types and messages
 */
export const AUDIO_ERRORS = {
  NOT_ALLOWED: 'Microphone access denied. Please allow microphone access in your browser settings.',
  NOT_FOUND: 'No microphone found. Please connect a microphone and try again.',
  NOT_SUPPORTED: 'Audio recording is not supported in this browser.',
  NOT_READABLE: 'Microphone is already in use by another application.',
  RECORDING_FAILED: 'Recording failed. Please try again.',
  PLAYBACK_FAILED: 'Audio playback failed. The audio format may not be supported.',
  FILE_TOO_LARGE: 'Audio file is too large. Please record a shorter message.',
  BROWSER_NOT_SUPPORTED: 'Your browser does not support audio recording.',
  HTTPS_REQUIRED: 'HTTPS is required for microphone access.',
  UNKNOWN: 'An unknown audio error occurred. Please try again.'
} as const;

/**
 * Check if the browser supports audio recording
 */
export function isAudioRecordingSupported(): { supported: boolean; issues: string[] } {
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
}

/**
 * Get the best supported audio MIME type for recording
 */
export function getBestSupportedMimeType(): string {
  for (const type of SUPPORTED_AUDIO_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    } catch (error) {
      console.warn(`Error checking MIME type ${type}:`, error);
    }
  }
  
  // Fallback to basic WebM if nothing else is supported
  return 'audio/webm';
}

/**
 * Get all supported audio MIME types
 */
export function getAllSupportedMimeTypes(): string[] {
  return SUPPORTED_AUDIO_TYPES.filter(type => {
    try {
      return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type);
    } catch (error) {
      return false;
    }
  });
}

/**
 * Get audio constraints for getUserMedia
 */
export function getAudioConstraints(deviceId?: string): MediaStreamConstraints {
  const audioConstraints: MediaTrackConstraints = {
    echoCancellation: AUDIO_CONFIG.echoCancellation,
    noiseSuppression: AUDIO_CONFIG.noiseSuppression,
    autoGainControl: AUDIO_CONFIG.autoGainControl,
    sampleRate: { ideal: AUDIO_CONFIG.sampleRate, min: 8000 },
    channelCount: { ideal: AUDIO_CONFIG.channelCount, max: 2 }
  };

  if (deviceId && deviceId !== 'default') {
    audioConstraints.deviceId = { exact: deviceId };
  }

  return { audio: audioConstraints };
}

/**
 * Check microphone permission status using Permissions API
 */
export async function checkMicrophonePermission(): Promise<AudioPermissionState> {
  try {
    if (navigator.permissions) {
      const permission = await navigator.permissions.query({ 
        name: 'microphone' as PermissionName 
      });
      return permission.state as AudioPermissionState;
    }
    return 'unknown';
  } catch (error) {
    console.log('Permission API not supported');
    return 'unknown';
  }
}

/**
 * Test microphone access with actual getUserMedia call
 */
export async function testMicrophoneAccess(deviceId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const constraints = getAudioConstraints(deviceId);
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

    // Clean up test stream
    stream.getTracks().forEach(track => track.stop());
    
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get available audio input devices
 */
export async function getAudioInputDevices(): Promise<MediaDeviceInfo[]> {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return [];
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'audioinput');
  } catch (error) {
    console.error('Failed to enumerate audio devices:', error);
    return [];
  }
}

/**
 * Format duration in MM:SS format
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Convert audio blob to data URL
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Get audio file extension from MIME type
 */
export function getAudioExtension(mimeType: string): string {
  const typeMap: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp4': 'm4a',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav'
  };
  
  // Extract base type (remove codecs)
  const baseType = mimeType.split(';')[0];
  return typeMap[baseType] || 'webm';
}

/**
 * Validate audio file size
 */
export function validateAudioSize(blob: Blob, maxSizeMB: number = 10): boolean {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return blob.size <= maxSizeBytes;
}

/**
 * Create audio element for playback testing
 */
export function createAudioElement(src: string): HTMLAudioElement {
  const audio = new Audio(src);
  audio.preload = 'metadata';
  return audio;
}

/**
 * Check if audio can be played in the browser
 */
export function canPlayAudioType(mimeType: string): boolean {
  const audio = document.createElement('audio');
  return audio.canPlayType(mimeType) !== '';
}

/**
 * Get user-friendly error message from MediaRecorder error
 */
export function getAudioErrorMessage(error: Error): string {
  switch (error.name) {
    case 'NotAllowedError':
      return AUDIO_ERRORS.NOT_ALLOWED;
    case 'NotFoundError':
      return AUDIO_ERRORS.NOT_FOUND;
    case 'NotSupportedError':
      return AUDIO_ERRORS.NOT_SUPPORTED;
    case 'NotReadableError':
      return AUDIO_ERRORS.NOT_READABLE;
    default:
      return AUDIO_ERRORS.UNKNOWN;
  }
}

/**
 * Get browser-specific instructions for enabling microphone
 */
export function getBrowserInstructions(): string {
  const userAgent = navigator.userAgent.toLowerCase();
  
  if (userAgent.includes('chrome')) {
    return 'Chrome: Click the microphone icon in the address bar and select "Allow", or go to Settings > Privacy and security > Site Settings > Microphone';
  } else if (userAgent.includes('firefox')) {
    return 'Firefox: Click the microphone icon in the address bar and select "Allow", or go to Preferences > Privacy & Security > Permissions > Microphone';
  } else if (userAgent.includes('safari')) {
    return 'Safari: Go to Safari > Preferences > Websites > Microphone and set this site to "Allow"';
  } else if (userAgent.includes('edge')) {
    return 'Edge: Click the microphone icon in the address bar and select "Allow", or go to Settings > Site permissions > Microphone';
  } else {
    return 'Look for a microphone icon in your browser\'s address bar and click it to allow access, or check your browser\'s privacy/security settings';
  }
}

/**
 * Get system information for debugging
 */
export function getSystemInfo(): string {
  const info = [];
  info.push(`Browser: ${navigator.userAgent}`);
  info.push(`Protocol: ${location.protocol}`);
  info.push(`Host: ${location.hostname}`);
  info.push(`MediaDevices: ${!!navigator.mediaDevices}`);
  info.push(`getUserMedia: ${!!navigator.mediaDevices?.getUserMedia}`);
  info.push(`MediaRecorder: ${!!window.MediaRecorder}`);
  info.push(`Permissions API: ${!!navigator.permissions}`);
  info.push(`Supported MIME types: ${getAllSupportedMimeTypes().join(', ') || 'None'}`);
  return info.join('\n');
}

/**
 * Test MediaRecorder functionality
 */
export async function testMediaRecorder(stream: MediaStream): Promise<{ success: boolean; error?: string }> {
  try {
    const mimeType = getBestSupportedMimeType();
    const recorder = new MediaRecorder(stream, { 
      mimeType,
      audioBitsPerSecond: AUDIO_CONFIG.audioBitsPerSecond
    });
    
    // Test basic functionality
    recorder.start();
    recorder.stop();
    
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'MediaRecorder test failed'
    };
  }
}

/**
 * Comprehensive audio system check
 */
export async function checkAudioSystem(): Promise<{
  supported: boolean;
  permission: AudioPermissionState;
  devices: MediaDeviceInfo[];
  mimeTypes: string[];
  issues: string[];
}> {
  const support = isAudioRecordingSupported();
  const permission = await checkMicrophonePermission();
  const devices = await getAudioInputDevices();
  const mimeTypes = getAllSupportedMimeTypes();
  
  return {
    supported: support.supported,
    permission,
    devices,
    mimeTypes,
    issues: support.issues
  };
}