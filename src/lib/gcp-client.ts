import { Storage } from "@google-cloud/storage";
import * as dotenv from "dotenv";
import * as fs from "fs";

dotenv.config();

export interface FileMetadata {
  bucket?: string;
  contentType?: string;
  id?: string;
  kind?: string;
  md5Hash?: string;
  name?: string;
  size: number;
  selfLink?: string;
  timeCreated?: string;
  updated?: string;
}

export class GcpClient {
  private storage: Storage;
  private bucketName: string;

  constructor(bucketName: string) {
    this.checkCredentials();
    this.storage = new Storage();
    this.bucketName = bucketName;
  }

  private checkCredentials(): void {
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (!credentialsPath) {
      throw new Error(
        "GOOGLE_APPLICATION_CREDENTIALS environment variable is not set. " +
          "Please set it to the path of your service account key file."
      );
    }

    if (process.env.NODE_ENV !== "test" && !fs.existsSync(credentialsPath)) {
      throw new Error(
        `Credentials file not found at ${credentialsPath}. ` +
          "Please check the GOOGLE_APPLICATION_CREDENTIALS environment variable."
      );
    }
  }

  /**
   * Uploads a file to Google Cloud Storage
   * @param filePath Local path to the file to upload
   * @param destinationPath Path in the bucket where the file should be stored
   * @returns Promise that resolves when the upload is complete
   */
  async uploadFile(filePath: string, destinationPath: string): Promise<void> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      await bucket.upload(filePath, {
        destination: destinationPath,
        metadata: {
          cacheControl: "public, max-age=31536000",
        },
      });
      console.log(
        `File ${filePath} uploaded to gs://${this.bucketName}/${destinationPath}`
      );
    } catch (error) {
      console.error("Error uploading file:", error);
      throw error;
    }
  }

  /**
   * Lists content in a specified path within the bucket
   * @param bucketName Name of the bucket to list content from
   * @param path Path within the bucket to list content from
   * @returns Promise that resolves to a list of strings representing the content
   */
  async listContent(bucketName: string, path: string): Promise<FileMetadata[]> {
    try {
      const bucket = this.storage.bucket(bucketName);
      const [files] = await bucket.getFiles({ prefix: path });
      return files.map((file) => {
        return {
          ...file.metadata,
          size: file.metadata.size
            ? parseInt(file.metadata.size.toString())
            : 0,
        };
      });
    } catch (error) {
      console.error("Error listing content:", error);
      throw error;
    }
  }
}
