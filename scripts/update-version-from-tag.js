#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const args = process.argv.slice(2);
const required = args.includes("--required");

function readArgValue(flag) {
  const index = args.findIndex((arg) => arg === flag || arg.startsWith(`${flag}=`));
  if (index === -1) {
    return "";
  }

  const valueFromEquals = args[index].split("=")[1];
  if (valueFromEquals) {
    return valueFromEquals;
  }

  return args[index + 1] || "";
}

function normalizeTag(rawTag) {
  if (!rawTag) {
    return "";
  }

  let tag = rawTag.trim();
  if (tag.startsWith("refs/tags/")) {
    tag = tag.slice("refs/tags/".length);
  }

  return tag;
}

function getTagFromGit() {
  try {
    const tags = execSync("git tag --points-at HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    })
      .split("\n")
      .map((tag) => tag.trim())
      .filter(Boolean);

    return tags[0] || "";
  } catch {
    return "";
  }
}

function resolveTag() {
  const fromArg = readArgValue("--tag");
  const fromEnv =
    process.env.TAG_NAME ||
    process.env.GITHUB_REF_NAME ||
    process.env.CI_COMMIT_TAG ||
    process.env.GITHUB_REF ||
    "";
  const fromGit = getTagFromGit();

  return normalizeTag(fromArg || fromEnv || fromGit);
}

function main() {
  const tag = resolveTag();

  if (!tag) {
    const message = "No release tag found. Checked --tag, TAG_NAME, GITHUB_REF_NAME, CI_COMMIT_TAG, GITHUB_REF, and tags on HEAD.";

    if (required) {
      console.error(message);
      process.exit(1);
    }

    console.log(`${message} Skipping version.ts update.`);
    return;
  }

  const targetFile = path.resolve(__dirname, "..", "src", "version.ts");
  const nextContent = `export const version = ${JSON.stringify(tag)};\n`;

  let currentContent = "";
  if (fs.existsSync(targetFile)) {
    currentContent = fs.readFileSync(targetFile, "utf8");
  }

  if (currentContent === nextContent) {
    console.log(`version.ts is already up to date (${tag}).`);
    return;
  }

  fs.writeFileSync(targetFile, nextContent, "utf8");
  console.log(`Updated src/version.ts to ${tag}.`);
}

main();
