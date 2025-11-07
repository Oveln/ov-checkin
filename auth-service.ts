/**
 * Auth Service: One-Time Link Handler with WeChat QR Code (TypeScript)
 * Functionality: Validate one-time link, generate WeChat QR code, start polling
 */

import { validateOneTimeLink } from './lib/auth-utils';
import { getWeChatQRCode } from './lib/wechat-utils';
import { startPollingSession } from './polling-service';
import { renderTemplate } from './lib/template-handler';
import { Env } from './types';

// Handle one-time link authentication and QR code generation
export async function handleAuthRequest(token: string, env: Env): Promise<{
  success: boolean;
  data?: {
    qrCodeDataUrl: string;
    uuid: string;
    pollingId: string;
  };
  error?: string;
}> {
  try {
    // Validate the one-time link
    const isValid = await validateOneTimeLink(token, env);

    if (!isValid) {
      return {
        success: false,
        error: '认证链接已失效或无效'
      };
    }

    // Generate WeChat QR code
    const qrResponse = await getWeChatQRCode();

    if (!qrResponse.success) {
      return {
        success: false,
        error: qrResponse.message || '生成二维码失败'
      };
    }

    // Start login polling
    const pollingResponse = await startPollingSession(qrResponse.uuid, env);

    if (!pollingResponse.success || !pollingResponse.pollingId) {
      return {
        success: false,
        error: pollingResponse.error || '启动登录轮询失败'
      };
    }

    return {
      success: true,
      data: {
        qrCodeDataUrl: qrResponse.qrCodeDataUrl,
        uuid: qrResponse.uuid,
        pollingId: pollingResponse.pollingId
      }
    };

  } catch (error) {
    console.error('[Auth Service] Error handling auth request:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '认证处理失败'
    };
  }
}

// Generate QR code HTML page using template
export async function generateQRCodePage(qrCodeDataUrl: string, pollingId: string): Promise<string> {
  return await renderTemplate('qr-login', {
    qr_code_data_url: qrCodeDataUrl,
    polling_id: pollingId
  });
}

// Generate error page using template
export async function generateErrorPage(errorMessage: string): Promise<string> {
  return await renderTemplate('error', {
    error_message: errorMessage
  });
}

// Generate success page using template
export async function generateSuccessPage(): Promise<string> {
  return await renderTemplate('success', {});
}