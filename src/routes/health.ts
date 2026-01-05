/**
 * 健康检查路由
 */

import { Elysia } from "elysia";
import { checkDnsRecords } from "../utils/dns-checker";

export function createHealthRoutes(domain: string, dkimSelector: string) {
  return new Elysia()
    .get("/", () => ({
      service: "Bun Mail Server",
      status: "running",
      version: "1.0.0",
    }))
    .get("/dns-check", async () => {
      return await checkDnsRecords(domain, dkimSelector);
    });
}
