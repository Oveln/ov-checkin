/**
 * Login polling utilities for Cloudflare Workers (TypeScript)
 * Handles WeChat login polling flow
 */

import { KVStorage } from './storage';
import { WeChatUtils } from './wechat-utils';
import { Env, PollingStatus, WeChatLoginStatus } from '../types';

export class LoginPolling {
  private storage: KVStorage;

  constructor(private env: Env) {
    this.storage = new KVStorage(env.TOKEN_KV);
  }

  /**
   * Start a new login polling session
   */
  async startPolling(uuid: string): Promise<string> {
    try {
      const pollingId = crypto.randomUUID();

      // Create polling session
      await this.storage.createPollingSession(pollingId, uuid);

      // Start background polling
      this.schedulePolling(pollingId, uuid);

      console.log(`[LoginPolling] Started polling session ${pollingId} for UUID ${uuid}`);

      return pollingId;
    } catch (error) {
      console.error('[LoginPolling] Error starting polling:', error);
      throw new Error('Failed to start polling');
    }
  }

  /**
   * Schedule continuous polling for a session
   */
  private schedulePolling(pollingId: string, uuid: string): void {
    // Use setTimeout to avoid blocking
    setTimeout(async () => {
      await this.performPolling(pollingId, uuid);
    }, 1000); // Start after 1 second
  }

  /**
   * Perform single polling iteration
   */
  private async performPolling(pollingId: string, uuid: string): Promise<void> {
    try {
      // Check if session still exists and is not completed
      const status = await this.storage.getPollingStatus(pollingId);

      if (!status) {
        console.log(`[LoginPolling] Session ${pollingId} not found, stopping polling`);
        return;
      }

      if (status.status === WeChatLoginStatus.CONFIRMED ||
          status.status === WeChatLoginStatus.ERROR ||
          status.status === WeChatLoginStatus.EXPIRED) {
        console.log(`[LoginPolling] Session ${pollingId} already completed with status: ${status.status}`);
        return;
      }

      // Check if session has expired (5 minutes)
      if (Date.now() - status.timestamp > 300000) {
        console.log(`[LoginPolling] Session ${pollingId} expired`);
        await this.handleSessionExpired(pollingId);
        return;
      }

      // Poll WeChat API
      console.log(`[LoginPolling] Polling WeChat for UUID: ${uuid}, session: ${pollingId}`);
      const pollResult = await WeChatUtils.pollWeChatLogin(uuid);

      console.log(`[LoginPolling] Poll result:`, {
        success: pollResult.success,
        status: pollResult.status,
        message: pollResult.message,
        hasWxCode: !!pollResult.wxCode
      });

      if (!pollResult.success) {
        console.error(`[LoginPolling] Polling error for session ${pollingId}:`, pollResult.message);
        await this.updatePollingStatus(pollingId, {
          status: WeChatLoginStatus.ERROR,
          message: pollResult.message || 'Polling failed'
        });
        return;
      }

      // Handle different poll responses
      await this.handlePollResponse(pollingId, pollResult, uuid);

    } catch (error) {
      console.error(`[LoginPolling] Error in polling iteration for session ${pollingId}:`, error);
      await this.updatePollingStatus(pollingId, {
        status: WeChatLoginStatus.ERROR,
        message: 'Polling iteration error'
      });
    }
  }

  /**
   * Handle polling response from WeChat API
   */
  private async handlePollResponse(pollingId: string, pollResult: any, uuid: string): Promise<void> {
    const { status, wxCode } = pollResult;

    switch (status) {
      case 404:
        // Still waiting for scan
        await this.updatePollingStatus(pollingId, {
          status: WeChatLoginStatus.WAITING,
          message: '等待扫描二维码'
        });
        // Continue polling after 1 second
        setTimeout(() => {
          this.performPolling(pollingId, uuid);
        }, 1000);
        break;

      case 408:
        // Scanned, waiting for confirmation
        await this.updatePollingStatus(pollingId, {
          status: WeChatLoginStatus.SCANNED,
          message: '二维码已扫描，等待确认'
        });
        // Continue polling after 1 second
        setTimeout(() => {
          this.performPolling(pollingId, uuid);
        }, 1000);
        break;

      case 405:
        // Confirmed, we have wx_code
        if (wxCode) {
          await this.handleLoginConfirmed(pollingId, wxCode);
        } else {
          await this.updatePollingStatus(pollingId, {
            status: WeChatLoginStatus.ERROR,
            message: '登录确认但未获取到授权码'
          });
        }
        break;

      case 403:
        // QR code expired
        await this.handleSessionExpired(pollingId);
        break;

      default:
        // Unknown status
        await this.updatePollingStatus(pollingId, {
          status: WeChatLoginStatus.ERROR,
          message: `未知状态码: ${status}`
        });
        break;
    }
  }

  /**
   * Handle successful login confirmation
   */
  private async handleLoginConfirmed(pollingId: string, wxCode: string): Promise<void> {
    try {
      console.log(`[LoginPolling] Login confirmed for session ${pollingId}`);

      // Exchange wx_code for token
      const tokenResult = await WeChatUtils.exchangeWeChatCode(wxCode);

      if (!tokenResult.success || !tokenResult.token) {
        console.error(`[LoginPolling] Token exchange failed for session ${pollingId}:`, tokenResult.message);
        await this.updatePollingStatus(pollingId, {
          status: WeChatLoginStatus.ERROR,
          message: tokenResult.message || 'Token exchange failed'
        });

        // Send failure email
        await this.sendFailureEmail(pollingId);
        return;
      }

      // Store token
      const tokenInfo = {
        token: tokenResult.token,
        expire: tokenResult.expire || (Date.now() + 3600 * 1000) // Default 1 hour
      };

      await this.storage.setToken(tokenInfo);

      // Update polling status to success
      await this.updatePollingStatus(pollingId, {
        status: WeChatLoginStatus.CONFIRMED,
        message: '登录成功，Token已保存'
      });

      console.log(`[LoginPolling] Login completed successfully for session ${pollingId}`);

      // Send success email
      await this.sendSuccessEmail();

      // Trigger immediate checkin
      await this.triggerCheckin();

    } catch (error) {
      console.error(`[LoginPolling] Error handling login confirmation for session ${pollingId}:`, error);
      await this.updatePollingStatus(pollingId, {
        status: WeChatLoginStatus.ERROR,
        message: 'Login confirmation processing error'
      });

      await this.sendFailureEmail(pollingId);
    }
  }

