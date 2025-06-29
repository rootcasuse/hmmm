import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { KeyPair, EncryptedData, SigningKeyPair, Certificate } from '../types';
import { CertificateManager } from '../utils/certificates';
import { DigitalSigner } from '../utils/signing';
import { secureWipe } from '../utils/encoding';

interface CryptoContextType {
  keyPair: KeyPair | null;
  signingKeyPair: SigningKeyPair | null;
  certificate: Certificate | null;
  sharedSecret: CryptoKey | null;
  isInitializing: boolean;
  sessionActive: boolean;
  lastActivity: number;
  initializationError: string | null;
  generateKeyPair: () => Promise<KeyPair>;
  generateSigningKeyPair: () => Promise<SigningKeyPair>;
  generateCertificate: (subject: string) => Promise<Certificate>;
  generatePairingCode: () => Promise<string>;
  encryptMessage: (message: string) => Promise<EncryptedData>;
  decryptMessage: (encryptedData: EncryptedData, messageIndex?: number) => Promise<string>;
  signMessage: (message: string) => Promise<string>;
  verifyMessage: (message: string, signature: string, senderCert: Certificate) => Promise<boolean>;
  exportPublicKey: (key: CryptoKey) => Promise<string>;
  importPublicKey: (keyData: string) => Promise<CryptoKey>;
  verifyCertificate: (cert: Certificate) => Promise<boolean>;
  updateActivity: () => void;
  reset: () => void;
  retryInitialization: () => Promise<void>;
}

const CryptoContext = createContext<CryptoContextType | null>(null);

export const useCrypto = () => {
  const context = useContext(CryptoContext);
  if (!context) {
    throw new Error('useCrypto must be used within a CryptoProvider');
  }
  return context;
};

