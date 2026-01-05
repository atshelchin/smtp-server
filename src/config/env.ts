/**
 * 环境变量配置
 * 集中管理所有环境变量，提供类型安全和默认值
 */

export interface EnvConfig {
  // 服务器
  port: number;
  apiKey: string;

  // 邮件
  domain: string;
  fromName: string;
  fromEmail: string;

  // DKIM
  dkimSelector: string;
  dkimPrivateKey: string;
}

export function loadEnvConfig(): EnvConfig {
  return {
    port: parseInt(process.env.PORT || "3000"),
    apiKey: process.env.API_KEY || "",
    domain: process.env.MAIL_DOMAIN || "",
    fromName: process.env.FROM_NAME || "Mail Service",
    fromEmail: process.env.FROM_EMAIL || "",
    dkimSelector: process.env.DKIM_SELECTOR || "mail",
    dkimPrivateKey: process.env.DKIM_PRIVATE_KEY || "",
  };
}

export function validateEnvConfig(config: EnvConfig): string[] {
  const missing: string[] = [];

  if (!config.apiKey) missing.push("API_KEY");
  if (!config.domain) missing.push("MAIL_DOMAIN");
  if (!config.fromEmail) missing.push("FROM_EMAIL");

  return missing;
}
