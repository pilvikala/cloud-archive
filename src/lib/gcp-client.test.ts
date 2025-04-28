import { Storage, Bucket, FileMetadata } from "@google-cloud/storage";
import { GcpClient } from "./gcp-client";

// Mock the entire @google-cloud/storage module
jest.mock("@google-cloud/storage", () => {
  const mockUpload = jest.fn().mockResolvedValue([{}]);
  const mockGetFiles = jest
    .fn()
    .mockResolvedValue([[{ name: "file1.txt" }, { name: "file2.txt" }]]);
  const mockBucket = {
    upload: mockUpload,
    getFiles: mockGetFiles,
  };
  const mockStorage = {
    bucket: jest.fn().mockReturnValue(mockBucket),
  };
  return {
    Storage: jest.fn().mockImplementation(() => mockStorage),
    Bucket: jest.fn(),
  };
});

describe("GcpClient", () => {
  let gcpClient: GcpClient;
  const mockBucketName = "test-bucket";
  const mockFilePath = "/path/to/local/file.txt";
  const mockDestinationPath = "path/in/bucket/file.txt";

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Mock process.env
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/path/to/credentials.json";

    gcpClient = new GcpClient(mockBucketName);
  });

  describe("uploadFile", () => {
    it("should call bucket.upload with correct parameters", async () => {
      // Act
      await gcpClient.uploadFile(mockFilePath, mockDestinationPath);

      // Assert
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket(mockBucketName);

      expect(mockStorage.bucket).toHaveBeenCalledWith(mockBucketName);
      expect(mockBucket.upload).toHaveBeenCalledWith(mockFilePath, {
        destination: mockDestinationPath,
        metadata: {
          cacheControl: "public, max-age=31536000",
        },
      });
    });

    it("should throw error when upload fails", async () => {
      // Arrange
      const mockError = new Error("Upload failed");
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket(mockBucketName);
      (mockBucket.upload as jest.Mock).mockRejectedValueOnce(mockError);

      // Act & Assert
      await expect(
        gcpClient.uploadFile(mockFilePath, mockDestinationPath)
      ).rejects.toThrow("Upload failed");
    });
  });

  describe("listContent", () => {
    it("should return files with metadata from bucket", async () => {
      // Arrange
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
        id: "pilvikala-archive/Vánoční/Filmy/Bridget J/Bridget Jonesova S rozumem v koncich  CZ dabing  2004.avi/1745751502720618",
        kind: "storage#object",
        md5Hash: "h3B//Aa4tATSU1CPTIW+eg==",
        mediaLink:
          "https://storage.googleapis.com/download/storage/v1/b/pilvikala-archive/o/V%C3%A1no%C4%8Dn%C3%AD%2FFilmy%2FBridget%20J%2FBridget%20Jonesova%20S%20rozumem%20v%20koncich%20%20CZ%20dabing%20%202004.avi?generation=1745751502720618&alt=media",
        name: "Vánoční/Filmy/Bridget J/Bridget Jonesova S rozumem v koncich  CZ dabing  2004.avi",
        selfLink:
          "https://www.googleapis.com/storage/v1/b/pilvikala-archive/o/V%C3%A1no%C4%8Dn%C3%AD%2FFilmy%2FBridget%20J%2FBridget%20Jonesova%20S%20rozumem%20v%20koncich%20%20CZ%20dabing%20%202004.avi",
        size: "724254720",
        timeCreated: "2025-04-27T10:58:22.723Z",
        timeFinalized: "2025-04-27T10:58:22.723Z",
        updated: "2025-04-27T10:58:22.723Z",
      };

      const expectedFiles = [
        { ...file1, size: 0 },
        { ...file2, size: 724254720 },
      ];
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket(mockBucketName);
      (mockBucket.getFiles as jest.Mock).mockResolvedValueOnce([
        [{ metadata: file1 }, { metadata: file2 }],
      ]);

      // Act
      const result = await gcpClient.listContent(mockBucketName, mockPath);

      // Assert
      expect(mockStorage.bucket).toHaveBeenCalledWith(mockBucketName);
      expect(mockBucket.getFiles).toHaveBeenCalledWith({ prefix: mockPath });
      expect(result).toEqual(expectedFiles);
    });

    it("should throw error when listing fails", async () => {
      // Arrange
      const mockPath = "test/path";
      const mockError = new Error("List failed");
      const mockStorage = new Storage();
      const mockBucket = mockStorage.bucket(mockBucketName);
      (mockBucket.getFiles as jest.Mock).mockRejectedValueOnce(mockError);

      // Act & Assert
      await expect(
        gcpClient.listContent(mockBucketName, mockPath)
      ).rejects.toThrow("List failed");
    });
  });
});
