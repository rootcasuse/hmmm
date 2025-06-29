import React, { useState, useEffect } from 'react';
import { Mic, AlertCircle, CheckCircle, XCircle, Settings, RefreshCw, Info, Volume2, Headphones } from 'lucide-react';
import Button from './ui/Button';

interface DiagnosticResult {
  test: string;
  status: 'pass' | 'fail' | 'warning' | 'info';
  message: string;
  details?: string;
}

interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  kind: string;
  groupId: string;
}

const AudioDiagnostics: React.FC = () => {
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [audioDevices, setAudioDevices] = useState<AudioDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('default');
  const [testRecording, setTestRecording] = useState<{
    blob: Blob | null;
    url: string | null;
    isRecording: boolean;
    isPlaying: boolean;
  }>({
    blob: null,
    url: null,
    isRecording: false,
    isPlaying: false
  });

  const addResult = (result: DiagnosticResult) => {
    setDiagnostics(prev => [...prev, result]);
  };

  const runComprehensiveDiagnostics = async () => {
    setIsRunning(true);
    setDiagnostics([]);

    // Test 1: Basic Browser Support
    addResult({
      test: 'Browser Support',
      status: window.crypto?.subtle ? 'pass' : 'fail',
      message: window.crypto?.subtle ? 'Web Crypto API supported' : 'Web Crypto API not supported',
      details: `Browser: ${navigator.userAgent}`
    });

    // Test 2: HTTPS Check
    const isSecure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
    addResult({
      test: 'Secure Context',
      status: isSecure ? 'pass' : 'fail',
      message: isSecure ? 'Secure context (HTTPS)' : 'Insecure context - HTTPS required',
      details: `Protocol: ${location.protocol}, Host: ${location.hostname}`
    });

    // Test 3: MediaDevices API
    addResult({
      test: 'MediaDevices API',
      status: navigator.mediaDevices ? 'pass' : 'fail',
      message: navigator.mediaDevices ? 'MediaDevices API available' : 'MediaDevices API not supported'
    });

    // Test 4: getUserMedia Support
    addResult({
      test: 'getUserMedia Support',
      status: navigator.mediaDevices?.getUserMedia ? 'pass' : 'fail',
      message: navigator.mediaDevices?.getUserMedia ? 'getUserMedia supported' : 'getUserMedia not supported'
    });

    // Test 5: MediaRecorder Support
    addResult({
      test: 'MediaRecorder Support',
      status: window.MediaRecorder ? 'pass' : 'fail',
      message: window.MediaRecorder ? 'MediaRecorder API supported' : 'MediaRecorder API not supported'
    });

    // Test 6: Permissions API
    try {
      if (navigator.permissions) {
        const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        addResult({
          test: 'Microphone Permission',
          status: permission.state === 'granted' ? 'pass' : permission.state === 'denied' ? 'fail' : 'warning',
          message: `Permission state: ${permission.state}`,
          details: permission.state === 'denied' ? 'Permission explicitly denied by user' : undefined
        });
      } else {
        addResult({
          test: 'Permissions API',
          status: 'warning',
          message: 'Permissions API not supported - will test directly'
        });
      }
    } catch (error) {
      addResult({
        test: 'Permission Check',
        status: 'warning',
        message: 'Could not check permissions',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    // Test 7: Enumerate Audio Devices
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      setAudioDevices(audioInputs.map(device => ({
        deviceId: device.deviceId,
        label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
        kind: device.kind,
        groupId: device.groupId
      })));

      addResult({
        test: 'Audio Input Devices',
        status: audioInputs.length > 0 ? 'pass' : 'fail',
        message: `Found ${audioInputs.length} audio input device(s)`,
        details: audioInputs.map(d => d.label || 'Unnamed device').join(', ')
      });
    } catch (error) {
      addResult({
        test: 'Device Enumeration',
        status: 'fail',
        message: 'Failed to enumerate devices',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    // Test 8: Actual Microphone Access Test
    try {
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(selectedDevice !== 'default' && { deviceId: { exact: selectedDevice } })
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const tracks = stream.getAudioTracks();

      if (tracks.length > 0) {
        const track = tracks[0];
        const settings = track.getSettings();
        
        addResult({
          test: 'Microphone Access',
          status: 'pass',
          message: 'Successfully accessed microphone',
          details: `Device: ${track.label}, Sample Rate: ${settings.sampleRate}Hz, Channels: ${settings.channelCount}`
        });

        // Test 9: MediaRecorder with actual stream
        try {
          const mimeTypes = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
            'audio/ogg;codecs=opus',
            'audio/wav'
          ];

          let supportedType = '';
          for (const type of mimeTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
              supportedType = type;
              break;
            }
          }

          if (supportedType) {
            const recorder = new MediaRecorder(stream, { mimeType: supportedType });
            addResult({
              test: 'MediaRecorder Creation',
              status: 'pass',
              message: 'MediaRecorder created successfully',
              details: `Using MIME type: ${supportedType}`
            });
          } else {
            addResult({
              test: 'MediaRecorder MIME Types',
              status: 'warning',
              message: 'No preferred MIME types supported, using default'
            });
          }
        } catch (recorderError) {
          addResult({
            test: 'MediaRecorder Creation',
            status: 'fail',
            message: 'Failed to create MediaRecorder',
            details: recorderError instanceof Error ? recorderError.message : 'Unknown error'
          });
        }

        // Clean up test stream
        stream.getTracks().forEach(track => track.stop());
      } else {
        addResult({
          test: 'Audio Tracks',
          status: 'fail',
          message: 'No audio tracks in stream'
        });
      }
    } catch (micError) {
      let errorType = 'Unknown error';
      let suggestion = 'Please try again';

      if (micError instanceof Error) {
        switch (micError.name) {
          case 'NotAllowedError':
            errorType = 'Permission denied';
            suggestion = 'Click the microphone icon in your browser address bar and select "Allow"';
            break;
          case 'NotFoundError':
            errorType = 'No microphone found';
            suggestion = 'Please connect a microphone and refresh the page';
            break;
          case 'NotReadableError':
            errorType = 'Microphone in use';
            suggestion = 'Close other applications using the microphone';
            break;
          case 'OverconstrainedError':
            errorType = 'Microphone constraints not met';
            suggestion = 'Try with a different microphone or default settings';
            break;
          case 'SecurityError':
            errorType = 'Security restriction';
            suggestion = 'Ensure you are using HTTPS';
            break;
        }
      }

      addResult({
        test: 'Microphone Access',
        status: 'fail',
        message: `Failed to access microphone: ${errorType}`,
        details: `${micError instanceof Error ? micError.message : 'Unknown error'}\n\nSuggestion: ${suggestion}`
      });
    }

    setIsRunning(false);
  };

  const testRecordingFunction = async () => {
    if (testRecording.isRecording) {
      // Stop recording
      setTestRecording(prev => ({ ...prev, isRecording: false }));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(selectedDevice !== 'default' && { deviceId: { exact: selectedDevice } })
        }
      });

      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => 
        MediaRecorder.isTypeSupported(type)
      ) || 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setTestRecording(prev => ({ 
          ...prev, 
          blob, 
          url, 
          isRecording: false 
        }));
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setTestRecording(prev => ({ ...prev, isRecording: true }));

      // Auto-stop after 3 seconds
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, 3000);

    } catch (error) {
      console.error('Test recording failed:', error);
      setTestRecording(prev => ({ ...prev, isRecording: false }));
    }
  };

  const playTestRecording = () => {
    if (testRecording.url) {
      const audio = new Audio(testRecording.url);
      setTestRecording(prev => ({ ...prev, isPlaying: true }));
      
      audio.onended = () => setTestRecording(prev => ({ ...prev, isPlaying: false }));
      audio.onerror = () => setTestRecording(prev => ({ ...prev, isPlaying: false }));
      
      audio.play().catch(() => {
        setTestRecording(prev => ({ ...prev, isPlaying: false }));
      });
    }
  };

  const getStatusIcon = (status: DiagnosticResult['status']) => {
    switch (status) {
      case 'pass': return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'fail': return <XCircle className="w-5 h-5 text-red-400" />;
      case 'warning': return <AlertCircle className="w-5 h-5 text-yellow-400" />;
      case 'info': return <Info className="w-5 h-5 text-blue-400" />;
    }
  };

  const getStatusColor = (status: DiagnosticResult['status']) => {
    switch (status) {
      case 'pass': return 'border-green-700 bg-green-900/20';
      case 'fail': return 'border-red-700 bg-red-900/20';
      case 'warning': return 'border-yellow-700 bg-yellow-900/20';
      case 'info': return 'border-blue-700 bg-blue-900/20';
    }
  };

  useEffect(() => {
    runComprehensiveDiagnostics();
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Mic className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Audio System Diagnostics</h1>
        <p className="text-gray-400">Comprehensive testing and troubleshooting for audio issues</p>
      </div>

      {/* Device Selection */}
      {audioDevices.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Headphones className="w-5 h-5 mr-2" />
            Audio Input Devices
          </h2>
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
          >
            <option value="default">Default Microphone</option>
            {audioDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Test Recording */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <Volume2 className="w-5 h-5 mr-2" />
          Live Recording Test
        </h2>
        <div className="flex items-center space-x-4">
          <Button
            onClick={testRecordingFunction}
            variant={testRecording.isRecording ? "danger" : "primary"}
            disabled={isRunning}
          >
            <Mic className="w-4 h-4 mr-2" />
            {testRecording.isRecording ? 'Stop Recording (3s)' : 'Test Record'}
          </Button>
          
          {testRecording.blob && (
            <Button
              onClick={playTestRecording}
              variant="secondary"
              disabled={testRecording.isPlaying}
            >
              <Volume2 className="w-4 h-4 mr-2" />
              {testRecording.isPlaying ? 'Playing...' : 'Play Test'}
            </Button>
          )}
        </div>
        
        {testRecording.isRecording && (
          <div className="mt-4 flex items-center space-x-2 text-red-400">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
            <span>Recording... (will auto-stop in 3 seconds)</span>
          </div>
        )}
        
        {testRecording.blob && (
          <div className="mt-4 p-3 bg-green-900/20 border border-green-700 rounded-lg">
            <p className="text-green-400 text-sm">
              ✓ Recording successful! Size: {(testRecording.blob.size / 1024).toFixed(1)} KB
            </p>
          </div>
        )}
      </div>

      {/* Diagnostic Results */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center">
            <Settings className="w-5 h-5 mr-2" />
            Diagnostic Results
          </h2>
          <Button
            onClick={runComprehensiveDiagnostics}
            variant="secondary"
            size="sm"
            disabled={isRunning}
            isLoading={isRunning}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Re-run Tests
          </Button>
        </div>

        <div className="space-y-3">
          {diagnostics.map((result, index) => (
            <div
              key={index}
              className={`border rounded-lg p-4 ${getStatusColor(result.status)}`}
            >
              <div className="flex items-center space-x-3">
                {getStatusIcon(result.status)}
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white">{result.test}</span>
                    <span className={`text-sm ${
                      result.status === 'pass' ? 'text-green-400' :
                      result.status === 'fail' ? 'text-red-400' :
                      result.status === 'warning' ? 'text-yellow-400' :
                      'text-blue-400'
                    }`}>
                      {result.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-gray-300 text-sm mt-1">{result.message}</p>
                  {result.details && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-400 cursor-pointer hover:text-white">
                        Show details
                      </summary>
                      <pre className="text-xs text-gray-400 mt-2 whitespace-pre-wrap bg-gray-900 p-2 rounded">
                        {result.details}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {diagnostics.length === 0 && isRunning && (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400">Running comprehensive diagnostics...</p>
          </div>
        )}
      </div>

      {/* Quick Fixes */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <AlertCircle className="w-5 h-5 mr-2 text-yellow-400" />
          Common Solutions
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-700/50 rounded-lg p-4">
            <h3 className="font-medium text-white mb-2">Browser Permissions</h3>
            <ul className="text-sm text-gray-300 space-y-1">
              <li>• Click the microphone icon in the address bar</li>
              <li>• Select "Allow" for microphone access</li>
              <li>• Refresh the page after changing permissions</li>
            </ul>
          </div>
          
          <div className="bg-gray-700/50 rounded-lg p-4">
            <h3 className="font-medium text-white mb-2">System Settings</h3>
            <ul className="text-sm text-gray-300 space-y-1">
              <li>• Check if microphone is connected and working</li>
              <li>• Close other apps using the microphone</li>
              <li>• Try a different microphone if available</li>
            </ul>
          </div>
          
          <div className="bg-gray-700/50 rounded-lg p-4">
            <h3 className="font-medium text-white mb-2">Browser Requirements</h3>
            <ul className="text-sm text-gray-300 space-y-1">
              <li>• Use Chrome, Firefox, Safari, or Edge</li>
              <li>• Ensure you're on HTTPS (secure connection)</li>
              <li>• Update browser to the latest version</li>
            </ul>
          </div>
          
          <div className="bg-gray-700/50 rounded-lg p-4">
            <h3 className="font-medium text-white mb-2">Advanced Troubleshooting</h3>
            <ul className="text-sm text-gray-300 space-y-1">
              <li>• Clear browser cache and cookies</li>
              <li>• Disable browser extensions temporarily</li>
              <li>• Try in incognito/private browsing mode</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioDiagnostics;