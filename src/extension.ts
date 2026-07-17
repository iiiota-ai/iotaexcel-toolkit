import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { IotaBytesPreviewProvider } from './previewProvider';

type ConvertFormat = 'bin' | 'json' | 'csv';
type CodegenLanguage = 'csharp' | 'go' | 'cpp' | 'java' | 'javascript' | 'python' | 'swift';

interface ToolkitConfig {
  toolPath: string;
  defaultTarget: 'both' | 'client' | 'server';
  overwrite: boolean;
  checkRef: boolean;
  selfDescribingBytes: boolean;
  sheet: string;
  recursive: boolean;
  strict: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logFormat: 'text' | 'json';
  logFile: string;
  packageName: string;
  convertConfigPath: string;
  convertInputPath: string;
  convertOutputPath: string;
  codegenConfigPath: string;
  codegenInputPath: string;
  codegenOutputPath: string;
}

export function activate(context: vscode.ExtensionContext): void {
  const bytesPreviewProvider = new IotaBytesPreviewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(IotaBytesPreviewProvider.viewType, bytesPreviewProvider, {
      supportsMultipleEditorsPerDocument: false,
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }),
    vscode.commands.registerCommand('iotaexcel-toolkit.convert', (uri?: vscode.Uri) => runInteractiveConvert(context, uri)),
    vscode.commands.registerCommand('iotaexcel-toolkit.codegen', (uri?: vscode.Uri) => runInteractiveCodegen(context, uri)),
    vscode.commands.registerCommand('iotaexcel-toolkit.previewBytes', (uri?: vscode.Uri) => openBytesPreview(uri)),
    vscode.commands.registerCommand('iotaexcel-toolkit.convertToBytes', (uri?: vscode.Uri) => runConvert(context, 'bin', uri)),
    vscode.commands.registerCommand('iotaexcel-toolkit.convertToJson', (uri?: vscode.Uri) => runConvert(context, 'json', uri)),
    vscode.commands.registerCommand('iotaexcel-toolkit.convertToCsv', (uri?: vscode.Uri) => runConvert(context, 'csv', uri)),
    vscode.commands.registerCommand('iotaexcel-toolkit.codegenCSharp', (uri?: vscode.Uri) => runCodegen(context, 'csharp', uri)),
    vscode.commands.registerCommand('iotaexcel-toolkit.codegenGo', (uri?: vscode.Uri) => runCodegen(context, 'go', uri)),
    vscode.commands.registerCommand('iotaexcel-toolkit.codegenCpp', (uri?: vscode.Uri) => runCodegen(context, 'cpp', uri)),
    vscode.commands.registerCommand('iotaexcel-toolkit.codegenJava', (uri?: vscode.Uri) => runCodegen(context, 'java', uri)),
    vscode.commands.registerCommand('iotaexcel-toolkit.codegenJavaScript', (uri?: vscode.Uri) => runCodegen(context, 'javascript', uri)),
    vscode.commands.registerCommand('iotaexcel-toolkit.codegenPython', (uri?: vscode.Uri) => runCodegen(context, 'python', uri)),
    vscode.commands.registerCommand('iotaexcel-toolkit.codegenSwift', (uri?: vscode.Uri) => runCodegen(context, 'swift', uri)),
    vscode.commands.registerCommand('iotaexcel-toolkit.showVersion', () => showVersion(context)),
  );
}

export function deactivate(): void {
  // No background resources to dispose.
}

async function runInteractiveConvert(context: vscode.ExtensionContext, uri?: vscode.Uri): Promise<void> {
  const format = await pickConvertFormat();
  if (!format) {
    return;
  }
  await runConvert(context, format, uri);
}

async function runInteractiveCodegen(context: vscode.ExtensionContext, uri?: vscode.Uri): Promise<void> {
  const language = await pickCodegenLanguage();
  if (!language) {
    return;
  }
  await runCodegen(context, language, uri);
}

async function openBytesPreview(uri?: vscode.Uri): Promise<void> {
  const target = uri?.scheme === 'file' ? uri : await pickBytesPreviewTarget();
  if (!target) {
    return;
  }

  await vscode.commands.executeCommand('vscode.openWith', target, IotaBytesPreviewProvider.viewType);
}

async function pickBytesPreviewTarget(): Promise<vscode.Uri | undefined> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      Bytes: ['bytes'],
      All: ['*'],
    },
    title: 'Select a .bytes file',
  });
  return picked?.[0];
}

