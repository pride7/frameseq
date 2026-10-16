import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { promisify } from "node:util";

/**
 * Start every child process of this one hidden on Windows, unless it says otherwise. A process
 * with no console of its own, as the Studio started in the background is, gives each console
 * program it starts a new console, and Windows 11 shows that in a Windows Terminal window: Vite's
 * own `net use` flashed one on every start. Code that names its own `windowsHide` keeps it.
 *
 * The functions are replaced on node:child_process itself, and the ES module bindings already
 * imported, Vite's among them, are brought in line with them.
 */
export function hideConsoles() {
  const hidden = (options) => ({ windowsHide: true, ...options });
  const { spawn, spawnSync, exec, execSync, execFile, execFileSync } = childProcess;

  // spawn(command, args?, options?) and spawnSync alike; args may also be left undefined.
  const withArgs = (original) => (command, args, options) => {
    if (Array.isArray(args)) return original(command, args, hidden(options));
    return original(command, hidden(args ?? options));
  };
  childProcess.spawn = withArgs(spawn);
  childProcess.spawnSync = withArgs(spawnSync);
  childProcess.execFileSync = withArgs(execFileSync);

  // exec(command, options?, callback?)
  childProcess.exec = (command, options, callback) => (typeof options === "function"
    ? exec(command, hidden(), options)
    : exec(command, hidden(options), callback));
  childProcess.exec[promisify.custom] = (command, options) => exec[promisify.custom](command, hidden(options));
  childProcess.execSync = (command, options) => execSync(command, hidden(options));

  // execFile(file, args?, options?, callback?)
  childProcess.execFile = (file, args, options, callback) => {
    if (args == null) return execFile(file, [], ...(typeof options === "function" ? [hidden(), options] : [hidden(options), callback]));
    if (!Array.isArray(args)) return typeof args === "function" ? execFile(file, [], hidden(), args) : execFile(file, [], hidden(args), options);
    return typeof options === "function" ? execFile(file, args, hidden(), options) : execFile(file, args, hidden(options), callback);
  };
  childProcess.execFile[promisify.custom] = (file, args, options) => (Array.isArray(args)
    ? execFile[promisify.custom](file, args, hidden(options))
    : execFile[promisify.custom](file, [], hidden(args)));

  syncBuiltinESMExports();
}
