import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          minSize: 10_000,
          groups: [
            {
              name: "three-addons",
              test: /node_modules[\\/]three[\\/]examples/,
              priority: 30,
              includeDependenciesRecursively: false,
            },
            {
              name: "three-core",
              test: /node_modules[\\/]three[\\/](?:build|src)/,
              priority: 20,
              includeDependenciesRecursively: false,
            },
            {
              name: "vendor",
              test: /node_modules/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
