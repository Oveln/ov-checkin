/**
 * Unified OV Checkin Worker (TypeScript)
 * Trigger: Cron Trigger + HTTP requests
 * Functionality: Scheduled checkin, auth handling, login polling
 */

import { performCheckin } from './lib/checkin-utils';
import { sendEmail } from './lib/email-utils';
import { generateOneTimeLink } from './lib/auth-utils';
import { handleAuthRequest, generateQRCodePage, generateErrorPage, generateSuccessPage } from './auth-service';
import { startPollingSession, getPollingStatus, processPollingSession } from './polling-service';
import { renderTemplate } from './lib/template-handler';
import { Env } from './types';
import { AuthUtils } from './lib/auth-utils';

interface TokenInfo {
  token: string;
  expire: number;
}

interface CheckinResult {
  success: boolean;
  message: string;
}

interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('[Checkin Scheduler] Starting scheduled operations at', new Date().toISOString());

    // Perform regular checkin
    console.log('[Checkin Scheduler] Starting regular checkin process');

    try {
      // Check if we have a valid token
      const tokenInfo: TokenInfo | null = await env.TOKEN_KV.get('wechat_token', 'json');

      if (tokenInfo && tokenInfo.expire > Date.now()) {
        // Token is valid, perform checkin
        console.log('[Checkin Scheduler] Using valid cached token');

        try {
          const checkinResult: CheckinResult = await performCheckin(tokenInfo.token, env.THREAD_ID, env.USER_NAME);

          if (checkinResult.success) {
            // Send success email
            await sendEmail(env, {
              subject: '✅ 签到成功',
              text: `今日签到已成功完成！\n\n签到时间: ${new Date().toLocaleString('zh-CN')}\n状态: ${checkinResult.message}`,
              html: `
                <h2>✅ 签到成功</h2>
                <p>今日签到已成功完成！</p>
                <ul>
                  <li><strong>签到时间:</strong> ${new Date().toLocaleString('zh-CN')}</li>
                  <li><strong>状态:</strong> ${checkinResult.message}</li>
                </ul>
              `
            });
            console.log('[Checkin Scheduler] Checkin successful, email sent');
          } else {
            // Checkin failed, determine if it's token expiry or other issues
            console.log('[Checkin Scheduler] Checkin failed:', checkinResult.message);
            await handleCheckinFailure(checkinResult, env);
          }
        } catch (error) {
          console.error('[Checkin Scheduler] Checkin error:', error);
          await handleAuthenticationRequired(env);
        }
      } else {
        // Token is invalid or missing, need authentication
        console.log('[Checkin Scheduler] No valid token found, authentication required');
        await handleAuthenticationRequired(env);
      }

    } catch (error: any) {
      console.error('[Checkin Scheduler] Critical error:', error);

      // Send error notification email if configured
      try {
        await sendEmail(env, {
          subject: '❌ 签到系统错误',
          text: `签到系统遇到错误:\n\n${error.message}\n\n时间: ${new Date().toLocaleString('zh-CN')}`,
          html: `
            <h2>❌ 签到系统错误</h2>
            <p>签到系统遇到错误:</p>
            <pre>${error.message}</pre>
            <p><strong>时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>
          `
        });
      } catch (emailError) {
        console.error('[Checkin Scheduler] Failed to send error email:', emailError);
      }
    }
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const clientIP = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';

    // Initialize auth utils for rate limiting
    const authUtils = new AuthUtils(env);

    // Handle authentication requests
    if (path.startsWith('/auth/')) {
      const token = path.replace('/auth/', '');

      // Input validation
      if (!token || token.length < 32) {
        return new Response('Invalid authentication link', { status: 400 });
      }

      // Rate limiting check
      const rateLimitAllowed = await authUtils.checkRateLimit(clientIP, 10, 300000); // 10 attempts per 5 minutes
      if (!rateLimitAllowed) {
        return new Response('Too many requests', {
          status: 429,
          headers: { 'Retry-After': '300' }
        });
      }

      try {
        // Handle authentication request
        const authResult = await handleAuthRequest(token, env);

        if (!authResult.success) {
          return new Response(await generateErrorPage(authResult.error || '认证失败'), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
            status: 400
          });
        }

        if (authResult.data) {
          // Generate QR code page
          const qrPage = await generateQRCodePage(authResult.data.qrCodeDataUrl, authResult.data.pollingId);
          return new Response(qrPage, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        }

        return new Response(await generateErrorPage('认证处理失败'), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
          status: 500
        });

      } catch (error) {
        console.error('[Checkin Scheduler] Auth error:', error);
        return new Response(await generateErrorPage('认证处理过程中发生错误'), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
          status: 500
        });
      }
    }

    // Handle login status polling
    if (path === '/login-status') {
      const pollingId = url.searchParams.get('pollingId');

      // Input validation
      if (!pollingId || pollingId.length < 10 || !/^[a-zA-Z0-9_-]+$/.test(pollingId)) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid polling ID' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        });
      }

      // Rate limiting for polling endpoint
      const rateLimitAllowed = await authUtils.checkRateLimit(clientIP, 100, 60000); // 100 requests per minute
      if (!rateLimitAllowed) {
        return new Response(JSON.stringify({ success: false, error: 'Too many requests' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60' }
        });
      }

      try {
        // Process polling session first (active polling)
        await processPollingSession(pollingId, env);

        // Then get the status
        const statusResult = await getPollingStatus(pollingId, env);
        return new Response(JSON.stringify(statusResult), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('[Checkin Scheduler] Login status error:', error);
        return new Response(JSON.stringify({
          success: false,
          error: '查询登录状态失败'
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 500
        });
      }
    }

    // Handle login success page
    if (path === '/login-success') {
      return new Response(await generateSuccessPage(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // Handle root path with beautiful index page
    if (path === '/') {
      return new Response(await renderTemplate('index', {}), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    if (request.method === 'POST' && url.pathname === '/trigger-checkin') {
      await this.scheduled({} as ScheduledEvent, env, ctx);
      return new Response(JSON.stringify({ success: true, message: 'Checkin triggered' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};

async function handleCheckinFailure(checkinResult: CheckinResult, env: Env): Promise<void> {
  try {
    // Send reminder email
    await sendEmail(env, {
      subject: '⚠️ 签到提醒',
      text: `今日签到遇到问题:\n\n${checkinResult.message}\n\n系统将在下次定时任务时自动重试。`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #856404; margin: 0; font-size: 24px;">⚠️ 签到提醒</h2>
          </div>
          <p style="color: #333; line-height: 1.6;">今日签到遇到问题，但无需重新登录。</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <h3 style="color: #333; margin-top: 0; font-size: 16px;">详情：</h3>
            <p style="color: #666; line-height: 1.6;">${checkinResult.message}</p>
          </div>
          <div style="background-color: #e7f3ff; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="color: #0066cc; margin: 0; font-size: 14px;">
              <strong>💡 提示:</strong> 系统将在下次定时任务时自动重试，您无需进行任何操作。
            </p>
          </div>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            此邮件由签到系统自动发送，请勿回复。
          </p>
        </div>
      `
    });

    console.log('[Checkin Scheduler] Checkin failure notification sent:', checkinResult.message);
  } catch (error) {
    console.error('[Checkin Scheduler] Failed to handle checkin failure:', error);
  }
}

async function handleAuthenticationRequired(env: Env): Promise<void> {
  try {
    // Generate one-time link for authentication
    const oneTimeLink: string = await generateOneTimeLink(env);

    // Send reminder email with one-time link
    await sendEmail(env, {
      subject: '🔐 需要重新登录微信',
      text: `您的微信登录已过期，请点击以下链接重新登录:\n\n${oneTimeLink}\n\n此链接将在24小时后失效。`,
      html: `
        <h2>🔐 需要重新登录微信</h2>
        <p>您的微信登录已过期，请点击下方按钮重新登录:</p>
        <a href="${oneTimeLink}" style="
          display: inline-block;
          padding: 12px 24px;
          background-color: #07c160;
          color: white;
          text-decoration: none;
          border-radius: 6px;
          margin: 16px 0;
        ">重新登录微信</a>
        <p><small>此链接将在24小时后失效。</small></p>
      `
    });

    console.log('[Checkin Scheduler] Authentication email sent with one-time link');
  } catch (error) {
    console.error('[Checkin Scheduler] Failed to handle authentication required:', error);
  }
}