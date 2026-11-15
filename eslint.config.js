import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

const maxLines = { max: 800, skipBlankLines: true, skipComments: true };

const legacyOversized = [
  "src/App.tsx",
  "src/components/Scene3D.tsx",
  "src/components/model/useModelPage.tsx",
  "src/lib/aiPlan.ts",
  "src/lib/aiView.ts",
  "src/lib/buildCity.ts",
  "src/lib/groundWindParticles.ts",
  "src/lib/explodedAxo.ts",
  "src/lib/isometricDrawing.ts",
  "src/lib/rhinoExport.ts",
  "src/lib/terrain.ts",
];

export default [
  {
    ignores: ["dist/**", "node_modules/**", "scripts/**", "pipeline/**"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "react-hooks": reactHooks,
    },
    rules: {
      "max-lines": ["error", maxLines],
      "react-hooks/exhaustive-deps": "off",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-nocheck": true,
          "ts-ignore": true,
          "ts-expect-error": "allow-with-description",
          "minimumDescriptionLength": 8,
        },
      ],
    },
  },
  {
    files: legacyOversized,
    rules: {
      "max-lines": ["warn", maxLines],
    },
  },
];