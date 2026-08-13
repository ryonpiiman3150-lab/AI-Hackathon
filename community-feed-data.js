(() => {
  "use strict";

  // デモ専用: 人物名・記録文・画像はすべて架空です。画像はローカル生成PNGです。
  const users = [
    ["u01", "佐伯みな"], ["u02", "森田直樹"], ["u03", "石井遥"], ["u04", "河野亮"], ["u05", "高橋澪"],
    ["u06", "小川健"], ["u07", "藤原紬"], ["u08", "中村蒼"], ["u09", "山本花"], ["u10", "田辺奏"]
  ].map(([id, name]) => ({ id, name, fictional: true }));

  const observations = [
    ["窓辺の青", "朝の光が、取っ手の内側だけを明るくしていた。"],
    ["影の端", "人が通るたび、影の端が短く揺れた。"],
    ["小さな芽", "丸い葉が二枚だけ、同じ方を向いていた。"],
    ["湯気の行き先", "静かな湯気が、食卓の真ん中でほどけていた。"],
    ["曲がる手すり", "川の方へゆっくり曲がって見えた。"],
    ["聞こえそうなもの", "誰も触れないのに、かすかな音がした。"],
    ["待っていた栞", "昨日の続きが、ここで待っていた。"],
    ["午後の細い線", "床に細い影が並んでいた。"],
    ["水滴の地図", "水滴が座面を小さな地図にしていた。"],
    ["夕方の灯り", "オレンジ色が少しだけ残っていた。"]
  ];
  const moods = ["calm", "refresh", "adventure", "surprise"];
  const date = (day) => `2026-08-${String(4 + day).padStart(2, "0")}`;

  window.NICHIJO_COMMUNITY_POSTS = users.flatMap((user, userIndex) => Array.from({ length: 10 }, (_, dayIndex) => {
    const [title, answer] = observations[(userIndex * 2 + dayIndex) % observations.length];
    return {
      id: `community-${user.id}-${String(dayIndex + 1).padStart(2, "0")}`,
      userId: user.id,
      user,
      dateKey: date(dayIndex),
      mood: moods[(userIndex + dayIndex) % moods.length],
      title,
      answer,
      imageUrl: `assets/feed/${user.id}-d${String(dayIndex + 1).padStart(2, "0")}.png`,
      imageAlt: `架空の採集写真: ${title}`,
      createdAt: new Date(`${date(dayIndex)}T${String(9 + ((userIndex + dayIndex) % 10)).padStart(2, "0")}:15:00+09:00`).getTime(),
      fictional: true
    };
  }));
})();
