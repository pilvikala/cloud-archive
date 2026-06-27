# Cloud Archiver

This is a CLI tool that syncs a local folder to your GCP bucket.

Check out the [Cloud Archive UI](https://github.com/pilvikala/cloud-archive-ui) project for an app to share the contents of your archive bucket with your family easily.

## Configuration

In GCP Console, create a new Bucket.

Create a new Service Account and give it read and write access to the bucket.

Generate a new JSON key for the service account and download it locally.
Export the path to the JSON key to the GOOGLE_APPLICATION_CREDENTIALS environment variable like this:

```
export GOOGLE_APPLICATION_CREDENTIALS=service-account-key.json
```

Test that the connection works (replace `bucket_name` with the name of your bucket)

```shell
cloud-archive list bucket_name
```

## Usage

Usage: cloud-archive [options] [command]

A CLI tool for cloud operations

Options:
-V, --version output the version number
-h, --help display help for command

Commands:
upload <bucket> <filePath> <destinationPath> Upload a file to Google Cloud Storage
list <bucket> [path] List files in the bucket
sync <bucket> <path> Sync folder with the bucket
help [command] display help for command

## Release builds

During builds, `src/version.ts` is now updated automatically from the Git tag on `HEAD`.

- `npm run build:release` requires a tag and fails if none is found.
- Existing `build:*` scripts try to read the tag and continue without changing the version when no tag exists.

Tag sources are checked in this order: `--tag`, `TAG_NAME`, `GITHUB_REF_NAME`, `CI_COMMIT_TAG`, `GITHUB_REF`, then tags pointing at `HEAD`.

GitHub Actions release builds (tag pushes matching `v1.*`) use `npm run build:release`.
