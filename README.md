Hier ist die **kompaktere, saubere Version** – deutlich kürzer, aber immer noch stark genug für dein Portfolio:

---

# Bitburner Automation System

Automation system built in the programming game *Bitburner*.

---

## Overview

This project evolved from simple scripts into a **distributed automation system** capable of handling large-scale networks (TB → PB RAM).

Core responsibilities:

* infrastructure management
* orchestration
* execution
* monitoring
* optional trading

---

## Core Features

* automatic target discovery and scoring
* coordinated HWGW batch execution
* distributed workload across all rooted servers
* RAM-aware scaling and scheduling
* automated server purchasing and upgrades
* real-time monitoring
* optional stock trading (4S API)

---

## Architecture

### Infrastructure

* **infra-manager.js**
  Network scan, rooting (incl. SQLInject), script deployment, server upgrades

---

### Orchestration (Main)

* **apex-hwgw.js** ⭐
  High-performance HWGW batch engine

  * multi-target optimization
  * prep logic (grow/weaken)
  * RAM-aware batch sizing
  * distributed execution
  * concurrency + timing control

👉 Single active orchestrator (avoids conflicts)

---

### Execution

* **hack2.js / grow2.js / weaken2.js** – batch workers
* **hack.js / grow.js / weaken.js** – legacy/simple

---

### Trading (Optional)

* **stock-trader.js**
  Long-only system using 4S API

  * forecast-based decisions
  * risk + capital management

---

### Access Tools

* **backdoors.js**, **backdoorsscan.js**, **path.js**

---

### Monitoring

* **stats.js** – RAM, income, targets
* **apex-hwgw.js** – internal logging

---

### Legacy

* adaptive-batch-orchestrator.js
* apex-batcher.js
* titan.js
* GM-series

(Replaced by apex-hwgw)

---

## RAM Usage

| Script           |      RAM |
| ---------------- | -------: |
| apex-hwgw.js     | 10.75 GB |
| stock-trader.js  |  18.2 GB |
| infra-manager.js |   9.5 GB |
| stats.js         |  4.25 GB |
| workers (each)   |  1.75 GB |

---

## Design Principles

* single orchestrator (no conflicts)
* RAM-aware scheduling
* modular structure
* scalable to large networks

---

## Purpose

Demonstrates:

* distributed execution
* resource optimization
* automation system design
* performance scaling

---

## Status

Active side project focused on automation and system design.