async function pickConvertFormat(): Promise<ConvertFormat | undefined> {
  const picked = await vscode.window.showQuickPick([
    {
      label: 'Bytes',
      format: 'bin' as const,
    },
    {
      label: 'JSON',
      format: 'json' as const,
    },
    {
      label: 'CSV',
      format: 'csv' as const,
    },
  ], {
    placeHolder: 'Format',
  });
  return picked?.format;
}

async function pickCodegenLanguage(): Promise<CodegenLanguage | undefined> {
  const picked = await vscode.window.showQuickPick([
    {
      label: 'C#',
      language: 'csharp' as const,
    },
    {
      label: 'Go',
      language: 'go' as const,
    },
    {
      label: 'C++',
      language: 'cpp' as const,
    },
    {
      label: 'Java',
      language: 'java' as const,
    },
    {
      label: 'JavaScript',
      language: 'javascript' as const,
    },
    {
      label: 'Python',
      language: 'python' as const,
    },
    {
      label: 'Swift',
      language: 'swift' as const,
    },
  ], {
    placeHolder: 'Language',
  });
  return picked?.language;
}

async function runConvert(context: vscode.ExtensionContext, format: ConvertFormat, uri?: vscode.Uri): Promise<void> {
  const config = getConfig();
  const input = await resolveInputPath(config.convertInputPath, uri);
  if (!input && !config.convertConfigPath.trim()) {
    return;
  }

  const output = await resolveOutputPath(config.convertOutputPath, `Select output folder for ${format === 'bin' ? '.bytes' : format.toUpperCase()} files`);
  if (!output && !config.convertConfigPath.trim()) {
    return;
  }

  const args = [
    'convert',
    '--format', format,
    '--target', config.defaultTarget,
    ...commonOptionArgs(config),
  ];

  appendOptionalArg(args, 'config', config.convertConfigPath);
  appendOptionalArg(args, 'input', input);
  appendOptionalArg(args, 'output', output);

  if (format === 'bin') {
    args.push(boolFlag('self-describing', config.selfDescribingBytes));
  }

  await runTool(context, args, `IotaExcel convert ${format}`);
}

async function runCodegen(context: vscode.ExtensionContext, language: CodegenLanguage, uri?: vscode.Uri): Promise<void> {
  const config = getConfig();
  const input = await resolveInputPath(config.codegenInputPath, uri);
  if (!input && !config.codegenConfigPath.trim()) {
    return;
  }

  const output = await resolveOutputPath(config.codegenOutputPath, `Select output folder for generated ${codegenLanguageLabel(language)} files`);
  if (!output && !config.codegenConfigPath.trim()) {
    return;
  }

  const args = [
    'codegen',
    '--lang', language,
    '--target', config.defaultTarget,
    '--package', config.packageName,
    ...commonOptionArgs(config),
  ];

  appendOptionalArg(args, 'config', config.codegenConfigPath);
  appendOptionalArg(args, 'input', input);
  appendOptionalArg(args, 'output', output);

  await runTool(context, args, `IotaExcel codegen ${language}`);
}

function codegenLanguageLabel(language: CodegenLanguage): string {
  switch (language) {
    case 'csharp':
      return 'C#';
    case 'go':
      return 'Go';
    case 'cpp':
      return 'C++';
    case 'java':
      return 'Java';
    case 'javascript':
      return 'JavaScript';
    case 'python':
      return 'Python';
    case 'swift':
      return 'Swift';
  }
}

async function showVersion(context: vscode.ExtensionContext): Promise<void> {
  const result = await runTool(context, ['version'], 'IotaExcel version', { revealOutput: false });
  if (result.exitCode === 0) {
    vscode.window.showInformationMessage(`IotaExcel ${result.stdout.trim()}`);
  }
}

async function resolveInputPath(configuredPath: string, uri?: vscode.Uri): Promise<string | undefined> {
  const configured = configuredPath.trim();
  if (configured) {
    return configured;
  }

  if (uri?.scheme === 'file') {
    return uri.fsPath;
  }

  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: true,
    canSelectMany: false,
    filters: {
      Excel: ['xlsx'],
      All: ['*'],
    },
    title: 'Select an Excel file or folder',
  });
  return picked?.[0]?.fsPath;
}

async function resolveOutputPath(configuredPath: string, title: string): Promise<string | undefined> {
  const configured = configuredPath.trim();
  if (configured) {
    return configured;
  }

  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    title,
  });
  return picked?.[0]?.fsPath;
}

