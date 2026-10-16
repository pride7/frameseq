import * as vscode from "vscode";
import { globalCli, globalsFor } from "./cli";

/** The TypeScript server plugin the manifest contributes for the `frameseq` language. */
export const typescriptPluginName = "frameseq-typescript-plugin";

/** The part of the API that VS Code's TypeScript extension exports which this extension uses. */
interface TypeScriptApi {
  configurePlugin(pluginId: string, configuration: unknown): void;
}

interface TypeScriptExtensionExports {
  getAPI?(version: 0): TypeScriptApi | undefined;
}

/**
 * Tell the TypeScript server plugin where the global FrameSeq install keeps its declarations,
 * so an `.fsq` file with no FrameSeq in its own project still knows `slide()` and the rest. The
 * plugin finds a project's own install, or a FrameSeq checkout, by itself, and prefers it.
 *
 * Activating VS Code's TypeScript extension here also starts it in a workspace that holds only
 * `.fsq` files, which it would otherwise leave alone. Without that extension, disabled or
 * replaced, `.fsq` files simply go unchecked, and everything else still works.
 */
export async function configureTypeScriptPlugin(output: vscode.OutputChannel): Promise<void> {
  const extension = vscode.extensions.getExtension<TypeScriptExtensionExports | undefined>(
    "vscode.typescript-language-features",
  );
  if (!extension) return;
  try {
    const exports = extension.isActive ? extension.exports : await extension.activate();
    const api = exports?.getAPI?.(0);
    if (!api) return;
    const cli = await globalCli();
    const globals = cli ? await globalsFor(cli) : undefined;
    // An empty path clears one sent before, so the plugin never keeps an install since removed.
    api.configurePlugin(typescriptPluginName, { globals: globals ?? "" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`TypeScript checking of .fsq files could not be set up: ${message}`);
  }
}
