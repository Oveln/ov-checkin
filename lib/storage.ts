/**
 * Storage utilities for Cloudflare Workers (TypeScript)
 * Handles KV storage
 */

import { TokenInfo, PollingStatus } from '../types';

// KV Storage wrapper
export class KVStorage {
  constructor(private kv: KVNamespace) {}

  // Token management
  async getToken(): Promise<TokenInfo | null> {
    try {
      return await this.kv.get('wechat_token', 'json') as TokenInfo;
    } catch (error) {
      console.error('[KVStorage] Error getting token:', error);
      return null;
    }
  }

  async setToken(tokenInfo: TokenInfo): Promise<void> {
    try {
      // Calculate TTL based on token expire time, minimum 5 minutes
      const ttlSeconds = Math.max(300, Math.floor((tokenInfo.expire - Date.now()) / 1000));

      await this.kv.put('wechat_token', JSON.stringify(tokenInfo), {
        expirationTtl: ttlSeconds
      });
    } catch (error) {
      console.error('[KVStorage] Error setting token:', error);
      throw error;
    }
  }

  async deleteToken(): Promise<void> {
    try {
      await this.kv.delete('wechat_token');
    } catch (error) {
      console.error('[KVStorage] Error deleting token:', error);
      throw error;
    }
  }

  // Polling session management
  async createPollingSession(pollingId: string, uuid: string): Promise<void> {
    try {
      const status: PollingStatus = {
        status: 'waiting',
        uuid,
        timestamp: Date.now()
      };

      console.log(`[KVStorage] Creating polling session with ID: ${pollingId}, UUID: ${uuid}`);

      await this.kv.put(pollingId, JSON.stringify(status), {
        expirationTtl: 300 // 5 minutes
      });

      // Store UUID for this polling session (compatibility with polling-service)
      await this.kv.put(`${pollingId}_uuid`, uuid, {
        expirationTtl: 300
      });

      console.log(`[KVStorage] Successfully created polling session: ${pollingId}`);
    } catch (error) {
      console.error('[KVStorage] Error creating polling session:', error);
      throw error;
    }
  }

  async getPollingStatus(pollingId: string): Promise<PollingStatus | null> {
    try {
      console.log(`[KVStorage] Getting polling status for ID: ${pollingId}`);
      const status = await this.kv.get(pollingId, 'json') as PollingStatus;
      console.log(`[KVStorage] Polling status result:`, status ? 'found' : 'not found');
      return status;
    } catch (error) {
      console.error('[KVStorage] Error getting polling status:', error);
      return null;
    }
  }

  async updatePollingStatus(pollingId: string, status: Partial<PollingStatus>): Promise<void> {
    try {
      const currentStatus = await this.getPollingStatus(pollingId);
      const updatedStatus: PollingStatus = {
        status: currentStatus?.status || 'waiting',
        uuid: currentStatus?.uuid,
        message: currentStatus?.message,
        wxCode: currentStatus?.wxCode,
        ...status,
        timestamp: Date.now()
      };

      await this.kv.put(pollingId, JSON.stringify(updatedStatus), {
        expirationTtl: 300 // 5 minutes
      });
    } catch (error) {
      console.error('[KVStorage] Error updating polling status:', error);
      throw error;
    }
  }

  async deletePollingSession(pollingId: string): Promise<void> {
    try {
      await this.kv.delete(pollingId);
      await this.kv.delete(`${pollingId}_uuid`);
    } catch (error) {
      console.error('[KVStorage] Error deleting polling session:', error);
      throw error;
    }
  }

  // Get all active polling sessions
  async getActivePollingSessions(): Promise<string[]> {
    try {
      const pollingKeys = await this.kv.list({ prefix: 'polling_' });
      // Filter out UUID keys and return only the polling session IDs
      return pollingKeys.keys
        .map(key => key.name)
        .filter(name => !name.endsWith('_uuid'));
    } catch (error) {
      console.error('[KVStorage] Error getting active polling sessions:', error);
      return [];
    }
  }

  // One-time link management
  async storeOneTimeLink(token: string, data: any, ttl: number = 86400): Promise<void> {
    try {
      await this.kv.put(`onetime_${token}`, JSON.stringify({
        ...data,
        createdAt: Date.now()
      }), {
        expirationTtl: ttl // 24 hours default
      });
    } catch (error) {
      console.error('[KVStorage] Error storing one-time link:', error);
      throw error;
    }
  }

  async getOneTimeLink(token: string): Promise<any | null> {
    try {
      const data = await this.kv.get(`onetime_${token}`, 'json');
      return data;
    } catch (error) {
      console.error('[KVStorage] Error getting one-time link:', error);
      return null;
    }
  }

  async consumeOneTimeLink(token: string): Promise<any | null> {
    try {
      const data = await this.getOneTimeLink(token);
      if (data) {
        await this.kv.delete(`onetime_${token}`);
      }
      return data;
    } catch (error) {
      console.error('[KVStorage] Error consuming one-time link:', error);
      return null;
    }
  }

  // Utility methods
  async healthCheck(): Promise<boolean> {
    try {
      const testKey = 'health_check_' + Date.now();
      await this.kv.put(testKey, 'ok');
      await this.kv.delete(testKey);
      return true;
    } catch (error) {
      console.error('[KVStorage] Health check failed:', error);
      return false;
    }
  }
}

// Storage factory - returns KV storage
export function createStorage(env: any): KVStorage {
  return new KVStorage(env.TOKEN_KV);
}

// Utility functions for token validation
export class TokenValidator {
  constructor(private storage: KVStorage) {}

  async isTokenValid(): Promise<boolean> {
    try {
      const tokenInfo = await this.storage.getToken();
      return tokenInfo !== null && tokenInfo.expire > Date.now();
    } catch (error) {
      console.error('[TokenValidator] Error validating token:', error);
      return false;
    }
  }

  async getValidToken(): Promise<string | null> {
    try {
      const tokenInfo = await this.storage.getToken();
      if (tokenInfo && tokenInfo.expire > Date.now()) {
        return tokenInfo.token;
      }
      return null;
    } catch (error) {
      console.error('[TokenValidator] Error getting valid token:', error);
      return null;
    }
  }

  async storeToken(token: string, expireIn: number = 3600): Promise<void> {
    try {
      const tokenInfo: TokenInfo = {
        token,
        expire: Date.now() + (expireIn * 1000)
      };
      await this.storage.setToken(tokenInfo);
    } catch (error) {
      console.error('[TokenValidator] Error storing token:', error);
      throw error;
    }
  }

  async refreshTokenIfNeeded(): Promise<string | null> {
    try {
      const isValid = await this.isTokenValid();
      if (!isValid) {
        return null; // Token expired, need re-authentication
      }
      return await this.getValidToken();
    } catch (error) {
      console.error('[TokenValidator] Error refreshing token:', error);
      return null;
    }
  }
}