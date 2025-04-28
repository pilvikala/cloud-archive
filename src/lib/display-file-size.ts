export const displayFileSize = (size: number): string => {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    const kb = Math.round(size / 1024);
    return `${kb} KB`;
  }

  if (size < 1024 * 1024 * 1024) {
    const mb = Math.round(size / (1024 * 1024));
    return `${mb} MB`;
  }

  const gb = Math.round(size / (1024 * 1024 * 1024));
  return `${gb} GB`;
};
