# 厳選ノート v0.1.8 – GitHub Pages

- Daily scheduled master validation at 19:17 UTC (04:17 JST, next calendar day); Actions may delay schedules.
- Sources: pokesleep-tool, sleep-dex and, when validated, the Pokémon Sleep community wiki.
- Same workflow validates, updates, commits verified changes and deploys Pages directly.
- Set **Settings → Pages → Source: GitHub Actions**.
- The first run copies the user-supplied eight PNG icons from a PINNED pokesleep-odds commit, verifies SHA-256 and saves them in this repo. Later changes to the source repo cannot affect the icons here.
- User ratings and custom icons live on the local device and are never overwritten by the update.
- After 35 days without repository commits, the scheduled run writes a tiny `data/schedule-keepalive.txt` commit to reduce the risk of GitHub auto-disabling inactive public repository schedules; GitHub-run delays still remain possible.

### First-run check

Actions → Update master and publish GitHub Pages → Run workflow. Verify both jobs succeed, eight assets are committed and the next scheduled run appears.

---

# 厳選ノート — GitHub Pages版 (v0.1.7)

ポケモンスリープの厳選優先度を記録し、全9島・3つの睡眠タイプごとに一覧する個人用PWAです。
**GitHub Pagesへ直接公開できるアップロード用ファイル**です（Netlifyのサーバー関数は含みません）。

## 新規リポジトリの推奨設定

- リポジトリ名: `pokesleep-priority`
- 説明（任意）: `Pokémon Sleep 厳選優先度管理 PWA / 図鑑・島別評価検索`
- 公開範囲: `Public`（GitHub FreeでPagesを使う場合）
- `Add a README file` / `.gitignore` / `Choose a license` は初回作成時は指定しなくて構いません（このZIPに README.md が含まれます）。
- デフォルトブランチ: `main`

## アップロード（重要）

**ZIPを1ファイルとしてGitHubにアップロードしても自動展開されません。**
ZIPを解凍し、その中の `index.html`、`app.js`、`assets`、`data`、`.github` などを**リポジトリの直下**に、フォルダー階層を保ってアップロードしてください。`pokesleep-priority-github-pages/` のような余分な親フォルダーを作らないこと。隠しフォルダー `.github` も必ず含めます。

GitHub画面の `Add file` → `Upload files` で登録できます。Androidだけでフォルダーを一括アップロードしづらい場合、PCから行うと確実です。GitHub操作後、次のように表示されれば正解です。

```text
pokesleep-priority/
  index.html
  app.js
  styles.css
  sw.js
  manifest.webmanifest
  .nojekyll
  assets/
    icon-192.png
    icon-512.png
  data/
    master.json
    seed-data.js
  .github/
    workflows/
      pages.yml
  tools/
    update_master.py
    availability.py
    embedded_islands.py
    seed.py
  tests/
    test_updater.py
    test_islands_snapshot.py
    test_sprites.py
    test_sprite_cache.js
  README.md
```

## GitHub Pagesの公開

1. GitHub上でリポジトリの `Settings` → `Pages` を開きます。
2. `Build and deployment` の `Source` を **GitHub Actions** にします。※ `Deploy from a branch` ではありません。
3. `Actions` タブで **Update master and publish GitHub Pages** を開き、`Run workflow` → `Run workflow` を実行します。初回アップロード時に自動で走っていた場合は、その成功結果があれば手動実行は不要です。
4. `deploy` ジョブが成功すると公開URLが発行されます。

例（ユーザー名が `meka-create`、リポジトリ名が上記の場合）:
`https://meka-create.github.io/pokesleep-priority/`

GitHub Pagesへの公開を自動処理するため、**GitHub Actionsのソース設定が必要です**。公開が始まらない場合は、最初に `Settings` → `Pages` を確認してください。

## 自動更新

`.github/workflows/pages.yml` が以下を行います。

- `main` に手動アップロード・コミットしたとき: サイトを公開。
- 毎日日本時間04:17ごろ: GitHub Actions がポケモン・島マスターを取得・検証し、変更があれば `data/master.json` と `data/seed-data.js` をコミットした上で**同じワークフローからサイトも再公開**。
- `Actions` タブの `Run workflow`: マスター更新チェックと再公開を手動実行。

