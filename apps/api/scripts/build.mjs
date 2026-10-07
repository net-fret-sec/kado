import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await build({
  entryPoints: { server: "src/server.ts", migrate: "scripts/migrate.ts" },
  outdir: "dist",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  packages: "external",
  plugins: [
    {
      name: "shared",
      setup(b) {
        b.onResolve({ filter: /^@kado\/shared$/ }, () => ({
          path: new URL(
            "../../../packages/shared/src/index.ts",
            import.meta.url,
          ).pathname,
        }));
      },
    },
  ],
});
await cp("src/workers", "dist/workers", { recursive: true });
await cp("migrations", "dist/migrations", { recursive: true });
