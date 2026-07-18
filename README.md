# IotaExcel ToolKit

IotaExcel ToolKit 是一个 VS Code 插件，用于在编辑器中使用 IotaExcel 工作流。插件内置 `iotaexcel` 命令行工具，支持 Excel 配置表转换、多语言读取代码生成，以及 `.bytes` 文件只读预览。

## 功能

- 将 Excel 配置表转换为 `.bytes`、JSON 或 CSV。
- 根据 Excel schema 生成多语言 Reader 代码。
- 以表格形式只读预览 `.bytes` 文件。
- 在 `.bytes` 预览中搜索数据、跳转行、按字段名或列号跳转列。
- 查看内置 IotaExcel 工具版本。

## 用户使用指南

### 命令面板

在 VS Code 命令面板中搜索 `IotaExcel`，可使用以下命令：

- `IotaExcel: Init Workspace`：初始化当前工作区的 IotaExcel 输入、输出目录和插件设置。
- `IotaExcel: Convert`：执行转换流程。
- `IotaExcel: Codegen`：执行代码生成流程。
- `IotaExcel: Preview Bytes`：选择并预览 `.bytes` 文件。

### 初始化工作区

执行 `IotaExcel: Init Workspace` 可以为当前 VS Code 工作区创建一套默认目录，并保存 IotaExcel ToolKit 的工作区设置。

默认目录会归拢在同一个根目录下：

```text
iotaexcel/
  excels/
  generated/
    data/
    code/
```

初始化命令会保存以下设置：

```json
{
  "iotaexcel-toolkit.convertInputPath": "${workspaceFolder}/iotaexcel/excels",
  "iotaexcel-toolkit.convertOutputPath": "${workspaceFolder}/iotaexcel/generated/data",
  "iotaexcel-toolkit.codegenInputPath": "${workspaceFolder}/iotaexcel/excels",
  "iotaexcel-toolkit.codegenOutputPath": "${workspaceFolder}/iotaexcel/generated/code",
  "iotaexcel-toolkit.package": "DataConfig"
}
```

执行时可以修改默认根目录名和代码生成使用的 package 或 namespace。如果工作区已有 IotaExcel 路径设置，插件会在覆盖前进行确认。

`settings.json` 中的 `${workspaceFolder}` 会在执行 Convert 或 Codegen 时由插件展开为当前工作区的实际路径。

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

## 上层业务接入

IotaExcel ToolKit 负责把策划侧 Excel 配置表转换成业务运行时可读取的资源，并生成对应语言的读取代码。上层业务通常只需要接入两个产物：

- Convert 输出目录中的 `.bytes` 配置资源。
- Codegen 输出目录中的业务 Reader 代码和共享 runtime 文件。

推荐接入流程：

1. 执行 `IotaExcel: Init Workspace`，初始化统一目录和 VS Code 设置；也可以手动配置 `convertInputPath`、`convertOutputPath`、`codegenInputPath` 和 `codegenOutputPath`。
2. 执行 `IotaExcel: Convert`，选择 `Bytes`，把 Excel 配置表导出为 `.bytes`。
3. 执行 `IotaExcel: Codegen`，选择业务工程使用的语言，生成读取 `.bytes` 的 Reader 代码。
4. 将 `.bytes` 放入业务工程的资源目录、包体目录或热更新目录。
5. 将生成代码加入业务工程编译，并在业务启动或配置模块初始化时加载 `.bytes`。

### 产物组织

每个 sheet 会导出一个 `.bytes` 文件，文件名遵循：

```text
Excel名_Sheet名Config.bytes
```

Codegen 会为每个 workbook 生成业务配置文件，并在输出根目录生成共享 runtime 文件。上层业务需要同时提交或复制这些文件，否则 Reader 无法独立解析 `.bytes`。

| 目标语言 | 业务文件 | runtime 文件 | 默认包/命名空间 |
| --- | --- | --- | --- |
| C# | `<ExcelName>.config.cs` | `IotaExcelRuntime.cs` | `DataConfig` |
| Go | `<ExcelName>.config.go` | `iotaexcel_runtime.go` | `dataconfig` |
| C++ | `<ExcelName>.config.hpp` | `iotaexcel_runtime.hpp` | `DataConfig` |
| Java | `<ExcelName>.java` | `IotaExcelRuntime.java` | `dataconfig` |
| JavaScript | `<ExcelName>.config.js` | `iotaexcel_runtime.js` | 不使用 |
| Python | `<ExcelName>_config.py` | `iotaexcel_runtime.py` | 不使用 |
| Swift | `<ExcelName>.config.swift` | `IotaExcelRuntime.swift` | 不使用 |

