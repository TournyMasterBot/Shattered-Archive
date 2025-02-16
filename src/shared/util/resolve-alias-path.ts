import fs from "fs";
import path from "path";
import { parse } from "jsonc-parser";

/**
 * Resolves a TypeScript alias (e.g. "@shared/types/ability-types")
 * to its absolute path using the tsconfig.json "paths" mapping.
 */
async function ResolveAlias(aliasPath: string): Promise<string> {
  // Assume tsconfig.json is in the project root.
  const tsconfigPath = path.join(process.cwd(), "tsconfig.json");
  const tsconfigContent = fs.readFileSync(tsconfigPath, "utf8");
  // Use jsonc-parser to parse JSON with comments.
  const tsconfig = parse(tsconfigContent);

  const baseUrl: string = tsconfig.compilerOptions.baseUrl || ".";
  const pathsMapping: Record<string, string[]> = tsconfig.compilerOptions.paths || {};

  // Loop through each alias pattern in the mapping
  for (const alias in pathsMapping) {
    const targets = pathsMapping[alias];
    // Handle glob aliases like "@shared/*"
    if (alias.endsWith("/*")) {
      const aliasPrefix = alias.slice(0, -2); // e.g. "@shared"
      if (aliasPath.startsWith(aliasPrefix)) {
        // Use the first target for this alias
        let target = targets[0];
        if (target.endsWith("/*")) {
          target = target.slice(0, -2);
        }
        // Determine the rest of the path after the alias prefix
        const remainingPath = aliasPath.slice(aliasPrefix.length);
        // Resolve relative to baseUrl
        const absoluteTarget = path.resolve(process.cwd(), baseUrl, target);
        return path.join(absoluteTarget, remainingPath);
      }
    } else {
      // Non-glob alias mapping
      if (aliasPath === alias) {
        const target = targets[0];
        return path.resolve(process.cwd(), baseUrl, target);
      }
    }
  }

  // If no mapping is found, return the aliasPath unchanged.
  return aliasPath;
}

export default ResolveAlias;
