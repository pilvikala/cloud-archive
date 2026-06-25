import { SyncClient } from "./sync-client";
import { GcpClient } from "./gcp-client";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

jest.mock("./gcp-client");

describe("SyncClient", () => {
  let syncClient: SyncClient;
  let mockGcpClient: jest.Mocked<GcpClient>;
  let tempDir: string;
  const destinationPath = "backups/2024";
  const bucketName = "test-bucket";

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sync-test-"));

    await fs.promises.mkdir(path.join(tempDir, "subdir"));
    await fs.promises.writeFile(
      path.join(tempDir, "file1.txt"),
      "test content 1"
    );
    await fs.promises.writeFile(
      path.join(tempDir, "file2.txt"),
      "test content 2"
    );
    await fs.promises.writeFile(
      path.join(tempDir, "subdir", "file3.txt"),
      "test content 3"
    );

    mockGcpClient = new GcpClient(bucketName) as jest.Mocked<GcpClient>;
    mockGcpClient.uploadFile.mockResolvedValue(undefined);
    mockGcpClient.listContent.mockResolvedValue([]);
    Object.defineProperty(mockGcpClient, "bucketName", {
      get: () => bucketName,
      configurable: true,
    });

    syncClient = new SyncClient(tempDir, destinationPath, mockGcpClient);
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it("should upload all files when none exist in bucket", async () => {
    const progressCallback = jest.fn();

    const result = await syncClient.sync(progressCallback);

    expect(result.uploadedFiles).toHaveLength(3);
    expect(result.totalFilesUploaded).toBe(3);
    expect(result.uploadedFiles).toContain(
      path.join(destinationPath, "file1.txt").replace(/\\/g, "/")
    );
    expect(result.uploadedFiles).toContain(
      path.join(destinationPath, "file2.txt").replace(/\\/g, "/")
    );
    expect(result.uploadedFiles).toContain(
      path.join(destinationPath, "subdir/file3.txt").replace(/\\/g, "/")
    );

    expect(mockGcpClient.uploadFile).toHaveBeenCalledTimes(3);
    expect(mockGcpClient.uploadFile).toHaveBeenCalledWith(
      path.join(tempDir, "file1.txt"),
      path.join(destinationPath, "file1.txt").replace(/\\/g, "/"),
      expect.any(Function)
    );
    expect(mockGcpClient.listContent).toHaveBeenCalledTimes(1);
    expect(mockGcpClient.listContent).toHaveBeenCalledWith(
      bucketName,
      destinationPath
    );
  });

  it("should skip existing files with same size", async () => {
    const file1Stats = await fs.promises.stat(path.join(tempDir, "file1.txt"));
    const file3Stats = await fs.promises.stat(
      path.join(tempDir, "subdir", "file3.txt")
    );

    mockGcpClient.listContent.mockResolvedValueOnce([
      { name: path.join(destinationPath, "file1.txt").replace(/\\/g, "/"), size: file1Stats.size },
      {
        name: path.join(destinationPath, "subdir/file3.txt").replace(/\\/g, "/"),
        size: file3Stats.size,
      },
    ]);

    const progressCallback = jest.fn();
    const result = await syncClient.sync(progressCallback);

    expect(result.uploadedFiles).toHaveLength(1);
    expect(result.totalFilesUploaded).toBe(1);
    expect(result.uploadedFiles).toContain(
      path.join(destinationPath, "file2.txt").replace(/\\/g, "/")
    );

    expect(mockGcpClient.uploadFile).toHaveBeenCalledTimes(1);
    expect(mockGcpClient.uploadFile).toHaveBeenCalledWith(
      path.join(tempDir, "file2.txt"),
      path.join(destinationPath, "file2.txt").replace(/\\/g, "/"),
      expect.any(Function)
    );
  });

  it("should upload files with different sizes", async () => {
    const file1Stats = await fs.promises.stat(path.join(tempDir, "file1.txt"));
    mockGcpClient.listContent.mockResolvedValueOnce([
      {
        name: path.join(destinationPath, "file1.txt"),
        size: file1Stats.size + 1,
      },
    ]);

    const progressCallback = jest.fn();
    const result = await syncClient.sync(progressCallback);

    expect(result.uploadedFiles).toContain(
      path.join(destinationPath, "file1.txt").replace(/\\/g, "/")
    );
    expect(mockGcpClient.uploadFile).toHaveBeenCalledWith(
      path.join(tempDir, "file1.txt"),
      path.join(destinationPath, "file1.txt").replace(/\\/g, "/"),
      expect.any(Function)
    );
  });

  it("should re-upload a file with smaller remote size (interrupted upload)", async () => {
    const file1Stats = await fs.promises.stat(path.join(tempDir, "file1.txt"));

    // Remote has partial upload (smaller size than local)
    mockGcpClient.listContent.mockResolvedValueOnce([
      {
        name: path.join(destinationPath, "file1.txt").replace(/\\/g, "/"),
        size: Math.floor(file1Stats.size / 2),
      },
    ]);

    const progressCallback = jest.fn();
    const result = await syncClient.sync(progressCallback);

    expect(result.uploadedFiles).toContain(
      path.join(destinationPath, "file1.txt").replace(/\\/g, "/")
    );
    expect(mockGcpClient.uploadFile).toHaveBeenCalledWith(
      path.join(tempDir, "file1.txt"),
      path.join(destinationPath, "file1.txt").replace(/\\/g, "/"),
      expect.any(Function)
    );
  });

  it("should handle upload failures gracefully", async () => {
    mockGcpClient.uploadFile.mockRejectedValueOnce(new Error("Upload failed"));

    const progressCallback = jest.fn();
    const result = await syncClient.sync(progressCallback);

    expect(result.uploadedFiles.length).toBeLessThan(3);
    expect(result.totalFilesUploaded).toBeLessThan(3);
    expect(mockGcpClient.uploadFile).toHaveBeenCalledTimes(3);
  });

  it("should correctly sync files to destination path", async () => {
    const progressCallback = jest.fn();
    const result = await syncClient.sync(progressCallback);

    expect(result.uploadedFiles).toHaveLength(3);
    expect(result.uploadedFiles).toEqual([
      path.join(destinationPath, "file1.txt").replace(/\\/g, "/"),
      path.join(destinationPath, "file2.txt").replace(/\\/g, "/"),
      path.join(destinationPath, "subdir/file3.txt").replace(/\\/g, "/"),
    ]);

    expect(mockGcpClient.uploadFile).toHaveBeenCalledWith(
      path.join(tempDir, "file1.txt"),
      path.join(destinationPath, "file1.txt").replace(/\\/g, "/"),
      expect.any(Function)
    );
    expect(mockGcpClient.uploadFile).toHaveBeenCalledWith(
      path.join(tempDir, "file2.txt"),
      path.join(destinationPath, "file2.txt").replace(/\\/g, "/"),
      expect.any(Function)
    );
    expect(mockGcpClient.uploadFile).toHaveBeenCalledWith(
      path.join(tempDir, "subdir/file3.txt"),
      path.join(destinationPath, "subdir/file3.txt").replace(/\\/g, "/"),
      expect.any(Function)
    );

    expect(mockGcpClient.listContent).toHaveBeenCalledWith(
      bucketName,
      destinationPath
    );
  });

  it("should report per-file upload progress through the sync progress callback", async () => {
    // Make uploadFile invoke the onProgress callback to simulate in-flight progress
    mockGcpClient.uploadFile.mockImplementation(
      async (_absolutePath: string, _dest: string, onProgress?: (b: number, total: number) => void) => {
        onProgress?.(512, 1024);
        onProgress?.(1024, 1024);
      }
    );

    const progressMessages: string[] = [];
    await syncClient.sync((msg) => progressMessages.push(msg));

    // Should contain at least one progress message with percentage
    const progressLines = progressMessages.filter((m) => m.includes("%"));
    expect(progressLines.length).toBeGreaterThan(0);

    // 50% progress message
    expect(progressLines.some((m) => m.includes("50%"))).toBe(true);
    // 100% progress message
    expect(progressLines.some((m) => m.includes("100%"))).toBe(true);
  });

  it("should return paths with forward slashes even on Windows", async () => {
    const nestedDir = path.join(tempDir, "nested", "deep", "dir");
    await fs.promises.mkdir(nestedDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(nestedDir, "test.txt"),
      "test content"
    );

    const files = await (syncClient as any).listFiles();

    const nestedFilePath = files.find(([_, path]: [string, string]) => path.includes("test.txt"))?.[1];

    expect(nestedFilePath).not.toContain("\\");
    expect(nestedFilePath).toContain("/");
    expect(nestedFilePath).toBe("nested/deep/dir/test.txt");
  });
});
