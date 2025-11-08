/**
 * Polling Service: WeChat Login Polling Handler (TypeScript)
 * Functionality: Poll WeChat login status, handle success/failure
 */

import { pollWeChatLogin, exchangeWeChatCode } from './lib/wechat-utils';
import { sendEmail } from './lib/email-utils';
import { performCheckin } from './lib/checkin-utils';
import { Env, PollingStatus, WeChatLoginStatus } from './types';

interface TokenInfo {
  token: string;
  expire: number;
}

// Start new polling session
export async function startPollingSession(uuid: string, env: Env): Promise<{
  success: boolean;
  pollingId?: string;
  error?: string;
}> {
  try {
    const pollingId = `polling_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    // Store initial polling status
    const pollingStatus: PollingStatus = {
      status: WeChatLoginStatus.WAITING,
      timestamp: Date.now()
    };

    await env.TOKEN_KV.put(pollingId, JSON.stringify(pollingStatus), {
      expirationTtl: 300 // 5 minutes
    });

    // Store UUID for this polling session
    await env.TOKEN_KV.put(`${pollingId}_uuid`, uuid, {
      expirationTtl: 300
    });

    console.log('[Polling Service] Started polling session:', pollingId, 'for UUID:', uuid);

    return {
      success: true,
      pollingId
    };

  } catch (error) {
    console.error('[Polling Service] Error starting polling session:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '启动轮询会话失败'
    };
  }
}

// Process a single polling session
export async function processPollingSession(pollingId: string, env: Env): Promise<void> {
  try {
    console.log('[Polling Service] Processing polling session:', pollingId);

    // Get polling status
    const statusData = await env.TOKEN_KV.get(pollingId);
    if (!statusData) {
      console.log('[Polling Service] Polling session not found:', pollingId);
      return;
    }

    const pollingStatus: PollingStatus = JSON.parse(statusData);

    // Check if already completed
    if ([WeChatLoginStatus.CONFIRMED, WeChatLoginStatus.EXPIRED, WeChatLoginStatus.SERVER_ERROR, WeChatLoginStatus.ERROR].includes(pollingStatus.status)) {
      console.log('[Polling Service] Session already completed:', pollingId, pollingStatus.status);
      return;
    }

    // Get UUID for this session
    const uuid = await env.TOKEN_KV.get(`${pollingId}_uuid`);
    if (!uuid) {
      console.error('[Polling Service] UUID not found for polling session:', pollingId);
      return;
    }

    // Poll WeChat login status
    const loginResult = await pollWeChatLogin(uuid);

    if (!loginResult.success) {
      console.error('[Polling Service] WeChat polling failed:', loginResult.message);
      pollingStatus.status = WeChatLoginStatus.ERROR;
      pollingStatus.message = loginResult.message;
    } else {
      // 直接使用微信 errcode 状态码
      pollingStatus.status = loginResult.status;
      pollingStatus.message = loginResult.message;

      if (loginResult.wxCode) {
        pollingStatus.wxCode = loginResult.wxCode;

        // Exchange code for token
        const tokenResult = await exchangeWeChatCode(loginResult.wxCode);

        if (tokenResult.success && tokenResult.token) {
          // Calculate TTL based on tokenResult.expire or fallback to 3 days
          const expireTime = tokenResult.expire || (Date.now() + (3 * 24 * 60 * 60 * 1000));
          const ttlSeconds = Math.max(300, Math.floor((expireTime - Date.now()) / 1000)); // Minimum 5 minutes

          // Store the token
          const tokenInfo: TokenInfo = {
            token: tokenResult.token,
            expire: expireTime
          };

          await env.TOKEN_KV.put('wechat_token', JSON.stringify(tokenInfo), {
            expirationTtl: ttlSeconds
          });

          console.log('[Polling Service] Token stored successfully');

          // Send success email
          await sendEmail(env, {
            subject: '✅ 微信登录成功',
            text: `微信登录已成功完成！\n\n登录时间: ${new Date().toLocaleString('zh-CN')}\n状态: 登录成功，系统将自动进行今日签到\n\n您无需进行其他操作。`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                  <h2 style="color: #2e7d32; margin: 0; font-size: 24px;">✅ 微信登录成功</h2>
                </div>
                <p style="color: #333; line-height: 1.6;">微信登录已成功完成！</p>
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 6px; margin: 20px 0;">
                  <h3 style="color: #333; margin-top: 0; font-size: 16px;">登录详情：</h3>
                  <ul style="color: #666; line-height: 1.6;">
                    <li><strong>登录时间:</strong> ${new Date().toLocaleString('zh-CN')}</li>
                    <li><strong>状态:</strong> <span style="color: #2e7d32;">✅ 登录成功</span></li>
                    <li><strong>后续操作:</strong> 系统将自动进行今日签到</li>
                  </ul>
                </div>
                <div style="text-align: center; margin: 20px 0;">
                  <p style="color: #666; font-style: italic;">您无需进行其他操作，请耐心等待签到完成。</p>
                </div>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #999; font-size: 12px; text-align: center;">
                  此邮件由签到系统自动发送，请勿回复。
                </p>
              </div>
            `
          });

          // Trigger checkin directly after successful login
          try {
            console.log('[Polling Service] Triggering checkin after login');

            // Call the trigger-checkin endpoint internally using the Worker's own URL
            const response = await fetch(`${env.AUTH_WORKER_URL}/trigger-checkin`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
            });

            if (response.ok) {
              console.log('[Polling Service] Checkin triggered successfully');
            } else {
              console.error('[Polling Service] Failed to trigger checkin:', response.status, response.statusText);
            }
          } catch (checkinError) {
            console.error('[Polling Service] Error triggering checkin:', checkinError);
          }

          pollingStatus.status = WeChatLoginStatus.CONFIRMED; // Use confirmed as success status
        } else {
          console.error('[Polling Service] Token exchange failed:', tokenResult.message);
          pollingStatus.status = WeChatLoginStatus.ERROR;
          pollingStatus.message = tokenResult.message;
        }
      }
    }

    // Update polling status
    await env.TOKEN_KV.put(pollingId, JSON.stringify(pollingStatus), {
      expirationTtl: pollingStatus.status === WeChatLoginStatus.WAITING ? 300 : 3600 // 1 hour for completed sessions
    });

    console.log('[Polling Service] Updated polling status:', pollingId, pollingStatus.status);

  } catch (error) {
    console.error('[Polling Service] Error processing polling session:', pollingId, error);
  }
}

// Get polling status for frontend polling
export async function getPollingStatus(pollingId: string, env: Env): Promise<{
  success: boolean;
  status?: string;
  message?: string;
  error?: string;
}> {
  try {
    const statusData = await env.TOKEN_KV.get(pollingId);

    if (!statusData) {
      return {
        success: false,
        error: '轮询会话不存在或已过期'
      };
    }

    const pollingStatus: PollingStatus = JSON.parse(statusData);

    // Check if session is expired (more than 5 minutes)
    if (Date.now() - pollingStatus.timestamp > 5 * 60 * 1000) {
      pollingStatus.status = WeChatLoginStatus.EXPIRED;
      await env.TOKEN_KV.put(pollingId, JSON.stringify(pollingStatus), {
        expirationTtl: 3600
      });
    }

    return {
      success: true,
      status: pollingStatus.status.toString(), // Convert to string for JSON response
      message: pollingStatus.message
    };

  } catch (error) {
    console.error('[Polling Service] Error getting polling status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '查询轮询状态失败'
    };
  }
}

