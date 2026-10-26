// Port of solve() from Traffic_route_optimization.ipynb. Works in the browser and in Node.
// Edge: [v, km, min, co2, fuel, f]. Heap entries compare (priority, node) like Python tuples.
(function (root) {
  class Heap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    less(i, j) { const x = this.a[i], y = this.a[j]; return x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]); }
    swap(i, j) { [this.a[i], this.a[j]] = [this.a[j], this.a[i]]; }
    push(item) {
      this.a.push(item);
      for (let i = this.a.length - 1; i > 0;) {
        const p = (i - 1) >> 1;
        if (!this.less(i, p)) break;
        this.swap(i, p); i = p;
      }
    }
    pop() {
      const top = this.a[0], last = this.a.pop();
      if (this.a.length) {
        this.a[0] = last;
        for (let i = 0; ;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < this.a.length && this.less(l, m)) m = l;
          if (r < this.a.length && this.less(r, m)) m = r;
          if (m === i) break;
          this.swap(i, m); i = m;
        }
      }
      return top;
    }
  }

  const key = (u, v) => (u < v ? u + "-" + v : v + "-" + u);

  function makeNet(sc) {
    const edge = sc.adj.map(list => new Map(list.map(e => [e[0], e])));
    const h = (n, goal) => {
      const [x1, y1] = sc.pos[n], [x2, y2] = sc.pos[goal];
      return Math.hypot(x1 - x2, y1 - y2) / sc.vmax * 60;  // admissible: best speed, straight line
    };
    const nbrs = (u, blocked) => sc.adj[u].filter(e => !blocked.has(key(u, e[0])));
    return { sc, edge, h, nbrs };
  }

  function solve(net, src, dst, algo, blocked = new Set()) {
    const t0 = (typeof performance !== "undefined" ? performance : Date).now();
    const parent = new Map(), explored = [], seen = new Set([src]);
    let found = false;
    if (algo === "BFS") {                                   // fewest junctions, ignores traffic
      const q = [src];
      for (let qi = 0; qi < q.length; qi++) {
        const u = q[qi];
        explored.push(u);
        if (u === dst) { found = true; break; }
        for (const [v] of net.nbrs(u, blocked))
          if (!seen.has(v)) { seen.add(v); parent.set(v, u); q.push(v); }
      }
    } else {
      const g = new Map([[src, 0]]), closed = new Set(), heap = new Heap();
      heap.push([0, src]);
      while (heap.size) {
        const [, u] = heap.pop();
        if (closed.has(u)) continue;
        closed.add(u); explored.push(u);
        if (u === dst) { found = true; break; }
        for (const e of net.nbrs(u, blocked)) {
          const v = e[0], ng = g.get(u) + e[2];
          if (algo === "Greedy") {                          // only looks at the heuristic
            if (!seen.has(v)) { seen.add(v); parent.set(v, u); g.set(v, ng); heap.push([net.h(v, dst), v]); }
          } else if (ng < (g.has(v) ? g.get(v) : 1e18)) {
            g.set(v, ng); parent.set(v, u);
            heap.push([ng + (algo === "A*" ? net.h(v, dst) : 0), v]);
          }
        }
      }
    }
    if (!found) return null;
    const path = [dst];
    while (path[path.length - 1] !== src) path.push(parent.get(path[path.length - 1]));
    path.reverse();
    const r = { path, explored, expanded: explored.length, min: 0, km: 0, co2: 0, fuel: 0 };
    for (let i = 0; i + 1 < path.length; i++) {
      const e = net.edge[path[i]].get(path[i + 1]);
      r.km += e[1]; r.min += e[2]; r.co2 += e[3]; r.fuel += e[4];
    }
    r.ms = (typeof performance !== "undefined" ? performance : Date).now() - t0;
    return r;
  }

  const api = { makeNet, solve, key };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Routing = api;
})(this);
