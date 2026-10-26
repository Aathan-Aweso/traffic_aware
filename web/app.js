/* global Routing */
const SVG_NS = "http://www.w3.org/2000/svg";
const S = 10;          // svg units per km
const PAD = 3;         // km of padding around the grid

const $ = sel => document.querySelector(sel);
const state = {
  data: null, nets: {}, scenario: "High traffic", mode: "trip", focus: "A*",
  src: null, dst: null, blocked: new Set(), results: {}, anim: null,
};

const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
const fmt = (x, d = 1) => x.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

// ---------------------------------------------------------------- colours
function mix(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "rgb(" + x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",") + ")";
}
const delayColor = t => (t < .5 ? mix("#22c55e", "#eab308", t * 2) : mix("#eab308", "#ef4444", (t - .5) * 2));

// ---------------------------------------------------------------- map
let layers, toXY, edges;

function buildMap() {
  const svg = $("#map");
  const pos = state.data.scenarios[state.scenario].pos;
  const xs = pos.map(p => p[0]), ys = pos.map(p => p[1]);
  const x0 = Math.min(...xs) - PAD, x1 = Math.max(...xs) + PAD;
  const y0 = Math.min(...ys) - PAD, y1 = Math.max(...ys) + PAD;
  svg.setAttribute("viewBox", `0 0 ${(x1 - x0) * S} ${(y1 - y0) * S}`);
  toXY = i => [(pos[i][0] - x0) * S, (y1 - pos[i][1]) * S];

  edges = [];
  state.data.scenarios[state.scenario].adj.forEach((list, u) =>
    list.forEach(e => { if (u < e[0]) edges.push([u, e[0]]); }));

  svg.innerHTML = "";
  layers = {};
  for (const name of ["edges", "explored", "paths", "nodes", "pins", "hits"]) layers[name] = el("g", { class: name }, svg);

  for (const [u, v] of edges) {
    const [ax, ay] = toXY(u), [bx, by] = toXY(v);
    const g = el("g", { "data-key": Routing.key(u, v) }, layers.edges);
    const hit = el("line", { x1: ax, y1: ay, x2: bx, y2: by, class: "edge-hit" }, g);
    el("line", { x1: ax, y1: ay, x2: bx, y2: by, class: "edge", "stroke-width": 2.4 }, g);
    el("title", {}, hit);
    hit.addEventListener("click", () => toggleBlock(u, v));
  }
  for (let i = 0; i < pos.length; i++) {
    const [x, y] = toXY(i);
    el("circle", { cx: x, cy: y, r: 2.6, class: "node" }, layers.nodes);
    const hit = el("circle", { cx: x, cy: y, r: 13, class: "node-hit" }, layers.hits);
    el("title", {}, hit).textContent = `Junction ${i}`;
    hit.addEventListener("click", () => pickNode(i));
  }
  paintEdges();
}

function paintEdges() {
  const sc = state.data.scenarios[state.scenario];
  // colour by rank so the ramp spreads even when many cells share the global average
  const fs = [...new Set(sc.adj.flatMap(l => l.map(e => e[5])))].sort((a, b) => a - b);
  const rank = f => fs.length > 1 ? fs.indexOf(f) / (fs.length - 1) : 0;
  for (const g of layers.edges.children) {
    const [u, v] = g.dataset.key.split("-").map(Number);
    const e = sc.adj[u].find(x => x[0] === v);
    const line = g.children[1], blocked = state.blocked.has(g.dataset.key);
    line.setAttribute("class", blocked ? "edge blocked" : "edge");
    line.setAttribute("stroke", blocked ? "" : delayColor(rank(e[5])));
    line.setAttribute("stroke-opacity", blocked ? 1 : .5);
    const avgSpeed = e[1] / (e[2] / 60) * e[5];
    g.querySelector("title").textContent =
      `${fmt(e[1])} km · ${fmt(e[2])} min · delay ×${fmt(e[5], 2)} · ~${fmt(avgSpeed, 0)} km/h` +
      (blocked ? " · BLOCKED (click to reopen)" : state.mode === "block" ? " · click to block" : "");
  }
}

function drawPins() {
  layers.pins.innerHTML = "";
  [[state.src, "A", "#16a34a"], [state.dst, "B", "#dc2626"]].forEach(([n, label, color]) => {
    if (n == null) return;
    const [x, y] = toXY(n);
    const g = el("g", { class: "pin" }, layers.pins);
    el("circle", { cx: x, cy: y, r: 10, fill: color }, g);
    el("text", { x, y }, g).textContent = label;
  });
}

function pathD(path) {
  return path.map((n, i) => (i ? "L" : "M") + toXY(n).join(" ")).join("");
}

