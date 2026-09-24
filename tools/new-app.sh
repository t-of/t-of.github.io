#!/usr/bin/env bash
# 新しいアプリのひな形を作る。
#
#   tools/new-app.sh <id> <名前> [ひとこと] [説明] [背景色]
#   例: tools/new-app.sh dot-rush "DOT RUSH" "点を集めるアクション" "点を集めて…" "#0d1017"
#
# ~/GitHub/<id>/ に template/ と webapp-kit/ をコピーし、__ID__ などを置き換え、
# 仮のアイコン（頭文字）を作って git init まで行う。
set -euo pipefail

if [ $# -lt 2 ]; then
  sed -n '2,8p' "$0"; exit 1
fi

ID=$1; NAME=$2; TITLE=${3:-$2}; DESC=${4:-}; BG=${5:-#0b0c10}
HERE=$(cd "$(dirname "$0")/.." && pwd)
DEST=${DEST_DIR:-$HOME/GitHub}/$ID

if [ -e "$DEST" ]; then echo "すでにあります: $DEST" >&2; exit 1; fi
if ! [[ $ID =~ ^[A-Za-z0-9._-]+$ ]]; then echo "id は英数字と - _ . だけにしてください" >&2; exit 1; fi

mkdir -p "$DEST"
cp -R "$HERE/template/." "$DEST/"
cp -R "$HERE/webapp-kit" "$DEST/webapp-kit"
printf '.DS_Store\n' > "$DEST/.gitignore"
touch "$DEST/.nojekyll"

export ID NAME TITLE DESC BG
python3 - "$DEST" <<'PY'
import os, sys
dest = sys.argv[1]
rep = {k: os.environ[v] for k, v in
       {'__ID__': 'ID', '__NAME__': 'NAME', '__TITLE__': 'TITLE', '__DESC__': 'DESC', '__BG__': 'BG'}.items()}
for name in ('index.html', 'style.css', 'main.js', 'sw.js', 'manifest.webmanifest', 'README.md', 'CLAUDE.md'):
    p = os.path.join(dest, name)
    s = open(p, encoding='utf-8').read()
    for a, b in rep.items():
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8').write(s)
PY

python3 "$HERE/tools/placeholder-icons.py" "$DEST/icons" "$NAME" "$BG"

git -C "$DEST" init -q -b main
echo "作成しました: $DEST"
echo "次: 本体を書く → アイコンを作る → npm run audit:browser -- $ID → docs/RELEASE.md の手順で公開"
