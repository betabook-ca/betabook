import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: [
    "eslint",
    "typescript",
    "unicorn",
    "oxc",
    "react",
    "jsx-a11y",
    "vitest",
    "import",
    "promise",
    "node",
  ],
  jsPlugins: ["oxlint-tailwindcss"],
  categories: {
    // Automatically enforces correctness, performance, and suspicious bug-prevention rules.
    correctness: "error",
    perf: "error",
    suspicious: "error",
    restriction: "error",
  },
  options: {
    // Run high-performance type-aware linting via tsrs
    typeAware: true,
    // Zero-warning policy: any warning fails the lint check
    denyWarnings: true,
  },
  settings: {
    tailwindcss: {
      entryPoint: "frontend/src/spa/globals.css",
      callees: ["clsx"],
    },
  },
  env: {
    builtin: true,
    browser: true,
    node: true,
  },
  ignorePatterns: [
    ".next/**",
    "storybook-static/**",
    "playwright-report/**",
    "test-results/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "worker-configuration.d.ts",
    "cloudflare-env.d.ts",
    "dist/**",
    ".open-next/**",
    ".wrangler/**",
    "climbs_data/**",
    ".claude/**",
    "backend/migrations/**",
    "target/**",
    "backend/**",
    "dist-spa/**",
  ],
  rules: {
    // Enforce strict equality (=== / !==) while permitting standard nullish (== null) comparisons.
    eqeqeq: ["error", "always", { null: "ignore" }],

    // Allow CSS side-effect imports (e.g. globals.css) while forbidding unassigned JS imports.
    "import/no-unassigned-import": ["error", { allow: ["**/*.css"] }],

    // Disallow void expressions except as statement to handle floating promises.
    "no-void": ["error", { allowAsStatement: true }],

    // Helper functions are routinely declared below their first use (hoisted
    // `function` declarations, bottom-of-file helpers); only const/let/class
    // references in the temporal dead zone are real hazards.
    "no-use-before-define": ["error", { functions: false, classes: false, variables: true }],

    // No-op default context setters (createContext(() => {})) and inert test
    // stubs are legitimately empty; a bare {} is the clearest way to say so.
    "no-empty-function": ["error", { allow: ["arrowFunctions"] }],

    // console.warn / console.error are the Workers logging channel
    // (wrangler.jsonc has observability on); console.log is still noise.
    "no-console": ["error", { allow: ["warn", "error"] }],

    // Ensure tests have assertions while recognizing custom assertion helpers (e.g. expectCycleRejection).
    "vitest/expect-expect": ["error", { assertFunctionNames: ["expect", "expect*"] }],

    // Tailwind CSS (oxlint-tailwindcss): allow design tokens defined in @heroui/styles.
    "tailwindcss/no-unknown-classes": ["error", { allowlist: ["link", "popover"] }],

    // React Compiler's recommended checks available in this Oxlint release.
    "react/error-boundaries": "error",
    "react/exhaustive-deps": "error",
    "react/globals": "error",
    "react/immutability": "error",
    "react/incompatible-library": "error",
    "react/preserve-manual-memoization": "error",
    "react/purity": "error",
    "react/refs": "error",
    "react/rules-of-hooks": "error",
    "react/set-state-in-effect": "error",
    "react/set-state-in-render": "error",
    "react/static-components": "error",
    "react/unsupported-syntax": "error",
    "react/use-memo": "error",

    // --- Rules intentionally disabled globally ---

    // React uses the automatic JSX runtime.
    "react/react-in-jsx-scope": "off",

    // Oxlint's experimental effect-deps variant; standard react/exhaustive-deps is active and enforced.
    "react/exhaustive-effect-dependencies": "off",

    // HeroUI and React Aria hooks (useDisclosure) return un-bound function records ({ onOpen, onClose }).
    "typescript/unbound-method": "off",

    // Cloudflare D1 SQL query rows and DOM event targets require explicit type assertions (as T).
    "typescript/no-unsafe-type-assertion": "off",

    // React useEffect hooks return undefined on early exits and cleanup functions on active runs.
    "typescript/consistent-return": "off",

    // Custom composite accessible widgets (e.g. <div role="progressbar">) cannot be native elements due to styling limits.
    "jsx-a11y/prefer-tag-over-role": "off",

    // Preflight sets list-style:none on ul/ol and Safari then drops their list semantics; the explicit role restores them.
    "jsx-a11y/no-redundant-roles": ["error", { ul: ["list"], ol: ["list"] }],

    // Composite interactive containers (comboboxes, radiogroups) manage roving tabindex and keys across children.
    "jsx-a11y/no-noninteractive-element-to-interactive-role": "off",
    "jsx-a11y/click-events-have-key-events": "off",
    "jsx-a11y/interactive-supports-focus": "off",

    // Tests narrowing TypeScript discriminated unions (if (res.kind === "ok") expect(...)) need conditional asserts.
    "vitest/no-conditional-expect": "off",

    // Sequential D1 database seed operations and migrations must execute in strict order, not concurrently.
    "eslint/no-await-in-loop": "off",

    // Variable shadowing is safe and standard in small arrow callbacks (e.g. items.find(item => item.id === id)).
    "eslint/no-shadow": "off",

    // .sort() on freshly mapped/cloned arrays ([...items].sort()) is idiomatic, safe, and avoids extra allocations.
    "unicorn/no-array-sort": "off",

    // Allow keeping small helper functions encapsulated inside local component/test scopes.
    "unicorn/consistent-function-scoping": "off",

    // Immutable object spreading in .map() transformations is idiomatic and clean.
    "oxc/no-map-spread": "off",

    // --- Framework compatibility & syntax allowances ---

    // Lazy route modules and tool configurations use default exports.
    "import/no-default-export": "off",

    // Permitted by project eqeqeq configuration ({ null: "ignore" }) for standard nullish comparisons.
    "eslint/no-eq-null": "off",

    // Standard JavaScript/TypeScript usage of undefined identifier is idiomatic.
    "eslint/no-undefined": "off",

    // Allow JSX in .tsx files.
    "react/jsx-filename-extension": "off",

    // Modern ES object rest/spread properties ({ ...props }) are standard and idiomatic.
    "oxc/no-rest-spread-properties": "off",

    // Explicit return types on every function/boundary are redundant with TypeScript's type inference.
    "typescript/explicit-function-return-type": "off",
    "typescript/explicit-module-boundary-types": "off",

    // Tailwind CSS and HeroUI rely heavily on className prop on custom components.
    "react/forbid-component-props": "off",

    // Optional chaining (?.) is standard modern ECMAScript.
    "oxc/no-optional-chaining": "off",

    // Allow literal text inside JSX without forced i18n translation wrapping.
    "react/jsx-no-literals": "off",

    // API calls and asynchronous component interactions use async/await.
    "oxc/no-async-await": "off",

    // Test timeout is managed globally via Vitest config rather than requiring explicit timeouts on all tests.
    "vitest/require-test-timeout": "off",

    // Keep feature entry points available to frontend consumers.
    "oxc/no-barrel-file": "off",

    // Experimental React Compiler diagnostics.
    "react/todo": "off",

    // --- restriction rules that fight the framework or the house style ---

    // React 19 types `ReactNode` to include `Promise<...>` (async Server
    // Components), so every component that returns a node trips this; the
    // remaining hits are one-line callbacks that forward a promise.
    "typescript/promise-function-async": "off",

    // Context modules export their provider and its hook together.
    "react/only-export-components": "off",

    // Small presentational subcomponents and toolbars are deliberately
    // co-located with the feature they belong to rather than scattered into
    // one-off files.
    "react/no-multi-comp": "off",
  },
  overrides: [
    {
      files: ["frontend/src/**"],
      rules: {
        // The native compiler handles provider values as well as other render expressions.
        "react/jsx-no-constructed-context-values": "off",
      },
    },
    {
      files: ["**/*.test.ts", "**/*.test.tsx", "test/**"],
      rules: {
        "typescript/no-non-null-assertion": "off",
      },
    },
    {
      // CLI scripts talk to the operator over stdout/stderr — that's their UI.
      files: ["scripts/**"],
      rules: {
        "no-console": "off",
      },
    },
    {
      files: ["frontend/src/components/ui/**"],
      rules: {
        "typescript/no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: [
                  "@/components",
                  "@/components/**",
                  "!@/components/ui",
                  "!@/components/ui/**",
                ],
                message: "UI components must not import from other components.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["frontend/src/lib/**"],
      rules: {
        "typescript/no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["@/components/**", "@/spa/routes/**"],
                message:
                  "Shared frontend logic must not depend on UI components or route implementations.",
              },
            ],
          },
        ],
      },
    },
  ],
});