function drawResults(exploredCount = Infinity, showPaths = true) {
  layers.explored.innerHTML = "";
  layers.paths.innerHTML = "";
  const color = state.data.colors[state.focus];
  const focus = state.results[state.focus];
  if (focus) {
    focus.explored.slice(0, exploredCount).forEach(n => {
      const [x, y] = toXY(n);
      el("circle", { cx: x, cy: y, r: 9, fill: color, "fill-opacity": .55 }, layers.explored);
    });
  }
  if (!showPaths) return;
  for (const a of state.data.algos) {
    const r = state.results[a];
    if (!r || a === state.focus) continue;
    el("path", { d: pathD(r.path), class: "path", stroke: state.data.colors[a], "stroke-width": 2.5,
      "stroke-opacity": .75, "stroke-dasharray": "1 6" }, layers.paths);
  }
  if (focus) {
    el("path", { d: pathD(focus.path), class: "path", stroke: "var(--card)", "stroke-width": 9 }, layers.paths);
    el("path", { d: pathD(focus.path), class: "path", stroke: color, "stroke-width": 5.5 }, layers.paths);
  }
}

// ---------------------------------------------------------------- interaction
function setHint() {
  let t = "";
  if (state.mode === "block") t = "Click a road to block or reopen it";
  else if (state.src == null) t = "Click a junction to set the start (A)";
  else if (state.dst == null) t = "Now click the destination (B)";
  $("#hint").textContent = t;
}

function pickNode(i) {
  if (state.mode !== "trip") return;
  if (state.src == null || state.dst != null) { state.src = i; state.dst = null; }
  else if (i !== state.src) state.dst = i;
  update();
}

function toggleBlock(u, v) {
  if (state.mode !== "block") return;
  const k = Routing.key(u, v);
  state.blocked.has(k) ? state.blocked.delete(k) : state.blocked.add(k);
  paintEdges();
  update();
}

function stopAnim() {
  if (state.anim) { clearTimeout(state.anim); state.anim = null; }
  $("#animate").disabled = false;
}

function animate() {
  stopAnim();
  const r = state.results[state.focus];
  if (!r) return;
  $("#animate").disabled = true;
  const delay = Math.round(260 / Math.pow(1.6, +$("#speed").value));
  let k = 0;
  const step = () => {
    k++;
    drawResults(k, false);
    if (k < r.explored.length) state.anim = setTimeout(step, delay);
    else { drawResults(); stopAnim(); }
  };
  step();
}

// ---------------------------------------------------------------- compute + render
function update() {
  stopAnim();
  setHint();
  drawPins();
  state.results = {};
  const net = state.nets[state.scenario];
  if (state.src != null && state.dst != null) {
    for (const a of state.data.algos) state.results[a] = Routing.solve(net, state.src, state.dst, a, state.blocked);
  }
  drawResults();
  renderTable();
}

function renderTable() {
  const body = $("#results");
  const sc = state.data.scenarios[state.scenario];
  body.innerHTML = "";
  if (state.src == null || state.dst == null) {
    $("#tripline").textContent = "Pick a start and destination on the map.";
    $("#reroute").textContent = "";
    return;
  }
  const [ax, ay] = sc.pos[state.src], [bx, by] = sc.pos[state.dst];
  $("#tripline").textContent =
    `Junction ${state.src} → ${state.dst} · ${fmt(Math.hypot(ax - bx, ay - by))} km straight line · ${state.scenario}`;

  const best = state.results.Dijkstra;
  const maxExp = Math.max(...Object.values(state.results).filter(Boolean).map(r => r.expanded));
  for (const a of state.data.algos) {
    const r = state.results[a], color = state.data.colors[a];
    const tr = document.createElement("tr");
    if (a === state.focus) tr.className = "on";
    const name = `<span class="algo"><i style="background:${color}"></i>${a}</span>`;
    if (!r) tr.innerHTML = `<td>${name}</td><td colspan="5" class="bad">no route (blocked)</td>`;
    else {
      const opt = Math.abs(r.min - best.min) < 1e-6;
      const extra = opt ? "" : ` <span class="bad">+${fmt(r.min - best.min)}</span>`;
      tr.innerHTML = `<td>${name}</td><td>${fmt(r.min)}${extra}</td><td>${fmt(r.km)}</td>` +
        `<td>${fmt(r.co2 / 1000, 1)}</td>` +
        `<td><span class="bar" style="width:${Math.max(2, 24 * r.expanded / maxExp)}px;background:${color}"></span>${r.expanded}</td>` +
        `<td class="${opt ? "good" : "bad"}">${opt ? "✓" : "✗"}</td>`;
    }
    tr.addEventListener("click", () => setFocus(a));
    body.appendChild(tr);
  }

  const note = $("#reroute");
  note.textContent = "";
  if (state.blocked.size) {
    const free = Routing.solve(state.nets[state.scenario], state.src, state.dst, "A*");
    const r = state.results["A*"];
    if (!r) note.textContent = `The ${state.blocked.size} blocked road(s) cut A from B entirely.`;
    else if (r.path.join() === free.path.join()) note.textContent = `${state.blocked.size} road(s) blocked, but none on A*'s best route.`;
    else note.textContent = `Road blocks: A* re-routes around them. ${fmt(free.min)} → ${fmt(r.min)} min (+${fmt(r.min - free.min)} min).`;
  }
}

