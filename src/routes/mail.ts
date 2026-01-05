/**
 * 邮件 API 路由
 */

import { Elysia, t } from "elysia";
import type { MailService, SendMailOptions } from "../services/mail";

// 请求体 Schema
const sendMailSchema = t.Object({
  to: t.Union([t.String(), t.Array(t.String())]),
  subject: t.String(),
  text: t.Optional(t.String()),
  html: t.Optional(t.String()),
  replyTo: t.Optional(t.String()),
  fromName: t.Optional(t.String()),  // 自定义发件人名称
  fromEmail: t.Optional(t.String()), // 自定义发件人邮箱（显示用）
});

const sendBatchSchema = t.Object({
  emails: t.Array(sendMailSchema),
});

export function createMailRoutes(mailService: MailService, apiKey: string) {
  return new Elysia({ prefix: "/api" })
    // API Key 认证
    .derive(({ headers, set }) => {
      const providedKey =
        headers["x-api-key"] ||
        headers["authorization"]?.replace("Bearer ", "");

      if (providedKey !== apiKey) {
        set.status = 401;
        throw new Error("Invalid API Key");
      }
      return {};
    })
    // 发送单封邮件
    .post(
      "/send",
      async ({ body }) => {
        return await mailService.send(body as SendMailOptions);
      },
      { body: sendMailSchema }
    )
    // 批量发送
    .post(
      "/send-batch",
      async ({ body }) => {
        return await mailService.sendBatch(body.emails as SendMailOptions[]);
      },
      { body: sendBatchSchema }
    );
}
