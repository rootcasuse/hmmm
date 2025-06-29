import React, { useState, useEffect } from 'react';
import ChatScreen from './components/ChatScreen';
import PairingScreen from './components/PairingScreen';
import { ChatProvider } from './context/ChatContext';
import { CryptoProvider } from './context/CryptoContext';

function App() {
  const [isChatting, setIsChatting] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);

  // Global error boundary effect
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('Global error:', event.error);
      setAppError('An unexpected error occurred. Please refresh the page.');
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      setAppError('An unexpected error occurred. Please refresh the page.');
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Check for required browser features
  useEffect(() => {
    const checkBrowserSupport = () => {
      const issues: string[] = [];

      if (!window.crypto || !window.crypto.subtle) {
        issues.push('Web Crypto API not supported');
      }

      if (!navigator.mediaDevices) {
        issues.push('MediaDevices API not supported');
      }

      if (!window.MediaRecorder) {
        issues.push('MediaRecorder API not supported');
      }

      if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        issues.push('HTTPS required for secure features');
      }

      if (issues.length > 0) {
        setAppError(`Browser compatibility issues: ${issues.join(', ')}. Please use a modern browser with HTTPS.`);
      }
    };

    checkBrowserSupport();
  }, []);

  if (appError) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-red-900 flex flex-col items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold mb-3 text-white">Application Error</h1>
          <p className="text-xl text-red-300 mb-6">SafeHarbor cannot start</p>
          
          <div className="bg-red-900/50 backdrop-blur-sm rounded-lg p-6 mb-6">
            <p className="text-red-200 text-sm mb-4">{appError}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              Refresh Page
            </button>
          </div>
          
          <div className="text-xs text-gray-400 space-y-1">
            <p>• Use Chrome, Firefox, Safari, or Edge</p>
            <p>• Ensure you're on HTTPS</p>
            <p>• Clear browser cache and cookies</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CryptoProvider>
      <ChatProvider>
        <div className="min-h-screen bg-gray-900 text-gray-100">
          {!isChatting ? (
            <PairingScreen onPaired={() => setIsChatting(true)} />
          ) : (
            <ChatScreen onLeave={() => setIsChatting(false)} />
          )}
        </div>
      </ChatProvider>
    </CryptoProvider>
  );
}

export default App;