import "dotenv/config";
import { validateLegalDirectory } from "../src/services/legal-content.service";

async function main() {
  const args = process.argv.slice(2);
  const directory =
    args.find((arg) => !arg.startsWith("--")) ?? process.env.LEGAL_CONTENT_DIR;
  if (
    !directory ||
    args.some((arg) => arg.startsWith("--") && arg !== "--published")
  )
    throw new Error(
      "Usage: pnpm --dir apps/api legal:validate /path/to/legal [--published]",
    );
  await validateLegalDirectory(directory, args.includes("--published"));
  console.log("Validated both legal documents in all three languages.");
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Validation failed.");
  process.exitCode = 1;
});
