/**
 * Email utilities for Cloudflare Workers (TypeScript)
 * Handles email sending using Resend
 */

import { EmailContent, Env } from '../types';
import { Resend } from 'resend';

export class EmailUtils {
  /**
   * Send email using Resend
   * Resend provides a simple API for sending emails
   */
  static async sendEmail(env: Env, content: EmailContent): Promise<{ success: boolean; message?: string }> {
    try {
      // Check if email configuration is available
      if (!env.RESEND_FROM_EMAIL || !env.RESEND_API_KEY || !env.TO_EMAIL) {
        console.warn('[EmailUtils] Email configuration not complete, skipping email send');
        return {
          success: false,
          message: 'Email configuration incomplete'
        };
      }

      console.log('[EmailUtils] Sending email via Resend:', {
        from: env.RESEND_FROM_EMAIL,
        to: env.TO_EMAIL,
        subject: content.subject
      });

      // Initialize Resend with API key
      const resend = new Resend(env.RESEND_API_KEY);

      // Send email using Resend SDK
      const { data, error } = await resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: [env.TO_EMAIL],
        subject: content.subject,
        text: content.text,
        html: content.html
      });

      if (error) {
        console.error('[EmailUtils] Resend error:', error);
        return {
          success: false,
          message: `Resend error: ${error.message}`
        };
      }

      if (data) {
        console.log('[EmailUtils] Email sent successfully via Resend:', data.id);
        return {
          success: true,
          message: 'Email sent successfully'
        };
      }

