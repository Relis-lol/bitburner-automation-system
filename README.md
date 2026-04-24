# Bitburner Automation System

Automation system built in the programming game *Bitburner*.

---

## Overview

This project evolved from simple scripts into a distributed automation system for large-scale Bitburner networks.

Core responsibilities:

- infrastructure management
- HWGW orchestration
- worker execution
- monitoring
- XP grinding
- optional stock trading

---

## Core Features

- automatic target discovery and scoring
- coordinated HWGW batch execution
- distributed workload across rooted servers
- RAM-aware scaling and scheduling
- automated server purchasing and upgrades
- real-time monitoring
- dedicated XP farming
- optional stock trading with 4S API

---

## Architecture

### Infrastructure

- **infra-manager.js**  
  Network scan, rooting, script deployment, server buying and upgrades.

---

### Orchestration

- **apex-hwgw.js** ⭐  
  Main HWGW profit engine.

  Features:
  - multi-target batching
  - prep logic
  - RAM-aware batch sizing
  - distributed execution
  - timing and concurrency control

---

### Workers

- **hack2.js / grow2.js / weaken2.js** – delay-compatible batch workers
- **hack.js / grow.js / weaken.js** – simple legacy workers

---

### XP

- **xp-grinder.js**  
  Dedicated hacking XP grinder using `weaken2.js` against `joesguns`.

  Features:
  - configurable RAM quota
  - network-wide deployment
  - home RAM reserve
  - safe worker detection

---

### Trading

- **stock-trader.js**  
  Long-only stock trader using 4S Market Data.

  Features:
  - forecast-based entries and exits
  - position limits
  - reserve budget
  - capped capital allocation

---

### Monitoring

- **stats.js**  
  Live overview for RAM usage, server status, and income.

---

### Access Tools

- **backdoors.js** – automatic backdoor installation
- **backdoorsscan.js** – lists possible backdoor targets
- **path.js** – generates connection paths

---

### Legacy

Older systems kept for reference:

- adaptive-batch-orchestrator.js
- apex-batcher.js
- titan.js
- GM-series
- basic_hack.js
- script_update.js

---

## RAM Usage

| Script            | RAM |
|------------------|----:|
| stock-trader.js  | 18.2 GB |
| apex-hwgw.js     | 10.75 GB |
| infra-manager.js | 9.5 GB |
| xp-grinder.js    | depends on quota |
| stats.js         | 4.25 GB |
| workers (each)   | 1.75 GB |

---

## Design Principles

- one active profit orchestrator
- distributed execution
- RAM-aware scheduling
- modular systems
- scalable from GB/TB to PB networks

---

## Purpose

This project demonstrates:

- automation design
- distributed scheduling
- resource optimization
- system monitoring
- iterative performance tuning

---

## Status

Active side project focused on automation, optimization, and system design.
