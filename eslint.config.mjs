import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "coverage/**"] },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    // Corsair and Supabase return dynamic provider-shaped payloads at this boundary.
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
];

export default eslintConfig;
