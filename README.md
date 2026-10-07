# ChatGPT to Notion Exporter

将 ChatGPT 的整段对话、单个问题或回答、一问一答导出到 Notion 数据库。支持标题、列表、引用、表格、公式和代码块；图片通过本机 PicList/PicGo 上传到你配置的图床，再将图片链接写入 Notion。

**当前版本：2.36。Mac 和 Windows 均可使用普通对话导出；附件自动上传是可选功能，默认关闭。** 只导出文字的用户安装油猴脚本并配置 Notion 即可。需要图片时再配置图片服务，需要生成文件时再部署附件辅助程序。

## 安装脚本

1. 在 Chrome 或 Edge 中安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 从 [Greasy Fork 安装或更新脚本](https://greasyfork.org/zh-CN/scripts/557605-chatgpt-to-notion-exporter)，然后刷新 ChatGPT 页面。
3. 页面右下角出现「📥 Save to Notion」，鼠标移到消息气泡上可看到单条导出按钮。

## 首次配置 Notion

### 1. 创建数据库

在 Notion 新建一个数据库，例如命名为「ChatGPT 对话」。把数据库自带的标题列改名为 `Name`，再添加 `Date` 和 `URL` 两列，名称和类型须与下表一致：

| 属性名称 | Notion 类型 | 用途 |
| --- | --- | --- |
| `Name` | 标题 / Title | 导出内容标题 |
| `Date` | 日期 / Date | 导出时间 |
| `URL` | URL | 原始 ChatGPT 对话链接 |

### 2. 创建集成并取得 Token

打开 [Notion 集成管理](https://www.notion.so/my-integrations)，新建内部集成（Internal Integration / Internal Connection），选择该数据库所在的工作区，名称可填「ChatGPT 导出」。创建后在「配置 / Configuration」中复制 API Token，也称 `Internal Integration Secret`。新建内部连接的具体界面见 [Notion 官方说明](https://developers.notion.com/guides/get-started/internal-connections)。

### 3. 将集成连接到数据库

打开刚才的数据库，点击右上角 `•••` →「连接 / Connections」→「添加连接 / Add connection」，搜索并选择「ChatGPT 导出」。这一步让集成可以向该数据库写入内容。也可在集成管理的「Content access」中选择数据库；见 [Notion 页面授权说明](https://developers.notion.com/guides/get-started/internal-connections)。

### 4. 取得 Database ID（示例）

打开数据库本身并复制链接。如果数据库嵌在普通页面中，先将数据库打开为整页，再复制链接。例如下面这个**示意链接**：

```text
https://www.notion.so/1234567890abcdef1234567890abcdef?v=abcdef0123456789abcdef0123456789
```

应填写的 Database ID 是：

```text
1234567890abcdef1234567890abcdef
```

即 `?` 前面的 32 位字符。`?v=` 后面的 `abcdef0123456789abcdef0123456789` 是视图 ID，不填到脚本中；上面的示例 ID 也需要替换为你自己的数据库 ID。如果链接带有数据库名称，例如 `ChatGPT-Export-1234567890abcdef1234567890abcdef?v=...`，仍取名称后面的这 32 位字符。位置规则见 [Notion 官方数据库 ID 说明](https://developers.notion.com/reference/retrieve-a-database)。

### 5. 在油猴菜单中保存配置

1. 回到 ChatGPT 页面，点击浏览器工具栏上的 Tampermonkey 图标；若图标未显示，可在扩展菜单中找到它。
2. 在本脚本下点击「⚙️ 设置 Notion Token」。
3. 第一个弹窗填写上面取得的 **Integration Secret / API Token**，点确定。
4. 第二个弹窗填写你自己的 **Database ID**，点确定。
5. 看到「配置已保存」后即可导出。配置会保存在油猴中，后续无需每次输入。

首次直接点击导出按钮时也会提示填写这两项；保存后再点击一次导出即可。

## 对话导出

鼠标移到消息气泡上即可看到操作按钮。

| 按钮 | 导出范围 |
| --- | --- |
| 气泡上的 📤 | 当前这一个问题或回答 |
| 问题气泡上的 🔗 | 当前问题及紧接着的回答；没有回答时只导出问题 |
| 气泡上的 👁️ | 标记该消息为跳过，后续导出会排除它 |
| 右下角「📥 Save to Notion」 | 当前页面已加载的整段对话，排除已标记跳过的消息 |

每次导出创建一条 Notion 页面。按钮出现「✅ Saved」表示本次写入完成。新版 ChatGPT 页面和原有页面结构均保留单条与问答导出入口。

## 图片导出

图床负责保存图片，PicList/PicGo 负责把图片上传到图床。导出时，脚本将对话中的图片交给本机图片服务，取得 HTTPS 图片直链后写入对应消息的 Notion 内容。

纯图片回答也支持单条导出、一问一答导出和整段对话导出，图片会保存在对应回答下。

### 1. 安装 PicList 或 PicGo

安装其中一个即可：

- [PicList 下载](https://github.com/Kuingsmile/PicList/releases)：使用 2.6.3 或以上，支持本脚本使用的文件表单上传接口。
- [PicGo 下载](https://github.com/Molunerfinn/PicGo/releases)：使用桌面版 2.4.0 或以上。

Mac 下载对应系统的 `.dmg` 安装包，Windows 下载 `.exe` 安装包，安装后打开软件。接口版本依据 [PicList 表单上传说明](https://www.piclist.cn/advanced) 与 [PicGo 表单上传说明](https://docs.picgo.app/gui/guide/advance)。

### 2. 配置图床并试传一张图片

1. 在软件的「图床设置」中选择你使用的图床，例如 GitHub、S3、阿里云 OSS 等。
2. 按该图床要求填写上传凭据、存储位置、访问域名等信息，保存并选为默认图床。配置项目见 [PicList 图床配置](https://www.piclist.cn/configure) 或 [PicGo 图床配置](https://docs.picgo.app/gui/guide/config)。
3. 在软件的上传区拖入一张测试图片。上传成功后，取得图片直链，例如 `https://你的图床域名/images/test.png`。
4. 在未登录图床的浏览器窗口打开这条链接，确认能直接看到图片；Notion 需要能访问这个链接。

图床的上传凭据填写在 PicList/PicGo 中，Notion Token 填写在油猴菜单中。

### 3. 开启本机 Server 并连接脚本

在 PicList 的设置中找到「设置 Server / PicGo-Server 设置」，或在 PicGo 的「PicGo 设置」中打开「设置 Server」。设置为：

| 设置项 | 值 |
| --- | --- |
| 开启 Server | 开启 |
| 监听地址 / Host | `127.0.0.1` |
| 监听端口 / Port | `36677` |

保存设置，保持软件运行。两款软件共用此端口，因此只运行你选用的那一款。当前脚本直接请求 `http://127.0.0.1:36677/upload`，没有图片服务鉴权密钥的配置入口；本机 Server 的接口鉴权密钥（若有）保持为空，监听地址使用上面的本机地址。图床本身的上传凭据仍按图床要求填写。

设置位置见 [PicList Server 配置](https://www.piclist.cn/configure) 和 [PicGo Server 配置](https://docs.picgo.app/gui/guide/config)。

### 4. 检查连接并导出

1. 回到 ChatGPT 页面，打开浏览器开发者工具的「Console / 控制台」：Chrome 在 Mac 上按 `⌥⌘J`，Windows 上按 `Ctrl+Shift+J`。
2. 刷新 ChatGPT，等待约 3 秒；连接成功会显示 `✅ 图片上传服务连接正常`。
3. 导出一条含图片的回答。脚本会显示 `⏳ Images: ...`，完成后显示 `✅ Saved`，图片会出现在 Notion 的对应消息中。

PicList 用户也可以在浏览器打开 `http://127.0.0.1:36677/heartbeat`，看到 `{"success":true,"result":"alive"}` 表示本机服务正在运行。此检查方法见 [PicList 健康检查接口](https://www.piclist.cn/advanced)。

### 常见问题

| 情况 | 检查方法 |
| --- | --- |
| 本机图片服务未连接 | 确认软件正在运行、Server 已开启、地址为 `127.0.0.1`、端口为 `36677`；若系统拦截连接，检查对应应用的网络权限 |
| 连接正常，但图片上传失败 | 在 PicList/PicGo 中手动上传测试图片，检查图床凭据、默认图床及直链是否可访问 |
| 只需要导出文字 | 可以跳过图片服务和下面的附件辅助程序；图片处理失败时会留下提示，文字仍会保存 |
| Notion 提示无权访问或找不到数据库 | 检查 Token、Database ID，并确认已给集成连接该数据库 |
| Notion 提示数据库属性错误 | 确认 `Name`、`Date`、`URL` 三列的名称和类型与前面的表格一致 |

图片服务使用 `36677`；下面的附件辅助程序使用 `36678`，两项功能可分别配置。

## 可选：自动下载并上传生成的文件

此功能会在导出时自动点击当前回答中生成文件的下载按钮，等待文件保存到**本机下载目录**，再通过 Notion 文件上传 API 把文件放在对应回答正文后面。支持单条、问答和整段导出。隐私标记的消息不会提交附件。

开启后，直接导出对应回答即可，脚本自动下载文件并上传，无需逐次点击下载或选择文件。辅助程序本身是一个 Python 脚本，运行时提供本机服务；需要 **Python 3.10 或以上**，无需安装 Python 第三方依赖。

辅助程序按系统提供独立下载包。每个包只包含 `helper.py`、对应系统的启动文件和 `README.md` 三个文件。解压后打开 `notion-attachment-helper` 文件夹，请保留三个文件在同一目录。

| 系统 | 下载 | 启动文件 |
| --- | --- | --- |
| Mac | [下载 Mac 版辅助程序](https://raw.githubusercontent.com/wyih/my-scripts-dist/refs/heads/main/downloads/notion-attachment-helper-mac.zip) | `启动附件辅助程序.command` |
| Windows | [下载 Windows 版辅助程序](https://raw.githubusercontent.com/wyih/my-scripts-dist/refs/heads/main/downloads/notion-attachment-helper-windows.zip) | `start-helper.cmd` |

源码和说明：

| 文件 | 用途 |
| --- | --- |
| [helper.py](https://github.com/wyih/my-scripts-dist/blob/main/notion-attachment-helper/helper.py) | 本机服务的完整 Python 源码，负责读取下载文件并上传到 Notion |
| [启动附件辅助程序.command](https://github.com/wyih/my-scripts-dist/blob/main/notion-attachment-helper/启动附件辅助程序.command) | Mac 双击启动入口 |
| [start-helper.cmd](https://github.com/wyih/my-scripts-dist/blob/main/notion-attachment-helper/start-helper.cmd) | Windows 双击启动入口 |
| [辅助程序 README](https://github.com/wyih/my-scripts-dist/blob/main/notion-attachment-helper/README.md) | 可单独阅读的部署、使用和接口说明 |

### Mac

1. 下载并解压 [Mac 版辅助程序 ZIP](https://raw.githubusercontent.com/wyih/my-scripts-dist/refs/heads/main/downloads/notion-attachment-helper-mac.zip)，打开其中的 `notion-attachment-helper` 文件夹。
2. 双击 `启动附件辅助程序.command`，保持终端窗口运行。若解压后文件不可执行，在该文件夹的终端运行 `chmod +x 启动附件辅助程序.command`，再双击。
3. 复制终端显示的连接密钥，在 ChatGPT 页面的油猴菜单「📎 开关自动上传下载附件（默认关闭）」中粘贴，完成开启。
4. 直接导出对应回答，脚本会自动下载文件并上传到 Notion。

尚未安装 Python 时，可从 [Python 官方 Mac 下载页](https://www.python.org/downloads/macos/) 安装。启动文件也会寻找 Homebrew 安装的 Python。

### Windows

1. 下载并解压 [Windows 版辅助程序 ZIP](https://raw.githubusercontent.com/wyih/my-scripts-dist/refs/heads/main/downloads/notion-attachment-helper-windows.zip)，打开 `notion-attachment-helper` 文件夹。
2. 从 [Python 官方 Windows 下载页](https://www.python.org/downloads/windows/) 安装 Python 3.10 或以上，启用 Python Launcher，或把 Python 加入 PATH。
3. 双击 `start-helper.cmd`，保持命令窗口运行。启动文件会优先使用 `py -3`，也可使用 PATH 中的 `python`。
4. 复制显示的连接密钥，在 ChatGPT 页面的同一油猴附件菜单中粘贴，完成开启。
5. 直接导出对应回答，脚本会自动下载文件并上传到 Notion。

### 下载目录与停止方式

默认下载目录为 Mac 的 `~/Downloads`、Windows 的 `%USERPROFILE%\Downloads`。如果 Chrome 的下载位置另有设置，启动时指定实际目录。Chrome 若开启「下载前询问保存位置」，请关闭该选项以便自动保存；批量导出时若浏览器要求允许多个文件下载，需要在浏览器中允许：

Mac，在辅助程序文件夹的终端运行：

```sh
./启动附件辅助程序.command --downloads-dir "$HOME/Downloads"
```

Windows，在辅助程序文件夹的命令提示符运行：

```bat
start-helper.cmd --downloads-dir "D:\ChatGPT下载"
```

再次点击油猴附件菜单即可关闭自动上传。关闭辅助程序窗口或按 Ctrl+C 可停止本机服务。下载包的启动文件不会设置开机启动。

### 上传限制和文件匹配

- 自动上传上限为 **20 MiB 与 Notion 工作区单文件限制中的较小值**。免费工作区通常为 5 MiB；本功能在付费工作区最多自动上传 20 MiB。每次导出查询工作区限制，响应未提供限制时采用 5 MiB。
- 只处理回答中提供下载入口的文件。资料库引用、用户上传文件的预览引用卡片会从导出正文中省略，保留周围正文；这些卡片不会自动下载或上传。
- 匹配完整文件名及 Chrome 的同名编号，例如 `报告.docx`、`报告 (1).docx`。导出时记录下载开始时间，等待本次新下载，避免读取旧版本。同一回答内的同名文件只处理一次；不同回答依次下载、上传，保留各自的版本。
- 检测到未完成的 `.crdownload` 或刚点击下载、文件尚未出现时，最多等待 15 秒。
- 超限、缺失、仍在下载、本机服务不可用或 Notion 拒绝文件类型时，导出保留文件名和原因，正文仍可保存。完成下载或解决原因后可重新导出。

辅助程序仅监听 `127.0.0.1:36678`，通过本机连接密钥鉴权。密钥保存在用户目录下的 `.config/chatgpt-notion-helper/key`；Notion Token 由原有导出配置提供，只用于当前请求，不保存到辅助程序磁盘文件中。

大小规则依据 [Notion 工作区文件限制](https://developers.notion.com/guides/data-apis/working-with-files-and-media) 和 [小文件上传 API](https://developers.notion.com/guides/data-apis/uploading-small-files)。辅助程序接口及开发验证见 [附件辅助程序说明](https://github.com/wyih/my-scripts-dist/blob/main/notion-attachment-helper/README.md)。

## 更新

脚本发布在 Greasy Fork，源代码来自本仓库的 `ChatGPT exporter.js`，配置为 GitHub Webhook 同步。本 README 是 Greasy Fork 的附加说明同步源。附件辅助程序与油猴脚本分别更新；需要更新辅助程序时，停止旧服务，再下载对应系统的新包重新启动。