      return {
        success: false,
        message: 'Unknown error: No data or error returned from Resend'
      };

    } catch (error) {
      console.error('[EmailUtils] Error sending email via Resend:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown email error'
      };
    }
  }

  /**
   * Create success checkin email content
   */
  static createCheckinSuccessEmail(userName: string, checkinTime: Date): EmailContent {
    const timeString = checkinTime.toLocaleString('zh-CN');

    return {
      subject: '✅ 签到成功',
      text: `亲爱的 ${userName}，

今日签到已成功完成！

签到时间: ${timeString}
状态: 成功

祝您生活愉快！`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #2e7d32; margin: 0; font-size: 24px;">✅ 签到成功</h2>
          </div>

          <p style="color: #333; line-height: 1.6;">亲爱的 <strong>${userName}</strong>，</p>

          <p style="color: #333; line-height: 1.6;">今日签到已成功完成！</p>

          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <h3 style="color: #333; margin-top: 0; font-size: 16px;">签到详情：</h3>
            <ul style="color: #666; line-height: 1.6;">
              <li><strong>签到时间:</strong> ${timeString}</li>
              <li><strong>状态:</strong> <span style="color: #2e7d32;">✅ 成功</span></li>
            </ul>
          </div>

          <p style="color: #666; font-size: 14px; margin-top: 30px;">祝您生活愉快！</p>

          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

          <p style="color: #999; font-size: 12px; text-align: center;">
            此邮件由签到系统自动发送，请勿回复。
          </p>
        </div>
      `
    };
  }

  /**
   * Create authentication required email content
   */
  static createAuthRequiredEmail(oneTimeLink: string): EmailContent {
    return {
      subject: '🔐 需要重新登录微信',
      text: `您的微信登录已过期，请点击以下链接重新登录:

${oneTimeLink}

此链接将在24小时后失效。

操作步骤：
1. 点击上方链接
2. 使用微信扫描二维码
3. 在手机上确认登录
4. 系统将自动完成签到

如有问题，请及时处理。`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #ffeaa7;">
            <h2 style="color: #856404; margin: 0; font-size: 24px;">🔐 需要重新登录微信</h2>
          </div>

          <p style="color: #333; line-height: 1.6;">您的微信登录已过期，请点击下方按钮重新登录：</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${oneTimeLink}" style="
              display: inline-block;
              padding: 15px 30px;
              background-color: #07c160;
              color: white;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 500;
              font-size: 16px;
              box-shadow: 0 2px 8px rgba(7, 193, 96, 0.3);
            ">重新登录微信</a>
          </div>

          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <h3 style="color: #333; margin-top: 0; font-size: 16px;">操作步骤：</h3>
            <ol style="color: #666; line-height: 1.6;">
              <li>点击上方链接或按钮</li>
              <li>使用微信扫描页面上的二维码</li>
              <li>在手机上确认登录</li>
              <li>系统将自动完成今日签到</li>
            </ol>
          </div>

          <div style="background-color: #fff2f0; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #ffccc7;">
            <p style="color: #cf1322; margin: 0; font-size: 14px;">
              <strong>⚠️ 重要提示：</strong> 此链接将在24小时后失效，请及时处理。
            </p>
          </div>

          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

          <p style="color: #999; font-size: 12px; text-align: center;">
            此邮件由签到系统自动发送，请勿回复。
          </p>
        </div>
      `
    };
  }

  /**
   * Create login success email content
   */
  static createLoginSuccessEmail(): EmailContent {
    const loginTime = new Date().toLocaleString('zh-CN');

    return {
      subject: '✅ 微信登录成功',
      text: `微信登录已成功完成！

登录时间: ${loginTime}
状态: 登录成功，系统将自动进行今日签到

您无需进行其他操作。`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #2e7d32; margin: 0; font-size: 24px;">✅ 微信登录成功</h2>
          </div>

          <p style="color: #333; line-height: 1.6;">微信登录已成功完成！</p>

          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <h3 style="color: #333; margin-top: 0; font-size: 16px;">登录详情：</h3>
            <ul style="color: #666; line-height: 1.6;">
              <li><strong>登录时间:</strong> ${loginTime}</li>
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
    };
  }

  /**
   * Create system error email content
   */
  static createSystemErrorEmail(error: string, timestamp: Date): EmailContent {
    return {
      subject: '❌ 签到系统错误',
      text: `签到系统遇到错误，需要您的关注：

错误信息: ${error}
发生时间: ${timestamp.toLocaleString('zh-CN')}

请检查系统状态并及时处理。`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #ffebee; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #ffcdd2;">
            <h2 style="color: #c62828; margin: 0; font-size: 24px;">❌ 签到系统错误</h2>
          </div>

          <p style="color: #333; line-height: 1.6;">签到系统遇到错误，需要您的关注：</p>

          <div style="background-color: #fff5f5; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #fed7d7;">
            <h3 style="color: #c62828; margin-top: 0; font-size: 16px;">错误详情：</h3>
            <div style="background-color: #f8f8f8; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 14px; color: #d32f2f;">
              ${error}
            </div>
            <p style="margin-top: 10px; margin-bottom: 0;"><strong>发生时间:</strong> ${timestamp.toLocaleString('zh-CN')}</p>
          </div>

          <div style="background-color: #fff3cd; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #ffeaa7;">
            <p style="color: #856404; margin: 0;">
              <strong>建议操作：</strong> 请检查系统状态并及时处理。如为认证问题，可能需要重新登录微信。
            </p>
          </div>

          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

          <p style="color: #999; font-size: 12px; text-align: center;">
            此邮件由签到系统自动发送，请勿回复。
          </p>
        </div>
      `
    };
  }

  /**
   * Test email configuration
   */
  static async testEmailConfig(env: Env): Promise<{ success: boolean; message?: string }> {
    try {
      const testContent: EmailContent = {
        subject: '🧪 签到系统邮件测试',
        text: '这是一封测试邮件，用于验证邮件配置是否正确。\n\n如果您收到此邮件，说明邮件服务工作正常。',
        html: `
          <h2>🧪 签到系统邮件测试</h2>
          <p>这是一封测试邮件，用于验证邮件配置是否正确。</p>
          <p>如果您收到此邮件，说明邮件服务工作正常。</p>
          <p><strong>测试时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>
        `
      };

      return await this.sendEmail(env, testContent);
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Test failed'
      };
    }
  }
}

// Export functions for backward compatibility
export async function sendEmail(env: Env, content: EmailContent): Promise<{ success: boolean; message?: string }> {
  return await EmailUtils.sendEmail(env, content);
}

export type { EmailContent };