/**
 * DKIM 密钥工具
 * 处理 DKIM 私钥的加载和生成
 */

import { generateKeyPairSync } from "crypto";

export interface DkimKeyPair {
  privateKey: string;
  publicKeyBase64: string;
  privateKeyBase64: string;
}

/**
 * 生成新的 DKIM 密钥对
 */
export function generateDkimKeyPair(): DkimKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const publicKeyBase64 = publicKey
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s/g, "");

  const privateKeyBase64 = Buffer.from(privateKey).toString("base64");

  return { privateKey, publicKeyBase64, privateKeyBase64 };
}

/**
 * 解析 DKIM 私钥（支持 PEM 和 Base64 格式）
 */
export function parseDkimPrivateKey(key: string): string {
  if (!key) return "";

  // 如果是 PEM 格式，直接返回
  if (key.includes("-----BEGIN")) {
    return key;
  }

  // 否则当作 Base64 解码
  return Buffer.from(key, "base64").toString("utf-8");
}

/**
 * 打印 DKIM 配置说明
 */
export function printDkimSetupGuide(
  domain: string,
  selector: string,
  keyPair: DkimKeyPair
): void {
  console.log("\n" + "=".repeat(70));
  console.log("DKIM Setup Guide");
  console.log("=".repeat(70));
  console.log("\n1. Add DNS TXT Record:");
  console.log(`   Name:  ${selector}._domainkey.${domain}`);
  console.log(`   Value: v=DKIM1; k=rsa; p=${keyPair.publicKeyBase64}`);
  console.log("\n2. Set GitHub Secret (DKIM_PRIVATE_KEY):");
  console.log(`   ${keyPair.privateKeyBase64}`);
  console.log("\n" + "=".repeat(70) + "\n");
}
