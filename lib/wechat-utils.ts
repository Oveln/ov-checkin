/**
 * WeChat API utilities for Cloudflare Workers (TypeScript)
 * Handles WeChat OAuth, QR code generation, and token exchange
 */

import { QRCodeResponse, PollingResponse, TokenExchangeResponse, WeChatApiResponse, WeChatTokenData } from '../types';

/**
 * Convert ArrayBuffer to Base64 string (Cloudflare Workers compatible)
 */
async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  const uint8Array = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < uint8Array.byteLength; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

// WeChat API constants - should be moved to environment variables in production
const WECHAT_APPID = 'wx4a23ae4b8f291087';
const WECHAT_REDIRECT_URI = 'https://i.jielong.com/login-callback';
const WECHAT_SCOPE = 'snsapi_login';

// API endpoints
const WECHAT_API = {
  GET_UUID: 'https://open.weixin.qq.com/connect/qrconnect',
  GET_QRCODE: (uuid: string) => `https://open.weixin.qq.com/connect/qrcode/${uuid}`,
  POLL_STATUS: (uuid: string) => `https://lp.open.weixin.qq.com/connect/l/qrconnect?uuid=${uuid}&last=404`,
  EXCHANGE_TOKEN: 'https://i-api.jielong.com/api/User/OpenAuth'
};

export class WeChatUtils {
  /**
   * Get WeChat QR code UUID
   */
  static async getUUID(): Promise<{ success: boolean; uuid?: string; message?: string }> {
    try {
      const url = `${WECHAT_API.GET_UUID}?appid=${WECHAT_APPID}&redirect_uri=${encodeURIComponent(WECHAT_REDIRECT_URI)}&response_type=code&scope=${WECHAT_SCOPE}&state=STATE#wechat_redirect`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1 MicroMessenger/8.0.10(0x18000a2a) NetType/WIFI Language/zh_CN',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.8,en-US;q=0.5,en;q=0.3',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      });

