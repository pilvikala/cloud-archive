import { Storage, FileMetadata } from "@google-cloud/storage";
import { GcpClient } from "./gcp-client";
import { PassThrough } from "stream";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const MockStorage = Storage as jest.MockedClass<typeof Storage>;

jest.mock("@google-cloud/storage");

describe("GcpClient", () => {
  let gcpClient: GcpClient;
  let mockWriteStream: PassThrough;
  let mockFile: { createWriteStream: jest.Mock };
  let mockBucket: { file: jest.Mock; getFiles: jest.Mock };
  let tempDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/fake/credentials.json";
    process.env.NODE_ENV = "test";

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gcp-test-"));

    mockWriteStream = new PassThrough();
    mockFile = { createWriteStream: jest.fn().mockReturnValue(mockWriteStream) };
    mockBucket = {
      file: jest.fn().mockReturnValue(mockFile),
      getFiles: jest.fn().mockResolvedValue([[]]),
    };

    MockStorage.prototype.bucket = jest.fn().mockReturnValue(mockBucket);

    gcpClient = new GcpClient("test-bucket");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("uploadFile", () => {
    it("should upload file using a resumable write stream to the correct destination", async () => {
      const testFile = path.join(tempDir, "test.txt");
      fs.writeFileSync(testFile, "Hello World");

      await gcpClient.uploadFile(testFile, "bucket/dest.txt");

      expect(mockBucket.file).toHaveBeenCalledWith("bucket/dest.txt");
      expect(mockFile.createWriteStream).toHaveBeenCalledWith(
        expect.objectContaining({
          resumable: true,
          metadata: { cacheControl: "public, max-age=31536000" },
        })
      );
    });

    it("should normalize Windows-style paths to use forward slashes", async () => {
      const testFile = path.join(tempDir, "test.txt");
      fs.writeFileSync(testFile, "content");

      await gcpClient.uploadFile(testFile, "path\\to\\file.txt");

      expect(mockBucket.file).toHaveBeenCalledWith("path/to/file.txt");
    });

    it("should handle paths with mixed separators", async () => {
      const testFile = path.join(tempDir, "test.txt");
      fs.writeFileSync(testFile, "content");

      await gcpClient.uploadFile(testFile, "path\\to/bucket\\file.txt");

      expect(mockBucket.file).toHaveBeenCalledWith("path/to/bucket/file.txt");
    });

    it("should call onProgress callback with cumulative bytes and total during upload", async () => {
      const content = "Hello World Test Content For Progress Tracking";
      const testFile = path.join(tempDir, "test.txt");
      fs.writeFileSync(testFile, content);
      const totalBytes = fs.statSync(testFile).size;

      const progressCallback = jest.fn();
      await gcpClient.uploadFile(testFile, "dest.txt", progressCallback);

      expect(progressCallback).toHaveBeenCalled();
      const calls = progressCallback.mock.calls;
      // Each call: (bytesUploaded, totalBytes)
      calls.forEach(([uploaded, total]) => {
        expect(total).toBe(totalBytes);
        expect(uploaded).toBeGreaterThan(0);
        expect(uploaded).toBeLessThanOrEqual(totalBytes);
      });
      // Final call should report all bytes uploaded
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toBe(totalBytes);
    });

    it("should succeed without an onProgress callback", async () => {
      const testFile = path.join(tempDir, "test.txt");
      fs.writeFileSync(testFile, "content");

      await expect(gcpClient.uploadFile(testFile, "dest.txt")).resolves.toBeUndefined();
    });

    it("should reject when the write stream emits an error", async () => {
      const testFile = path.join(tempDir, "test.txt");
      fs.writeFileSync(testFile, "content");

      const uploadPromise = gcpClient.uploadFile(testFile, "dest.txt");

      // Allow piping to start before injecting the error
      await new Promise((r) => process.nextTick(r));
      mockWriteStream.destroy(new Error("GCS write error"));

      await expect(uploadPromise).rejects.toThrow("GCS write error");
    });
  });

  describe("listContent", () => {
    it("should return files with metadata from bucket", async () => {
      const mockPath = "test/path";
      const file1: FileMetadata = {
        bucket: "pilvikala-archive",
        contentType: "text/plain",
        id: "pilvikala-archive/Vánoční//1745748387190283",
        kind: "storage#object",
        md5Hash: "1B2M2Y8AsgTpgAmY7PhCfg==",
        mediaLink:
          "https://storage.googleapis.com/download/storage/v1/b/pilvikala-archive/o/V%C3%A1no%C4%8Dn%C3%AD%2F?generation=1745748387190283&alt=media",
        name: "Vánoční/",
        selfLink:
          "https://www.googleapis.com/storage/v1/b/pilvikala-archive/o/V%C3%A1no%C4%8Dn%C3%AD%2F",
        size: "0",
        timeCreated: "2025-04-27T10:06:27.191Z",
        timeFinalized: "2025-04-27T10:06:27.191Z",
        updated: "2025-04-27T10:06:27.191Z",
      };
      const file2: FileMetadata = {
        bucket: "pilvikala-archive",
        contentType: "video/avi",
        id: "pilvikala-archive/Vánoční/Filmy/Bridget J/file.avi/1745751502720618",
        kind: "storage#object",
        md5Hash: "h3B//Aa4tATSU1CPTIW+eg==",
        mediaLink: "https://storage.googleapis.com/...",
        name: "Vánoční/Filmy/Bridget J/file.avi",
        selfLink: "https://www.googleapis.com/storage/v1/b/...",
        size: "724254720",
        timeCreated: "2025-04-27T10:58:22.723Z",
        timeFinalized: "2025-04-27T10:58:22.723Z",
        updated: "2025-04-27T10:58:22.723Z",
      };
      const expectedFiles = [
        { ...file1, size: 0 },
        { ...file2, size: 724254720 },
      ];
      mockBucket.getFiles.mockResolvedValueOnce([
        [{ metadata: file1 }, { metadata: file2 }],
      ]);

      const result = await gcpClient.listContent("test-bucket", mockPath);

      expect(mockBucket.getFiles).toHaveBeenCalledWith({ prefix: mockPath });
      expect(result).toEqual(expectedFiles);
    });

    it("should throw error when listing fails", async () => {
      mockBucket.getFiles.mockRejectedValueOnce(new Error("List failed"));

      await expect(gcpClient.listContent("test-bucket", "test/path")).rejects.toThrow(
        "List failed"
      );
    });
  });
});
