# IotaExcel ToolKit

IotaExcel ToolKit 是一个 VS Code 插件，用于在编辑器中使用 IotaExcel 工作流。插件内置 `iotaexcel` 命令行工具，支持 Excel 配置表转换、C# 读取代码生成，以及 `.bytes` 文件只读预览。

## 功能

- 将 Excel 配置表转换为 `.bytes`、JSON 或 CSV。
- 根据 Excel schema 生成 C# Reader 代码。
- 以表格形式只读预览 `.bytes` 文件。
- 在 `.bytes` 预览中搜索数据、跳转行、按字段名或列号跳转列。
- 查看内置 IotaExcel 工具版本。

## 用户使用指南

### 命令面板

在 VS Code 命令面板中搜索 `IotaExcel`，可使用以下命令：

- `IotaExcel: Convert`：执行转换流程。
- `IotaExcel: Codegen`：执行代码生成流程。
- `IotaExcel: Preview Bytes`：选择并预览 `.bytes` 文件。

### 转换 Excel

1. 执行 `IotaExcel: Convert`。
2. 选择输出格式：`Bytes`、`JSON` 或 `CSV`。
3. 如果没有在设置中配置 `convertInputPath`，插件会让你选择 Excel 文件或目录。
4. 如果没有在设置中配置 `convertOutputPath`，插件会让你选择输出目录。
5. 转换结果会写入指定输出目录。

也可以在资源管理器中右键 `.xlsx` 文件或文件夹，直接执行 Convert 快捷命令。

### 生成读取代码

1. 执行 `IotaExcel: Codegen`。
2. 选择语言，目前支持 `C#`、`Go`、`C++`、`Java`、`JavaScript`、`Python` 和 `Swift`。
3. 如果没有在设置中配置 `codegenInputPath`，插件会让你选择 Excel 文件或目录。
4. 如果没有在设置中配置 `codegenOutputPath`，插件会让你选择输出目录。
5. 生成的 Reader 代码会写入指定输出目录。

也可以在资源管理器中右键 `.xlsx` 文件或文件夹，直接执行各语言的 Codegen 快捷命令。

### 预览 `.bytes`

可以通过两种方式打开预览：

- 执行 `IotaExcel: Preview Bytes`，然后选择目标 `.bytes` 文件。
- 在资源管理器中右键 `.bytes` 文件，选择 `IotaExcel: Preview Bytes`。

预览界面支持：

- 分页查看数据。
- 调整列宽。
- 搜索值、字段名、列号或类型。
- 搜索匹配支持大小写、整词和正则模式。
- 跳转到指定行号。
- 按字段名或列号跳转到指定列。

### 配置路径和配置文件

Convert 和 Codegen 分别支持独立的配置文件、输入路径和输出路径：

- Convert：`convertConfigPath`、`convertInputPath`、`convertOutputPath`
- Codegen：`codegenConfigPath`、`codegenInputPath`、`codegenOutputPath`

如果设置了对应命令的 config path，插件会传入 `--config`。如果同时设置了 input/output path，插件也会显式传入 `--input` 和 `--output`。

IotaExcel 的参数优先级为：

```text
工具默认值 < config 文件 < 显式命令行参数
```

因此，在 VS Code 设置中配置的 input/output path 会覆盖 config 文件中的 input/output。

## 设置项

IotaExcel ToolKit 提供以下设置：

- `iotaexcel-toolkit.toolPath`：可选的外部 IotaExcel 可执行程序绝对路径。为空时使用插件内置程序。
- `iotaexcel-toolkit.defaultTarget`：默认字段目标，可选 `both`、`client`、`server`。
- `iotaexcel-toolkit.overwrite`：输出文件存在时是否覆盖。
- `iotaexcel-toolkit.checkRef`：是否检查 `ref<T>` 引用目标表和 key。
- `iotaexcel-toolkit.selfDescribingBytes`：导出 `.bytes` 时是否包含字段名、类型名等自描述信息。
- `iotaexcel-toolkit.sheet`：可选的 sheet 名称或 1-based sheet 序号。
- `iotaexcel-toolkit.recursive`：扫描输入目录时是否递归。
- `iotaexcel-toolkit.strict`：schema 错误是否导致当前文件失败。
- `iotaexcel-toolkit.logLevel`：IotaExcel 日志等级。
- `iotaexcel-toolkit.logFormat`：IotaExcel 日志格式，可选 `text` 或 `json`。
- `iotaexcel-toolkit.logFile`：可选日志文件路径。
- `iotaexcel-toolkit.package`：代码生成使用的 package 或 namespace。
- `iotaexcel-toolkit.convertConfigPath`：Convert 使用的 key=value 配置文件路径。
- `iotaexcel-toolkit.convertInputPath`：Convert 输入 Excel 文件或目录，会覆盖配置文件中的 input。
- `iotaexcel-toolkit.convertOutputPath`：Convert 输出目录，会覆盖配置文件中的 output。
- `iotaexcel-toolkit.codegenConfigPath`：Codegen 使用的 key=value 配置文件路径。
- `iotaexcel-toolkit.codegenInputPath`：Codegen 输入 Excel 文件或目录，会覆盖配置文件中的 input。
- `iotaexcel-toolkit.codegenOutputPath`：Codegen 输出目录，会覆盖配置文件中的 output。

## 内置命令行工具

插件会根据当前平台自动选择 `bin/` 目录下的可执行程序：

- Windows：`iotaexcel-windows-amd64.exe`
- Linux：`iotaexcel-linux-amd64`
- macOS Intel：`iotaexcel-darwin-amd64`
- macOS Apple Silicon：`iotaexcel-darwin-arm64`

如果需要使用外部构建的 IotaExcel，请配置 `iotaexcel-toolkit.toolPath`。

## 开发

安装依赖：

```powershell
npm install
```

编译：

```powershell
npm run compile
```

在 VS Code 中按 F5 可启动 Extension Development Host 进行调试。

## 打包 VSIX

确保已安装 `vsce` 后执行：

```powershell
npm run package
```

生成的 `.vsix` 文件可通过 VS Code 的 `Install from VSIX...` 命令安装。
