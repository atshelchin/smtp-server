import { Elysia, t } from "elysia";
import { createTransport, type Transporter } from "nodemailer";
import { generateKeyPairSync } from "crypto";

// ============== 配置 (全部使用环境变量) ==============
interface Config {
  port: number;
  apiKey: string;
  domain: string;
  fromName: string;
  fromEmail: string;
  dkimSelector: string;
  dkimPrivateKey: string;
}

function loadConfig(): Config {
  const config: Config = {
    port: parseInt(process.env.PORT || "3000"),
    apiKey: process.env.API_KEY || "your-secret-api-key-change-me",
    domain: process.env.MAIL_DOMAIN || "yourdomain.com",
    fromName: process.env.FROM_NAME || "Mail Service",
    fromEmail: process.env.FROM_EMAIL || "noreply@yourdomain.com",
    dkimSelector: process.env.DKIM_SELECTOR || "mail",
    dkimPrivateKey: process.env.DKIM_PRIVATE_KEY || ""
  };

  // 验证必要配置
  const missing: string[] = [];
  if (!process.env.API_KEY) missing.push("API_KEY");
  if (!process.env.MAIL_DOMAIN) missing.push("MAIL_DOMAIN");
  if (!process.env.FROM_EMAIL) missing.push("FROM_EMAIL");
  if (!process.env.DKIM_PRIVATE_KEY) missing.push("DKIM_PRIVATE_KEY");

  if (missing.length > 0) {
    console.warn(`⚠️  缺少环境变量: ${missing.join(", ")}`);
    console.warn("   请设置环境变量或创建 .env 文件");
  }

  return config;
}

// ============== DKIM 密钥工具 ==============
function getDkimPrivateKey(config: Config): string {
  // 优先使用环境变量中的私钥
  if (config.dkimPrivateKey) {
    // 支持 base64 编码的私钥 (适合 GitHub Secrets)
    if (!config.dkimPrivateKey.includes("-----BEGIN")) {
      return Buffer.from(config.dkimPrivateKey, "base64").toString("utf-8");
    }
    return config.dkimPrivateKey;
  }

  // 如果没有配置私钥，生成新的密钥对（仅用于开发/测试）
  console.log("🔑 未配置 DKIM_PRIVATE_KEY，正在生成临时密钥对...");
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });

  // 提取公钥用于 DNS 记录
  const publicKeyBase64 = publicKey
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s/g, "");

  // 私钥 base64 编码（用于 GitHub Secrets）
  const privateKeyBase64 = Buffer.from(privateKey).toString("base64");

  console.log("\n" + "=".repeat(70));
  console.log("📋 DKIM 密钥已生成，请配置以下内容:");
  console.log("=".repeat(70));
  console.log("\n1️⃣  DNS TXT 记录:");
  console.log(`   名称: ${config.dkimSelector}._domainkey.${config.domain}`);
  console.log(`   值: v=DKIM1; k=rsa; p=${publicKeyBase64}`);
  console.log("\n2️⃣  GitHub Secret (DKIM_PRIVATE_KEY):");
  console.log(`   ${privateKeyBase64}`);
  console.log("\n" + "=".repeat(70) + "\n");

  return privateKey;
}

// ============== 邮件发送器 ==============
class MailSender {
  private transporter: Transporter;
  private config: Config;

  constructor(config: Config, dkimPrivateKey: string) {
    this.config = config;

    this.transporter = createTransport({
      host: "localhost",
      port: 25,
      secure: false,
      direct: true,
      dkim: {
        domainName: config.domain,
        keySelector: config.dkimSelector,
        privateKey: dkimPrivateKey
      }
    } as any);
  }

  async send(options: {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string;
  }) {
    const mailOptions = {
      from: `"${this.config.fromName}" <${this.config.fromEmail}>`,
      to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      replyTo: options.replyTo,
      headers: {
        "X-Mailer": "Bun Mail Server/1.0"
      }
    };

    const result = await this.transporter.sendMail(mailOptions);
    return {
      success: true,
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected
    };
  }
}

