#!/usr/bin/env python3
"""Optional loopback service for attaching completed ChatGPT downloads to Notion."""
from __future__ import annotations

import argparse
import hmac
import json
import os
import re
import secrets
import stat
import threading
import time
import unicodedata
from dataclasses import asdict, dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

MIB = 1024 * 1024
SINGLE_PART_LIMIT = 20 * MIB
NOTION_API = 'https://api.notion.com/v1'
NOTION_VERSION = '2026-03-11'
KEY_PATH = Path.home() / '.config/chatgpt-notion-helper/key'


@dataclass(frozen=True)
class Download:
    filename: str
    downloaded_after: float | None = None
    require_new_download: bool = False

    @classmethod
    def parse(cls, value: object) -> Download:
        if not isinstance(value, dict):
            raise ValueError('文件条目必须是对象')
        filename = value.get('filename')
        if (not isinstance(filename, str) or filename in ('', '.', '..')
                or re.search(r'[/\\\x00-\x1f]', filename)
                or len(filename.encode('utf-8')) > 900):
            raise ValueError('文件名无效：仅接受下载目录中的文件名')
        after = value.get('downloaded_after')
        if after is not None and (type(after) not in (int, float) or not 0 <= after <= time.time() + 60):
            raise ValueError('下载时间无效')
        fresh = value.get('require_new_download', False)
        if type(fresh) is not bool or (fresh and after is None):
            raise ValueError('新下载标记无效')
        return cls(filename, after, fresh)


@dataclass(frozen=True)
class UploadResult:
    filename: str
    status: Literal['uploaded', 'skipped', 'error']
    reason: str = ''
    file_upload_id: str = ''
    size_bytes: int = 0
    limit_bytes: int = 0


class AttachmentHelper:
    def __init__(self, downloads: Path, wait_seconds: float = 15):
        self.downloads = downloads.expanduser().resolve()
        self.wait_seconds = wait_seconds
        self._api_lock = threading.Lock()
        self._next_request = 0.0

    def _find_download(self, download: Download) -> Path | None:
        normalized = unicodedata.normalize('NFC', download.filename)
        stem, extension = os.path.splitext(normalized)
        pattern = re.compile(re.escape(stem) + r'(?: \((\d+)\))?' + re.escape(extension) + r'$')
        deadline = time.monotonic() + self.wait_seconds
        while True:
            matches = []
            partial = False
            for entry in self.downloads.iterdir():
                name = unicodedata.normalize('NFC', entry.name)
                if entry.is_symlink():
                    continue
                if name.endswith('.crdownload') and pattern.fullmatch(name[:-11]):
                    partial = True
                match = pattern.fullmatch(name)
                if match and entry.is_file():
                    info = entry.stat()
                    threshold = download.downloaded_after
                    if threshold is not None and not download.require_new_download:
                        threshold -= 2
                    if threshold is None or info.st_mtime >= threshold:
                        matches.append((info.st_mtime_ns, int(match[1] or 0), entry.name, entry))
            if matches and not partial:
                return max(matches)[-1]
            if time.monotonic() >= deadline or (not partial and download.downloaded_after is None):
                return None
            time.sleep(0.25)

    def _notion_request(self, token: str, method: str, path: str,
                        data: dict | bytes | None = None, content_type: str = 'application/json') -> dict:
        body = json.dumps(data, ensure_ascii=False).encode('utf-8') if isinstance(data, dict) else data
        request = Request(NOTION_API + path, data=body, method=method, headers={
            'Authorization': f'Bearer {token}', 'Notion-Version': NOTION_VERSION,
            'Content-Type': content_type,
        })
        # This service and the page writer run in sequence; space file API calls.
        with self._api_lock:
            time.sleep(max(0, self._next_request - time.monotonic()))
            self._next_request = time.monotonic() + 0.35
            try:
                with urlopen(request, timeout=45) as response:
                    return json.load(response)
            except HTTPError as error:
                try:
                    message = json.loads(error.read()).get('message', '')
                except (ValueError, UnicodeError):
                    message = ''
                finally:
                    error.close()
                raise RuntimeError(f'Notion API {error.code}：{message or error.reason}') from error
            except URLError as error:
                raise RuntimeError(f'Notion 网络请求失败：{error.reason}') from error

    def _upload(self, download: Download, token: str, limit: int) -> UploadResult:
        path = self._find_download(download)
        if path is None:
            return UploadResult(download.filename, 'skipped', '未找到已完成的下载，请检查浏览器下载状态及下载目录后重试', limit_bytes=limit)
        # Windows has O_BINARY but no O_NOFOLLOW. Check the opened file's
        # identity before reading so a replaced path cannot escape Downloads.
        selected = path.lstat()
        if not stat.S_ISREG(selected.st_mode):
            return UploadResult(download.filename, 'skipped', '该下载不是普通文件')
        flags = os.O_RDONLY | getattr(os, 'O_BINARY', 0) | getattr(os, 'O_NOFOLLOW', 0)
        with os.fdopen(os.open(path, flags), 'rb') as source:
            before = os.fstat(source.fileno())
            if not stat.S_ISREG(before.st_mode) or (selected.st_dev, selected.st_ino) != (before.st_dev, before.st_ino):
                return UploadResult(download.filename, 'skipped', '下载文件已被替换，请重新导出')
            if before.st_size > limit:
                return UploadResult(download.filename, 'skipped', f'超过自动上传大小限制（{limit / MIB:g} MiB）', size_bytes=before.st_size, limit_bytes=limit)
            content = source.read(limit + 1)
            after = os.fstat(source.fileno())
        if len(content) > limit or (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            return UploadResult(download.filename, 'skipped', '文件仍在写入，请下载完成后再导出', limit_bytes=limit)
        # Let Notion infer the supported type from the extension; system MIME
        # tables can mislabel valid document extensions such as .ts or .yaml.
        upload = self._notion_request(token, 'POST', '/file_uploads', {
            'mode': 'single_part', 'filename': download.filename, 'content_type': 'application/octet-stream',
        })
        upload_id = upload['id']
        mime = upload.get('content_type') or 'application/octet-stream'
        boundary = '----ChatGPTNotion' + secrets.token_hex(12)
        escaped_name = download.filename.replace('"', r'\"')
        prefix = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{escaped_name}"\r\n'
                  f'Content-Type: {mime}\r\n\r\n').encode('utf-8')
        result = self._notion_request(token, 'POST', f'/file_uploads/{upload_id}/send',
                                      prefix + content + f'\r\n--{boundary}--\r\n'.encode(),
                                      f'multipart/form-data; boundary={boundary}')
        if result.get('status') != 'uploaded':
            raise RuntimeError('Notion 未确认文件上传完成')
        return UploadResult(download.filename, 'uploaded', file_upload_id=upload_id, size_bytes=len(content), limit_bytes=limit)

    def upload_files(self, downloads: list[Download], token: str) -> list[UploadResult]:
        if not downloads:
            return []
        try:
            user = self._notion_request(token, 'GET', '/users/me')
            workspace_limit = user.get('bot', {}).get('workspace_limits', {}).get('max_file_upload_size_in_bytes')
            # Older/scoped token responses can omit limits; use the free-plan cap.
            limit = min(SINGLE_PART_LIMIT, workspace_limit if type(workspace_limit) is int and workspace_limit > 0 else 5 * MIB)
        except (RuntimeError, OSError, ValueError) as error:
            return [UploadResult(item.filename, 'error', str(error)) for item in downloads]
        results = []
        for download in downloads:
            try:
                results.append(self._upload(download, token, limit))
            except (RuntimeError, OSError, ValueError, KeyError) as error:
                results.append(UploadResult(download.filename, 'error', str(error), limit_bytes=limit))
        return results


