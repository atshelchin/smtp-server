/**
 * DNS 记录检查工具
 * 验证邮件相关 DNS 配置是否正确
 */

export interface DnsCheckResult {
  status: "OK" | "MISSING" | "OPTIONAL";
  value?: string;
  hint?: string;
}

export type DnsCheckResults = Record<string, DnsCheckResult>;

/**
 * 检查域名的邮件相关 DNS 记录
 */
export async function checkDnsRecords(
  domain: string,
  dkimSelector: string
): Promise<DnsCheckResults> {
  const { Resolver } = await import("dns").then((m) => m.promises);
  const resolver = new Resolver();
  const results: DnsCheckResults = {};

  // SPF
  results.SPF = await checkSpf(resolver, domain);

  // DKIM
  results.DKIM = await checkDkim(resolver, domain, dkimSelector);

  // DMARC
  results.DMARC = await checkDmarc(resolver, domain);

  // MX
  results.MX = await checkMx(resolver, domain);

  return results;
}

async function checkSpf(
  resolver: any,
  domain: string
): Promise<DnsCheckResult> {
  try {
    const records = await resolver.resolveTxt(domain);
    const spf = records.flat().find((r: string) => r.startsWith("v=spf1"));

    if (spf) {
      return { status: "OK", value: spf };
    }
    return {
      status: "MISSING",
      hint: "Add TXT: v=spf1 ip4:YOUR_SERVER_IP ~all",
    };
  } catch {
    return {
      status: "MISSING",
      hint: "Add TXT: v=spf1 ip4:YOUR_SERVER_IP ~all",
    };
  }
}

async function checkDkim(
  resolver: any,
  domain: string,
  selector: string
): Promise<DnsCheckResult> {
  try {
    const records = await resolver.resolveTxt(`${selector}._domainkey.${domain}`);
    const dkim = records.flat().join("");

    if (dkim.includes("v=DKIM1")) {
      return { status: "OK", value: dkim.substring(0, 50) + "..." };
    }
    return { status: "MISSING", hint: "DKIM record not configured" };
  } catch {
    return { status: "MISSING", hint: "DKIM record not configured" };
  }
}

async function checkDmarc(
  resolver: any,
  domain: string
): Promise<DnsCheckResult> {
  try {
    const records = await resolver.resolveTxt(`_dmarc.${domain}`);
    const dmarc = records.flat().find((r: string) => r.startsWith("v=DMARC1"));

    if (dmarc) {
      return { status: "OK", value: dmarc };
    }
    return {
      status: "MISSING",
      hint: `Add TXT _dmarc.${domain}: v=DMARC1; p=quarantine`,
    };
  } catch {
    return {
      status: "MISSING",
      hint: `Add TXT _dmarc.${domain}: v=DMARC1; p=quarantine`,
    };
  }
}

async function checkMx(resolver: any, domain: string): Promise<DnsCheckResult> {
  try {
    const records = await resolver.resolveMx(domain);

    if (records.length > 0) {
      const value = records
        .map((r: any) => `${r.priority} ${r.exchange}`)
        .join(", ");
      return { status: "OK", value };
    }
    return { status: "OPTIONAL", hint: "Not required for sending only" };
  } catch {
    return { status: "OPTIONAL", hint: "Not required for sending only" };
  }
}

/**
 * 打印 DNS 检查结果
 */
export function printDnsCheckResults(results: DnsCheckResults): void {
  console.log("\nDNS Status:");
  for (const [key, value] of Object.entries(results)) {
    const icon =
      value.status === "OK" ? "✓" : value.status === "OPTIONAL" ? "○" : "✗";
    console.log(`  ${icon} ${key}: ${value.status}`);
    if (value.hint) console.log(`    → ${value.hint}`);
  }
}
