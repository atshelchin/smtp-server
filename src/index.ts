/**
 * Bun Mail Server
 * 简单可靠的邮件发送服务，支持 DKIM 签名
 */

import { Elysia } from "elysia";
import { loadEnvConfig, validateEnvConfig } from "./config/env";
import { MailService } from "./services/mail";
import { createHealthRoutes } from "./routes/health";
import { createMailRoutes } from "./routes/mail";
import {
  generateDkimKeyPair,
  parseDkimPrivateKey,
  printDkimSetupGuide,
} from "./utils/dkim";
import { checkDnsRecords, printDnsCheckResults } from "./utils/dns-checker";

// 加载配置
const config = loadEnvConfig();
const missingEnvVars = validateEnvConfig(config);

if (missingEnvVars.length > 0) {
  console.warn(`⚠️  Missing env vars: ${missingEnvVars.join(", ")}`);
}

// 初始化 DKIM 私钥
let dkimPrivateKey = parseDkimPrivateKey(config.dkimPrivateKey);

if (!dkimPrivateKey) {
  console.log("⚠️  DKIM_PRIVATE_KEY not set, generating temporary key...");
  const keyPair = generateDkimKeyPair();
  dkimPrivateKey = keyPair.privateKey;
  printDkimSetupGuide(config.domain, config.dkimSelector, keyPair);
}

// 初始化邮件服务
const mailService = new MailService({
  domain: config.domain,
  fromName: config.fromName,
  fromEmail: config.fromEmail,
  dkimSelector: config.dkimSelector,
  dkimPrivateKey,
});

// 创建应用
const app = new Elysia()
  .use(createHealthRoutes(config.domain, config.dkimSelector))
  .use(createMailRoutes(mailService, config.apiKey))
  .listen(config.port);

// 启动日志
console.log(`
Bun Mail Server
===============
URL:    http://localhost:${config.port}
Domain: ${config.domain || "(not set)"}

Endpoints:
  GET  /           - Health check
  GET  /dns-check  - DNS configuration status
  POST /api/send   - Send email
  POST /api/send-batch - Batch send

Auth: x-api-key header or Authorization: Bearer <key>
`);

// 检查 DNS 配置
if (config.domain) {
  checkDnsRecords(config.domain, config.dkimSelector).then(printDnsCheckResults);
}