マスターの参照元: [pokesleep-tool](https://github.com/nitoyon/pokesleep-tool)、[sleep-dex](https://github.com/AnticCosine/sleep-dex)、[ポケモンスリープ攻略・検証Wiki](https://wikiwiki.jp/poke_sleep/)。上流データの取得失敗・不整合のときは更新を停止し、**既存のマスターを保持**します。追加直後の新ポケモンの出現島は元データの更新まで未設定のことがあります。

GitHub Actionsがリポジトリへ書き込めない場合は `Settings` → `Actions` → `General` → `Workflow permissions` を確認してください。組織のポリシーで許可されない場合は変更できません。

## v0.1.7：画像取得の流量制御・エラー対策

- **画面に近い画像だけ遅延読み込み**。端末上の標準アイコン表示開始は最大3件を同時実行、開始間隔は150ms以上です。初回起動でService Workerが未稼働でも制限します。
- Service Workerでもスプライト取得を**同時最大3件・新規通信開始間隔150ms以上**に制限します。通常読み込み・30日経過後の更新・初回読み込み後のキャッシュ保存は共通キューを使います。
- 同じURLを同時に要求した場合は1回の通信を共有します。スプライトはCORSでHTTPステータスを確認し、429/5xxの場合は最大2回再試行（合計3試行）。429は `Retry-After` を優先し、待機を他の画像要求にも適用します。404などは再試行せずキャッシュしません。ネットワーク失敗は待機後再試行し、最終的に代替文字を表示します。
- 未知のリージョンフォームを解決するPokéAPIの `pokemon-species` APIも、150ms以上の間隔、429/5xx時の再試行、CacheStorageへのAPIレスポンス保存に対応しました。同じフォームで解決できない場合の連続照会は1日1回に制限します。
- **手動アイコンがある場合は外部画像を取得しません**。起動時のIndexedDB読み込みを完了してから画像の読み込みを開始します。リージョン画像・評価・島別マスター・バックアップ形式は従来どおりです。
- ブラウザ・配信元でCORSが許可されない場合、HTTP状態を安全に判定できないため、標準画像を取得できず代替文字が表示される場合があります。

## v0.1.6：リージョン画像とオフラインキャッシュ

- ロコン（アローラ）→ PokéAPI `10103`、キュウコン（アローラ）→ `10104`、ウパー（パルデア）→ `10253` の**専用スプライト**を使用します。通常のロコン・キュウコン・ウパーはそれぞれ全国図鑑番号のスプライトを使用します。
- 新しいリージョンフォームが追加された場合は、まず専用IDをマスターから参照します。未知のフォームについてはオンライン時にPokéAPIの `pokemon-species` からIDを照合し、端末に記録します。見つからない場合は別の姿の絵を誤表示せず、名前の代替表示になります。
- 標準アイコンを取得してHTTP成功を確認できると、Service Worker がその画像を CacheStorage に保存します。**初回起動でService Workerの準備より先に読み込まれた画像**も、読み込み成功を検知して後から保存します。
- 保存した画像はオフラインでも表示可能です（ストレージ削除・ブラウザによる容量回収がない場合）。**未表示・未取得の画像はオフライン保証の対象外**です。30日を経過した画像はオンライン時にバックグラウンドで取得し直します。画像キャッシュは最大350件です。
- 個別にアップロードした画像は**最優先**で表示します。IndexedDB保存・JSONバックアップはそのままです。「画像解除」で専用の標準スプライトに戻ります。キャッシュ自体には評価・メモ・画像アップロードのデータを保存しません。
- PWAのプログラム更新時にも、画像用キャッシュを別管理するため可能な限り維持します。標準画像はオリジナルのゲーム内アイコンと異なる場合があります。

## データの保存

- ☆・◎・○・△・× の評価は各端末のブラウザ内に保存されます。**GitHubリポジトリには保存されません**。
- バックアップをJSONでエクスポートできます。スマホの変更・ブラウザデータ削除の前に必ず保存してください。
- GitHub Pages上でURLを変えるとブラウザの保存先も変わる場合があるため、URL変更前にバックアップしてください。
- GitHub Pagesのサイトは静的公開です。Netlify Functionsは使いませんが、同梱マスターとGitHub Actions更新により島情報の利用・更新ができます。
- Pokémon、Pokémon Sleepは権利者に帰属します。非公式ツールです。

## ファイルの検証

```bash
python -m pip install beautifulsoup4==4.13.4
python -m unittest discover -s tests -v
node tests/test_sprite_cache.js  # 流量・429・オフライン・重複・404の模擬テスト（約4秒）
node --check app.js
node --check sw.js
```

PWAは静的ファイルなのでビルド不要です。`index.html`、`assets/`、`data/` の相対パスはGitHub Pagesのリポジトリ配下 `/pokesleep-priority/` でも動きます。

GitHub Pages公開後、初回オンライン表示→オフライン再表示の実機確認を推奨します。ブラウザや回線の条件によりキャッシュ動作が異なる場合があります。
