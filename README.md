# NETROUTE — Adaptive Network Intelligence

**Adaptive Routing for Dynamic Network Topologies and Multipath Routing for Reliable Data Transmission**

NETROUTE is an interactive, browser-only network routing simulator built for a Computer Networks case study. It animates packets moving through a 12-router topology and shows how routing decisions change when links fail, routers crash or congestion builds. It also compares adaptive single-path routing with multipath routing under identical, reproducible conditions.

Everything runs locally in the browser. There is no backend, no database, no external API and no real network traffic. Every packet, route, metric and log entry comes from the simulator's discrete-event engine.

---

## 1. Installation and startup

Requirements: Node.js 18 or newer (tested with Node 24) and npm.

```bash
npm install          # install dependencies
npm run dev          # start the development server
```

Open **http://localhost:5173** in a desktop browser (Chrome, Edge or Firefox).

Other commands:

| Command | Purpose |
|---|---|
| `npm test` | Run the 34 Vitest unit tests (routing, simulation, metrics, exports) |
| `npm run typecheck` | TypeScript type check |
| `npm run build` | Type check + production build into `dist/` |
| `npm run preview` | Serve the production build locally |

---

## 2. Technology

React 18 · Vite 5 · TypeScript (strict) · Tailwind CSS 3 · React Flow (`@xyflow/react` 12) · Zustand · Recharts · Lucide icons · Vitest.

---

## 3. Using the dashboard

| Area | What it does |
|---|---|
| **Top bar** | Status (Ready / Running / Paused / Completed), routing mode, loaded scenario, simulated clock, Learn, Settings, Reset |
| **Metric cards** | Routers online and active links (*current state*); packets sent, delivered and dropped, PDR, loss, average delay and throughput (*cumulative*); latest recovery time. In Compare mode each card shows both algorithms. |
| **Left panel → Simulate** | Start, Pause/Resume, Step (2 ms), Stop, Reset; speed (Slow / Normal / Fast / Turbo); routing mode; source and destination; packet count; injection rate; multipath distribution |
| **Left panel → Scenarios** | 8 deterministic scenarios, each with starting conditions, trigger, expected behaviour (a hypothesis), and the buttons Run Scenario (live), Load only, Reset Scenario and **Run A/B Experiment (instant)** |
| **Left panel → Events** | Disable/restore a link, apply/clear congestion, fail/restore a router, restore the entire network |
| **Canvas** | Drag routers, pan, zoom. Toolbar: select, add router (click the canvas), add link (click two routers), zoom in/out, fit, reset layout, reset topology, delete selection (`Del`). `Esc` cancels a tool. Click any router or link (or its cost label) to inspect it. |
| **Right panel → Paths** | Active route(s) with cost, hops, estimated delay and packet allocation; earlier routes; packet reordering count; **routing decision explanation** generated from the latest recalculation |
| **Right panel → Routing** | Routing table for any router (destination, next hop, cost, hops, validity), computed by Dijkstra over the routing engine's current view |
| **Right panel → Inspector** | Every property of the selected router or link, including effective cost, available bandwidth, delay breakdown, loss probability, packets carried and utilisation; fail/restore, congestion, parameter editing, removal |
| **Performance** | PDR, throughput, delay and loss over time, with failure markers; route utilisation; busiest links; recovery table |
| **Comparison** | Adaptive vs multipath table with per-metric winner, plus bar and time-series charts |
| **Export** | Results CSV, comparison CSV, packet-level CSV, event-log CSV, summary JSON, topology JSON; topology import |
| **Event log** | Chronological simulated events with category filters, an algorithm filter (compare mode), auto-scroll, clear and CSV export |

Colours: cyan = adaptive traffic, green = primary path / delivery, purple and pink = secondary multipath paths, amber = congestion, red = failure or drop.

---

## 4. Network model

The network is an undirected weighted graph **G = (V, E)**. The default topology has 12 routers (R1 = source, R12 = destination) and 25 links, with several alternate routes. Each link has a positive base cost, a bandwidth (Mbps), a propagation delay (ms), an administrative status (active or failed) and a congestion level *c* ∈ [0, 0.95].

A link can carry traffic only if it is active and both of its routers are online. A failed router therefore makes all of its links unusable (shown as **DOWN**). **Router recovery policy:** restoring a router brings back its links unless they were failed independently.

### Link performance model (used consistently everywhere)

