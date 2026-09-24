# T.OF...

T.OF... のゲームとアプリの一覧サイト。 → https://t-of.github.io/

あわせて、アプリを作るときの共通ルールと道具もここにまとめている。

| ファイル | 内容 |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Claude Code で本部を開いたときの指示（組織・役割・進め方） |
| [RULES.md](RULES.md) | **アプリ制作ルール**（必須事項・公開前チェックリスト・自動チェック） |
| [docs/BRAND.md](docs/BRAND.md) | 名前の表記・ロゴ・色・アイコンの作り方・文章 |
| [docs/RELEASE.md](docs/RELEASE.md) | 公開の手順 |
| [docs/board.json](docs/board.json) | プロジェクトとタスク（スタジオで見る・編集する） |
| [studio/](studio/) | 社内の様子を見るダッシュボード（`npm run studio`） |
| [docs/DECISIONS.md](docs/DECISIONS.md) | 決めたこと・ルールの例外 |
| [apps.js](apps.js) | 一覧に並べるアプリのデータ。新しいアプリはここに 1 件足す |
| [template/](template/) | 新しいアプリのひな形 |
| [webapp-kit/](webapp-kit/) | 「アプリにする」「共有」ボタンとスマホ表示の対策（正本） |
| [logo/](logo/) | T.OF... のロゴ |
| [tools/audit.mjs](tools/audit.mjs) | 全アプリの自動チェック（`npm run audit`） |
| [tools/new-app.sh](tools/new-app.sh) | ひな形から新しいアプリを作る |
| [tools/make-logo.py](tools/make-logo.py) / [make-icons.py](tools/make-icons.py) | ロゴ・アイコン・共有画像を作る |
| [.claude/](.claude/) | メンバー（企画・デザイン・実装・品質・リリース）と決まった仕事（/new-app・/release・/audit） |

## Claude Code で使う

```sh
cd ~/GitHub/tof/t-of.github.io
npm install        # 最初の 1 回（自動チェック用の Playwright）
claude
```

起動すると、Claude がディレクターとして動き、仕事をメンバーに振る。

- `/new-app` — アイデアから公開まで
- `/release <id>` — 1 本を公開・更新
- `/audit` — 全アプリの点検

## 新しいアプリを作る

```sh
tools/new-app.sh <id> "<アプリ名>" "<ひとこと>" "<説明>" "<背景色>"
```

詳しい手順は [RULES.md の 11 章](RULES.md#11-新しいアプリの始め方)。

## 注意

このサイトはすべてのアプリと同じオリジン（t-of.github.io）にある。
**ルートに Service Worker を置かないこと**（全アプリの通信を横取りしてしまう）。

## ローカルで見る

```sh
python3 -m http.server 8000   # → http://localhost:8000/
```

アイコンは本番の `/<id>/icons/...` を参照しているので、ローカルでは頭文字の仮表示になる。
