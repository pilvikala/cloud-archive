import { Storage } from "@google-cloud/storage";
import { JWT } from "google-auth-library";
import { Readable } from "stream";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

function formatGcpError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const e = error as any;
  const lines: string[] = [`${error.constructor.name}: ${error.message}`];
  if (e.code) lines.push(`  code: ${e.code}`);
  if (e.config?.url) lines.push(`  url: ${e.config.url}`);
  if (e.response?.status) lines.push(`  http status: ${e.response.status}`);
  if (e.error instanceof Error) {
    lines.push(`  caused by: ${e.error.constructor.name}: ${e.error.message}`);
    const inner = e.error as any;
    if (inner.code) lines.push(`    code: ${inner.code}`);
    if (inner.errno) lines.push(`    errno: ${inner.errno}`);
  }
  return lines.join("\n");
}

// Build a JWT auth client whose transporter uses native fetch instead of
// gaxios → node-fetch v2 (which has broken gzip decompression on Node 18+).
function buildAuthClient(credentialsPath: string): JWT {
  const key = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  const auth = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ["https://www.googleapis.com/auth/devstorage.full_control"],
  });

  // Replace the transporter so all HTTP requests (token fetches and GCS API
  // calls) go through native fetch, bypassing node-fetch v2's broken gzip
  // decompression pipeline (ERR_STREAM_PREMATURE_CLOSE on Node 18+).
  (auth as any).transporter = {
    request: async (opts: any) => {
      // Build URL with query params (gaxios opts.params → URL query string)
      let url = String(opts.url ?? "");
      if (opts.params && typeof opts.params === "object") {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(
          opts.params as Record<string, unknown>
        )) {
          if (v != null) params.append(k, String(v));
        }
        const qs = params.toString();
        if (qs) url += (url.includes("?") ? "&" : "?") + qs;
      }

      // Build request body
      let body: BodyInit | null = null;
      let isStream = false;
      const contentType: string = opts.headers?.["Content-Type"] ?? "";

      if (opts.body != null) {
        if (opts.body instanceof Readable) {
          // Node.js Readable → Web ReadableStream (required by native fetch)
          body = Readable.toWeb(opts.body) as unknown as BodyInit;
          isStream = true;
        } else {
          body = opts.body as BodyInit;
        }
      } else if (opts.data != null) {
        if (typeof opts.data === "string") {
          body = opts.data;
        } else if (contentType.toLowerCase().includes("x-www-form-urlencoded")) {
          body = new URLSearchParams(
            opts.data as Record<string, string>
          ).toString();
        } else {
          // Default to JSON for object bodies (gaxios behaviour)
          body = JSON.stringify(opts.data);
          opts.headers = { "Content-Type": "application/json", ...opts.headers };
        }
      }

      const fetchOpts: RequestInit = {
        method: opts.method ?? "GET",
        headers: opts.headers ?? {},
        body: body ?? undefined,
      };
      // Streaming bodies require the non-standard duplex option in Node's fetch
      if (isStream) (fetchOpts as any).duplex = "half";

      const res = await globalThis.fetch(url, fetchOpts);

      // Parse response body based on content-type
      const resContentType = res.headers.get("content-type") ?? "";
      let data: unknown;
      try {
        data = resContentType.includes("application/json")
          ? await res.json()
          : await res.text();
      } catch {
        data = null;
      }

      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });

      return { data, status: res.status, statusText: res.statusText, headers, config: opts, request: {} };
    },
  } as any;

  return auth;
}

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
  public bucketName: string;

  constructor(bucketName: string) {
    const credentialsPath = this.checkCredentials();
    const authClient =
      process.env.NODE_ENV !== "test"
        ? buildAuthClient(credentialsPath)
        : undefined;
    this.storage = new Storage({ authClient });
    this.bucketName = bucketName;
  }

  private checkCredentials(): string {
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

    return credentialsPath;
  }

  async uploadFile(
    filePath: string,
    destinationPath: string,
    onProgress?: (bytesUploaded: number, totalBytes: number) => void
  ): Promise<void> {
    const normalizedDestinationPath = destinationPath.replace(/\\/g, "/");
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(normalizedDestinationPath);
    const totalBytes = fs.statSync(filePath).size;

    await new Promise<void>((resolve, reject) => {
      const writeStream = file.createWriteStream({
        resumable: true,
        metadata: {
          cacheControl: "public, max-age=31536000",
        },
      });

      const readStream = fs.createReadStream(filePath);
      let bytesUploaded = 0;

      readStream.on("data", (chunk: string | Buffer) => {
        bytesUploaded += chunk.length;
        onProgress?.(bytesUploaded, totalBytes);
      });

      readStream.pipe(writeStream);
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
      readStream.on("error", reject);
    });

    console.log(
      `File ${filePath} uploaded to gs://${this.bucketName}/${normalizedDestinationPath}`
    );
  }

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
      console.error("Error listing content:\n" + formatGcpError(error));
      throw error;
    }
  }
}