| Quantity | Formula |
|---|---|
| Congestion multiplier | M(c) = 1 + 4c |
| Effective routing cost | baseCost × M(c) |
| Available bandwidth | B × (1 − c) |
| Transmission delay | payload bits ÷ available bandwidth |
| Congestion queueing delay | 4 ms × c ÷ (1 − c) |
| Per-hop delay | transmission + propagation + congestion queueing + waiting behind earlier packets in the output queue |
| Congestion loss probability | 0.3 × (c − 0.6) ÷ 0.35 for c > 0.6, else 0 (seeded PRNG ⇒ reproducible) |

A link is shown as *congested* (amber) when c ≥ 25 %. Each directed output queue holds at most `bufferPackets` packets (default 20). When the queue is full, arriving packets are dropped (buffer overflow).

---

## 5. Algorithms

### Adaptive single-path routing
- **Dijkstra's algorithm** (binary heap, deterministic tie-breaking) over the operational topology using effective costs. Failed links and routers are not in the graph, so they can never be chosen.
- **Control plane vs data plane.** A topology change takes effect physically at once. The routing engine converges `convergenceDelayMs` later (default 15 ms), which models failure detection and route recomputation. Routing state carries a revision number, so stale routes are always detected.
- **In-flight packet policy.**
  - A packet on a link when that link (or one of its routers) fails is lost.
  - A packet held by a failed router is lost.
  - Before convergence, a packet whose next link is down is dropped ("next-hop down").
  - After convergence, each packet is re-evaluated at its next router. Adaptive packets follow the new shortest path from that router. The continuation never revisits a router; if no loop-free continuation exists, the packet is dropped with "no route".

### Multipath routing
- **Path discovery** (configurable in Settings):
  - *Edge-disjoint* (default): repeated Dijkstra searches, temporarily excluding the links of paths already chosen. The paths share no links, so one link failure breaks at most one path.
  - *Yen's k-shortest loop-free paths*: cheaper paths that may share links.
  - Up to *k* paths (default 3). Candidates costing more than 3× the best path are discarded.
- **Distribution:**
  - *Round-robin*: packets cycle through the valid candidates.
  - *Load-aware*: smooth weighted round-robin with weight 1/D². D is the estimated path delay: advertised link state plus the current queue backlog.
- Invalid paths are removed at convergence, and new packets go only to valid candidates. A packet whose path broke is moved at its current router to the shortest valid loop-free continuation.
- Paths with different delays can deliver packets out of order. The simulator counts these out-of-order deliveries.

### Comparison
Each algorithm runs in its own `PacketEngine`, on a deep copy of the same starting topology, with the same configuration, seed, packet schedule and scripted events.
- **Instant A/B experiment:** both algorithms run headlessly to completion.
- **Compare Both mode:** both engines run live on the same clock and receive every injected event at the same simulated instant. The canvas can show either engine.

Both paths give identical numbers. A unit test checks this isolation.

---

## 6. Metrics (all derived from recorded packet events)

| Metric | Definition |
|---|---|
| Packets sent | Packets generated and injected at the source. Every sent packet ends as exactly one of delivered or dropped. |
| PDR | delivered ÷ sent × 100 |
| Packet loss rate | dropped ÷ sent × 100 |
| Average end-to-end delay | Σ(arrival − creation) ÷ delivered, in simulated ms |
| Throughput | delivered × payload × 8 bits ÷ measurement duration (first creation → completion, or now). Default payload 1 000 bytes. |
| Recovery time | Simulated time from a failure to the first delivery of a packet created at or after the failure. Reported as *Not recovered* if no such delivery happens. |
| Route utilisation | Packets assigned / delivered / dropped per route (packet counts) |
| Link utilisation | Busy transmission time ÷ measurement duration (bandwidth utilisation), shown separately from packet counts |
| Others | Route recalculations, route changes, distinct paths used, packets rerouted in flight, out-of-order deliveries, hop count, delay standard deviation, drops by cause |

Percentages and averages show **N/A** when the denominator is zero.

---

## 7. Demonstration scenarios

1. Normal Network Operation
2. Single Link Failure (R3–R7 at 150 ms)
3. Intermediate Router Failure (R7 at 150 ms)
4. Congestion and Load Redistribution (R7–R10 → 85 %, R3–R7 → 60 %)
5. Multiple Link Failures (three failures at 120 / 220 / 320 ms)
6. Network Recovery (two failed links repaired at 180 / 300 ms)
7. No Available Route (all links into R12 fail at 150 ms; R10–R12 is repaired at 400 ms)
8. Adaptive Routing versus Multipath Routing

Each scenario starts from the default topology and uses seed 42, so repeated runs give identical results.

---

## 8. Presentation guide (about 8 minutes)

