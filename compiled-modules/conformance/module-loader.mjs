import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function loadCompiledModuleBuild({ manifestPath, packagePath }) {
  const manifestFile = resolve(manifestPath);
  const root = dirname(manifestFile);
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  if (manifest.schema !== "gobi.build-manifest/v1" || !Array.isArray(manifest.apps)) {
    throw new TypeError(`invalid build manifest: ${manifestFile}`);
  }
  const app = manifest.apps.find((candidate) => candidate.packagePath === packagePath);
  if (!app) throw new TypeError(`${packagePath} is missing from ${manifestFile}`);
  for (const key of ["appIR", "module", "encoder", "components", "moduleABI"]) {
    if (typeof app[key] !== "string" || app[key] === "") throw new TypeError(`manifest app is missing ${key}`);
  }
  const artifactPaths = [app.appIR, app.module, app.encoder, app.components];
  const [compiledModule, encoderModule, descriptorBytes, appIRBytes] = await Promise.all([
    import(pathToFileURL(resolve(root, app.module)).href),
    import(pathToFileURL(resolve(root, app.encoder)).href),
    readFile(resolve(root, app.moduleABI)),
    readFile(resolve(root, app.appIR)),
  ]);
  const descriptor = JSON.parse(descriptorBytes.toString("utf8"));
  const appIR = JSON.parse(appIRBytes.toString("utf8"));
  if (!compiledModule.gobiCompiled || !compiledModule.gobiModuleBridges || typeof encoderModule.gobiEncodeState !== "function") {
    throw new TypeError(`generated module exports are incomplete: ${packagePath}`);
  }
  if (compiledModule.gobiCompiled.appIR.packagePath !== packagePath || appIR.packagePath !== packagePath ||
      descriptor.packagePath !== packagePath || descriptor.componentID !== app.componentId) {
    throw new TypeError(`build identity mismatch for ${packagePath}`);
  }
  if (JSON.stringify(compiledModule.gobiCompiled.appIR) !== JSON.stringify(appIR)) {
    throw new TypeError(`module AppIR does not match manifest AppIR for ${packagePath}`);
  }
  const artifactBytes = new Map();
  for (const artifact of descriptor.artifacts) {
    artifactBytes.set(artifact.path, new Uint8Array(await readFile(resolve(root, artifact.path))));
  }
  for (const path of artifactPaths) {
    if (!descriptor.artifacts.some((artifact) => artifact.path === path)) {
      throw new TypeError(`descriptor does not cover manifest artifact ${path}`);
    }
  }
  return {
    compiled: compiledModule.gobiCompiled,
    bridges: compiledModule.gobiModuleBridges,
    encoder: encoderModule,
    descriptor,
    descriptorBytes: new Uint8Array(descriptorBytes),
    artifactBytes,
    componentId: app.componentId,
    backend: app.backend,
    packagePath,
    manifestPath: manifestFile,
    appIRPath: resolve(root, app.appIR),
    modulePath: resolve(root, app.module),
    encoderPath: resolve(root, app.encoder),
    descriptorPath: resolve(root, app.moduleABI),
  };
}

export async function loadModulePairBuilds({ parentManifest, childManifest, parentPackage, childPackage }) {
  const [parent, child] = await Promise.all([
    loadCompiledModuleBuild({ manifestPath: parentManifest, packagePath: parentPackage }),
    loadCompiledModuleBuild({ manifestPath: childManifest, packagePath: childPackage }),
  ]);
  if (parent.backend !== child.backend) throw new TypeError("parent and child must come from the same backend build profile");
  return { parent, child, backend: parent.backend };
}
