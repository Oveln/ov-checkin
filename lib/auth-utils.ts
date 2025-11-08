/**
 * Authentication utilities for Cloudflare Workers (TypeScript)
 * Handles one-time links and authentication flows
 */

import * as crypto from 'node:crypto';
import { KVStorage } from './storage';
import { Env } from '../types';

export class AuthUtils {
  private storage: KVStorage;

  constructor(private env: Env) {
    this.storage = new KVStorage(env.TOKEN_KV);
  }

  /**
   * Generate a secure one-time link for authentication
   */
  async generateOneTimeLink(): Promise<string> {
    try {
      // Generate secure random token
      const token = crypto.randomBytes(32).toString('hex');

      // Store token with metadata
      await this.storage.storeOneTimeLink(token, {
        purpose: 'wechat_auth',
        createdAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
      }, 86400); // 24 hours TTL

      const baseUrl = this.env.AUTH_WORKER_URL;
      return `${baseUrl}/auth/${token}`;
    } catch (error) {
      console.error('[AuthUtils] Error generating one-time link:', error);
      throw new Error('Failed to generate one-time link');
    }
  }

  /**
   * Validate a one-time link and consume it if valid
   */
  async validateOneTimeLink(token: string): Promise<boolean> {
    try {
      if (!token || token.length < 32) {
        return false;
      }

      const data = await this.storage.consumeOneTimeLink(token);

      if (!data) {
        return false;
      }

      // Additional validation
      if (data.purpose !== 'wechat_auth') {
        return false;
      }

      // Check if expired
      if (data.expiresAt && data.expiresAt < Date.now()) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('[AuthUtils] Error validating one-time link:', error);
      return false;
    }
  }

  /**
   * Generate a secure session ID for login polling
   */
  generateSessionId(): string {
    return crypto.randomUUID();
  }

  /**
   * Create a secure hash for data integrity
   */
  async createHash(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataArray = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataArray);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Verify data integrity with hash
   */
  async verifyHash(data: string, expectedHash: string): Promise<boolean> {
    try {
      const actualHash = await this.createHash(data);
      return actualHash === expectedHash;
    } catch (error) {
      console.error('[AuthUtils] Error verifying hash:', error);
      return false;
    }
  }

  /**
   * Rate limiting helper for authentication attempts
   */
  async checkRateLimit(identifier: string, maxAttempts: number = 5, windowMs: number = 300000): Promise<boolean> {
    try {
      const rateLimitKey = `rate_limit_${identifier}`;
      const rateLimitData = await this.env.TOKEN_KV.get(rateLimitKey, 'json');

      if (!rateLimitData) {
        // First attempt
        await this.env.TOKEN_KV.put(rateLimitKey, JSON.stringify({
          count: 1,
          firstAttempt: Date.now()
        }), {
          expirationTtl: Math.max(60, Math.ceil(windowMs / 1000))
        });
        return true;
      }

      const data = typeof rateLimitData === 'string' ? JSON.parse(rateLimitData) : rateLimitData;
      const now = Date.now();

      // Reset window if expired
      if (now - data.firstAttempt > windowMs) {
        await this.env.TOKEN_KV.put(rateLimitKey, JSON.stringify({
          count: 1,
          firstAttempt: now
        }), {
          expirationTtl: Math.max(60, Math.ceil(windowMs / 1000))
        });
        return true;
      }

      // Check if over limit
      if (data.count >= maxAttempts) {
        return false;
      }

      // Increment counter
      const remainingTtl = Math.ceil((windowMs - (now - data.firstAttempt)) / 1000);
      await this.env.TOKEN_KV.put(rateLimitKey, JSON.stringify({
        count: data.count + 1,
        firstAttempt: data.firstAttempt
      }), {
        expirationTtl: Math.max(60, remainingTtl) // Ensure minimum 60 seconds TTL
      });

      return true;
    } catch (error) {
      console.error('[AuthUtils] Error checking rate limit:', error);
      // Fail open - allow the attempt if rate limiting fails
      return true;
    }
  }

  /**
   * Generate CSRF token for form protection
   */
  generateCSRFToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Validate CSRF token
   */
  async validateCSRFToken(token: string, sessionId: string): Promise<boolean> {
    try {
      const storedToken = await this.env.TOKEN_KV.get(`csrf_${sessionId}`);
      return storedToken === token;
    } catch (error) {
      console.error('[AuthUtils] Error validating CSRF token:', error);
      return false;
    }
  }

  /**
   * Store CSRF token for session
   */
  async storeCSRFToken(token: string, sessionId: string): Promise<void> {
    try {
      await this.env.TOKEN_KV.put(`csrf_${sessionId}`, token, {
        expirationTtl: 3600 // 1 hour
      });
    } catch (error) {
      console.error('[AuthUtils] Error storing CSRF token:', error);
      throw error;
    }
  }
}

// Export functions for backward compatibility
export async function generateOneTimeLink(env: Env): Promise<string> {
  const authUtils = new AuthUtils(env);
  return await authUtils.generateOneTimeLink();
}

export async function validateOneTimeLink(token: string, env: Env): Promise<boolean> {
  const authUtils = new AuthUtils(env);
  return await authUtils.validateOneTimeLink(token);
}

export class SecurityUtils {
  /**
   * Sanitize input to prevent XSS
   */
  static sanitizeInput(input: string): string {
    return input
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .trim();
  }

  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate URL format
   */
  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate secure random string
   */
  static generateSecureRandom(length: number = 32): string {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
  }

  /**
   * Time-safe string comparison to prevent timing attacks
   */
  static async timeSafeEqual(a: string, b: string): Promise<boolean> {
    if (a.length !== b.length) {
      return false;
    }

    const encoder = new TextEncoder();
    const bufferA = encoder.encode(a);
    const bufferB = encoder.encode(b);

    const key = await crypto.subtle.generateKey(
      { name: 'HMAC', hash: 'SHA-256' },
      true,
      ['sign', 'verify']
    );

    const signatureA = await crypto.subtle.sign('HMAC', key, bufferA);
    const signatureB = await crypto.subtle.sign('HMAC', key, bufferB);

    return this.arrayBufferEqual(signatureA, signatureB);
  }

  private static arrayBufferEqual(buf1: ArrayBuffer, buf2: ArrayBuffer): boolean {
    if (buf1.byteLength !== buf2.byteLength) {
      return false;
    }

    const view1 = new Uint8Array(buf1);
    const view2 = new Uint8Array(buf2);

    for (let i = 0; i < view1.length; i++) {
      if (view1[i] !== view2[i]) {
        return false;
      }
    }

    return true;
  }
}