# Routeoff

いつもの道から少し外れ、日常の小さな寄り道を一枚持ち帰る体験を確認するローカルデモです。評価や連続記録ではなく、その日の発見と気分が近い人の景色を残します。

## 開発状況

| 項目 | 状態 | 内容 |
|---|---|---|
| ローカルデモ | 利用可 | HTML / CSS / JavaScript と IndexedDB で動作 |
| 他PCでのローカル利用 | 完了 | [#16](https://github.com/ryonpiiman3150-lab/AI-Hackathon/issues/16) Node.jsで独立起動。各PCの記録はそのPC内だけに保存 |
| 既存端末の保存互換 | 完了 | [#14](https://github.com/ryonpiiman3150-lab/AI-Hackathon/issues/14) 旧形式のIndexedDBを既存記録を残したまま更新 |
| テストログイン | 完了 | デモユーザー1・デモユーザー2のローカルテストアカウント |
| 非公開プロフィール | 完了 | 任意インタビュー、あとで設定、端末内保存、みんなには非表示 |
| My Route・導線 | 完了 | [#22](https://github.com/ryonpiiman3150-lab/AI-Hackathon/issues/22) ログイン後の初期画面、今日の寄り道への入口、メニューを「寄り道／みつける／My Route」へ統一 |
| My Routeの傾向分析 | 完了 | [#21](https://github.com/ryonpiiman3150-lab/AI-Hackathon/issues/21) 直近1週間の写真・投稿内容を基にした、3行のポジティブ傾向分析 |
| みつける | 完了 | [#20](https://github.com/ryonpiiman3150-lab/AI-Hackathon/issues/20) 写真グリッドから投稿者ホームと他の寄り道へ移動 |
| サービス名 | 完了 | [#19](https://github.com/ryonpiiman3150-lab/AI-Hackathon/issues/19) Routeoffへ名称・ユーザー向け文言を更新 |
| みんなのデモ投稿 | 完了 | [#15](https://github.com/ryonpiiman3150-lab/AI-Hackathon/issues/15) 架空参加者10名・10日分・ローカル生成PNG 100枚 |
| プレゼンモード | 完了 | 暫定ログの再生成と4段階のデモ案内 |
| AI送信・処理レシート | 完了 | [#23](https://github.com/ryonpiiman3150-lab/AI-Hackathon/issues/23) 送信前確認、画像の再エンコード、実測token・応答時間・推定コスト・フォールバックの表示 |
| 写真の根拠承認 | 完了 | [#24](https://github.com/ryonpiiman3150-lab/AI-Hackathon/issues/24) AIが抽出した観察可能な根拠候補を、採用・修正・非表示してから保存 |
| AIパーソナル提案 | 完了 | [#10](https://github.com/ryonpiiman3150-lab/AI-Hackathon/issues/10) 写真選択時の自動質問、[#11](https://github.com/ryonpiiman3150-lab/AI-Hackathon/issues/11) 気分選択時のお題提案。プロフィールと過去ログを文脈に利用 |
| 外部共有 | 完了 | 採集カードの画像保存・OS標準共有・投稿文コピー。X / Instagramへの直接投稿は対象外 |
| インフラ移行 | 判断済み | 外部公開またはAI接続時に OCI へ段階移行。詳細は [インフラ方針](./インフラ方針_2026-08-12.md) |

### 最終日プレゼン導線

ログイン画面の「プレゼンモードで始める」から、デモユーザー1アカウントと暫定ログを初期化して開始します。

1. 気分から今日の寄り道を選ぶ
2. 一枚の採集がMy Routeと視点レポートに残ることを見る
3. 写真から投稿者の寄り道をたどれる「みつける」を見る
4. 競争や義務感を作らない設計を伝える

### 更新ルール

- 機能の追加・変更は、実装前にGitHub Issueを作成する。
- 実装と確認が終わったら、Issueへ結果を記録してクローズする。
- この表は、機能が完了・中止・優先変更になった節目に更新する。

## 他のPCでローカルに動かす

これはクラウド版ではありません。各利用者が自分のPCへこのリポジトリ一式をコピー（またはGitでclone）し、ローカルサーバーを起動して使います。起動したPC以外からはアクセスできず、写真・下書き・採集記録はそのPCのブラウザ内にだけ保存されます。端末間で記録・プロフィール・ログイン状態は同期されません。

### 1. 準備するもの

1. このリポジトリのフォルダ一式（`assets/` を含む）
2. [Node.js 20 LTS 以上](https://nodejs.org/)
3. AIの個別提案を使う場合だけ、**その利用者自身のOrcaRouter APIキー**

Node.jsを入れた後、ターミナルまたはPowerShellで次を実行し、バージョンが `v20` 以上であることを確認します。

```bash
node --version
```

### 2. OrcaRouterを使わない場合

APIキーなしでも、固定のお題・固定の一問・写真記録・採集帳・みんなのデモ投稿は利用できます。この場合は次のOS別手順で起動するだけです。

### 3. OrcaRouterを使う場合（PCごと・利用者ごとに設定）

OrcaRouterのキーは共有キーとして配布せず、**利用者ごとに自分のアカウントで発行し、自分のPCだけへ設定**してください。キーの利用量・請求・失効はキー所有者のアカウントに紐づきます。

1. [OrcaRouter Console のAPIキー画面](https://www.orcarouter.ai/console/keys)でアカウントにログインし、個人用APIキーを発行します。キーは `sk-orca-...` の形式です。
2. このプロジェクトのルートで、ひな形から `.env.local` を作ります。

Mac / Linux:

```bash
cp .env.example .env.local
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

3. `.env.local` をテキストエディタで開き、`ORCAROUTER_API_KEY=` の右側へ自分のキーだけを貼り付けます。

```dotenv
ORCAROUTER_API_KEY=sk-orca-自分のキー
ORCAROUTER_BASE_URL=https://api.orcarouter.ai/v1
ORCAROUTER_MODEL=openai/gpt-4o-mini
```

4. 保存後、アプリをいったん終了してからもう一度起動します。`http://127.0.0.1:8000/api/health` を開き、`{"configured":true}` と表示されれば設定を読み込めています。

`.env.local` はGit管理外です。メール、Slack、チャット、スクリーンショット、共有フォルダへキーを載せないでください。誤って共有した場合は、OrcaRouter Consoleでただちにそのキーを失効・再発行してください。OrcaRouterはOpenAI互換の `https://api.orcarouter.ai/v1` を使うため、本アプリではキーをブラウザへ渡さず、ローカルの `server.js` だけが読み込みます。[公式ドキュメント](https://docs.orcarouter.ai/introduction)

## 起動方法

### Mac

Finderで `start.command` をダブルクリックします。macOSが初回実行を止めた場合は、右クリックして「開く」を選びます。ターミナルから起動する場合は次でも構いません。

```bash
npm start
```

### Windows

エクスプローラーで `start.bat` をダブルクリックするか、PowerShellで次を実行します。

```powershell
npm start
```

### Linux

ターミナルで次を実行します。

```bash
npm start
```

起動すると既定ブラウザで `http://127.0.0.1:8000/` を開きます。終了するには、起動したターミナルで `Ctrl + C` を押します。ポート8000が既に使われている場合は、Mac / Linuxでは次のように別ポートで起動できます。

```bash
PORT=8001 npm start
```

Windows PowerShellでは次を使います。

```powershell
$env:PORT=8001; npm start
```

キーが未設定の場合やAI接続に失敗した場合も、固定のお題と一問に自動で切り替わるため、アプリはそのまま利用できます。

## 確認できること

- 気分から今日の寄り道を選ぶ
- 屋外版と室内版を切り替える
- 写真一枚と短い言葉を採集記録にする
- 直近1週間の写真・投稿内容から、ポジティブな傾向を3行で見る
- 写真を撮らない日は「余白」として残す
- ログイン後にMy Routeを開き、そこから今日の寄り道を始める
- テストユーザーごとのMy Routeと、写真から投稿者の寄り道をたどる「みつける」を見る
- 気分を選ぶと、非公開プロフィールと過去の採集を文脈に、AIが今日のお題と記録用の一問を提案する
- 写真を選ぶと、写真・気分・非公開プロフィール・直近の採集からAIが自動で肯定コメントと一問を作る
- 採集カードを画像として保存し、端末の共有メニューまたは投稿文コピーで持ち出す
- プレゼンモードで暫定ログを初期化し、固定導線を実演する

## 意図して実装しないこと

Routeoffは、毎日の達成や他者との比較ではなく、その日の気分に合う小さな寄り道と発見を残すためのアプリです。そのため、次は現在の対象外としています。

- いいね数、フォロワー数、連続ログイン、ポイント、ランキングなど、競争や継続報酬を生む仕組み
- 利用頻度・反応数・未実施を可視化して、義務感を生む仕組み
- 通知、位置情報、天候
- 本番の認証、クラウド同期、公開、ホスティング
- 外部SNSへの直接投稿・公開、SNS認証、外部反応の取得

写真、下書き、採集記録はブラウザの `IndexedDB` に保存されます。気分を選ぶと、気分・非公開プロフィール・最近の採集を、写真を選ぶと写真も含めて、ローカル中継経由でOrcaRouterへ自動送信します。お題または一問の生成にだけ使い、保存や公開はしません。APIキーはブラウザやGitへ保存しません。以前のモックで保存した `localStorage` の記録は、元データを残したまま初回起動時に移行します。

詳しい仕様は [AI_HACK_2026_日常採集_実装設計書.md](./AI_HACK_2026_日常採集_実装設計書.md) を参照してください。
