#!/usr/bin/env bash
# 既存アプリ 1 本の更新を、docs/RELEASE.md の手順に沿って機械的に進める。
# 新しいアプリの作成・apps.js の編集など判断が要る部分はしない（release エージェントか手で行う）。
#
#   tools/release.sh <id>            audit → push → ビルド待ち → 反映を確かめる
#   tools/release.sh <id> --dry-run  何もしない。手順だけ表示する
#
# 使うもの: npm run audit、git push、gh api（GitHub Pages のビルド待ち）、curl（反映の確認）

set -euo pipefail

HUB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPS_DIR="$(dirname "$HUB")/apps"

id="${1:-}"
dry_run=false
for a in "$@"; do [ "$a" = "--dry-run" ] && dry_run=true; done
if [ -z "$id" ]; then
  echo "使い方: tools/release.sh <id> [--dry-run]" >&2
  exit 1
fi

app_dir="$APPS_DIR/$id"
if [ ! -d "$app_dir/.git" ]; then
  echo "リポジトリがない: $app_dir" >&2
  exit 1
fi

# apps.js から host / url を拾う（Cloudflare のアプリは Pages の gh api が使えないので、確認先が変わる）
app_info=$(cd "$HUB" && node -e "
const fs = require('node:fs');
const window = {};
new Function('window', fs.readFileSync('apps.js', 'utf8'))(window);
const app = (window.TOFO_APPS || []).find((a) => a.id === '$id');
console.log((app && app.host) || '-', (app && app.url) || '-');
")
read -r host url <<< "$app_info"
[ "$url" = "-" ] && url=""
if [ "$host" = "cloudflare" ]; then
  prod_url="$url"
else
  prod_url="https://t-of.github.io/$id/"
fi

echo "== 1. npm run audit -- $id =="
if $dry_run; then
  echo "(dry-run) 実行しない: cd '$HUB' && npm run audit -- '$id'"
else
  (cd "$HUB" && npm run audit -- "$id")
fi

echo "== 2. 反映前の本番の中身を覚えておく =="
before_hash=""
if curl -sf -o /tmp/release-before.html "$prod_url" 2>/dev/null; then
  before_hash=$(shasum -a 256 /tmp/release-before.html | cut -d' ' -f1)
fi
echo "before: ${before_hash:-（まだ何もない）}"

echo "== 3. push =="
if $dry_run; then
  echo "(dry-run) 実行しない: cd '$app_dir' && git push"
else
  (cd "$app_dir" && git push)
fi

if [ "$host" = "cloudflare" ]; then
  echo "== 4. Cloudflare Workers Builds には gh api の確認先がない。少し待ってから URL を確かめる =="
  if $dry_run; then
    echo "(dry-run) 実行しない: sleep 20"
  else
    sleep 20
  fi
else
  echo "== 4. GitHub Pages のビルドを待つ（built になるまで、最大 5 分） =="
  if $dry_run; then
    echo "(dry-run) 実行しない: gh api repos/t-of/$id/pages/builds/latest --jq .status を繰り返す"
  else
    for _ in $(seq 1 30); do
      status=$(gh api "repos/t-of/$id/pages/builds/latest" --jq .status 2>/dev/null || echo "?")
      echo "  status: $status"
      [ "$status" = "built" ] && break
      [ "$status" = "errored" ] && { echo "Pages のビルドが失敗した" >&2; exit 1; }
      sleep 10
    done
    [ "$status" = "built" ] || { echo "5 分待っても built にならなかった" >&2; exit 1; }
  fi
fi

echo "== 5. 本番の反映を確かめる =="
if $dry_run; then
  echo "(dry-run) 実行しない: curl -s -o /dev/null -w '%{http_code}' '$prod_url'"
  echo "(dry-run) 実行しない: 反映前後の中身を比べる"
else
  code=$(curl -s -o /tmp/release-after.html -w '%{http_code}' "$prod_url")
  echo "HTTP: $code"
  [ "$code" = "200" ] || { echo "本番が 200 を返さない" >&2; exit 1; }
  after_hash=$(shasum -a 256 /tmp/release-after.html | cut -d' ' -f1)
  if [ -n "$before_hash" ] && [ "$before_hash" = "$after_hash" ]; then
    echo "警告: 反映前後で中身が同じ（キャッシュか、見た目に関わらない変更かも）"
  else
    echo "反映を確認: 中身が変わった"
  fi
fi

echo "== 終わり =="
