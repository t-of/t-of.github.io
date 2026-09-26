#!/bin/zsh
# 決まった時刻の仕事。launchd（tools/routines/*.plist）から呼ぶ。手でも動かせる。
#   tools/routine.sh note   … note の下書きを次の 1 週間分（writer。日曜の夜に回す）
#   tools/routine.sh daily  … 日報を docs/private/daily/ と Notion に書く
# どちらも下書きを作るだけ。コミット・push・投稿はしない。
set -eu
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin
TOF=~/GitHub/tof
HQ=$TOF/t-of.github.io
NOTION_DAILY=3e74d3d9-3dcb-8161-be29-de2080138361  # Notion の「T.OF... 日報」
cd $HQ
echo "== $(date '+%F %T') $1"

case $1 in
note)
  claude -p "~/GitHub/tof/note/ideas.md の予定のうち、明日（$(date -v+1d +%F)）から 7 日間で drafts/ にまだ .md がない日の記事を、GUIDE.md に沿って 1 日 1 本ずつ下書きして。ideas.md に予定がない日は、先にネタを ideas.md に足してから書く。最後に書いたファイル名とタイトルを 1 行ずつ出す。" \
    --agent writer --model sonnet \
    --permission-mode acceptEdits --allowedTools Read Write Edit Glob Grep WebSearch WebFetch \
    --add-dir $TOF/note
  ;;
daily)
  # 23 時の予定がスリープで遅れて日付をまたいでも、その日の分として書く
  DAY=$(date -v-3H +%F)
  mkdir -p docs/private/daily
  LOG=$(for r in $HQ $HQ/docs/private $TOF/note $TOF/apps/*(N/); do
    [ -d $r/.git ] || continue
    c=$(git -C $r log --since="$DAY 00:00" --until="$DAY 23:59:59" --format='- %s' 2>/dev/null)
    [ -n "$c" ] && printf '## %s\n%s\n' ${r:t} $c
  done)
  claude -p "T.OF... の $DAY の日報を docs/private/daily/$DAY.md に書いて。材料は下のその日のコミットと docs/board.json（doneAt が $DAY のもの＝やったこと、todo・doing＝残り、owner が owner で waiting＝オーナーに決めてほしいこと）。
形: # $DAY 日報 → ## やったこと（アプリ・部ごと） → ## 残っているタスク → ## オーナーの番 → ## 明日やるとよいこと（3 つまで）。日本語で短く、作り話をしない。
書いたら ToolSearch で Notion の道具を読み込み、Notion の親ページ $NOTION_DAILY（T.OF... 日報）の子ページとして、タイトル「$DAY 日報」、本文は同じ中身（先頭の # 見出しは除く）で作る。同じタイトルの子ページがもうあれば、作らずに中身を置き換える。
--- その日のコミット ---
${LOG:-（なし）}" \
    --model sonnet \
    --permission-mode acceptEdits --allowedTools Read Write Glob Grep ToolSearch "mcp__claude_ai_Notion__*"
  ;;
*) echo "使い方: $0 note|daily" >&2; exit 1 ;;
esac
