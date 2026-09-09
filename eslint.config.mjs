import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Keep legacy feed typing debt visible while strict tsc checks the build.
  // Runtime correctness rules stay blocking; explicit any is migration work.
  { rules: { "@typescript-eslint/no-explicit-any": "warn" } },
  // The standalone intel service runs as CommonJS (see intel/package.json).
  { files: ["intel/**/*.js"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
