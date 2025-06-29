import React, { useState, useEffect, useCallback } from 'react';
import { KeyRound, Copy, ArrowRight, Shield, Award, Key, User, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import Button from './ui/Button';
import { useChat } from '../context/ChatContext';
import { useCrypto } from '../context/CryptoContext';

interface PairingScreenProps {
  onPaired: () => void;
}

const PairingScreen: React.FC<PairingScreenProps> = ({ onPaired }) => {
  const { generateCode, joinChat, pairingCode, isPaired } = useChat();
  const { 
    certificate, 
    isInitializing, 
    generateCertificate, 
    sessionActive, 
    lastActivity,
    initializationError,
    retryInitialization
  } = useCrypto();
  
  const [inputCode, setInputCode] = useState('');
  const [username, setUsername] = useState('');
  const [showUsernameInput, setShowUsernameInput] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [isCreatingIdentity, setIsCreatingIdentity] = useState(false);

  // Load saved username on mount and when certificate is available
  useEffect(() => {
    const savedUsername = localStorage.getItem('safeharbor-username');
    if (savedUsername && certificate) {
      setUsername(savedUsername);
      setShowUsernameInput(false);
    } else if (savedUsername) {
      setUsername(savedUsername);
    }
  }, [certificate]);

  // Handle pairing completion
  useEffect(() => {
    if (isPaired) {
      onPaired();
    }
  }, [isPaired, onPaired]);

  // Clear errors when user starts typing
  useEffect(() => {
    if (username && usernameError) {
      setUsernameError('');
    }
  }, [username, usernameError]);

  useEffect(() => {
    if (inputCode && error) {
      setError('');
    }
  }, [inputCode, error]);

  // Validate username input
  const validateUsername = useCallback((value: string): string => {
    const trimmed = value.trim();
    
    if (!trimmed) {
      return 'Please enter a valid username';
    }
    
    if (trimmed.length < 2) {
      return 'Username must be at least 2 characters long';
    }
    
    if (trimmed.length > 20) {
      return 'Username must be 20 characters or less';
    }
    
    // Check for valid characters (alphanumeric, spaces, hyphens, underscores)
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmed)) {
      return 'Username can only contain letters, numbers, spaces, hyphens, and underscores';
    }
    
    return '';
  }, []);

  const handleSetUsername = async () => {
    const validationError = validateUsername(username);
    if (validationError) {
      setUsernameError(validationError);
      return;
    }

    setIsCreatingIdentity(true);
    setUsernameError('');
    setError('');

    try {
      const trimmedUsername = username.trim();
      localStorage.setItem('safeharbor-username', trimmedUsername);
      await generateCertificate(trimmedUsername);
      setShowUsernameInput(false);
    } catch (error) {
      console.error('Certificate generation failed:', error);
      setUsernameError('Failed to create digital identity. Please try again.');
      localStorage.removeItem('safeharbor-username');
    } finally {
      setIsCreatingIdentity(false);
    }
  };

  const handleGenerateCode = async () => {
    if (showUsernameInput) {
      await handleSetUsername();
      return;
    }

    if (!certificate) {
      setError('Digital certificate not ready. Please wait or refresh the page.');
      return;
    }

    if (!sessionActive) {
      setError('Session expired. Please refresh the page.');
      return;
    }

    setIsGenerating(true);
    setError('');
    
    try {
      await generateCode();
    } catch (err) {
      console.error('Failed to generate code:', err);
      setError('Failed to generate code. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleJoinChat = async () => {
    if (showUsernameInput) {
      await handleSetUsername();
      return;
    }

    const trimmedCode = inputCode.trim().toUpperCase();
    
    if (!trimmedCode) {
      setError('Please enter a valid code');
      return;
    }

    if (trimmedCode.length !== 6) {
      setError('Code must be exactly 6 characters');
      return;
    }

    if (!certificate) {
      setError('Digital certificate not ready. Please wait or refresh the page.');
      return;
    }

    if (!sessionActive) {
      setError('Session expired. Please refresh the page.');
      return;
    }

    setIsJoining(true);
    setError('');
    
    try {
      const success = await joinChat(trimmedCode);
      if (!success) {
        setError('Invalid code or room not found. Make sure someone has created the room first.');
      }
    } catch (err) {
      console.error('Failed to join chat:', err);
      setError('Failed to join chat. Please try again.');
    } finally {
      setIsJoining(false);
    }
  };

  const copyToClipboard = async () => {
    if (pairingCode) {
      try {
        await navigator.clipboard.writeText(pairingCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
        // Fallback for browsers that don't support clipboard API
        const textArea = document.createElement('textarea');
        textArea.value = pairingCode;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch (fallbackErr) {
          console.error('Fallback copy failed:', fallbackErr);
        }
        document.body.removeChild(textArea);
      }
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getSessionStatus = () => {
    if (!sessionActive) return { text: 'Session Expired', color: 'text-red-400' };
    
    const now = Date.now();
    const timeSinceActivity = now - lastActivity;
    
    if (timeSinceActivity < 60000) return { text: 'Active', color: 'text-green-400' };
    if (timeSinceActivity < 300000) return { text: 'Recently Active', color: 'text-yellow-400' };
    return { text: 'Idle', color: 'text-orange-400' };
  };

  const resetUsername = () => {
    localStorage.removeItem('safeharbor-username');
    setUsername('');
    setUsernameError('');
    setShowUsernameInput(true);
  };

  const handleUsernameKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isCreatingIdentity) {
      handleSetUsername();
    }
  };

  const handleCodeKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isJoining) {
      handleJoinChat();
    }
  };

  // Handle initialization errors
  if (initializationError) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-red-900 flex flex-col items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold mb-3 text-white">Initialization Failed</h1>
          <p className="text-xl text-red-300 mb-6">Security System Error</p>
          
          <div className="bg-red-900/50 backdrop-blur-sm rounded-lg p-6 mb-6">
            <p className="text-red-200 text-sm mb-4">
              {initializationError}
            </p>
            <div className="space-y-3">
              <Button
                onClick={retryInitialization}
                className="w-full"
                variant="secondary"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry Initialization
              </Button>
              <Button
                onClick={() => window.location.reload()}
                className="w-full"
                variant="danger"
              >
                Refresh Page
              </Button>
            </div>
          </div>
          
          <div className="text-xs text-gray-400 space-y-1">
            <p>• Ensure you're using HTTPS</p>
            <p>• Use a modern browser (Chrome, Firefox, Safari, Edge)</p>
            <p>• Check your internet connection</p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-indigo-900 flex flex-col items-center justify-center p-8">
        <div className="text-center">
          <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Shield className="w-10 h-10 text-white animate-pulse" />
          </div>
          <h1 className="text-4xl font-bold mb-3 text-white">SafeHarbor</h1>
          <p className="text-xl text-indigo-300 mb-6">Initializing Security...</p>
          
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 max-w-md mx-auto">
            <div className="flex items-center justify-center space-x-3 mb-4">
              <div className="w-4 h-4 bg-indigo-500 rounded-full animate-bounce"></div>
              <div className="w-4 h-4 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-4 h-4 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
            <p className="text-gray-300 text-sm">
              Generating cryptographic keys...
            </p>
          </div>
        </div>
      </div>
    );
  }

  const sessionStatus = getSessionStatus();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-indigo-900 flex flex-col items-center justify-center p-8">
      <div className="mb-8 text-center">
        <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <Shield className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-4xl font-bold mb-3 text-white">SafeHarbor</h1>
        <p className="text-xl text-indigo-300">PKI-Secured Anonymous Messaging</p>
        
        {!showUsernameInput && username && (
          <div className="mt-6 bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 max-w-md mx-auto">
            <div className="flex items-center justify-center space-x-2 mb-2">
              <User className="w-5 h-5 text-green-400" />
              <span className="text-green-400 font-medium">Signed in as: {username}</span>
            </div>
            <button
              onClick={resetUsername}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Change username
            </button>
          </div>
        )}
        
        {certificate && !showUsernameInput && (
          <div className="mt-4 bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 max-w-md mx-auto">
            <div className="flex items-center justify-center space-x-2 mb-2">
              <Award className="w-5 h-5 text-green-400" />
              <span className="text-green-400 font-medium">Digital Identity Ready</span>
            </div>
            <div className="text-sm text-gray-300 space-y-1">
              <p><strong>Certificate:</strong> {certificate.subject.split('-')[0]}</p>
              <div className="flex items-center justify-center space-x-2">
                <Clock className="w-4 h-4" />
                <span className="text-sm">Session Status:</span>
                <span className={`font-medium ${sessionStatus.color}`}>{sessionStatus.text}</span>
              </div>
              <p className="text-xs text-gray-400">Valid while session is active</p>
            </div>
          </div>
        )}
      </div>

      <div className="w-full max-w-md space-y-6">
        {showUsernameInput && (
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 shadow-xl border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <User className="w-5 h-5 mr-2" />
              Choose Your Identity
            </h2>
            <div className="space-y-4">
              <div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={handleUsernameKeyPress}
                  placeholder="Enter your username"
                  className={`w-full p-4 bg-gray-900/50 rounded-lg border text-white placeholder-gray-400 focus:ring-1 transition-colors ${
                    usernameError 
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500' 
                      : 'border-gray-600 focus:border-indigo-500 focus:ring-indigo-500'
                  }`}
                  maxLength={20}
                  disabled={isCreatingIdentity}
                  autoComplete="username"
                  autoFocus
                />
                {usernameError && (
                  <p className="text-red-400 text-sm mt-2 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {usernameError}
                  </p>
                )}
              </div>
              <p className="text-sm text-gray-400">
                This will be your identity in the chat and on your digital certificate
              </p>
              <Button
                onClick={handleSetUsername}
                className="w-full"
                disabled={!username.trim() || isCreatingIdentity}
                isLoading={isCreatingIdentity}
              >
                {isCreatingIdentity ? 'Creating Identity...' : 'Create Digital Identity'}
                {!isCreatingIdentity && <ArrowRight className="ml-2 w-5 h-5" />}
              </Button>
            </div>
          </div>
        )}

        {!showUsernameInput && (
          <>
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 shadow-xl border border-gray-700">
              {pairingCode ? (
                <div className="text-center">
                  <h2 className="text-xl font-semibold mb-4">Your Secure Code</h2>
                  <div className="bg-gray-900/50 p-4 rounded-lg mb-4 flex items-center justify-center space-x-3">
                    <span className="text-3xl font-mono tracking-wider text-green-400">
                      {pairingCode}
                    </span>
                    <button
                      onClick={copyToClipboard}
                      className={`p-2 rounded-lg transition-colors ${
                        copied ? 'bg-green-600' : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                      title={copied ? 'Copied!' : 'Copy code'}
                    >
                      <Copy className="w-5 h-5" />
                    </button>
                  </div>
                  {copied && (
                    <p className="text-green-400 text-sm mb-2">✓ Copied to clipboard!</p>
                  )}
                  <p className="text-sm text-gray-400 mb-4">
                    Share this code with someone to start a secure, signed conversation
                  </p>
                  <div className="bg-indigo-900/30 border border-indigo-700 rounded-lg p-3 mb-4">
                    <div className="flex items-center space-x-2 text-sm text-indigo-300">
                      <Key className="w-4 h-4" />
                      <span>Messages will be digitally signed with your certificate</span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-400">
                    Waiting for someone to join...
                  </p>
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-semibold mb-4">Start New Chat</h2>
                  <Button
                    onClick={handleGenerateCode}
                    isLoading={isGenerating}
                    className="w-full"
                    disabled={!certificate || !sessionActive}
                  >
                    {isGenerating ? 'Generating...' : 'Generate Secure Code'}
                  </Button>
                  {!certificate && (
                    <p className="text-sm text-amber-400 mt-2 text-center">
                      Creating digital certificate...
                    </p>
                  )}
                  {!sessionActive && (
                    <p className="text-sm text-red-400 mt-2 text-center">
                      Session expired. Please refresh the page.
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 shadow-xl border border-gray-700">
              <h2 className="text-xl font-semibold mb-4">Join Existing Chat</h2>
              <div className="space-y-4">
                <div>
                  <input
                    type="text"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                    onKeyDown={handleCodeKeyPress}
                    placeholder="Enter secure code"
                    className="w-full p-4 bg-gray-900/50 rounded-lg border border-gray-600 text-white text-center text-xl font-mono tracking-wider placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    maxLength={6}
                    disabled={isJoining}
                    autoComplete="off"
                  />
                </div>
                <Button
                  onClick={handleJoinChat}
                  isLoading={isJoining}
                  className="w-full"
                  disabled={!inputCode.trim() || !certificate || !sessionActive}
                >
                  {isJoining ? 'Joining...' : 'Join Chat'}
                  {!isJoining && <ArrowRight className="ml-2 w-5 h-5" />}
                </Button>
                {!certificate && (
                  <p className="text-sm text-amber-400 text-center">
                    Waiting for certificate initialization...
                  </p>
                )}
                {!sessionActive && (
                  <p className="text-sm text-red-400 text-center">
                    Session expired. Please refresh the page.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {error && (
          <div className="bg-red-900/50 backdrop-blur-sm border border-red-700 text-red-200 p-4 rounded-xl">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <span className="font-medium">Error</span>
            </div>
            <p className="mt-1">{error}</p>
          </div>
        )}

        {!showUsernameInput && (
          <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
            <h3 className="text-lg font-semibold mb-4 text-center">Security Features</h3>
            <div className="grid grid-cols-1 gap-3 text-sm">
              <div className="flex items-center space-x-3">
                <Shield className="w-4 h-4 text-green-400 flex-shrink-0" />
                <span>End-to-end encryption with forward secrecy</span>
              </div>
              <div className="flex items-center space-x-3">
                <Award className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <span>Digital signatures with PKI certificates</span>
              </div>
              <div className="flex items-center space-x-3">
                <Key className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <span>Document signing and verification</span>
              </div>
              <div className="flex items-center space-x-3">
                <Clock className="w-4 h-4 text-orange-400 flex-shrink-0" />
                <span>Session-based validity with activity monitoring</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PairingScreen;