import { GcpClient } from "./gcp-client";
import * as fs from "fs";
import * as path from "path";

export interface SyncProgress {
  fileCount: number;
  totalFiles: number;
  sizeUploaded: number;
  totalSize: number;
}

export interface SyncResult {
  uploadedFiles: string[];
  totalFilesUploaded: number;
}

export class SyncClient {
  private localPath: string;
  private gcpClient: GcpClient;

  constructor(localPath: string, gcpClient: GcpClient) {
    this.localPath = localPath;
    this.gcpClient = gcpClient;
  }

  private async listFiles(): Promise<[string, string][]> {
    const result: [string, string][] = [];

    const processDirectory = async (
      currentPath: string,
      relativePath: string = ""
    ) => {
      const entries = await fs.promises.readdir(currentPath, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const newRelativePath = path.join(relativePath, entry.name);

        if (entry.isDirectory()) {
          await processDirectory(fullPath, newRelativePath);
        } else if (entry.isFile()) {
          result.push([fullPath, newRelativePath]);
        }
      }
    };

    await processDirectory(this.localPath);
    return result;
  }

  private async getFilesToUpload(
    files: [string, string][]
  ): Promise<[string, string, number][]> {
    const existingFiles = await this.gcpClient.listContent(
      this.gcpClient["bucketName"],
      ""
    );
    const existingFilesMap = new Map(
      existingFiles.map((file) => [file.name, file.size])
    );

    const filesToUpload: [string, string, number][] = [];

    for (const [absolutePath, relativePath] of files) {
      const stats = await fs.promises.stat(absolutePath);
      const existingSize = existingFilesMap.get(relativePath);

      if (!existingSize || existingSize !== stats.size) {
        filesToUpload.push([absolutePath, relativePath, stats.size]);
      }
    }

    return filesToUpload;
  }

  async sync(
    onProgress: (progress: SyncProgress) => void
  ): Promise<SyncResult> {
    const files = await this.listFiles();
    const filesToUpload = await this.getFilesToUpload(files);

    const totalFiles = files.length;
    let fileCount = 0;
    let sizeUploaded = 0;
    let totalSize = 0;
    const uploadedFiles: string[] = [];

    // Calculate total size of files to upload
    for (const [, , size] of filesToUpload) {
      totalSize += size;
    }

    // Upload files one by one
    for (const [absolutePath, relativePath, size] of filesToUpload) {
      try {
        await this.gcpClient.uploadFile(absolutePath, relativePath);
        sizeUploaded += size;
        fileCount++;
        uploadedFiles.push(relativePath);

        onProgress({
          fileCount,
          totalFiles,
          sizeUploaded,
          totalSize,
        });
      } catch (error) {
        console.error(`Failed to upload ${relativePath}:`, error);
        // Continue with next file even if one fails
      }
    }

    return {
      uploadedFiles,
      totalFilesUploaded: fileCount,
    };
  }
}
