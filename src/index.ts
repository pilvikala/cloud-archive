#!/usr/bin/env node

import { Command } from "commander";
import * as dns from "dns";
import * as fs from "fs";
import * as https from "https";
import * as os from "os";
import { GcpClient } from "./lib/gcp-client";
import { SyncClient } from "./lib/sync-client";
import { displayFileSize } from "./lib/display-file-size";
import { version } from "./version";

async function printDiagnostics(): Promise<void> {
  console.log("\n--- Network Diagnostics ---");
  console.log(`Node.js: ${process.version}  platform: ${os.platform()}/${os.arch()}`);
  console.log(`GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);

  try {
    const mtu = fs.readFileSync("/sys/class/net/eth0/mtu", "utf8").trim();
    console.log(`eth0 MTU: ${mtu}`);
  } catch {
    console.log("eth0 MTU: not available");
  }

  const ifaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces ?? {})) {
    for (const addr of (addrs ?? [])) {
      if (!addr.internal) console.log(`interface ${name}: ${addr.family} ${addr.address}`);
    }
  }

  try {
    const nodeFetchPkg = JSON.parse(
      fs.readFileSync(require.resolve("node-fetch/package.json"), "utf8")
    );
    console.log(`node-fetch version: ${nodeFetchPkg.version}`);
  } catch {
    console.log("node-fetch: not found");
  }

  // Test the two hosts the GCP library actually uses
  for (const host of ["oauth2.googleapis.com", "www.googleapis.com"]) {
    try {
      const r = await dns.promises.lookup(host);
      console.log(`dns.lookup ${host}: IPv${r.family} ${r.address}`);
    } catch (e: any) {
      console.log(`dns.lookup ${host}: FAILED (${e.code})`);
    }

    for (const family of [4, 6] as const) {
      await new Promise<void>((resolve) => {
        const req = https.request(
          { hostname: host, path: "/", method: "GET", timeout: 5000, family },
          (res) => {
            console.log(`HTTPS IPv${family} ${host}: connected, HTTP ${res.statusCode}`);
            res.resume();
            res.on("end", resolve);
          }
        );
        req.on("error", (e: any) => {
          console.log(`HTTPS IPv${family} ${host}: FAILED (${e.code ?? e.message})`);
          resolve();
        });
        req.on("timeout", () => {
          console.log(`HTTPS IPv${family} ${host}: TIMEOUT`);
          req.destroy();
          resolve();
        });
        req.end();
      });
    }
  }

  console.log("--- End Diagnostics ---\n");
}

const program = new Command();

program
  .name("cloud-archive")
  .description("A CLI tool to sync a directory to a GCP storage bucket")
  .version(version);

program
  .command("version")
  .description("show version")
  .action(async () => {
    console.log(version);
  });
program
  .command("upload <bucket> <filePath> <destinationPath>")
  .description("Upload a file to Google Cloud Storage")
  .action(async (bucket: string, filePath: string, destinationPath: string) => {
    if (process.env.DEBUG) await printDiagnostics();
    try {
      const gcpClient = new GcpClient(bucket);
      await gcpClient.uploadFile(filePath, destinationPath);
    } catch (error) {
      console.error("Failed to upload file:", error);
      process.exit(1);
    }
  });

program
  .command("list <bucket> [path]")
  .description("List files in the bucket")
  .action(async (bucket: string, path: string) => {
    if (process.env.DEBUG) await printDiagnostics();
    try {
      const gcpClient = new GcpClient(bucket);
      const files = await gcpClient.listContent(bucket, path || "");
      files.forEach((f) => {
        console.log(f.name, f.kind, f.contentType, f.size);
      });
    } catch (error) {
      console.error("Failed to list the content:", error);
      process.exit(1);
    }
  });

program
  .command("sync <bucket> <path> <destinationPath>")
  .description("Sync folder with the bucket at the specified destination path")
  .action(async (bucket: string, path: string, destinationPath: string) => {
    if (process.env.DEBUG) await printDiagnostics();
    try {
      const gcpClient = new GcpClient(bucket);
      const syncClient = new SyncClient(path, destinationPath, gcpClient);
      await syncClient.sync((message) => {
        console.log(message);
      });
    } catch (error) {
      console.error("Failed to sync the folder:", error);
      process.exit(1);
    }
  });

program.parse();
