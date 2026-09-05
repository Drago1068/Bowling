const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

const assetExts = new Set(config.resolver.assetExts ?? []);
assetExts.add("wasm");
config.resolver.assetExts = [...assetExts];
config.resolver.sourceExts = (config.resolver.sourceExts ?? []).filter(
  (ext) => ext !== "wasm",
);

function endsWithPath(moduleName, basename) {
  return (
    moduleName === basename ||
    moduleName.endsWith(`/${basename}`) ||
    moduleName.endsWith(`\\${basename}`)
  );
}

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("node:")) {
    throw new Error(`Blocked Node-only import in mobile bundle: ${moduleName}`);
  }
  if (moduleName === "sql.js" || moduleName.startsWith("sql.js/")) {
    if (platform !== "web") {
      throw new Error(
        "sql.js is approved for the web preview harness only; native Expo uses expo-sqlite",
      );
    }
    return {
      filePath: path.resolve(
        projectRoot,
        "node_modules/sql.js/dist/sql-wasm-browser.js",
      ),
      type: "sourceFile",
    };
  }
  // App imports `openDatabase.ts` / `nativeValidation.ts` with explicit
  // extensions (TypeScript allowImportingTsExtensions). Metro then skips
  // `.web.ts` overlays, so web must be redirected here.
  if (platform === "web") {
    if (endsWithPath(moduleName, "openDatabase.ts")) {
      return {
        filePath: path.resolve(projectRoot, "src/openDatabase.web.ts"),
        type: "sourceFile",
      };
    }
    if (endsWithPath(moduleName, "nativeValidation.ts")) {
      return {
        filePath: path.resolve(projectRoot, "src/nativeValidation.web.ts"),
        type: "sourceFile",
      };
    }
  } else if (
    endsWithPath(moduleName, "openDatabase.web.ts") ||
    endsWithPath(moduleName, "webSqlJs.ts") ||
    endsWithPath(moduleName, "sqlJsDriver.ts")
  ) {
    throw new Error(
      `Blocked web-only module in native bundle: ${moduleName}`,
    );
  }
  if (typeof defaultResolveRequest === "function") {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
