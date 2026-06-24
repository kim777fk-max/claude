# `assets/` — BGM と SE のライブラリ

`mobile-shorts-edit` スキル（Remotion 経由のショート/Reels/YT 編集）が、貼り付け本文の **タグキーワード** から BGM や効果音を引くためのマニフェスト置き場です。

実音源は **Cloudinary 上に置く**（あなたが手動で video/audio として upload）。このフォルダの JSON は「タグ → secure_url」のインデックスだけを持ちます。Web セッションは毎回作り直しなので、JSON を Git に入れて再現性を保つのが目的です。

---

## ファイル

| ファイル | 用途 |
|---|---|
| `bgm-manifest.json` | BGM トラックの索引（タグで検索） |
| `se-manifest.json`  | SE（効果音）の索引 |

---

## `bgm-manifest.json` の形

```json
{
  "tracks": [
    {
      "name": "Sunny Morning Vlog",
      "tags": ["vlog", "chill", "uplifting", "朝", "晴れ"],
      "url":  "https://res.cloudinary.com/<cloud>/video/upload/v.../bgm/sunny.mp3",
      "duration": 122.5,
      "bpm":  96,
      "license": "CC0",
      "source": "Pixabay",
      "credit": "Music by xxx from Pixabay"
    },
    {
      "name": "Lo-Fi Hip Hop Loop",
      "tags": ["lofi", "lo-fi", "chill", "落ち着いた"],
      "url":  "https://res.cloudinary.com/<cloud>/video/upload/v.../bgm/lofi.mp3",
      "duration": 60,
      "bpm":  80,
      "license": "CC0",
      "source": "FreePD"
    }
  ]
}
```

- `tags` は**自由文字列の配列**。スキルがユーザー指示から拾ったキーワード（"チル"・"vlog"・"テンポ"・"感動" など）と部分一致で当てる。
- 同じタグに複数曲あれば**ランダム**で 1 本選ばれる。
- ヒットしない場合は `scripts/bgm-synth.sh` の合成パッドにフォールバックする（音は出るがあまりキャッチーではない）。

## `se-manifest.json` の形

```json
{
  "effects": [
    {
      "name": "Pop",
      "tags": ["pop", "ポップ", "クリック"],
      "url":  "https://res.cloudinary.com/<cloud>/video/upload/v.../se/pop.mp3",
      "duration": 0.25
    },
    {
      "name": "Swoosh",
      "tags": ["swoosh", "スウッシュ", "切替", "transition"],
      "url":  "https://res.cloudinary.com/<cloud>/video/upload/v.../se/swoosh.mp3",
      "duration": 0.6
    }
  ]
}
```

ヒットしない場合は**スキップ**される（音が無くて困らないので合成しない）。

---

## ライブラリの集め方（あなたの作業）

1. **ロイヤリティフリー音源を集める**。代表的なソース:
   - Pixabay Audio（CC0）: https://pixabay.com/music/ / https://pixabay.com/sound-effects/
   - YouTube Audio Library（YT クリエイター向け、各曲ライセンス確認）
   - Free Music Archive: https://freemusicarchive.org/
   - DOVA-SYNDROME（日本語、無料、要クレジット確認）: https://dova-s.jp/
   - 効果音ラボ（SE、無料）: https://soundeffect-lab.info/

2. **Cloudinary にアップ**。Cloudinary MCP `upload-asset` か `scripts/upload.sh` で（後者なら base64 経由）。`public_id` は `bgm/<name>` `se/<name>` のように分けると見通しが良い。

3. **マニフェストに追記**。`name / tags / url / duration` は最低限欲しい。`license` を必ず書いておくと後で揉めない。

4. **コミット → push**。Web セッションは新規コンテナだが、Git に入っていれば再現できる。

---

## おすすめタグ運用

| カテゴリ | タグ例 |
|---|---|
| 雰囲気 | `chill` `uplifting` `epic` `lo-fi` `cinematic` `acoustic` |
| シーン | `vlog` `cooking` `travel` `gaming` `intro` `outro` |
| 日本語並列 | `チル` `感動` `テンポ` `落ち着いた` `カフェ` `Vlog` |
| SE 種別 | `pop` `swoosh` `boom` `whoosh` `click` `notif` `cymbal` |

スキル側はユーザーの貼り付け文（例: 「BGMはチル系で」「テンポよく切り替え音入れて」）から自動でタグを拾います。
