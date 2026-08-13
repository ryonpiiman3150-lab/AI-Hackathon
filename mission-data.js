/* Routeoffの固定ミッションカタログ。外部サービスには接続しません。 */
(function () {
  const moods = [
    { id: 'calm', label: '気持ちを整えたい', description: '呼吸が少し深くなるものを、近くで見つける。' },
    { id: 'refresh', label: '気分を変えたい', description: 'いつもの景色に、別の切り口をひとつ。' },
    { id: 'adventure', label: '小さく冒険したい', description: '少しだけ遠回りして、知らない表情に会う。' },
    { id: 'surprise', label: 'おまかせ', description: '今日の偶然に、ゆるくついていく。' }
  ];

  const missions = [
    { id: 'window-light', moodTypes: ['calm', 'surprise'], noveltyType: 'view', title: '窓のそばの光', instruction: '近くの窓辺で、光が落ちているところを一枚。', indoorInstruction: '部屋の窓辺で、光が落ちているところを一枚。', durationMinutes: 5, question: '見る前と見た後で、光の感じはどう変わりましたか？', perspectiveTags: ['light', 'space'] },
    { id: 'one-color-walk', moodTypes: ['refresh', 'surprise'], noveltyType: 'sense', title: '今日の一色', instruction: '歩きながら、なぜか目に残る一色を一枚。', indoorInstruction: '身の回りで、なぜか目に残る一色を一枚。', durationMinutes: 10, question: 'その色に目が留まった前後で、気分はどう動きましたか？', perspectiveTags: ['color', 'detail'] },
    { id: 'small-detour', moodTypes: ['adventure', 'refresh'], noveltyType: 'route', title: '角をひとつ曲がる', instruction: 'いつもと違う角をひとつ曲がり、最初に気になったものを一枚。', indoorInstruction: 'いつも使わない部屋の隅へ行き、最初に気になったものを一枚。', durationMinutes: 10, question: 'いつもと少し違う場所で、何が新しく見えましたか？', perspectiveTags: ['space', 'detail'] },
    { id: 'afternoon-shadow', moodTypes: ['calm', 'adventure'], noveltyType: 'time', title: '影の居場所', instruction: 'いまの時間だけの影を、足元か壁ぎわで一枚。', indoorInstruction: 'いまの時間だけの影を、机や壁ぎわで一枚。', durationMinutes: 5, question: '影を見つける前と後で、時間の流れはどう感じましたか？', perspectiveTags: ['light', 'traces'] },
    { id: 'quiet-sound', moodTypes: ['calm', 'surprise'], noveltyType: 'sense', title: '音のする方へ', instruction: '耳に入った小さな音の近くで、音の気配を一枚。', indoorInstruction: '部屋で聞こえる小さな音の近くを一枚。', durationMinutes: 5, question: 'その音に気づく前と後で、周りの静けさはどう変わりましたか？', perspectiveTags: ['sound', 'space'] },
    { id: 'green-between', moodTypes: ['calm', 'refresh'], noveltyType: 'view', title: 'すき間の緑', instruction: '建物や道のすき間に見える緑を一枚。', indoorInstruction: '窓や棚のそばにある緑を一枚。', durationMinutes: 10, question: '緑を見つける前と後で、目線はどこへ向きましたか？', perspectiveTags: ['nature', 'space'] },
    { id: 'ordinary-trace', moodTypes: ['adventure', 'surprise'], noveltyType: 'view', title: '誰かのあと', instruction: '道やベンチに残る、誰かの気配を一枚。', indoorInstruction: '部屋に残る、さっきまでの気配を一枚。', durationMinutes: 10, question: '気配を見つける前と後で、その場所は誰のものに感じましたか？', perspectiveTags: ['traces', 'people'] },
    { id: 'eye-level', moodTypes: ['refresh', 'adventure'], noveltyType: 'view', title: '目線を下げる', instruction: '少しかがんで、いつもより低い目線から一枚。', indoorInstruction: '座った目線から、いつもと違う一枚。', durationMinutes: 5, question: '目線を変える前と後で、見えてきたものは何でしたか？', perspectiveTags: ['detail', 'space'] },
    { id: 'slow-corner', moodTypes: ['calm', 'refresh'], noveltyType: 'action', title: '立ち止まる角', instruction: '通り過ぎがちな角で少し立ち止まり、一枚。', indoorInstruction: '通り過ぎがちな棚や机の角で少し立ち止まり、一枚。', durationMinutes: 5, question: '立ち止まる前と後で、その場所の印象はどう変わりましたか？', perspectiveTags: ['detail', 'traces'] },
    { id: 'people-distance', moodTypes: ['adventure', 'surprise'], noveltyType: 'sense', title: '人の流れの端', instruction: '人の流れを少し離れて眺め、気になった景色を一枚。', indoorInstruction: '窓の外や写真の中の人の気配を、少し離れて一枚。', durationMinutes: 10, question: '少し距離を置く前と後で、人の流れはどう見えましたか？', perspectiveTags: ['people', 'space'] },
    { id: 'sky-fragment', moodTypes: ['refresh', 'calm'], noveltyType: 'view', title: '空の切れ端', instruction: '建物の間や木の上に見える空を一枚。', indoorInstruction: '窓や画面の向こうに見える空の色を一枚。', durationMinutes: 5, question: '空を見上げる前と後で、体の向きや気分はどう変わりましたか？', perspectiveTags: ['light', 'nature'] },
    { id: 'texture-note', moodTypes: ['adventure', 'refresh'], noveltyType: 'sense', title: '触れない質感', instruction: '壁、地面、布など、触れずに気になった質感を一枚。', indoorInstruction: '机、布、本など、触れずに気になった質感を一枚。', durationMinutes: 10, question: '質感に気づく前と後で、手触りの想像はどう変わりましたか？', perspectiveTags: ['detail', 'traces'] },
    { id: 'late-light', moodTypes: ['calm', 'surprise'], noveltyType: 'time', title: 'いまだけの明るさ', instruction: '朝夕や曇り空など、いまの明るさを一枚。', indoorInstruction: '室内にある、いまの明るさの濃淡を一枚。', durationMinutes: 5, question: '明るさを見つめる前と後で、いまの時間はどう感じましたか？', perspectiveTags: ['light', 'color'] },
    { id: 'nearby-nature', moodTypes: ['adventure', 'calm'], noveltyType: 'route', title: '近所の季節', instruction: '少し遠回りして、季節の気配があるものを一枚。', indoorInstruction: '家にある、季節を思わせるものを一枚。', durationMinutes: 15, question: '季節の気配を探す前と後で、今日の空気はどう変わりましたか？', perspectiveTags: ['nature', 'color'] },
    { id: 'reflection-glimpse', moodTypes: ['refresh', 'surprise'], noveltyType: 'action', title: '映りこみの景色', instruction: '水たまりやガラスに映る、もうひとつの景色を一枚。', indoorInstruction: '鏡や画面に映る、もうひとつの景色を一枚。', durationMinutes: 10, question: '映りこみを見る前と後で、いつもの景色はどう変わりましたか？', perspectiveTags: ['light', 'space'] },
    { id: 'pause-and-listen', moodTypes: ['calm', 'adventure'], noveltyType: 'time', title: '五分後の景色', instruction: '気になる場所で五分ほど過ごし、その後の景色を一枚。', indoorInstruction: '気になる場所で五分ほど過ごし、その後の景色を一枚。', durationMinutes: 10, question: '少し待つ前と後で、景色のどこが動いて見えましたか？', perspectiveTags: ['sound', 'people'] }
  ];

  const reportTemplates = {
    light: { headline: '光のありかを見つける人', body: '最近のあなたは、ものそのものより、そこに落ちる光をよく持ち帰っています。', nextPrompt: '次は、光が届かないところも眺めてみる？' },
    color: { headline: '色に引かれる人', body: '最近のあなたは、日常に混じる色の変化をよく見つけています。', nextPrompt: '次は、同じ色がある別の場所を探してみる？' },
    traces: { headline: '残された気配を読む人', body: '最近のあなたは、通り過ぎた時間の痕跡をよく持ち帰っています。', nextPrompt: '次は、これから残りそうな気配にも目を向けてみる？' },
    nature: { headline: '近くの季節に気づく人', body: '最近のあなたは、街や部屋に混じる自然の気配をよく持ち帰っています。', nextPrompt: '次は、風や温度の変化も感じてみる？' },
    people: { headline: '人の流れを眺める人', body: '最近のあなたは、人がつくる景色や気配をよく持ち帰っています。', nextPrompt: '次は、人のいない時間の景色も眺めてみる？' },
    space: { headline: 'すき間を見つける人', body: '最近のあなたは、場所と場所の間にある余白をよく持ち帰っています。', nextPrompt: '次は、いつもより高い目線から見てみる？' },
    sound: { headline: '音の輪郭を感じる人', body: '最近のあなたは、目に見えない音の気配まで景色として持ち帰っています。', nextPrompt: '次は、いちばん静かな瞬間を待ってみる？' },
    detail: { headline: '小さな違いを拾う人', body: '最近のあなたは、見過ごしやすい細部をよく持ち帰っています。', nextPrompt: '次は、一歩引いて全体の形も眺めてみる？' }
  };

  window.NICHIJO_DATA = { moods, missions, reportTemplates };
}());
