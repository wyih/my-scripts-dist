# ChatGPT to Notion Exporter

将 ChatGPT 的整段对话、单个问题或回答、一问一答导出到 Notion 数据库。支持标题、列表、引用、表格、公式和代码块，图片继续通过 PicList/PicGo 处理。

**当前版本：2.34。Mac 和 Windows 均可使用普通对话导出；附件自动上传是可选功能，默认关闭。** 只导出对话的用户安装油猴脚本并配置 Notion 即可。

## 安装与 Notion 配置

1. 在 Chrome 或 Edge 中安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 从 [Greasy Fork 安装或更新脚本](https://greasyfork.org/zh-CN/scripts/557605-chatgpt-to-notion-exporter)，然后刷新 ChatGPT 页面。
3. 在 [Notion Integrations](https://www.notion.so/my-integrations) 创建集成，取得 Integration Secret，并通过目标数据库的「连接 / Connections」菜单把集成连接到数据库。
4. 确认数据库有以下三个属性，名称和类型须一致：

| 属性名称 | Notion 类型 | 用途 |
| --- | --- | --- |
| `Name` | 标题 / Title | 导出内容标题 |
| `Date` | 日期 / Date | 导出时间 |
| `URL` | URL | 原始 ChatGPT 对话链接 |

5. 在 ChatGPT 页面打开油猴菜单「⚙️ 设置 Notion Token」，填写 Integration Secret 和 Database ID。已有配置会沿用。

Database ID 是数据库链接中、`?` 之前的 32 位 ID；视图参数 `?v=` 后面的 ID 是另一项。

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

需要导出图片时，安装并配置 [PicList](https://github.com/Kuingsmile/PicList/releases) 及其图床，开启本机上传服务，端口使用 `36677`。脚本取得图片的 HTTPS 链接后写入 Notion。图片服务与下面的附件辅助程序分别运行。

## 可选：自动下载并上传生成的文件

此功能会在导出时自动点击当前回答中生成文件的下载按钮，等待文件保存到**本机下载目录**，再通过 Notion 文件上传 API 把文件放在对应回答正文后面。支持单条、问答和整段导出。隐私标记的消息不会提交附件。

开启后，直接导出对应回答即可，脚本自动下载文件并上传，无需逐次点击下载或选择文件。辅助程序本身是一个 Python 脚本，运行时提供本机服务；需要 **Python 3.10 或以上**，无需安装 Python 第三方依赖。

### Mac

1. 下载并解压 [附件辅助程序所在的仓库 ZIP](https://github.com/wyih/my-scripts-dist/archive/refs/heads/main.zip)，打开其中的 `notion-attachment-helper` 文件夹。
2. 双击 `启动附件辅助程序.command`，保持终端窗口运行。若解压后文件不可执行，在该文件夹的终端运行 `chmod +x 启动附件辅助程序.command`，再双击。
3. 复制终端显示的连接密钥，在 ChatGPT 页面的油猴菜单「📎 开关自动上传下载附件（默认关闭）」中粘贴，完成开启。
4. 直接导出对应回答，脚本会自动下载文件并上传到 Notion。

尚未安装 Python 时，可从 [Python 官方 Mac 下载页](https://www.python.org/downloads/macos/) 安装。启动文件也会寻找 Homebrew 安装的 Python。

### Windows

1. 下载并解压同一个 [仓库 ZIP](https://github.com/wyih/my-scripts-dist/archive/refs/heads/main.zip)，打开 `notion-attachment-helper` 文件夹。
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

脚本发布在 Greasy Fork，源代码来自本仓库的 `ChatGPT exporter.js`，配置为 GitHub Webhook 同步。本说明也可作为 Greasy Fork 的附加信息同步源。附件辅助程序与油猴脚本分别更新；需要更新辅助程序时，停止旧服务，再下载新包重新启动。