      if (!response.ok) {
        return {
          success: false,
          message: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const html = await response.text();

      console.log(`[WeChatUtils] UUID response length: ${html.length}`);
      console.log(`[WeChatUtils] UUID response preview:`, html.substring(0, 300) + (html.length > 300 ? '...' : ''));

      // Extract UUID from HTML response
      const uuidMatch = html.match(/uuid=([a-zA-Z0-9_-]+)/);
      if (!uuidMatch) {
        console.error('[WeChatUtils] UUID pattern not found in response');
        return {
          success: false,
          message: 'Failed to extract UUID from response'
        };
      }

      console.log(`[WeChatUtils] Extracted UUID: ${uuidMatch[1]}`);

      return {
        success: true,
        uuid: uuidMatch[1]
      };

    } catch (error) {
      console.error('[WeChatUtils] Error getting UUID:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate QR code data URL from UUID
   */
  static async generateQRCodeDataURL(uuid: string): Promise<{ success: boolean; dataUrl?: string; message?: string }> {
    try {
      const qrCodeUrl = WECHAT_API.GET_QRCODE(uuid);

      // Fetch QR code image
      const response = await fetch(qrCodeUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1 MicroMessenger/8.0.10(0x18000a2a) NetType/WIFI Language/zh_CN'
        }
      });

      if (!response.ok) {
        return {
          success: false,
          message: `Failed to fetch QR code: ${response.status}`
        };
      }

      const imageBuffer = await response.arrayBuffer();
      const base64 = await arrayBufferToBase64(imageBuffer);
      const dataUrl = `data:image/png;base64,${base64}`;

      return {
        success: true,
        dataUrl
      };

    } catch (error) {
      console.error('[WeChatUtils] Error generating QR code:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get complete WeChat QR code response
   */
  static async getWeChatQRCode(): Promise<QRCodeResponse> {
    try {
      // Get UUID first
      const uuidResult = await this.getUUID();
      if (!uuidResult.success || !uuidResult.uuid) {
        return {
          success: false,
          uuid: '',
          qrCodeDataUrl: '',
          message: uuidResult.message || 'Failed to get UUID'
        };
      }

      // Generate QR code data URL
      const qrResult = await this.generateQRCodeDataURL(uuidResult.uuid);
      if (!qrResult.success || !qrResult.dataUrl) {
        return {
          success: false,
          uuid: uuidResult.uuid,
          qrCodeDataUrl: '',
          message: qrResult.message || 'Failed to generate QR code'
        };
      }

      return {
        success: true,
        uuid: uuidResult.uuid,
        qrCodeDataUrl: qrResult.dataUrl
      };

    } catch (error) {
      console.error('[WeChatUtils] Error getting WeChat QR code:', error);
      return {
        success: false,
        uuid: '',
        qrCodeDataUrl: '',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Poll WeChat login status
   */
  static async pollWeChatLogin(uuid: string): Promise<PollingResponse> {
    try {
      const pollUrl = WECHAT_API.POLL_STATUS(uuid);
      console.log(`[WeChatUtils] Polling with UUID: ${uuid}`);
      console.log(`[WeChatUtils] Polling URL: ${pollUrl}`);

      // Validate UUID format
      if (!uuid || uuid.length < 10) {
        throw new Error(`Invalid UUID format: ${uuid}`);
      }

      const response = await fetch(pollUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1 MicroMessenger/8.0.10(0x18000a2a) NetType/WIFI Language/zh_CN',
          'Accept': '*/*',
          'Referer': 'https://open.weixin.qq.com/',
          'Connection': 'keep-alive'
        }
      });

      if (!response.ok) {
        return {
          success: false,
          status: response.status,
          message: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const responseText = await response.text();

      // Log a truncated version of the response for debugging
      console.log(`[WeChatUtils] Raw response (${responseText.length} chars):`, responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''));

      // Parse wx_errcode and wx_code from response
      const errMatch = responseText.match(/wx_errcode=(\d+)/);
      const codeMatch = responseText.match(/wx_code='([^']+)'/);

      const errcode = errMatch ? parseInt(errMatch[1]) : null;
      const wxCode = codeMatch ? codeMatch[1] : null;

      console.log(`[WeChatUtils] Parsed response: errcode=${errcode}, wxCode=${wxCode ? '***' : 'null'}`);

      // Handle successful code retrieval
      if (errcode === 405 && wxCode) {
        console.log(`[WeChatUtils] 扫码成功，wx_code: ${wxCode.substring(0, 8)}...`);
        return {
          success: true,
          status: 405, // Confirmed
          wxCode,
          message: '扫码成功'
        };
      }

      // Handle expired QR code
      if (errcode === 403) {
        return {
          success: true,
          status: 403,
          message: '二维码已过期，请重试'
        };
      }

      // Handle waiting for scan
      if (errcode === 404) {
        return {
          success: true,
          status: 404,
          message: '等待扫描二维码'
        };
      }

      // Handle other status codes
      const status = errcode || response.status;

      // Handle 408 (scanned but not confirmed)
      if (status === 408) {
        return {
          success: true,
          status: 408,
          message: '二维码已扫描，等待确认'
        };
      }

      // Handle unknown status codes
      return {
        success: false,
        status,
        message: `未知状态码: ${status}`
      };

    } catch (error) {
      console.error('[WeChatUtils] Error polling WeChat login:', error);
      return {
        success: false,
        status: 0,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Exchange wx_code for access token
   */
  static async exchangeWeChatCode(wxCode: string): Promise<TokenExchangeResponse> {
    try {
      console.log(`[WeChatUtils] Exchanging wx_code: ${wxCode.substring(0, 8)}...`);

      // 使用原始实现的方式：URL参数 + 空请求体
      const url = `${WECHAT_API.EXCHANGE_TOKEN}?code=${wxCode}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'accept': 'application/json, text/plain, */*',
          'origin': 'https://i.jielong.com',
          'referer': 'https://i.jielong.com/',
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/16A366 MicroMessenger/8.0.40 NetType/WIFI Language/zh_CN',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
          'sec-fetch-dest': 'empty'
        },
        body: '' // 空请求体
      });

      console.log(`[WeChatUtils] Exchange response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[WeChatUtils] Exchange error response:`, errorText);
        return {
          success: false,
          message: `HTTP ${response.status}: ${response.statusText} - ${errorText}`
        };
      }

      const data = await response.json() as WeChatApiResponse;
      console.log(`[WeChatUtils] Exchange response data:`, data);

      // 按照原始实现提取数据：从Data字段获取Token和Expire
      const tokenData = (data.Data as WeChatTokenData)?.Token;
      const expire = (data.Data as WeChatTokenData)?.Expire;

      if (tokenData && expire) {
        const bearerToken = `Bearer ${tokenData}`;
        console.log('✅ 登录成功，Token 获取完毕');
        return {
          success: true,
          token: bearerToken,
          expire: expire
        };
      } else {
        console.error(`[WeChatUtils] Token exchange failed:`, data);
        throw new Error('❌ 获取 Token 失败');
      }

    } catch (error) {
      console.error('[WeChatUtils] Error exchanging WeChat code:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Validate WeChat token format
   */
  static isValidToken(token: string): boolean {
    try {
      if (!token || typeof token !== 'string') {
        return false;
      }

      // Check if it's a Bearer token
      if (token.startsWith('Bearer ')) {
        token = token.slice(7);
      }

      // Basic JWT format validation (header.payload.signature)
      const parts = token.split('.');
      return parts.length === 3;
    } catch {
      return false;
    }
  }

  /**
   * Extract token expiration from JWT (without verification)
   */
  static getTokenExpiration(token: string): number | null {
    try {
      if (token.startsWith('Bearer ')) {
        token = token.slice(7);
      }

      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const payload = JSON.parse(atob(parts[1]));
      return payload.exp ? payload.exp * 1000 : null; // Convert to milliseconds
    } catch {
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  static isTokenExpired(token: string): boolean {
    const expiration = this.getTokenExpiration(token);
    if (!expiration) {
      return true; // Assume expired if we can't parse
    }
    return Date.now() >= expiration;
  }
}

// Export functions for backward compatibility
export async function getWeChatQRCode(): Promise<QRCodeResponse> {
  return await WeChatUtils.getWeChatQRCode();
}

export async function pollWeChatLogin(uuid: string): Promise<PollingResponse> {
  return await WeChatUtils.pollWeChatLogin(uuid);
}

export async function exchangeWeChatCode(wxCode: string): Promise<TokenExchangeResponse> {
  return await WeChatUtils.exchangeWeChatCode(wxCode);
}