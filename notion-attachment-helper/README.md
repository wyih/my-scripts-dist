# 可选附件辅助程序

ChatGPT exporter 2.34 的附件自动上传**默认关闭**。只导出对话的用户直接使用油猴脚本即可。

Mac 使用 `启动附件辅助程序.command`，Windows 使用 `start-helper.cmd`。两者均需要 Python 3.10 或以上，无需第三方 Python 依赖。完整安装、Notion 配置、上传限制和 Mac / Windows 使用步骤见 [主 README](https://github.com/wyih/my-scripts-dist/blob/main/README.md)。

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