`iotaexcel-toolkit.package` 可用于覆盖 C# 命名空间、Go/Java 包名或 C++ 命名空间。JavaScript、Python 和 Swift 当前不使用该设置。

### 业务加载方式

生成代码提供两类加载入口：

- 直接加载入口：业务层自行读取完整 `.bytes` 字节，再传给 table loader。
- 文件名回调加载入口：Reader 把约定的 `.bytes` 文件名交给业务层回调，由业务层从文件系统、包体资源、Addressables、AssetBundle、网络或其他资源系统中读取字节。

C# 示例：

```csharp
using DataConfig;

var itemBytes = File.ReadAllBytes("Config_ItemConfig.bytes");
var itemTable = ItemConfigTable.Load(itemBytes);
if (itemTable.TryGetByid(1001, out var item))
{
    Console.WriteLine(item.name);
}

var itemTableFromAssets = await ItemConfigTable.LoadAsync(ReadBytesAsync);
```

Go 示例：

```go
itemBytes, err := os.ReadFile("Config_ItemConfig.bytes")
if err != nil {
    return err
}
itemTable, err := dataconfig.LoadItemConfigTable(itemBytes)
if err != nil {
    return err
}
item, ok := itemTable.TryGetByid(1001)

itemTableFromAssets, err := dataconfig.LoadItemConfigTableFrom(readBytes)
```

C++ 示例：

```cpp
auto itemTable = DataConfig::ItemConfigTable::Load(ReadAllBytes("Config_ItemConfig.bytes"));
const DataConfig::ItemConfig* item = nullptr;
if (itemTable.TryGetByid(1001, item)) {
    // use item
}

auto itemTableFromAssets = DataConfig::ItemConfigTable::LoadFrom(readBytes);
```

Java 示例：

```java
Config.ItemConfigTable table = Config.ItemConfigTable.load(data);
Config.ItemConfig item = table.tryGetByid(1001);

Config.ItemConfigTable tableFromAssets = Config.ItemConfigTable.loadFrom(readBytes);
```

JavaScript 示例：

```js
import { ItemConfigTable, loadItemConfigTableFrom } from "./generated/Config.config.js";

const table = ItemConfigTable.load(bytes);
const item = table.tryGetByid(1001);

const tableFromAssets = await loadItemConfigTableFrom(readBytes);
```

Python 示例：

```python
from Config_config import ItemConfigTable, load_item_config_table_from

table = ItemConfigTable.load(item_bytes)
item = table.try_get_by_id(1001)

table_from_assets = load_item_config_table_from(read_bytes)
```

Swift 示例：

```swift
let table = try ItemConfigTable.load(data)
let item = table.tryGetByid(1001)

let tableFromAssets = try ItemConfigTable.loadFrom(readBytes)
```

上述示例中的 `ReadBytesAsync`、`readBytes`、`ReadAllBytes`、`data`、`bytes` 和 `item_bytes` 都由业务层按自身资源系统实现。生成代码只负责解析 `.bytes` 内容，并提供按 key 或 `!` 唯一字段查询配置行的 table API。

### 运行时边界

业务运行时不需要依赖 VS Code 插件，也不需要调用 `iotaexcel` 命令行工具。Reader 代码会按照生成时编译进代码里的 schema 解析 `.bytes`，因此上层业务只需要发布 `.bytes` 和生成代码。

如果业务只需要运行时读取，建议优先导出 `.bytes`。JSON 和 CSV 更适合调试、比对、人工检查或其他工具链消费。

### 版本与 schema 兼容

`.bytes` 文件中包含二进制版本号和 schema hash。生成 Reader 会检查版本，并按代码中的字段编号和 wire type 解析数据。为了降低线上兼容风险，建议遵守以下约定：

- `.bytes` 和生成代码应来自同一次导出流程，或至少来自兼容的 Excel schema。
- 已发布并被业务读取的表，不建议在已有二进制字段中间插入新字段；新增字段优先追加到末尾。
- 修改字段名、字段类型、key 字段或字段用途后，需要重新执行 Convert 和 Codegen，并同步更新业务工程。
- `defaultTarget` 会影响导出的字段集合，客户端和服务端应分别使用匹配的 `client`、`server` 或 `both` 产物。
- 开启 `selfDescribingBytes` 会在 `.bytes` 中写入字段名和类型名，便于预览和独立 decode；关闭后体积更小，但预览和反解析能力会受限。
- 使用 `ref<T>` 时，建议开启 `checkRef`，在导出阶段提前发现跨表引用错误。

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
