/**
 * Shared Checkin Service (TypeScript)
 * Provides unified checkin functionality for both scheduled tasks and login triggers
 */

import { performCheckin } from './checkin-utils';
import { sendEmail } from './email-utils';
import { Env } from '../types';

export class CheckinService {
  /**
   * Perform checkin and handle results with proper notifications
   */
  static async executeCheckin(token: string, threadId: number, userName: string, env: Env): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      console.log('[Checkin Service] Starting checkin process');

      const checkinResult = await performCheckin(token, threadId, userName);

      if (checkinResult.success) {
        // Send success email
        await sendEmail(env, {
          subject: '✅ 签到成功',
          text: `今日签到已成功完成！\n\n签到时间: ${new Date().toLocaleString('zh-CN')}\n状态: ${checkinResult.message}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h2 style="color: #2e7d32; margin: 0; font-size: 24px;">✅ 签到成功</h2>
              </div>
              <p style="color: #333; line-height: 1.6;">今日签到已成功完成！</p>
              <div style="background-color: #f5f5f5; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <h3 style="color: #333; margin-top: 0; font-size: 16px;">签到详情：</h3>
                <ul style="color: #666; line-height: 1.6;">
                  <li><strong>签到时间:</strong> ${new Date().toLocaleString('zh-CN')}</li>
                  <li><strong>状态:</strong> ${checkinResult.message}</li>
                </ul>
              </div>
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; text-align: center;">
                此邮件由签到系统自动发送，请勿回复。
              </p>
            </div>
          `
        });

        console.log('[Checkin Service] Checkin successful, email sent');
        return {
          success: true,
          message: checkinResult.message
        };
      } else {
        // Handle checkin failure
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

        console.log('[Checkin Service] Checkin failed, notification sent:', checkinResult.message);
        return {
          success: false,
          message: checkinResult.message
        };
      }
    } catch (error) {
      console.error('[Checkin Service] Error during checkin:', error);

      // Send error notification
      try {
        await sendEmail(env, {
          subject: '❌ 签到系统错误',
          text: `签到系统遇到错误:\n\n${error instanceof Error ? error.message : '未知错误'}\n\n时间: ${new Date().toLocaleString('zh-CN')}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background-color: #f8d7da; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h2 style="color: #721c24; margin: 0; font-size: 24px;">❌ 签到系统错误</h2>
              </div>
              <p style="color: #333; line-height: 1.6;">签到系统遇到错误:</p>
              <div style="background-color: #f5f5f5; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <pre style="color: #666; margin: 0;">${error instanceof Error ? error.message : '未知错误'}</pre>
              </div>
              <p style="color: #333; margin: 20px 0;"><strong>时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; text-align: center;">
                此邮件由签到系统自动发送，请勿回复。
              </p>
            </div>
          `
        });
      } catch (emailError) {
        console.error('[Checkin Service] Failed to send error email:', emailError);
      }

      return {
        success: false,
        message: error instanceof Error ? error.message : '签到过程中发生未知错误'
      };
    }
  }
}