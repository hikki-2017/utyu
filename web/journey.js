// 「宇宙の旅」: 説明なしで伝わる一本道。あなたの街 → 地球 → 月 → 太陽系 → 138億光年 → あなたの1週間。
const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (sel) => { const e = document.querySelector(sel); if (e) e.click(); };

export function initJourney({ setMode, focusTyphoon, focusIss }) {
  let running = false, abort = false;

  const say = (text, sub = "") => {
    const el = $("#jCaption");
    el.innerHTML = `<b>${text}</b>${sub ? `<span>${sub}</span>` : ""}`;
    el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  };

  const STEPS = [
    { ms: 5200, run: async () => { setMode("earth"); await sleep(600); focusTyphoon(); say("いま、この瞬間の地球です。", "衛星がさっき撮った、本物の雲"); } },
    { ms: 5200, run: () => say("台風が、ここにいます。", "気象庁の実況データ。暴風域も本物の大きさ") },
    { ms: 5200, run: () => { focusIss(); say("高度400kmを、人が乗った箱が飛んでいます。", "国際宇宙ステーション・いまの位置"); } },
    { ms: 6500, run: async () => { setMode("sky"); say("今夜、それが頭上を通る時刻まで分かります。", "軌道データから計算"); } },
    { ms: 5600, run: async () => { setMode("moon"); await sleep(500); click('#moonList button[data-k="0"]'); say("人が立った場所。半世紀前の足あと。", "NASA月探査機の実画像"); } },
    { ms: 5600, run: async () => { click('#moonInfo button[data-act="south"]'); say("次に行くのは、氷が眠る南極。", "永久に日が当たらないクレーター"); } },
    { ms: 6200, run: async () => { setMode("solar"); await sleep(500); click('#planetList button[data-id="sun"]'); say("太陽系。今日の、本当の位置です。", "軌道要素から計算した現在位置"); } },
    { ms: 5200, run: async () => { setMode("cosmos"); await sleep(600); click('#cosmosLevels button[data-i="0"]'); say("いちばん近いお隣まで、4.2光年。", "光の速さで4年"); } },
    { ms: 5600, run: () => { click('#cosmosLevels button[data-i="1"]'); say("天の川。この中の、ひとつが太陽です。", "2000億個のうちの1個"); } },
    { ms: 5200, run: () => { click('#cosmosLevels button[data-i="2"]'); say("その銀河が、無数にある。", "アンドロメダまで254万光年"); } },
    { ms: 6500, run: () => { click('#cosmosLevels button[data-i="3"]'); say("138億光年。ここが、見える宇宙の果て。", "これ以上は、光がまだ届いていない"); } },
    { ms: 3800, run: async () => { say("——そして。"); } },
    { ms: 7000, run: async () => { setMode("inner"); await sleep(1200); startInner(); say("あなたの1週間も、ひとつの宇宙でした。", "予定の密度が重力になり、宇宙が鳴りだす"); } },
    { ms: 8000, run: () => say("さっきの台風が、この宇宙で星になって光っています。", "現実の観測が、あなたの宇宙に星を生む") },
  ];

  function startInner() {
    try {
      const f = $("#inner"), d = f.contentDocument, w = f.contentWindow;
      d.querySelector("#start")?.click();
      setTimeout(() => { try { w.__cosmos?.submitWeek("バイト3回、課題に追われた、友達と遊んだ、ハッカソン"); } catch (e) {} }, 1800);
    } catch (e) { /* iframe not ready */ }
  }

  async function play() {
    if (running) return;
    running = true; abort = false;
    $("#intro").classList.add("gone");
    document.body.classList.add("journey");
    const total = STEPS.reduce((a, s) => a + s.ms, 0);
    let done = 0;
    for (const step of STEPS) {
      if (abort) break;
      try { await step.run(); } catch (e) { console.warn(e); }
      const t0 = Date.now();
      while (Date.now() - t0 < step.ms) {
        if (abort) break;
        $("#jBar").style.width = ((done + (Date.now() - t0)) / total) * 100 + "%";
        await sleep(80);
      }
      done += step.ms;
    }
    if (!abort) { $("#jCaption").classList.remove("show"); }
    document.body.classList.remove("journey");
    running = false;
  }

  $("#jStart").addEventListener("click", play);
  $("#jSkip").addEventListener("click", () => { $("#intro").classList.add("gone"); setMode("earth"); });
  $("#jStop").addEventListener("click", () => { abort = true; });
  $("#jReplay").addEventListener("click", () => { abort = true; setTimeout(play, 400); });
  return { play };
}
