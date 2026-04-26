import { spawnSync } from "node:child_process";
import { cp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = path.join(rootDir, "tmp-agent-parser-check");
const distDir = path.join(tempDir, "dist");
const tscBin = path.join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
const compileCommand = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : tscBin;
const compileArgs =
  process.platform === "win32"
    ? ["/c", tscBin, "-p", path.join(tempDir, "tsconfig.json")]
    : ["-p", path.join(tempDir, "tsconfig.json")];

await rm(tempDir, { force: true, recursive: true });
await mkdir(tempDir, { recursive: true });

await writeFile(
  path.join(tempDir, "tsconfig.json"),
  JSON.stringify(
    {
      compilerOptions: {
        baseUrl: "..",
        esModuleInterop: true,
        module: "CommonJS",
        moduleResolution: "Node",
        outDir: "dist",
        paths: {
          "@/*": ["./*"],
        },
        resolveJsonModule: true,
        rootDir: "..",
        skipLibCheck: true,
        strict: true,
        target: "ES2022",
        types: ["node"],
      },
      include: ["../tests/agent-parser-fixture.ts", "../lib/agent/**/*.ts"],
    },
    null,
    2,
  ),
);

const compileResult = spawnSync(compileCommand, compileArgs, {
  cwd: rootDir,
  stdio: "inherit",
});

if (compileResult.error) {
  console.error(compileResult.error);
}

if (compileResult.status !== 0) {
  process.exit(compileResult.status ?? 1);
}

await mkdir(path.join(distDir, "node_modules", "@"), { recursive: true });

try {
  await symlink(path.join(distDir, "lib"), path.join(distDir, "node_modules", "@", "lib"), "junction");
} catch {
  await cp(path.join(distDir, "lib"), path.join(distDir, "node_modules", "@", "lib"), { recursive: true });
}

const testResult = spawnSync(process.execPath, [path.join(distDir, "tests", "agent-parser-fixture.js")], {
  cwd: rootDir,
  stdio: "inherit",
});

if (testResult.status === 0) {
  await rm(tempDir, { force: true, recursive: true });
}

process.exit(testResult.status ?? 1);