def make_server(helper: AttachmentHelper, key: str, port: int = 36678) -> ThreadingHTTPServer:
    if not key:
        raise ValueError('连接密钥不能为空')
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: object) -> None:
            pass  # Do not log request headers, tokens, or filenames.

        def respond(self, status: int, value: dict) -> None:
            content = json.dumps(value, ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        def do_GET(self) -> None:
            if self.path == '/health':
                self.respond(200, {'service': 'chatgpt-notion-attachments', 'version': 2})
            else:
                self.respond(404, {'error': '接口不存在'})

        def do_POST(self) -> None:
            if self.headers.get('Host') not in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'):
                self.respond(403, {'error': '仅接受本机访问'})
                return
            if not hmac.compare_digest(self.headers.get('Authorization', '').encode(), f'Bearer {key}'.encode()):
                self.respond(401, {'error': '本地附件服务连接密钥不正确'})
                return
            if self.path != '/upload':
                self.respond(404, {'error': '接口不存在'})
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 65536:
                    raise ValueError('请求大小无效')
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict) or not isinstance(payload.get('files'), list):
                    raise ValueError('请求必须包含 files 列表')
                token = payload.get('notion_token')
                if not isinstance(token, str) or not token or re.search(r'[\r\n]', token):
                    raise ValueError('Notion Token 无效')
                downloads = [Download.parse(item) for item in payload['files']]
            except (ValueError, UnicodeError) as error:
                self.respond(400, {'error': str(error)})
                return
            self.respond(200, {'results': [asdict(result) for result in helper.upload_files(downloads, token)]})

    return ThreadingHTTPServer(('127.0.0.1', port), Handler)


def load_key(path: Path = KEY_PATH) -> str:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if not path.exists():
        with open(path, 'x', opener=lambda p, flags: os.open(p, flags, 0o600)) as target:
            target.write(secrets.token_urlsafe(32))
    key = path.read_text().strip()
    if not key:
        raise ValueError(f'连接密钥文件为空：{path}')
    return key


def main() -> None:
    parser = argparse.ArgumentParser(description='ChatGPT → Notion 可选本地附件辅助程序')
    parser.add_argument('--downloads-dir', type=Path, default=Path.home() / 'Downloads')
    parser.add_argument('--port', type=int, default=36678)
    parser.add_argument('--show-key', action='store_true', help='显示连接密钥后退出')
    args = parser.parse_args()
    key = load_key()
    if args.show_key:
        print(key)
        return
    helper = AttachmentHelper(args.downloads_dir)
    if not helper.downloads.is_dir():
        parser.error('下载目录不存在')
    server = make_server(helper, key, args.port)
    print(f'附件服务已启动：http://127.0.0.1:{server.server_port}；下载目录：{helper.downloads}', flush=True)
    print('按 Ctrl+C 停止。Notion Token 由导出脚本提供，不保存到磁盘。', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