// ============== DNS 检查工具 ==============
async function checkDnsRecords(domain: string, selector: string) {
  const { Resolver } = await import("dns").then(m => m.promises);
  const resolver = new Resolver();

  const results: Record<string, { status: string; value?: string; hint?: string }> = {};

  // 检查 SPF
  try {
    const txtRecords = await resolver.resolveTxt(domain);
    const spf = txtRecords.flat().find(r => r.startsWith("v=spf1"));
    if (spf) {
      results.SPF = { status: "OK", value: spf };
    } else {
      results.SPF = {
        status: "MISSING",
        hint: `Add TXT: v=spf1 ip4:YOUR_SERVER_IP ~all`
      };
    }
  } catch {
    results.SPF = {
      status: "MISSING",
      hint: `Add TXT: v=spf1 ip4:YOUR_SERVER_IP ~all`
    };
  }

  // 检查 DKIM
  try {
    const dkimRecords = await resolver.resolveTxt(`${selector}._domainkey.${domain}`);
    const dkim = dkimRecords.flat().join("");
    if (dkim.includes("v=DKIM1")) {
      results.DKIM = { status: "OK", value: dkim.substring(0, 50) + "..." };
    } else {
      results.DKIM = { status: "MISSING", hint: "Run server to generate DKIM key" };
    }
  } catch {
    results.DKIM = { status: "MISSING", hint: "Run server to generate DKIM key" };
  }

  // 检查 DMARC
  try {
    const dmarcRecords = await resolver.resolveTxt(`_dmarc.${domain}`);
    const dmarc = dmarcRecords.flat().find(r => r.startsWith("v=DMARC1"));
    if (dmarc) {
      results.DMARC = { status: "OK", value: dmarc };
    } else {
      results.DMARC = {
        status: "MISSING",
        hint: `Add TXT _dmarc.${domain}: v=DMARC1; p=quarantine`
      };
    }
  } catch {
    results.DMARC = {
      status: "MISSING",
      hint: `Add TXT _dmarc.${domain}: v=DMARC1; p=quarantine`
    };
  }

  // 检查 MX
  try {
    const mxRecords = await resolver.resolveMx(domain);
    if (mxRecords.length > 0) {
      results.MX = {
        status: "OK",
        value: mxRecords.map(r => `${r.priority} ${r.exchange}`).join(", ")
      };
    }
  } catch {
    results.MX = { status: "OPTIONAL", hint: "Not required for sending only" };
  }

  return results;
}

// ============== 启动服务器 ==============
const config = loadConfig();
const dkimPrivateKey = getDkimPrivateKey(config);
const mailSender = new MailSender(config, dkimPrivateKey);

// API 认证中间件
const authMiddleware = (apiKey: string) => {
  return (app: Elysia) => app.derive(({ headers, set }) => {
    const providedKey = headers["x-api-key"] || headers["authorization"]?.replace("Bearer ", "");
    if (providedKey !== apiKey) {
      set.status = 401;
      throw new Error("Invalid API Key");
    }
    return {};
  });
};

const app = new Elysia()
  .get("/", () => ({
    service: "Bun Mail Server",
    status: "running",
    version: "1.0.0"
  }))

  .get("/dns-check", async () => {
    return await checkDnsRecords(config.domain, config.dkimSelector);
  })

  .group("/api", (app) =>
    app
      .use(authMiddleware(config.apiKey))

      .post("/send", async ({ body }) => {
        try {
          const result = await mailSender.send(body);
          return result;
        } catch (error: any) {
          return {
            success: false,
            error: error.message
          };
        }
      }, {
        body: t.Object({
          to: t.Union([t.String(), t.Array(t.String())]),
          subject: t.String(),
          text: t.Optional(t.String()),
          html: t.Optional(t.String()),
          replyTo: t.Optional(t.String())
        })
      })

      .post("/send-batch", async ({ body }) => {
        const results = await Promise.allSettled(
          body.emails.map(email => mailSender.send(email))
        );

        return {
          total: body.emails.length,
          success: results.filter(r => r.status === "fulfilled").length,
          failed: results.filter(r => r.status === "rejected").length,
          results: results.map((r, i) => ({
            to: body.emails[i].to,
            ...(r.status === "fulfilled" ? r.value : { success: false, error: (r.reason as Error).message })
          }))
        };
      }, {
        body: t.Object({
          emails: t.Array(t.Object({
            to: t.Union([t.String(), t.Array(t.String())]),
            subject: t.String(),
            text: t.Optional(t.String()),
            html: t.Optional(t.String()),
            replyTo: t.Optional(t.String())
          }))
        })
      })
  )
  .listen(config.port);

console.log(`
Bun Mail Server started
=======================
URL:    http://localhost:${config.port}
Domain: ${config.domain}

Endpoints:
  GET  /           - Health check
  GET  /dns-check  - Check DNS configuration
  POST /api/send   - Send email (requires API key)
  POST /api/send-batch - Batch send (requires API key)

Auth: x-api-key header or Authorization: Bearer <key>
`);

// 启动时检查 DNS
checkDnsRecords(config.domain, config.dkimSelector).then(results => {
  console.log("DNS Status:");
  for (const [key, value] of Object.entries(results)) {
    const icon = value.status === "OK" ? "✓" : value.status === "OPTIONAL" ? "○" : "✗";
    console.log(`  ${icon} ${key}: ${value.status}`);
    if (value.hint) console.log(`    → ${value.hint}`);
  }
});
