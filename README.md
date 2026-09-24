# T.OF...

T.OF... のゲームとアプリの一覧サイト。 → https://sora3141.github.io/

あわせて、アプリを作るときの共通ルールと道具もここにまとめている。

| ファイル | 内容 |
|---|---|
| [RULES.md](RULES.md) | **アプリ制作ルール**（必須事項・公開前チェックリスト・既知の落とし穴） |
| [apps.js](apps.js) | 一覧に並べるアプリのデータ。新しいアプリはここに 1 件足す |
| [template/](template/) | 新しいアプリのひな形（`<head>`・manifest・sw.js・README） |
| [webapp-kit/](webapp-kit/) | 「アプリにする」「共有」ボタンとスマホ表示の対策（正本） |
| [tools/new-app.sh](tools/new-app.sh) | ひな形から新しいアプリを作る |
| [tools/make-icons.py](tools/make-icons.py) | このサイトのアイコンと OGP 画像を作る |

## 新しいアプリを作る

```sh
tools/new-app.sh <id> "<アプリ名>" "<ひとこと>" "<説明>" "<背景色>"
```

詳しい手順は [RULES.md の 11 章](RULES.md#11-新しいアプリの始め方)。

## 注意

このサイトはすべてのアプリと同じオリジン（sora3141.github.io）にある。
**ルートに Service Worker を置かないこと**（全アプリの通信を横取りしてしまう）。

## ローカルで見る

```sh
python3 -m http.server 8000   # → http://localhost:8000/
```

アイコンは本番の `/<id>/icons/...` を参照しているので、ローカルでは頭文字の仮表示になる。
