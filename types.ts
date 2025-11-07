/**
 * TypeScript type definitions for Cloudflare Workers
 */

// Cloudflare Workers Environment
export interface Env {
  // KV Storage for tokens and polling sessions
  TOKEN_KV: KVNamespace;

  // Email configuration
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  TO_EMAIL: string;

  // User configuration
  USER_NAME: string;
  THREAD_ID: number;

  // JWT secrets for one-time links
  JWT_SECRET?: string;

  // Worker URLs
  AUTH_WORKER_URL?: string;
  CHECKIN_WORKER_URL?: string;
}

// Token information
export interface TokenInfo {
  token: string;
  expire: number;
}

// Checkin result
export interface CheckinResult {
  success: boolean;
  message: string;
  data?: any;
}

// Email content
export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

// WeChat QR code response
export interface QRCodeResponse {
  success: boolean;
  uuid: string;
  qrCodeDataUrl: string;
  message?: string;
}

// WeChat login polling response
export interface PollingResponse {
  success: boolean;
  status: number;
  wxCode?: string;
  message?: string;
}

// Polling session status
export interface PollingStatus {
  status: 'waiting' | 'scanned' | 'confirmed' | 'expired' | 'error' | 'success';
  message?: string;
  wxCode?: string;
  uuid?: string;
  timestamp: number;
}

// WeChat API response structure (from i-api.jielong.com)
export interface WeChatApiResponse {
  Type: string;
  Data: string | WeChatTokenData;
  Description: string;
  ServerIp?: string;
}

// WeChat token data from API response
export interface WeChatTokenData {
  Token: string;
  Expire: number;
}

// WeChat token exchange response
export interface TokenExchangeResponse {
  success: boolean;
  token?: string;
  expire?: number;
  message?: string;
}

// API response wrapper
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Checkin configuration
export interface CheckinConfig {
  Id: number;
  ThreadId: number;
  Name: string;
  Description?: string;
  Fields: CheckinField[];
}

export interface CheckinField {
  Id: number;
  Name: string;
  Type: string;
  Required: boolean;
  Options?: string[];
}

// Checkin record data
export interface CheckinRecord {
  Id: number;
  ThreadId: number;
  Signature: string;
  RecordValues: CheckinValue[];
}

export interface CheckinValue {
  FieldId: number;
  Values: string[];
  Texts: string[];
  HasValue: boolean;
}

// Location data
export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

// WeChat login flow states
export type WeChatLoginState =
  | 'waiting_for_scan'
  | 'scanned_waiting_confirm'
  | 'confirmed'
  | 'expired'
  | 'error'
  | 'success';

// HTTP request/response types
export interface AuthRequest {
  token: string;
  userId?: string;
}

export interface StartPollingRequest {
  uuid: string;
}

export interface StartPollingResponse {
  success: boolean;
  pollingId?: string;
  error?: string;
}

export interface LoginStatusResponse {
  success?: boolean;
  error?: string;
  expired?: boolean;
  status?: WeChatLoginState;
}