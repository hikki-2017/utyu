import assert from "node:assert/strict";
import { assessHour, level } from "../web/model.js";
import { sampleForecast } from "../web/forecast.js";

const mk = (o) => {
  const n = 120, f = (v) => Array(n).fill(v);
  return { time: f(""), temp: f(o.temp), rh: f(o.rh), wind: f(o.wind), dir: f(0), precip: f(o.rain ?? 0) };
};
const humid = assessHour(mk({ temp: 20, rh: 75, wind: 8, rain: 0.3 }), 100);
const dry = assessHour(mk({ temp: 30, rh: 20, wind: 30 }), 100);
assert.ok(dry.fire.score > 80, "dry+windy fire is high");
assert.ok(humid.fire.score < 15, "humid fire is low");
assert.ok(assessHour(mk({ temp: 20, rh: 80, wind: 5, rain: 6 }), 100).flood.score > 80, "heavy rain -> flood");
assert.ok(assessHour(mk({ temp: 36, rh: 60, wind: 5 }), 100).heat.score > 75, "hot -> heat");
assert.equal(level(10).label, "低");
assert.equal(level(99).label, "危険");
const s = sampleForecast([{ lat: 35, lon: 139 }]);
assert.equal(s[0].time.length, s[0].temp.length);
console.log("ok");
