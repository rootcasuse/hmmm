# Technology Stack Documentation

## Overview
SafeHarbor is built using modern web technologies with a focus on security, performance, and user experience. The stack is carefully chosen to provide maximum security while maintaining broad browser compatibility.

## Technology Stack Table

| Category | Technologies Used | Purpose | Security Level |
|----------|------------------|---------|----------------|
| **Frontend Framework** | React 18.3.1 with TypeScript 5.5.3 | Component-based UI with type safety | High - Type safety prevents runtime errors |
| **Build System** | Vite 5.4.2 with ESBuild | Fast development and optimized production builds | Medium - Build-time security checks |
| **Styling** | Tailwind CSS 3.4.1 | Utility-first CSS framework | Low - No security implications |
| **Icons** | Lucide React 0.344.0 | Consistent iconography | Low - Static assets only |
| **Cryptography** | Web Crypto API (Native) | Browser-native cryptographic operations | Maximum - Hardware-backed security |
| **State Management** | React Context + Hooks | Centralized state with secure cleanup | High - Memory isolation |
| **Communication** | BroadcastChannel API | Cross-tab secure messaging | Medium - Browser sandbox protection |
| **Storage** | LocalStorage (minimal) + Memory | Session-based temporary storage | High - No persistent sensitive data |
| **Audio Processing** | MediaRecorder + WebRTC | Voice message recording | Medium - Permission-based access |
| **File Handling** | File API + FileReader | Document processing and signing | Medium - Client-side only |
| **Networking** | Fetch API | Minimal external requests | High - HTTPS only |
| **Development** | ESLint + TypeScript ESLint | Code quality and security linting | High - Prevents common vulnerabilities |

## Backend Technologies
| Category | Technologies Used | Purpose | Security Level |
|----------|------------------|---------|----------------|
| **Server Architecture** | None (Serverless/Client-only) | Zero server-side data storage | Maximum - No server attack surface |
| **Data Persistence** | None (Session-based only) | No permanent data storage | Maximum - No data breach risk |
| **Authentication** | PKI Certificates (Self-signed) | Decentralized identity management | High - No central authority required |
| **Key Management** | Browser Memory Only | Ephemeral key storage | Maximum - Keys never leave browser |

## Database Technologies
| Category | Technologies Used | Purpose | Security Level |
|----------|------------------|---------|----------------|
| **Primary Storage** | Browser Memory | Cryptographic material storage | Maximum - Volatile, secure cleanup |
| **Session Storage** | SessionStorage API | Temporary UI state | Medium - Browser-managed |
| **Local Storage** | LocalStorage (Room codes only) | Minimal non-sensitive data | Low - Public information only |
| **Persistent Storage** | None | No long-term data retention | Maximum - Zero data persistence |

## Security Technologies
| Category | Technologies Used | Purpose | Security Level |
|----------|------------------|---------|----------------|
| **Encryption** | AES-256-GCM | Symmetric encryption with authentication | Maximum - Military-grade |
| **Key Exchange** | ECDH P-256 | Secure key agreement | High - NSA Suite B approved |
| **Digital Signatures** | ECDSA P-256 + SHA-256 | Message authentication | High - Non-repudiation |
| **Hashing** | SHA-256 | Data integrity verification | High - Collision resistant |
| **Key Derivation** | HKDF-SHA256 | Forward secrecy implementation | High - Perfect forward secrecy |
| **Random Generation** | Web Crypto CSPRNG | Secure random number generation | Maximum - Hardware entropy |
| **Certificate Authority** | Self-signed ECDSA | Session-based PKI | Medium - Trust-on-first-use |
| **Memory Protection** | Secure cleanup patterns | Sensitive data wiping | High - Explicit memory management |