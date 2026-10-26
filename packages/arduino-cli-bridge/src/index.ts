export { ArduinoCliClient, ArduinoCliExitError, ArduinoCliTimeoutError } from "./ArduinoCliClient.js";
export {
  parseBoardList,
  parseInstalledCoreVersion,
  parseInstalledLibraryNames,
} from "./ArduinoCliClient.js";
export type { ArduinoCliClientOptions, ArduinoCliEvents, DetectedBoard } from "./ArduinoCliClient.js";
export { ProcessTimeoutError, runProcess } from "./runProcess.js";
export { proxyUrlFromPacResult } from "./proxy.js";
export {
  resolveArduinoCliPath,
  getArduinoCliBinaryPath,
  getArduinoCliConfigPath,
  getArduinoDataDir,
  getArduinoUserDir,
  getLibraryPinsPath,
} from "./paths.js";
export {
  ArduinoCliInstaller,
  type ArduinoCliInstallerOptions,
  type EnsureReadyOptions,
  type FetchLike,
  type DownloadOptions,
  downloadFile,
  formatDownloadProgress,
  type InstallProgressEvent,
  type PlatformAsset,
  type LibraryDependency,
  type LibraryPins,
  getPlatformAsset,
  needsLibraryInstall,
} from "./installer.js";