function renderBench() {
  const rows = state.data.benchmark.rows.filter(r => r.scenario === state.scenario);
  const by = Object.fromEntries(rows.map(r => [r.algorithm, r]));
  const maxNodes = Math.max(...rows.map(r => r.nodes));
  $("#benchnote").textContent = `${state.scenario} · averages over ${state.data.benchmark.trials} random trips (> 30 km), computed by the Python notebook`;
  $("#bench").innerHTML = state.data.algos.map(a => {
    const r = by[a], color = state.data.colors[a];
    return `<tr><td><span class="algo"><i style="background:${color}"></i>${a}</span></td>` +
      `<td>${fmt(r.minutes)} min</td><td>${fmt(r.km)} km</td><td>${fmt(r.co2_g / 1000, 2)} kg</td><td>${fmt(r.fuel_l, 2)} L</td>` +
      `<td><span class="bar" style="width:${Math.max(2, 90 * r.nodes / maxNodes)}px;background:${color}"></span>${fmt(r.nodes)}</td>` +
      `<td class="${r.optimal_pct > 99.9 ? "good" : r.optimal_pct < 50 ? "bad" : ""}">${fmt(r.optimal_pct, 0)}%</td></tr>`;
  }).join("");
  const A = by["A*"], D = by.Dijkstra, B = by.BFS, G = by.Greedy;
  $("#findings").innerHTML = [
    `A* finds the optimal route in <b>${fmt(A.optimal_pct, 0)}%</b> of trips while checking <b>${fmt(100 * (1 - A.nodes / D.nodes), 0)}% fewer</b> junctions than Dijkstra.`,
    `BFS ignores traffic: its trips take <b>${fmt(100 * (B.minutes / A.minutes - 1))}% longer</b> and emit <b>${fmt(100 * (B.co2_g / A.co2_g - 1))}% more CO₂</b>.`,
    `Greedy is the fastest search (${fmt(G.nodes)} junctions) but optimal in only <b>${fmt(G.optimal_pct, 0)}%</b> of trips.`,
  ].map(s => `<li>${s}</li>`).join("");
}

function setFocus(a) {
  state.focus = a;
  document.querySelectorAll("#algos .chip").forEach(c => c.classList.toggle("on", c.dataset.algo === a));
  stopAnim();
  drawResults();
  renderTable();
}

function setScenario(name) {
  state.scenario = name;
  document.querySelectorAll("#scenario button").forEach(b => b.classList.toggle("on", b.dataset.sc === name));
  paintEdges();
  update();
  renderBench();
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll("#mode button").forEach(b => b.classList.toggle("on", b.dataset.mode === mode));
  $("#map").classList.toggle("block-mode", mode === "block");
  paintEdges();
  setHint();
}

function demoTrip() {
  [state.src, state.dst] = state.data.scenarios[state.scenario].demo;
  update();
  animate();
}

function randomTrip() {
  const pos = state.data.scenarios[state.scenario].pos;
  let s, d;
  do {
    s = Math.floor(Math.random() * pos.length);
    d = Math.floor(Math.random() * pos.length);
  } while (s === d || Math.hypot(pos[s][0] - pos[d][0], pos[s][1] - pos[d][1]) < 30);
  state.src = s; state.dst = d;
  update();
  animate();
}

// ---------------------------------------------------------------- boot
async function init() {
  state.data = await (await fetch("data.json")).json();
  for (const [k, sc] of Object.entries(state.data.scenarios)) state.nets[k] = Routing.makeNet(sc);

  const segs = $("#scenario");
  for (const name of Object.keys(state.data.scenarios)) {
    const b = document.createElement("button");
    b.dataset.sc = name;
    b.textContent = name.replace(" traffic", "");
    b.addEventListener("click", () => setScenario(name));
    segs.appendChild(b);
  }
  const chips = $("#algos");
  for (const a of state.data.algos) {
    const b = document.createElement("button");
    b.className = "chip";
    b.dataset.algo = a;
    b.style.color = state.data.colors[a];
    b.innerHTML = `<i style="background:${state.data.colors[a]}"></i><span style="color:var(--ink)">${a}</span>`;
    b.addEventListener("click", () => setFocus(a));
    chips.appendChild(b);
  }
  document.querySelectorAll("#mode button").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
  $("#animate").addEventListener("click", animate);
  $("#demo").addEventListener("click", demoTrip);
  $("#random").addEventListener("click", randomTrip);
  $("#clear").addEventListener("click", () => { state.blocked.clear(); paintEdges(); update(); });

  buildMap();
  setFocus("A*");
  setScenario(state.scenario);
  demoTrip();
}

init().catch(err => {
  $("#hint").textContent = "Failed to load network data: " + err.message;
});
