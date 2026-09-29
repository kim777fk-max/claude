# ナレーション／アバターの差し替え計画（未実施）

この版は無音。音声とアバターは、あとから差し込める構成にしてある。
**有料 API（Aivis Cloud / Gemini TTS / HeyGen）は呼んでいない。認証情報もリポジトリに置かない。**

## 手順（承認と認証がそろってから）
1. 台本を確定し、Aivis または Gemini TTS で音声を生成して `assets/audio/narration.wav` に置く。
2. 音声の長さを実測する: `ffprobe -v error -show_entries format=duration -of csv=p=0 assets/audio/narration.wav`
3. 各場面の区切り秒を実測値に合わせる。直すのは `index.html` の scene1〜3 の `data-start` / `data-duration` と、
   ルートの `data-duration` だけ。各シーン内部のタイムラインは相対時間なので、そのまま使える。
   音声が15秒を超えても、途中で切らない。尺のほうを延ばす。
4. `index.html` の「Audio slot」に `<audio id="narration" src="assets/audio/narration.wav" data-start="0" data-duration="<実測>" data-track-index="3"></audio>` を追加する
   （`id` は必須。id がないとミキサーに拾われず、無音になる）。
5. HeyGen を使う場合: **手順1と同じ音声**を渡し、口パク動画を生成する → `<video muted>` として別トラックで重ねる
   （音は narration の `<audio>` 側から鳴らす）。重ねる位置は現在のレイアウトに空きがないため、場面ごとに再設計が必要。
6. `npx hyperframes check --snapshots` → render → ffprobe で音声ストリームと長さを確認する。

## 台本の叩き台（未確定・音声は未生成）
| 場面 | 画面 | 読み上げ案 |
|---|---|---|
| S1 0–5s | 18:00・LINE確認 | 夕方6時。LINEに届いた業務連絡を、AIがまとめて確認します。 |
| S2 5–10s | 依頼・期限の抽出 | 雑談は除いて、依頼と期限だけを抜き出します。 |
| S3 10–15s | 翌朝の朝会へ | 整理した依頼は、翌朝の朝会へ引き継ぎます。これは構想段階のイメージです。 |
