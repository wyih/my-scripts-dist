# 可选附件辅助程序

ChatGPT exporter 2.34 的附件自动上传**默认关闭**。只导出对话的用户直接使用油猴脚本即可。

本机服务的完整代码是 [helper.py](helper.py)。Mac 包附带 `启动附件辅助程序.command`，Windows 包附带 `start-helper.cmd`。两者均需要 Python 3.10 或以上，无需第三方 Python 依赖。

## 下载与部署

先在油猴脚本中配置 Notion Token 和 Database ID，具体见 [主 README](https://github.com/wyih/my-scripts-dist/blob/main/README.md)。按系统下载对应的包并解压，打开其中的 `notion-attachment-helper` 文件夹。每个包只包含 `helper.py`、对应系统的启动文件和本说明三个文件。启动文件和 `helper.py` 须放在同一目录。

| 系统 | 下载 | 启动文件 |
| --- | --- | --- |
| Mac | [Mac 版 ZIP](https://raw.githubusercontent.com/wyih/my-scripts-dist/refs/heads/main/downloads/notion-attachment-helper-mac.zip) | `启动附件辅助程序.command` |
| Windows | [Windows 版 ZIP](https://raw.githubusercontent.com/wyih/my-scripts-dist/refs/heads/main/downloads/notion-attachment-helper-windows.zip) | `start-helper.cmd` |

### Mac

1. 安装 Python 3.10 或以上，可使用 [Python 官方安装包](https://www.python.org/downloads/macos/) 或已有的 Homebrew Python。
2. 双击 `启动附件辅助程序.command`。若文件不可执行，在该文件夹的终端运行 `chmod +x 启动附件辅助程序.command`，再双击。
3. 保持终端窗口运行，复制其中显示的连接密钥。
4. 在 ChatGPT 页面的油猴菜单「📎 开关自动上传下载附件（默认关闭）」中粘贴密钥，开启功能。

### Windows

1. 安装 [Python 3.10 或以上](https://www.python.org/downloads/windows/)，启用 Python Launcher，或把 Python 加入 PATH。
2. 双击 `start-helper.cmd`，它会优先使用 `py -3`，也可使用 PATH 中的 `python`。
3. 保持命令窗口运行，复制显示的连接密钥。
4. 在 ChatGPT 页面的同一油猴附件菜单中粘贴密钥，开启功能。

开启后，直接导出对应回答，脚本自动下载生成文件，等待下载完成后上传到 Notion，并放在对应回答末尾。用户上传文件的引用卡片会从正文中省略，不会触发下载。

### 下载目录、停止与更新

默认读取 Mac 的 `~/Downloads`、Windows 的 `%USERPROFILE%\Downloads`。若 Chrome 使用其他下载位置，在辅助程序文件夹内运行：

Mac：

```sh
./启动附件辅助程序.command --downloads-dir "/实际下载目录"
```

Windows 命令提示符：

```bat
start-helper.cmd --downloads-dir "D:\ChatGPT下载"
```

Chrome 的「下载前询问保存位置」须关闭，以便自动保存；批量导出若出现允许多个文件下载的提示，需要在浏览器中允许。

关闭服务窗口或按 Ctrl+C 可停止。启动文件不会注册开机启动。更新时停止旧服务，下载新包后重新启动；连接密钥保存在用户目录，替换程序文件后仍可沿用。

自动上传上限为 20 MiB 与 Notion 工作区单文件限制中的较小值；免费工作区通常为 5 MiB。超限、下载失败或上传失败时，正文仍会保存，附件位置保留文件名与原因。

## 直接运行

Mac：

```sh
python3 helper.py --show-key
python3 helper.py --downloads-dir "$HOME/Downloads"
```

Windows：

```bat
py -3 helper.py --show-key
py -3 helper.py --downloads-dir "%USERPROFILE%\Downloads"
```

将连接密钥粘贴到 ChatGPT 页面的油猴附件菜单后，直接导出对应回答，脚本自动触发下载并等待上传。服务地址为 `http://127.0.0.1:36678`；`--port` 主要用于本地测试，普通使用保持默认端口。按 Ctrl+C 停止；下载包不会注册开机启动。

## 本机接口

`GET /health` 返回服务名称与接口版本；自动下载要求接口版本 2。

`POST /upload` 要求 `Authorization: Bearer <连接密钥>`，JSON 内容为：

```json
{"notion_token":"<原有 Notion Token>","files":[{"filename":"报告.docx","downloaded_after":1791340000,"require_new_download":true}]}
```

自动下载请求设置 `require_new_download: true`，只匹配 `downloaded_after` 之后的新文件，等待浏览器完成下载。此标记省略时保留手动下载匹配方式。

返回顺序与请求相同，每项包含 `filename`、`status`（`uploaded` / `skipped` / `error`）、`file_upload_id` 或 `reason`。调用方将成功的 ID 作为 `file_upload` 文件块写入 Notion 页面，位于对应回答正文之后、分隔线之前。

程序只匹配指定下载目录中的完整文件名及 Chrome 同名编号，不接受路径。文件打开后核对文件身份，再以二进制读取，适用于 Mac 和 Windows。连接密钥保存在用户目录的 `.config/chatgpt-notion-helper/key`；Notion Token 不保存到磁盘。启动输出和请求日志不包含 Notion Token。

## 验证

```sh
python3 -m unittest discover -s tests -p test_notion_attachment_helper.py -v
```

从仓库根目录运行；Windows 将 `python3` 换成 `py -3`。测试使用本机模拟 Notion 服务，不写入真实工作区。GitHub Actions 分别在 Mac 和 Windows 上运行接口测试，Windows 还测试包含空格和中文路径的 `.cmd` 启动文件。

接口依据：[Notion 小文件上传](https://developers.notion.com/guides/data-apis/uploading-small-files)、[工作区文件限制](https://developers.notion.com/guides/data-apis/working-with-files-and-media)。
