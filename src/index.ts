#!/usr/bin/env node

import { Command } from "commander";
import { GcpClient } from "./lib/gcp-client";
import { SyncClient } from "./lib/sync-client";

const program = new Command();

program
  .name("cloud-archive")
  .description("A CLI tool to sync a directory to a GCP storage bucket")
  .version("1.0.0");

program
  .command("upload <bucket> <filePath> <destinationPath>")
  .description("Upload a file to Google Cloud Storage")
  .action(async (bucket: string, filePath: string, destinationPath: string) => {
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
  .command("sync <bucket> <path>")
  .description("Sync folder with the bucket")
  .action(async (bucket: string, path: string) => {
    try {
      const gcpClient = new GcpClient(bucket);
      const syncClient = new SyncClient(path, gcpClient);
      await syncClient.sync((p) => {
        console.log(
          `Uploaded ${p.fileCount} of ${p.totalFiles}. Size: ${p.sizeUploaded}/${p.totalSize}`
        );
      });
    } catch (error) {
      console.error("Failed to sync the folder:", error);
      process.exit(1);
    }
  });

program.parse();
