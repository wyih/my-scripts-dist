import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

spec = importlib.util.spec_from_file_location('notion_attachment_helper', Path(__file__).parents[1] / 'notion-attachment-helper/helper.py')
helper_module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = helper_module
spec.loader.exec_module(helper_module)


class NotionMock(BaseHTTPRequestHandler):
    workspace_limit = 5 * helper_module.MIB
    requests = []

    def log_message(self, *args):
        pass

    def respond(self, value, status=200):
        data = json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.requests.append((self.command, self.path, b'', dict(self.headers)))
        self.respond({'bot': {'workspace_limits': {'max_file_upload_size_in_bytes': self.workspace_limit}}})

    def do_POST(self):
        data = self.rfile.read(int(self.headers['Content-Length']))
        self.requests.append((self.command, self.path, data, dict(self.headers)))
        if self.path.endswith('/file_uploads'):
            if json.loads(data)['filename'].endswith('.exe'):
                self.respond({'message': 'Unsupported file type'}, 400)
            else:
                self.respond({'id': 'file-upload-id', 'status': 'pending'})
        else:
            self.respond({'id': 'file-upload-id', 'status': 'uploaded'})


class AttachmentHelperTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.notion = ThreadingHTTPServer(('127.0.0.1', 0), NotionMock)
        cls.notion_thread = threading.Thread(target=cls.notion.serve_forever, daemon=True)
        cls.notion_thread.start()
        cls.previous_api = helper_module.NOTION_API
        helper_module.NOTION_API = f'http://127.0.0.1:{cls.notion.server_port}/v1'

    @classmethod
    def tearDownClass(cls):
        helper_module.NOTION_API = cls.previous_api
        cls.notion.shutdown()
        cls.notion.server_close()
        cls.notion_thread.join()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.downloads = Path(self.temp.name) / 'Downloads'
        self.downloads.mkdir()
        NotionMock.workspace_limit = 5 * helper_module.MIB
        NotionMock.requests = []
        self.helper = helper_module.AttachmentHelper(self.downloads, wait_seconds=0)
        self.server = helper_module.make_server(self.helper, 'test-local-key', 0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def post(self, files, *, key='test-local-key', host=None):
        headers = {'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
        if host:
            headers['Host'] = host
        request = Request(f'http://127.0.0.1:{self.server.server_port}/upload',
                          data=json.dumps({'notion_token': 'test-notion-token', 'files': files}).encode(), headers=headers)
        try:
            with urlopen(request, timeout=10) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            with error:
                return error.code, json.load(error)

    def test_upload_latest_completed_chrome_copy_and_skip_free_plan_oversize(self):
        old = self.downloads / '报告.docx'
        old.write_bytes(b'old content')
        os.utime(old, (time.time() - 20, time.time() - 20))
        content = b'PK\x03\x04' + '这是最新的报告'.encode()
        (self.downloads / '报告 (1).docx').write_bytes(content)
        with (self.downloads / 'large.pdf').open('wb') as file:
            file.truncate(5 * helper_module.MIB + 1)
        status, data = self.post([{'filename': '报告.docx'}, {'filename': 'large.pdf'}, {'filename': 'missing.txt'}])
        self.assertEqual(status, 200)
        uploaded, large, missing = data['results']
        self.assertEqual(uploaded['status'], 'uploaded')
        self.assertEqual(uploaded['file_upload_id'], 'file-upload-id')
        self.assertEqual(uploaded['size_bytes'], len(content))
        self.assertEqual(uploaded['limit_bytes'], 5 * helper_module.MIB)
        self.assertEqual(large['status'], 'skipped')
        self.assertIn('大小限制', large['reason'])
        self.assertEqual(missing['status'], 'skipped')
        send = NotionMock.requests[-1]
        self.assertEqual(send[1], '/v1/file_uploads/file-upload-id/send')
        self.assertIn(content, send[2])
        self.assertNotIn(b'old content', send[2])
        self.assertIn('filename="报告.docx"'.encode(), send[2])
        self.assertTrue(send[3]['Content-Type'].startswith('multipart/form-data; boundary='))
        self.assertTrue(all(request[3]['Notion-Version'] == helper_module.NOTION_VERSION for request in NotionMock.requests))
        created = json.loads(NotionMock.requests[-2][2])
        self.assertEqual(created['content_type'], 'application/octet-stream')

    def test_paid_plan_auto_upload_cap_and_exact_boundary(self):
        NotionMock.workspace_limit = 5 * 1024 ** 3
        with (self.downloads / 'too-large.zip').open('wb') as file:
            file.truncate(20 * helper_module.MIB + 1)
        with (self.downloads / 'boundary.zip').open('wb') as file:
            file.truncate(20 * helper_module.MIB)
        _, data = self.post([{'filename': 'too-large.zip'}, {'filename': 'boundary.zip'}])
        skipped, uploaded = data['results']
        self.assertEqual(skipped['status'], 'skipped')
        self.assertEqual(skipped['limit_bytes'], 20 * helper_module.MIB)
        self.assertEqual(uploaded['status'], 'uploaded')
        self.assertEqual(uploaded['size_bytes'], 20 * helper_module.MIB)

    def test_partial_download_does_not_upload_an_old_copy(self):
        (self.downloads / 'report.pdf').write_bytes(b'old')
        partial = self.downloads / 'report (1).pdf.crdownload'
        partial.write_bytes(b'new')
        _, data = self.post([{'filename': 'report.pdf'}])
        self.assertEqual(data['results'][0]['status'], 'skipped')
        self.assertEqual(len(NotionMock.requests), 1)
        partial.rename(self.downloads / 'report (1).pdf')
        _, data = self.post([{'filename': 'report.pdf', 'downloaded_after': time.time()}])
        self.assertEqual(data['results'][0]['status'], 'uploaded')
        self.assertIn(b'new', NotionMock.requests[-1][2])

    def test_stale_download_not_used_after_new_download_click(self):
        path = self.downloads / 'report.pdf'
        path.write_bytes(b'old')
        os.utime(path, (time.time() - 60, time.time() - 60))
        _, data = self.post([{'filename': 'report.pdf', 'downloaded_after': time.time()}])
        self.assertEqual(data['results'][0]['status'], 'skipped')

    def test_waits_for_automatic_download_and_uses_new_copy(self):
        old = self.downloads / 'report.pdf'
        old.write_bytes(b'old download')
        os.utime(old, (time.time() - 0.1, time.time() - 0.1))
        self.helper.wait_seconds = 2
        started = time.time()

        def browser_download():
            time.sleep(0.15)
            partial = self.downloads / 'report (1).pdf.crdownload'
            partial.write_bytes(b'new automatic download')
            time.sleep(0.35)
            partial.rename(self.downloads / 'report (1).pdf')

        writer = threading.Thread(target=browser_download)
        writer.start()
        try:
            _, data = self.post([{'filename': 'report.pdf', 'downloaded_after': started, 'require_new_download': True}])
        finally:
            writer.join()
        self.assertEqual(data['results'][0]['status'], 'uploaded')
        self.assertIn(b'new automatic download', NotionMock.requests[-1][2])
        self.assertNotIn(b'old download', NotionMock.requests[-1][2])

    def test_connection_key_paths_and_links_protect_local_files(self):
        status, _ = self.post([{'filename': 'report.pdf'}], key='wrong-key')
        self.assertEqual(status, 401)
        status, _ = self.post([{'filename': 'report.pdf'}], key='clé')
        self.assertEqual(status, 401)
        status, _ = self.post([{'filename': 'report.pdf'}], host='unrelated.example')
        self.assertEqual(status, 403)
        for name in ['../outside.txt', '/tmp/outside.txt', r'..\outside.txt', 'bad\nname.txt']:
            status, _ = self.post([{'filename': name}])
            self.assertEqual(status, 400)
        self.assertEqual(NotionMock.requests, [])
        outside = Path(self.temp.name) / 'outside.txt'
        outside.write_bytes(b'private file')
        try:
            (self.downloads / 'link.txt').symlink_to(outside)
        except OSError as error:
            if os.name != 'nt' or error.winerror != 1314:
                raise
            return  # Windows can require elevated rights to create a symlink.
        _, data = self.post([{'filename': 'link.txt'}])
        self.assertEqual(data['results'][0]['status'], 'skipped')
        self.assertEqual(len(NotionMock.requests), 1)

    def test_upstream_rejection_is_per_attachment_and_missing_limit_falls_back(self):
        NotionMock.workspace_limit = None
        (self.downloads / 'unsupported.exe').write_bytes(b'bad type')
        (self.downloads / 'okay.txt').write_bytes(b'good file')
        _, data = self.post([{'filename': 'unsupported.exe'}, {'filename': 'okay.txt'}])
        failed, uploaded = data['results']
        self.assertEqual(failed['status'], 'error')
        self.assertIn('Unsupported file type', failed['reason'])
        self.assertEqual(uploaded['status'], 'uploaded')
        self.assertEqual(uploaded['limit_bytes'], 5 * helper_module.MIB)

    def test_connection_key_is_generated_once_and_kept_private(self):
        key_path = Path(self.temp.name) / 'config/key'
        first = helper_module.load_key(key_path)
        self.assertGreaterEqual(len(first), 32)
        self.assertEqual(helper_module.load_key(key_path), first)
        if os.name != 'nt':
            self.assertEqual(key_path.stat().st_mode & 0o777, 0o600)

    def test_binary_upload_without_unix_open_flag(self):
        content = b'PK\x03\x04\r\n\x1a\x00' + '中文文件'.encode()
        (self.downloads / '报告.docx').write_bytes(content)
        with patch.object(os, 'O_NOFOLLOW', 0, create=True):
            _, data = self.post([{'filename': '报告.docx'}])
        self.assertEqual(data['results'][0]['status'], 'uploaded')
        self.assertEqual(data['results'][0]['size_bytes'], len(content))
        self.assertIn(content, NotionMock.requests[-1][2])

    def test_replaced_file_is_rejected_before_reading(self):
        path = self.downloads / 'report.txt'
        path.write_bytes(b'expected download')
        replacement = self.downloads / 'replacement.txt'
        replacement.write_bytes(b'other file must not be uploaded')
        original_open = os.open

        def replace_then_open(filename, flags, *args, **kwargs):
            replacement.replace(path)
            return original_open(filename, flags, *args, **kwargs)

        with patch.object(os, 'O_NOFOLLOW', 0, create=True), patch.object(os, 'open', replace_then_open):
            _, data = self.post([{'filename': 'report.txt'}])
        self.assertEqual(data['results'][0]['status'], 'skipped')
        self.assertIn('替换', data['results'][0]['reason'])
        self.assertEqual(len(NotionMock.requests), 1)

    @unittest.skipUnless(os.name == 'nt', 'Windows launcher')
    def test_windows_launcher_handles_spaces_and_chinese_path(self):
        folder = Path(self.temp.name) / '中文 helper folder'
        folder.mkdir()
        for name in ['helper.py', 'start-helper.cmd']:
            shutil.copyfile(Path(__file__).parents[1] / 'notion-attachment-helper' / name, folder / name)
        result = subprocess.run(['cmd', '/d', '/c', 'call', str(folder / 'start-helper.cmd'), '--help'],
                                capture_output=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr.decode('utf-8', errors='replace'))
        self.assertIn(b'--downloads-dir', result.stdout)


if __name__ == '__main__':
    unittest.main()
