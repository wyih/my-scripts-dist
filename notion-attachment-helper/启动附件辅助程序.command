#!/bin/zsh
helper_dir="$(cd "$(dirname "$0")" && pwd)"
for helper_python in python3 /opt/homebrew/bin/python3 /usr/local/bin/python3; do
    if command -v "$helper_python" >/dev/null 2>&1 && "$helper_python" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
        break
    fi
    helper_python=''
done
if [[ -z "$helper_python" ]]; then
    print '需要 Python 3.10 或以上，请先从 https://www.python.org/downloads/macos/ 安装。'
    read -r '?按回车关闭。'
    exit 1
fi
print '复制下面的连接密钥，在油猴菜单“开关自动上传下载附件”中粘贴：'
"$helper_python" "$helper_dir/helper.py" --show-key "$@" || exit 1
exec "$helper_python" "$helper_dir/helper.py" "$@"
