/**
 * 邮件发送服务
 * 封装 nodemailer，提供简洁的邮件发送接口
 */

import { createTransport, type Transporter } from "nodemailer";

export interface MailConfig {
  domain: string;
  fromName: string;
  fromEmail: string;
  dkimSelector: string;
  dkimPrivateKey: string;
}

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}

export interface SendMailResult {
  success: boolean;
  messageId?: string;
  accepted?: string[];
  rejected?: string[];
  error?: string;
}

export class MailService {
  private transporter: Transporter;
  private config: MailConfig;

  constructor(config: MailConfig) {
    this.config = config;
    this.transporter = this.createTransporter();
  }

  private createTransporter(): Transporter {
    return createTransport({
      host: "localhost",
      port: 25,
      secure: false,
      direct: true,
      dkim: {
        domainName: this.config.domain,
        keySelector: this.config.dkimSelector,
        privateKey: this.config.dkimPrivateKey,
      },
    } as any);
  }

  /**
   * 发送单封邮件
   */
  async send(options: SendMailOptions): Promise<SendMailResult> {
    try {
      const result = await this.transporter.sendMail({
        from: `"${this.config.fromName}" <${this.config.fromEmail}>`,
        to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        replyTo: options.replyTo,
        headers: {
          "X-Mailer": "Bun Mail Server/1.0",
        },
      });

      return {
        success: true,
        messageId: result.messageId,
        accepted: result.accepted as string[],
        rejected: result.rejected as string[],
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 批量发送邮件
   */
  async sendBatch(
    emails: SendMailOptions[]
  ): Promise<{
    total: number;
    success: number;
    failed: number;
    results: Array<SendMailResult & { to: string | string[] }>;
  }> {
    const results = await Promise.allSettled(
      emails.map((email) => this.send(email))
    );

    const processedResults = results.map((result, index) => ({
      to: emails[index].to,
      ...(result.status === "fulfilled"
        ? result.value
        : { success: false, error: (result.reason as Error).message }),
    }));

    return {
      total: emails.length,
      success: processedResults.filter((r) => r.success).length,
      failed: processedResults.filter((r) => !r.success).length,
      results: processedResults,
    };
  }
}