function getConfig(): ToolkitConfig {
  const config = vscode.workspace.getConfiguration('iotaexcel-toolkit');
  return {
    toolPath: config.get('toolPath', ''),
    defaultTarget: config.get('defaultTarget', 'both'),
    overwrite: config.get('overwrite', true),
    checkRef: config.get('checkRef', false),
    selfDescribingBytes: config.get('selfDescribingBytes', true),
    sheet: config.get('sheet', ''),
    recursive: config.get('recursive', true),
    strict: config.get('strict', true),
    logLevel: config.get('logLevel', 'info'),
    logFormat: config.get('logFormat', 'text'),
    logFile: config.get('logFile', ''),
    packageName: config.get('package', 'DataConfig'),
    convertConfigPath: config.get('convertConfigPath', ''),
    convertInputPath: config.get('convertInputPath', ''),
    convertOutputPath: config.get('convertOutputPath', ''),
    codegenConfigPath: config.get('codegenConfigPath', ''),
    codegenInputPath: config.get('codegenInputPath', ''),
    codegenOutputPath: config.get('codegenOutputPath', ''),
  };
}

function commonOptionArgs(config: ToolkitConfig): string[] {
  const args = [
    boolFlag('overwrite', config.overwrite),
    boolFlag('check-ref', config.checkRef),
    boolFlag('recursive', config.recursive),
    boolFlag('strict', config.strict),
    '--log-level', config.logLevel,
    '--log-format', config.logFormat,
  ];

  const sheet = config.sheet.trim();
  if (sheet) {
    args.push('--sheet', sheet);
  }

  const logFile = config.logFile.trim();
  if (logFile) {
    args.push('--log-file', logFile);
  }

  return args;
}

function appendOptionalArg(args: string[], name: string, value: string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) {
    args.push(`--${name}`, trimmed);
  }
}

function resolveToolPath(context: vscode.ExtensionContext): string {
  const configuredPath = getConfig().toolPath.trim();
  if (configuredPath) {
    return configuredPath;
  }

  const executableName = bundledExecutableName();
  const toolPath = context.asAbsolutePath(path.join('bin', executableName));
  ensureExecutableMode(toolPath);
  return toolPath;
}

function bundledExecutableName(): string {
  if (process.platform === 'win32') {
    return 'iotaexcel-windows-amd64.exe';
  }
  if (process.platform === 'linux') {
    return 'iotaexcel-linux-amd64';
  }
  if (process.platform === 'darwin') {
    return os.arch() === 'arm64' ? 'iotaexcel-darwin-arm64' : 'iotaexcel-darwin-amd64';
  }
  throw new Error(`Unsupported platform: ${process.platform}`);
}

function runTool(
  context: vscode.ExtensionContext,
  args: string[],
  title: string,
  options: { revealOutput?: boolean } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const output = vscode.window.createOutputChannel('IotaExcel');
  const toolPath = resolveToolPath(context);
  const revealOutput = options.revealOutput ?? true;

  if (revealOutput) {
    output.show(true);
  }
  output.appendLine(`> ${toolPath} ${args.map(quoteArg).join(' ')}`);

  return new Promise((resolve) => {
    const child = cp.spawn(toolPath, args, {
      cwd: workspaceCwd(),
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      output.append(text);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      output.append(text);
    });

    child.on('error', (error) => {
      const message = `${title} failed to start: ${error.message}`;
      output.appendLine(message);
      vscode.window.showErrorMessage(message);
      resolve({ exitCode: -1, stdout, stderr: message });
    });

    child.on('close', (exitCode) => {
      const code = exitCode ?? -1;
      output.appendLine('');
      output.appendLine(`${title} exited with code ${code}`);
      if (code === 0) {
        if (revealOutput) {
          vscode.window.showInformationMessage(`${title} completed.`);
        }
      } else {
        vscode.window.showErrorMessage(`${title} failed with exit code ${code}. See IotaExcel output for details.`);
      }
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}

function workspaceCwd(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function quoteArg(value: string): string {
  return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function boolFlag(name: string, value: boolean): string {
  return `--${name}=${value}`;
}

function ensureExecutableMode(toolPath: string): void {
  if (process.platform === 'win32') {
    return;
  }

  try {
    fs.chmodSync(toolPath, 0o755);
  } catch {
    // The spawned process will surface a clearer permission error if chmod is unavailable.
  }
}
