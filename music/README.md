# BGM（フリー音源）の追加方法

1. 曲ファイル（mp3 / m4a / ogg）をこの `music` フォルダに入れる
2. `tracks.js` に1行足す

```js
window.MUSIC_TRACKS = [
  { title: '朝のカフェ', file: 'music/morning-cafe.mp3', credit: 'Kevin MacLeod', license: 'CC0' },
];
```

3. GitHub Desktop で Commit → Push

## 曲を選ぶときの注意

このリポジトリは公開なので、曲ファイルそのものを誰でもダウンロードできる状態になります。
**ファイルの再配布まで許可されている曲**（CC0 / パブリックドメインなど）を選んでください。
「作品の中で使うのはOK、ファイル単体の再配布はNG」という規約のフリー音源サイトも多いので、利用規約を確認してから入れましょう。
