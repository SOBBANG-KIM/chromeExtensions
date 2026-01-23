#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

const DEFAULT_OUTPUT_DIR = path.join(os.homedir(), "Desktop", "mac-bug-screenshot");

function expandHome(input) {
  if (!input) {
    return input;
  }
  const home = os.homedir();
  return input
    .replace(/^~(?=\/|$)/, home)
    .replace(/\$HOME/g, home);
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function runCommandDetailed(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function runCommandOutput(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function openInPreview(filePath) {
  const script = [
    'tell application "Preview"',
    "activate",
    `open POSIX file "${filePath}"`,
    "end tell"
  ].join("\n");

  try {
    await runAppleScript(script);
    return;
  } catch (error) {
    // fallback to open command below
  }

  try {
    await runCommandDetailed("open", ["-a", "Preview", filePath]);
  } catch (error) {
    await sleep(300);
    await runCommandDetailed("open", ["-n", "-a", "Preview", filePath]);
  }
}

async function setPreviewActualSize() {
  const script = [
    'tell application "Preview"',
    "activate",
    "delay 0.2",
    "tell application \"System Events\" to tell process \"Preview\"",
    "if exists (menu bar 1) then",
    "click menu item \"Actual Size\" of menu 1 of menu item \"Zoom\" of menu 1 of menu bar 1",
    "end if",
    "end tell",
    "end tell"
  ].join("\n");

  try {
    await runAppleScript(script);
  } catch (error) {
    // Ignore AppleScript failures (permission or menu layout).
  }
}

async function readImageSize(filePath) {
  try {
    const output = await runCommandOutput("sips", ["-g", "pixelWidth", "-g", "pixelHeight", filePath]);
    const widthMatch = output.match(/pixelWidth:\s+(\d+)/);
    const heightMatch = output.match(/pixelHeight:\s+(\d+)/);
    if (!widthMatch || !heightMatch) {
      return null;
    }
    return {
      width: Number(widthMatch[1]),
      height: Number(heightMatch[1])
    };
  } catch (error) {
    return null;
  }
}

async function capture(outputDir, mode = "region") {
  const resolvedDir = expandHome(outputDir || DEFAULT_OUTPUT_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(resolvedDir, `screenshot-${timestamp}.png`);

  await fs.promises.mkdir(resolvedDir, { recursive: true });
  await sleep(300);
  const captureArgs = mode === "full"
    ? ["-x", "-t", "png", outputPath]
    : ["-i", "-s", "-t", "png", outputPath];
  try {
    await runCommandDetailed("screencapture", captureArgs);
  } catch (error) {
    await sleep(300);
    await runCommandDetailed("screencapture", captureArgs);
  }
  if (!fs.existsSync(outputPath)) {
    throw new Error("캡처가 취소되었습니다.");
  }
  const dimensions = await readImageSize(outputPath);
  await openInPreview(outputPath);
  await sleep(200);
  await setPreviewActualSize();

  return { outputPath, dimensions };
}

function writeMessage(message) {
  const json = JSON.stringify(message);
  const buffer = Buffer.from(json, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(buffer.length, 0);
  process.stdout.write(Buffer.concat([length, buffer]));
}

function readMessage() {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);

    function onData(chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4) {
        return;
      }

      const length = buffer.readUInt32LE(0);
      if (buffer.length < 4 + length) {
        return;
      }

      const messageBuffer = buffer.subarray(4, 4 + length);
      process.stdin.removeListener("data", onData);
      try {
        resolve(JSON.parse(messageBuffer.toString("utf8")));
      } catch (error) {
        reject(error);
      }
    }

    process.stdin.on("data", onData);
    process.stdin.on("error", reject);
  });
}

async function main() {
  try {
    const message = await readMessage();
    if (!message || message.action !== "capture") {
      writeMessage({ ok: false, error: "지원하지 않는 요청입니다." });
      return;
    }

    const result = await capture(message.outputDir, message.mode);
    writeMessage({ ok: true, outputPath: result.outputPath, dimensions: result.dimensions });
  } catch (error) {
    writeMessage({ ok: false, error: error.message });
  } finally {
    setImmediate(() => process.exit(0));
  }
}

main();