  /**
   * Handle expired polling session
   */
  private async handleSessionExpired(pollingId: string): Promise<void> {
    await this.updatePollingStatus(pollingId, {
      status: WeChatLoginStatus.EXPIRED,
      message: '二维码已过期'
    });

    console.log(`[LoginPolling] Session ${pollingId} expired`);

    // Send failure email with new link
    await this.sendFailureEmail(pollingId);
  }

  /**
   * Update polling status
   */
  private async updatePollingStatus(pollingId: string, statusUpdate: Partial<PollingStatus>): Promise<void> {
    await this.storage.updatePollingStatus(pollingId, statusUpdate);
  }

  /**
   * Send success email
   */
  private async sendSuccessEmail(): Promise<void> {
    try {
      const { EmailUtils } = await import('./email-utils');
      const content = EmailUtils.createLoginSuccessEmail();
      await EmailUtils.sendEmail(this.env, content);
      console.log('[LoginPolling] Success email sent');
    } catch (error) {
      console.error('[LoginPolling] Error sending success email:', error);
    }
  }

  /**
   * Send failure email with new one-time link
   */
  private async sendFailureEmail(pollingId: string): Promise<void> {
    try {
      const { AuthUtils } = await import('./auth-utils');
      const { EmailUtils } = await import('./email-utils');

      const authUtils = new AuthUtils(this.env);
      const newOneTimeLink = await authUtils.generateOneTimeLink();

      const content = {
        subject: '❌ 微信登录失败',
        text: `微信登录失败或超时，请点击以下链接重新尝试:\n\n${newOneTimeLink}\n\n可能的原因:\n- 二维码已过期\n- 登录超时\n- 用户取消登录\n\n请重新扫描二维码进行登录。`,
        html: `
          <h2>❌ 微信登录失败</h2>
          <p>微信登录失败或超时，请点击下方按钮重新尝试:</p>
          <a href="${newOneTimeLink}" style="
            display: inline-block;
            padding: 12px 24px;
            background-color: #07c160;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            margin: 16px 0;
          ">重新登录</a>
          <h3>可能的原因:</h3>
          <ul>
            <li>二维码已过期</li>
            <li>登录超时</li>
            <li>用户取消登录</li>
          </ul>
          <p>请重新扫描二维码进行登录。</p>
        `
      };

      await EmailUtils.sendEmail(this.env, content);
      console.log(`[LoginPolling] Failure email sent for session ${pollingId}`);

    } catch (error) {
      console.error(`[LoginPolling] Error sending failure email for session ${pollingId}:`, error);
    }
  }

  /**
   * Trigger immediate checkin after successful login
   */
  private async triggerCheckin(): Promise<void> {
    try {
      if (!this.env.CHECKIN_WORKER_URL) {
        console.warn('[LoginPolling] CHECKIN_WORKER_URL not configured, skipping checkin trigger');
        return;
      }

      const checkinUrl = this.env.CHECKIN_WORKER_URL + '/trigger-checkin';

      const response = await fetch(checkinUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        console.log('[LoginPolling] Checkin triggered successfully');
      } else {
        console.error('[LoginPolling] Failed to trigger checkin:', response.status);
      }

    } catch (error) {
      console.error('[LoginPolling] Error triggering checkin:', error);
    }
  }

  /**
   * Get current polling status
   */
  async getPollingStatus(pollingId: string): Promise<PollingStatus | null> {
    return await this.storage.getPollingStatus(pollingId);
  }

  /**
   * Clean up expired polling sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const activeSessions = await this.storage.getActivePollingSessions();
      let cleanedCount = 0;

      for (const sessionId of activeSessions) {
        const status = await this.storage.getPollingStatus(sessionId);

        if (!status) {
          // Session doesn't exist, remove from active list
          await this.storage.deletePollingSession(sessionId);
          cleanedCount++;
          continue;
        }

        // Check if expired (5 minutes)
        if (Date.now() - status.timestamp > 300000) {
          await this.storage.deletePollingSession(sessionId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`[LoginPolling] Cleaned up ${cleanedCount} expired polling sessions`);
      }

      return cleanedCount;
    } catch (error) {
      console.error('[LoginPolling] Error cleaning up expired sessions:', error);
      return 0;
    }
  }
}

/**
 * Convenience function to start login polling (backward compatibility)
 */
export async function startLoginPolling(uuid: string, env: Env): Promise<{
  success: boolean;
  pollingId?: string;
  error?: string;
}> {
  try {
    const loginPolling = new LoginPolling(env);
    const pollingId = await loginPolling.startPolling(uuid);
    return {
      success: true,
      pollingId
    };
  } catch (error) {
    console.error('[LoginPolling] Error in startLoginPolling:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '启动轮询失败'
    };
  }
}

// Note: This file is deprecated. Use polling-service.ts instead.
// The LoginPolling class is kept for backward compatibility only.