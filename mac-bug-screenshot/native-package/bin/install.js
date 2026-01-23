#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const os = require("os");

const HOST_NAME = "com.sobbangcompany.mac_bug_screenshot";
const ROOT_DIR = path.resolve(__dirname, "..");
const TEMPLATE_PATH = path.join(ROOT_DIR, "manifest.template.json");
const HOST_PATH = path.join(ROOT_DIR, "host.js");
const WRAPPER_DIR = path.join(os.homedir(), ".mac-bug-screenshot");
const WRAPPER_PATH = path.join(WRAPPER_DIR, "native-host.sh");
const TARGET_DIR = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Google",
  "Chrome",
  "NativeMessagingHosts"
);
const TARGET_PATH = path.join(TARGET_DIR, `${HOST_NAME}.json`);

function printUsage() {
  console.log("사용법: mac-bug-screenshot-install <확장_프로그램_ID>");
}

function main() {
  const extensionId = process.argv[2];
  if (!extensionId) {
    printUsage();
    process.exit(1);
  }

  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const manifest = template
    .replace(/__HOST_PATH__/g, WRAPPER_PATH)
    .replace(/__EXTENSION_ID__/g, extensionId);

  if (!fs.existsSync(HOST_PATH)) {
    console.error("host.js를 찾을 수 없습니다:", HOST_PATH);
    process.exit(1);
  }

  fs.mkdirSync(WRAPPER_DIR, { recursive: true });
  const wrapperScript = [
    "#!/bin/sh",
    `NODE_PATH="${process.execPath}"`,
    `HOST_PATH="${HOST_PATH}"`,
    'exec "$NODE_PATH" "$HOST_PATH"'
  ].join("\n") + "\n";
  fs.writeFileSync(WRAPPER_PATH, wrapperScript);
  fs.chmodSync(WRAPPER_PATH, 0o755);

  fs.mkdirSync(TARGET_DIR, { recursive: true });
  fs.writeFileSync(TARGET_PATH, manifest);
  fs.chmodSync(HOST_PATH, 0o755);

  console.log("Native host 등록 완료:");
  console.log(TARGET_PATH);
}

main();
