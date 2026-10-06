# 学習 AI（deck-builder・catan・carcassonne）

3 本の学習 AI は Mac の 1 つのチャット（本体）でまとめて進め、HAKUSAN の上のチャット（ジョブ係）がジョブを回す（2026-10-06 オーナー）。
新しいチャットで続けるときは、これとボード（各アプリの task）を読んでから始める。
進んだらここを書き直す（いまの状態だけを書く。経緯は DECISIONS.md と各アプリの設計メモ）。

## 共通

- 方針: 手書きの CPU とは別の相手「AI」として、自己対局で学習したネットで打つ。推論はブラウザ内の手書き JS。学習は HAKUSAN（CPU だけ）。
- 本体（Mac）: 設計・コードの直し・ボード・push。手元ではコンパイルと数秒の確認だけ（大きく回さない）。HAKUSAN 向けの変更は push してから、ジョブ係に「pull して何を流すか」を渡す。
- コマンドを渡すときは「HAKUSAN（hakusan1）のプロンプトで」と毎回書く（Mac で打ってしまったことがある）。
- パーティション: `sbatch -p DEF -n 64` を基本にする。SINGLE（256 コア）は研究のジョブで上限に当たっていて空かない。DEF の 1 ジョブの上限時間は未確認 → 世代ごとに保存して再開できる形にする。
- HAKUSAN の環境（入れ済み）: Node v24.21.0 が `~/opt/node/bin`、Node v22.11.0 が `~/node-v22.11.0-linux-x64/bin`。PyTorch 2.14.1+cpu は `pip --user`（~/.local、venv なし）、numpy 1.26.4、Python 3.12.3。GPU（A40・A100）はあるが使わない前提。
- 置き方はそろえる: ジョブは各アプリ直下の `jobs/`、ログは `logs/%x-%j.out`、手順は `README_hakusan.md`（deck-builder は設計メモ §11）。
- 研究（展開図）のジョブも DEF を使っているので、同時に流す本数はオーナーと相談する。

## ジョブ係（HAKUSAN の上のチャット）

HAKUSAN（hakusan1）で Claude を起動したら、まずこの節を読む。
- やること: `git pull` → `sbatch` → ログを読み、結果を短くまとめてオーナーに渡す（オーナーが Mac の本体に貼る）。
- 置き場所: `~/tof/t-of.github.io`（本部。この文書）、`~/catan`・`~/carcassonne`・`~/deck-builder`（各アプリの clone。`https://github.com/t-of/<id>.git`）。carcassonne と catan は前に tar で置いたものがあれば、消す前にオーナーに聞く（runs/・logs/ を残す）。
- してはいけないこと: ログインノードで重い計算（自己対局・学習・測定）をしない。計算は全部 sbatch。コードを直さない・commit / push しない（直したいところは本体へのまとめに書く）。docs/board.json を触らない。
- ジョブを流すのは、オーナーがそのチャットで「流して」と言ったものだけ。DEF は研究のジョブも使うので、同時に何本流すかはオーナーに聞く。
- まとめに書くこと: ジョブ番号、終わったか・落ちたか、ログの「==== 結果」から下（落ちたら tail -40）、`sinfo -p DEF` で空き具合。

## deck-builder（ドミニオン風）

- 段階: 段階 0 済み（push 済み、origin/main = f68f4e8）。HAKUSAN の計測ジョブの結果待ち（t881）。
- 設計: apps/deck-builder/docs/ai-design.md（§10 ファイルと記録の形、§11 損失・実測・HAKUSAN のコマンド）。価値ネットで買う・獲得するだけ判断し、ほかは さいきょう CPU に任せる。約 16 万パラメータ、model.bin は float16 で 328KB。
- 決めたこと: AI は 2 人のときだけ、強さは 1 つ、合格は さいきょう に全拡張ランダム 400 局で 60%。
- 待っているもの: 計測ジョブの流し直し。784139 は自己対局で「問いが終わらない」の例外で落ちた（64 中 3 プロセス）ので、f68f4e8 で打ち切り扱いにした。`cd ~/deck-builder && git pull && sbatch jobs/job_ai_bench.sh`。結果は `sed -n '/==== 結果/,$p' ~/deck-builder/logs/aibench-*.out`、失敗なら `tail -40`。
- 次: 結果で job_ai.sh の EXPERT_GAMES・GEN_GAMES（いまは仮の 20000）と世代数を直し、本番（段階 1、基本だけ）`sbatch -p DEF -n 64 jobs/job_ai.sh <名前> 0 <世代数> base` を渡す。学習は手元で約 5,000 サンプル/秒（メモの仮定の 1/20）。
- 残っている不具合: t879（持続の効果が関数で、複製・取り消し・通信の引き継ぎで消える。AI の段階 3 の試し打ちも同じ制約）。