1. **Introduce the model (1 min).** Point at R1 (source) and R12 (destination). The cyan dashed line is the Dijkstra route, cost 8. Click a link to show its cost, bandwidth and delay in the Inspector.
2. **Adaptive rerouting after a link failure (2 min).** Mode: Adaptive, speed Normal, press **Start**. When packets are flowing, open **Events**, choose `R3–R7` and click **Disable Link**.
   - The link turns red, and a few packets turn into red ✕ marks (lost in transit or before convergence).
   - The "reconverging" banner appears, then the route moves to R1→R2→R6→R10→R12 (cost 9).
   - Open **Paths** and read the *Routing decision* aloud: previous route, new route, cost 8 → 9, affected packets, recovery time.
3. **Router failure and congestion (1 min).** Click R7 → Inspector → **Fail Router**: its links show DOWN and routes avoid it. Then congest a link to 85 % and watch it turn amber, with its effective cost rising (2→8.8).
4. **Multipath routing (1.5 min).** Reset. Choose **Multipath** and press **Start**.
   - Three coloured edge-disjoint paths carry traffic in turn.
   - Disable `R3–R7` again: only packets on that one path are affected, while the others keep arriving.
   - Point at the out-of-order counter in Paths.
5. **Performance comparison (2 min).** Open **Scenarios → Adaptive Routing versus Multipath Routing → Run A/B Experiment**.
   - The Comparison tab shows both algorithms on identical isolated copies. In the default run, multipath delivered more packets (99 vs 96) and recovered faster (35.4 vs 41.5 ms).
   - Adaptive had lower delay (29.1 vs 31.9 ms), lower jitter, and no reordering.
   - Explain the trade-off. Optionally press **Run Scenario (live)** to show both running side by side.
6. **Evidence (30 s).** Open **Export** and download the results, packet-level CSV and summary JSON for the report.

Tip: if you have little time, use **Fast** or **Turbo** speed; the results are the same at every speed because simulated time is independent of animation speed.

---

## 9. Assumptions and limitations

- This is an **educational graph-based model** of link-state adaptive routing and multipath forwarding. It does **not** implement OSPF, BGP, MPLS or ECMP protocol messages, timers or packet formats.
- Routing is source-computed from a globally converged link-state view. Convergence is modelled as one configurable delay, not a hop-by-hop flood of link-state advertisements.
- Background congestion is a user-controlled parameter per link. The simulator's own traffic adds queueing through finite FIFO output queues, but it does not raise the advertised congestion level.
- Links are full-duplex; each direction has its own queue.
- Times are simulated milliseconds and do not depend on animation speed. Throughput values describe the simulated network, not the computer running it.
- The event log keeps the most recent 4 000 entries per algorithm, and the time-series keeps 3 000 points (enough for 1 000-packet runs).
- Topology editing (add/remove routers and links) is supported at any time. Changing mode, endpoints or packet settings requires resetting the run.

---

## 10. Project structure

```
src/
  app/App.tsx                     root component + simulation loop
  main.tsx                        entry point
  components/
    layout/                       TopBar, DashboardLayout
    topology/                     NetworkCanvas, RouterNode, NetworkEdge, PacketLayer, TopologyToolbar, PacketLegend
    simulation/                   SimulationControls, RoutingModeSelector, ScenarioSelector, EventInjectionPanel
    metrics/                      MetricCards, PerformanceCharts, ComparisonPanel, ExportPanel
    routing/                      Inspector, RoutingTable, PathDetails
    logs/                         EventLog
    common/                       StatusBadge, Tooltip, Tabs, Modal, Toasts, SettingsModal, LearnPanel, theme
  engine/
    graph.ts                      graph helpers + link performance model
    dijkstra.ts                   Dijkstra (binary heap)
    multipath.ts                  edge-disjoint / Yen path discovery, smooth weighted round-robin
    adaptiveRouting.ts            adaptive route + routing tables
    packetEngine.ts               discrete-event packet simulator (one per algorithm)
    simulationClock.ts            SimulationRunner: clock, scripted events, isolated engines, comparison
    topology.ts                   default topology + validated topology mutations
    scenarios.ts                  8 deterministic scenarios
    metrics.ts                    metric formulas
    eventQueue.ts                 event priority queue + seeded PRNG
    config.ts                     default parameters
    __tests__/                    Vitest suites + fixture topology
  store/                          Zustand store (UI mirror of the runner), frame store
  hooks/useSimulationLoop.ts      single requestAnimationFrame loop
  types/                          network, packet, simulation types
  utils/                          CSV escaping/download, exporters, formatting
  styles/index.css                Tailwind + theme
```