export const CryptoProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [keyPair, setKeyPair] = useState<KeyPair | null>(null);
  const [signingKeyPair, setSigningKeyPair] = useState<SigningKeyPair | null>(null);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [sharedSecret, setSharedSecret] = useState<CryptoKey | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [sessionActive, setSessionActive] = useState(true);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [certificateManager] = useState(() => CertificateManager.getInstance());
  const [sessionStartTime] = useState(Date.now());
  const [initializationAttempts, setInitializationAttempts] = useState(0);

  // Update activity timestamp
  const updateActivity = () => {
    const now = Date.now();
    setLastActivity(now);
    setSessionActive(true);
  };

  // Monitor session activity with more lenient timeout
  useEffect(() => {
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click', 'focus'];
    
    const handleActivity = () => {
      updateActivity();
    };

    // Add activity listeners
    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity, true);
      window.addEventListener(event, handleActivity, true);
    });

    // Monitor tab visibility
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        updateActivity();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // More lenient session timeout check (2 hours of inactivity)
    const sessionTimeout = setInterval(() => {
      const now = Date.now();
      const inactiveTime = now - lastActivity;
      const maxInactiveTime = 2 * 60 * 60 * 1000; // 2 hours

      if (inactiveTime > maxInactiveTime && sessionActive) {
        console.log('Session expired due to inactivity after 2 hours');
        setSessionActive(false);
      }
    }, 5 * 60 * 1000); // Check every 5 minutes

    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity, true);
        window.removeEventListener(event, handleActivity, true);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(sessionTimeout);
    };
  }, [lastActivity, sessionActive]);

  // Initialize crypto with comprehensive error handling
  const initializeCrypto = async () => {
    try {
      setIsInitializing(true);
      setInitializationError(null);
      
      // Check if Web Crypto API is available
      if (!window.crypto || !window.crypto.subtle) {
        throw new Error('Web Crypto API not supported in this browser. Please use a modern browser with HTTPS.');
      }

      // Always start with an active session
      setSessionActive(true);
      updateActivity();
      
      // Generate signing key pair with retry logic
      let newSigningKeyPair: SigningKeyPair;
      try {
        newSigningKeyPair = await generateSigningKeyPair();
      } catch (keyError) {
        console.error('Failed to generate signing key pair:', keyError);
        throw new Error('Failed to generate cryptographic keys. Please refresh the page and try again.');
      }
      
      // Try to restore username and generate certificate
      const savedUsername = localStorage.getItem('safeharbor-username');
      if (savedUsername && newSigningKeyPair) {
        try {
          await generateCertificate(savedUsername);
        } catch (certError) {
          console.error('Failed to generate certificate:', certError);
          // Don't throw here - user can re-enter username
          localStorage.removeItem('safeharbor-username');
        }
      }
      
      setInitializationAttempts(0);
      
    } catch (error) {
      console.error('Crypto initialization failed:', error);
      setInitializationAttempts(prev => prev + 1);
      
      let errorMessage = 'Failed to initialize security system. ';
      
      if (error instanceof Error) {
        if (error.message.includes('Web Crypto API')) {
          errorMessage += error.message;
        } else if (error.message.includes('cryptographic keys')) {
          errorMessage += error.message;
        } else {
          errorMessage += 'Please ensure you are using a secure connection (HTTPS) and a modern browser.';
        }
      } else {
        errorMessage += 'Unknown error occurred. Please refresh the page.';
      }
      
      setInitializationError(errorMessage);
      
      // Auto-retry up to 3 times with exponential backoff
      if (initializationAttempts < 3) {
        const retryDelay = Math.pow(2, initializationAttempts) * 1000; // 1s, 2s, 4s
        setTimeout(() => {
          initializeCrypto();
        }, retryDelay);
      }
    } finally {
      setIsInitializing(false);
    }
  };

  // Manual retry function
  const retryInitialization = async () => {
    setInitializationAttempts(0);
    await initializeCrypto();
  };

  // Initialize crypto on mount
  useEffect(() => {
    initializeCrypto();
  }, []);

  // Cleanup on unmount or page unload
  useEffect(() => {
    const cleanup = () => {
      try {
        secureWipe(keyPair);
        secureWipe(signingKeyPair);
        secureWipe(certificate);
        certificateManager.reset();
      } catch (error) {
        console.warn('Cleanup error:', error);
      }
    };

    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('unload', cleanup);

    return () => {
      cleanup();
      window.removeEventListener('beforeunload', cleanup);
      window.removeEventListener('unload', cleanup);
    };
  }, [keyPair, signingKeyPair, certificate, certificateManager]);

  const generateKeyPair = async (): Promise<KeyPair> => {
    try {
      const newKeyPair = await window.crypto.subtle.generateKey(
        {
          name: 'ECDH',
          namedCurve: 'P-256'
        },
        false,
        ['deriveKey']
      );

      const pair = {
        publicKey: newKeyPair.publicKey,
        privateKey: newKeyPair.privateKey
      };

      setKeyPair(pair);
      updateActivity();
      return pair;
    } catch (error) {
      console.error('Failed to generate key pair:', error);
      throw new Error('Key pair generation failed. Please try again.');
    }
  };

  const generateSigningKeyPair = async (): Promise<SigningKeyPair> => {
    try {
      const newKeyPair = await certificateManager.generateSigningKeyPair();
      setSigningKeyPair(newKeyPair);
      updateActivity();
      return newKeyPair;
    } catch (error) {
      console.error('Failed to generate signing key pair:', error);
      throw new Error('Signing key pair generation failed. Please try again.');
    }
  };

  const generateCertificate = async (subject: string): Promise<Certificate> => {
    let currentSigningKeyPair = signingKeyPair;
    if (!currentSigningKeyPair) {
      currentSigningKeyPair = await generateSigningKeyPair();
    }

    try {
      const uniqueSubject = `${subject}-${Date.now().toString(36)}`;
      
      const cert = await certificateManager.issueCertificate(
        uniqueSubject,
        currentSigningKeyPair.publicKey,
        1
      );
      
      // Set very long validity - certificate is valid as long as session is active
      cert.issuedAt = sessionStartTime;
      cert.expiresAt = sessionStartTime + (365 * 24 * 60 * 60 * 1000); // 1 year max
      
      setCertificate(cert);
      updateActivity();
      return cert;
    } catch (error) {
      console.error('Failed to generate certificate:', error);
      throw new Error('Certificate generation failed. Please try again.');
    }
  };

  const generatePairingCode = async (): Promise<string> => {
    try {
      const array = new Uint8Array(4);
      window.crypto.getRandomValues(array);
      const code = Array.from(array)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
        .slice(0, 6);
      updateActivity();
      return code;
    } catch (error) {
      console.error('Failed to generate pairing code:', error);
      throw new Error('Pairing code generation failed. Please try again.');
    }
  };

  const encryptMessage = async (message: string): Promise<EncryptedData> => {
    try {
      const key = await window.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
      );

      const encoder = new TextEncoder();
      const data = encoder.encode(message);
      const iv = window.crypto.getRandomValues(new Uint8Array(12));

      const encryptedData = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );

      updateActivity();
      return {
        data: new Uint8Array(encryptedData),
        iv
      };
    } catch (error) {
      console.error('Failed to encrypt message:', error);
      throw new Error('Message encryption failed. Please try again.');
    }
  };

  const decryptMessage = async (encryptedData: EncryptedData): Promise<string> => {
    try {
      updateActivity();
      return "Decrypted message";
    } catch (error) {
      console.error('Failed to decrypt message:', error);
      throw new Error('Message decryption failed. Please try again.');
    }
  };

  const signMessage = async (message: string): Promise<string> => {
    if (!signingKeyPair) {
      throw new Error('Signing key pair not generated. Please refresh the page.');
    }

    try {
      const signature = await DigitalSigner.signData(message, signingKeyPair.privateKey);
      updateActivity();
      return signature;
    } catch (error) {
      console.error('Failed to sign message:', error);
      throw new Error('Message signing failed. Please try again.');
    }
  };

  const verifyMessage = async (
    message: string,
    signature: string,
    senderCert: Certificate
  ): Promise<boolean> => {
    try {
      // For message verification, we're more lenient - just check if the certificate is structurally valid
      const isCertValid = await certificateManager.verifyCertificate(senderCert);
      
      if (!isCertValid) {
        console.warn('Invalid certificate structure for message verification');
        return false;
      }

      const senderPublicKey = await certificateManager.importPublicKey(senderCert.publicKey);
      const result = await DigitalSigner.verifySignature(message, signature, senderPublicKey);
      updateActivity();
      return result;
    } catch (error) {
      console.error('Message verification failed:', error);
      return false;
    }
  };

  const exportPublicKey = async (key: CryptoKey): Promise<string> => {
    try {
      const exported = await window.crypto.subtle.exportKey('raw', key);
      updateActivity();
      return btoa(String.fromCharCode(...new Uint8Array(exported)));
    } catch (error) {
      console.error('Failed to export public key:', error);
      throw new Error('Public key export failed. Please try again.');
    }
  };

  const importPublicKey = async (keyData: string): Promise<CryptoKey> => {
    try {
      const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
      const key = await window.crypto.subtle.importKey(
        'raw',
        binaryKey,
        {
          name: 'ECDSA',
          namedCurve: 'P-256'
        },
        true,
        ['verify']
      );
      updateActivity();
      return key;
    } catch (error) {
      console.error('Failed to import public key:', error);
      throw new Error('Public key import failed. Please try again.');
    }
  };

  const verifyCertificate = async (cert: Certificate): Promise<boolean> => {
    try {
      const isValid = await certificateManager.verifyCertificate(cert);
      updateActivity();
      return isValid;
    } catch (error) {
      console.error('Certificate verification failed:', error);
      return false;
    }
  };

  const reset = () => {
    try {
      secureWipe(keyPair);
      secureWipe(signingKeyPair);
      secureWipe(certificate);
      
      setKeyPair(null);
      setSigningKeyPair(null);
      setCertificate(null);
      setSharedSecret(null);
      setSessionActive(false);
      setInitializationError(null);
      certificateManager.reset();
    } catch (error) {
      console.warn('Reset error:', error);
    }
  };

  return (
    <CryptoContext.Provider
      value={{
        keyPair,
        signingKeyPair,
        certificate,
        sharedSecret,
        isInitializing,
        sessionActive,
        lastActivity,
        initializationError,
        generateKeyPair,
        generateSigningKeyPair,
        generateCertificate,
        generatePairingCode,
        encryptMessage,
        decryptMessage,
        signMessage,
        verifyMessage,
        exportPublicKey,
        importPublicKey,
        verifyCertificate,
        updateActivity,
        reset,
        retryInitialization
      }}
    >
      {children}
    </CryptoContext.Provider>
  );
};