## catan（カタン風）

- 段階: 段階 1〜3 済み（d137bae、push 済み）。HAKUSAN の計測ジョブ 784698（catanbench）待ち（t884）。
- 学習: Node で自己対局 → PyTorch で PPO（世代 0 は つよい CPU の模倣、`--init zero` でゼロから）。1 世代 8000 局、300 ターンで打ち切り。世代ごとに gen-NNNN.bin と log.jsonl を残し、同じコマンドで続きから。JS と PyTorch の一致は `python3 ai/py/parity.py`（差 1e-7 ほど）。
- 手順: apps/catan/README_hakusan.md。hakusan1 で `git clone https://github.com/t-of/catan.git ~/catan`（以後は `git pull`。tar で送る `npm run pack:hakusan` も残っている） → `bash jobs/setup.sh`（確かめるだけ）→ `sbatch jobs/job_ai_bench.sh`（5 分ほど）→ `logs/catanbench-*.out` の「==== 結果」から下を貼ってもらう。
- 次: 計測の結果で TORCH_THREADS と局数を直し、本番 `sbatch -t 12:00:00 jobs/job_ai.sh run1 125`（模倣から）と `... zero1 125 --init zero`（ゼロから）。100 万局で 64 コア 11〜16 時間の見込み。
- 設計: apps/catan/docs/ai-design.md、ai/README.md（特徴量・ネット・重みの仕様）。
- 決めたこと: 基本ルール・4 人・銀行と港の交易だけ。席は「CPU / AI（実験中）」。合格は AI 1 人 vs つよい 3 人で 1000 局以上・55% 以上。通信対戦では AI の席をホストで動かす。まず 100 万局。
- 測った数字: つよい 1 人 vs ふつう 3 人で、つよいの勝率 54%。乱数の重みのネット 4 人は 1 局 3.8 秒（320 ターン）。
- 残っている不具合: t882（探検家と海賊のテストが 40 回に 3 回落ちる。AI とは別）。

## carcassonne（カルカソンヌ風）

- 段階: 段階 1（探索 CPU、ai/search.js）と段階 2（学習の仕組み）済み。HAKUSAN の probe ジョブ（784138）は終わった（t869）。段階 3（画面に強さの選択・Worker）は未着手（t868）。main に 7 本あって push していない（1d73c00 まで）。
- 設計: apps/carcassonne/README_hakusan.md、ai/。特徴 60 入力・ネット 60-64-32-1、ai/train.mjs（自己対局 → Adam → 55% 勝てば採用。学習も Node）。ai/model.json は 3 分学習の仮。
- 測った数字: 探索 CPU は 0.2 秒/手で greedyBot に 87%（30 局）。probe（784138）は 1 世代 78 秒（自己対局 128 局、局面 18,168、検証損失 0.4463 → 0.2849、候補 45% で見送り）→ 本番の 1 世代は約 5 分の見込みで目安の内。
- 待っているもの: probe の logs を回収してから、本番 run1 を流す（下の「次」）。HAKUSAN の ~/carcassonne は tar のまま。
- 次: 1 世代 ≒ probe の時間 × 4。目安 5〜15 分で、外れたら --games / --ref-games を先に直す（arena は 400 局を割らない）。本番は例 `sbatch -t 12:00:00 jobs/job_train.sh run1 720`。持ち帰りは runs/run1/best.json → ai/model.json。
- 決めていないこと: 段階 2 の合格の数字（学習 AI が探索だけの CPU に同じ回数で勝ち越す、の何局・何 %）。
