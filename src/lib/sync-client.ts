import { GcpClient } from "./gcp-client";
import * as fs from "fs";
import * as path from "path";
import { displayFileSize } from "./display-file-size";

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
  private destinationPath: string;
  private gcpClient: GcpClient;

  constructor(
    localPath: string,
    destinationPath: string,
    gcpClient: GcpClient
  ) {
    this.localPath = localPath;
    this.destinationPath = destinationPath;
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
    console.log("Checking target bucket");
    const existingFiles = await this.gcpClient.listContent(
      this.gcpClient.bucketName,
      this.destinationPath
    );
    const existingFilesMap = new Map(
      existingFiles.map((file) => [file.name, file.size])
    );

    const filesToUpload: [string, string, number][] = [];

    for (const [absolutePath, relativePath] of files) {
      const stats = await fs.promises.stat(absolutePath);
      const destinationPath = path.join(this.destinationPath, relativePath);
      const existingSize = existingFilesMap.get(destinationPath);

      if (!existingSize || existingSize !== stats.size) {
        filesToUpload.push([absolutePath, destinationPath, stats.size]);
      }
    }

    return filesToUpload;
  }

  async sync(
    onProgress: (progress: SyncProgress) => void
  ): Promise<SyncResult> {
    console.log("Getting the list of files...");
    const files = await this.listFiles();
    const filesToUpload = await this.getFilesToUpload(files);
    const totalFiles = filesToUpload.length;
    let fileCount = 0;
    let sizeUploaded = 0;
    let totalSize = 0;
    const uploadedFiles: string[] = [];

    // Calculate total size of files to upload
    for (const [, , size] of filesToUpload) {
      totalSize += size;
    }
    console.log(
      `Will upload ${filesToUpload.length} files, total size ${displayFileSize(
        totalSize
      )}`
    );
    console.log("Starting upload");
    // Upload files one by one
    for (const [absolutePath, destinationPath, size] of filesToUpload) {
      try {
        await this.gcpClient.uploadFile(absolutePath, destinationPath);
        sizeUploaded += size;
        fileCount++;
        uploadedFiles.push(destinationPath);

        onProgress({
          fileCount,
          totalFiles,
          sizeUploaded,
          totalSize,
        });
      } catch (error) {
        console.error(`Failed to upload ${destinationPath}:`, error);
        // Continue with next file even if one fails
      }
    }

    return {
      uploadedFiles,
      totalFilesUploaded: fileCount,
    };
  }
}
