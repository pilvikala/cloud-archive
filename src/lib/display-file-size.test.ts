import { displayFileSize } from "./display-file-size";

describe("displayFileSize", () => {
  it("should display bytes for sizes less than 1KB", () => {
    expect(displayFileSize(0)).toBe("0 B");
    expect(displayFileSize(1)).toBe("1 B");
    expect(displayFileSize(500)).toBe("500 B");
    expect(displayFileSize(999)).toBe("999 B");
  });

  it("should display kilobytes for sizes between 1KB and 1MB", () => {
    expect(displayFileSize(1024)).toBe("1 KB");
    expect(displayFileSize(1500)).toBe("1 KB");
  });

  it("should display megabytes for sizes between 1MB and 1GB", () => {
    expect(displayFileSize(1048576)).toBe("1 MB");
    expect(displayFileSize(300000)).toBe("293 KB");
    expect(displayFileSize(999999999)).toBe("954 MB");
    expect(displayFileSize(1000000000)).toBe("954 MB");
  });

  it("should display gigabytes for sizes 1GB and larger", () => {
    expect(displayFileSize(1073741824)).toBe("1 GB");
    expect(displayFileSize(1500000000)).toBe("1 GB");
    expect(displayFileSize(5000000000)).toBe("5 GB");
  });

  it("should handle large numbers correctly", () => {
    expect(displayFileSize(1000000000000)).toBe("931 GB");
    expect(displayFileSize(10000000000000)).toBe("9313 GB");
  });
});
