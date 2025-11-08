/**
 * Checkin utilities for Cloudflare Workers (TypeScript)
 * Handles school checkin API calls and data formatting
 */

import { CheckinResult, Location } from '../types';

// Default location
const DEFAULT_LOCATION: Location = {
  latitude: 28.423147,
  longitude: 117.976543,
  address: '上饶市信州区•上饶师范学院'
};

// API endpoints
const API_BASE = 'https://i-api.jielong.com';

/**
 * Generic request function (matching the original implementation)
 */
async function request(url: string, options: any = {}, token: string | null = null) {
  const defaultHeaders: any = {
    'content-type': 'application/json',
    accept: 'application/json, text/plain, */*',
    origin: 'https://i.jielong.com',
    referer: 'https://i.jielong.com/',
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/16A366 MicroMessenger/8.0.40 NetType/WIFI Language/zh_CN',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'sec-fetch-dest': 'empty',
  };

  if (token) defaultHeaders['Authorization'] = token;

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      ...defaultHeaders,
      ...(options.headers || {}),
    },
    body: options.body
      ? typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body)
      : undefined,
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class CheckinUtils {
  /**
   * Submit checkin record (simplified version)
   */
  static async submitCheckIn(
    token: string,
    signature: string,
    threadId: number,
    location: Location | null = null
  ): Promise<CheckinResult> {
    try {
      const payload = {
        Id: 0,
        ThreadId: threadId,
        Signature: signature,
        RecordValues: [
          {
            FieldId: 1,
            Values: [],
            Texts: [],
            HasValue: false,
          },
          {
            FieldId: 2,
            Values: [
              JSON.stringify(location || DEFAULT_LOCATION),
            ],
            Texts: [location?.address || DEFAULT_LOCATION.address || '上饶市信州区•上饶师范学院'],
            HasValue: true,
          },
        ],
      };

      const url = `${API_BASE}/api/CheckIn/EditRecord`;
      console.log(`[CheckinUtils] Submitting checkin to: ${url}`);
      console.log(`[CheckinUtils] Using threadId: ${threadId}, signature: ${signature}`);

      const result = await request(url, { method: 'POST', body: payload }, token);

      console.log(`[CheckinUtils] Checkin submit response:`, result);

      const description = result.Description;

      if (description.includes('打卡成功')) {
        return {
          success: true,
          message: description,
          data: result.Data
        };
      } else {
        return {
          success: false,
          message: description
        };
      }

    } catch (error) {
      console.error('[CheckinUtils] Error submitting checkin:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Network error'
      };
    }
  }
}

// Export functions for backward compatibility
export async function performCheckin(token: string, threadId: number, signature: string): Promise<CheckinResult> {
  try {
    return await CheckinUtils.submitCheckIn(token, signature, threadId);
  } catch (error) {
    console.error('[CheckinUtils] Error in performCheckin:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Checkin failed'
    };
  }
}