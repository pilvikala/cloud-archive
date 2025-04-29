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
    // Create a temporary directory for testing
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sync-test-"));

    // Create some test files
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

    // Create mock GcpClient
    mockGcpClient = new GcpClient(bucketName) as jest.Mocked<GcpClient>;
    mockGcpClient.uploadFile.mockResolvedValue(undefined);
    mockGcpClient.listContent.mockResolvedValue([]);
    // Add the bucketName property to the mock
    Object.defineProperty(mockGcpClient, "bucketName", {
      get: () => bucketName,
      configurable: true,
    });

    syncClient = new SyncClient(tempDir, destinationPath, mockGcpClient);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it("should upload all files when none exist in bucket", async () => {
    const progressCallback = jest.fn();

    const result = await syncClient.sync(progressCallback);

    // Verify the result
    expect(result.uploadedFiles).toHaveLength(3);
    expect(result.totalFilesUploaded).toBe(3);
    expect(result.uploadedFiles).toContain(
      path.join(destinationPath, "file1.txt")
    );
    expect(result.uploadedFiles).toContain(
      path.join(destinationPath, "file2.txt")
    );
    expect(result.uploadedFiles).toContain(
      path.join(destinationPath, "subdir/file3.txt")
    );

    // Verify uploadFile was called for each file with correct destination paths
    expect(mockGcpClient.uploadFile).toHaveBeenCalledTimes(3);
    expect(mockGcpClient.uploadFile).toHaveBeenCalledWith(
      path.join(tempDir, "file1.txt"),
      path.join(destinationPath, "file1.txt")
    );
    expect(mockGcpClient.listContent).toHaveBeenCalledTimes(1);
    expect(mockGcpClient.listContent).toHaveBeenCalledWith(
      bucketName,
      destinationPath
    );
  });

  it("should skip existing files with same size", async () => {
    // Mock existing files in bucket
    const file1Stats = await fs.promises.stat(path.join(tempDir, "file1.txt"));
    const file3Stats = await fs.promises.stat(
      path.join(tempDir, "subdir", "file3.txt")
    );

    mockGcpClient.listContent.mockResolvedValueOnce([
      { name: path.join(destinationPath, "file1.txt"), size: file1Stats.size },
      {
        name: path.join(destinationPath, "subdir/file3.txt"),
        size: file3Stats.size,
      },
    ]);

    const progressCallback = jest.fn();
    const result = await syncClient.sync(progressCallback);

    // Verify only file2.txt was uploaded
    expect(result.uploadedFiles).toHaveLength(1);
    expect(result.totalFilesUploaded).toBe(1);
    expect(result.uploadedFiles).toContain(
      path.join(destinationPath, "file2.txt")
    );

    // Verify uploadFile was called only once with correct destination path
    expect(mockGcpClient.uploadFile).toHaveBeenCalledTimes(1);
    expect(mockGcpClient.uploadFile).toHaveBeenCalledWith(
      path.join(tempDir, "file2.txt"),
      path.join(destinationPath, "file2.txt")
    );
  });

  it("should upload files with different sizes", async () => {
    // Mock existing files in bucket with different sizes
    const file1Stats = await fs.promises.stat(path.join(tempDir, "file1.txt"));
    mockGcpClient.listContent.mockResolvedValueOnce([
      {
        name: path.join(destinationPath, "file1.txt"),
        size: file1Stats.size + 1,
      }, // Different size
    ]);

    const progressCallback = jest.fn();
    const result = await syncClient.sync(progressCallback);

    // Verify file1.txt was uploaded again due to size difference
    expect(result.uploadedFiles).toContain(
      path.join(destinationPath, "file1.txt")
    );
    expect(mockGcpClient.uploadFile).toHaveBeenCalledWith(
      path.join(tempDir, "file1.txt"),
      path.join(destinationPath, "file1.txt")
    );
  });

  it("should handle upload failures gracefully", async () => {
    // Make one upload fail
    mockGcpClient.uploadFile.mockRejectedValueOnce(new Error("Upload failed"));

    const progressCallback = jest.fn();
    const result = await syncClient.sync(progressCallback);

    // Verify the result
    expect(result.uploadedFiles.length).toBeLessThan(3);
    expect(result.totalFilesUploaded).toBeLessThan(3);
    expect(mockGcpClient.uploadFile).toHaveBeenCalledTimes(3);
  });

  it("should correctly sync files to destination path", async () => {
    const progressCallback = jest.fn();
    const result = await syncClient.sync(progressCallback);

    // Verify all files are uploaded to the correct destination path
    expect(result.uploadedFiles).toHaveLength(3);
    expect(result.uploadedFiles).toEqual([
      path.join(destinationPath, "file1.txt"),
      path.join(destinationPath, "file2.txt"),
      path.join(destinationPath, "subdir/file3.txt"),
    ]);

    // Verify uploadFile was called with correct destination paths
    expect(mockGcpClient.uploadFile).toHaveBeenCalledWith(
      path.join(tempDir, "file1.txt"),
      path.join(destinationPath, "file1.txt")
    );
    expect(mockGcpClient.uploadFile).toHaveBeenCalledWith(
      path.join(tempDir, "file2.txt"),
      path.join(destinationPath, "file2.txt")
    );
    expect(mockGcpClient.uploadFile).toHaveBeenCalledWith(
      path.join(tempDir, "subdir/file3.txt"),
      path.join(destinationPath, "subdir/file3.txt")
    );

    // Verify listContent was called with the correct destination path
    expect(mockGcpClient.listContent).toHaveBeenCalledWith(
      bucketName,
      destinationPath
    );
  });
});
