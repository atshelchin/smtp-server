/**
 * 邮件发送服务
 * 直接发送到目标邮件服务器（通过 MX 记录），支持 DKIM 签名
 */

import { createTransport, type Transporter } from "nodemailer";
import { Resolver } from "dns/promises";

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
  private config: MailConfig;
  private resolver: Resolver;

  constructor(config: MailConfig) {
    this.config = config;
    this.resolver = new Resolver();
  }

  /**
   * 获取目标域名的 MX 服务器
   */
  private async getMxHost(email: string): Promise<string> {
    const domain = email.split("@")[1];
    try {
      const mxRecords = await this.resolver.resolveMx(domain);
      // 按优先级排序，取最优先的
      mxRecords.sort((a, b) => a.priority - b.priority);
      return mxRecords[0].exchange;
    } catch {
      // 如果没有 MX 记录，尝试直接使用域名
      return domain;
    }
  }

  /**
   * 创建针对特定目标服务器的 transporter
   */
  private createTransporter(mxHost: string): Transporter {
    return createTransport({
      host: mxHost,
      port: 25,
      secure: false,
      tls: {
        rejectUnauthorized: false,
      },
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
      // 获取第一个收件人的 MX 服务器
      const toEmail = Array.isArray(options.to) ? options.to[0] : options.to;
      const mxHost = await this.getMxHost(toEmail);

      const transporter = this.createTransporter(mxHost);

      const result = await transporter.sendMail({
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
