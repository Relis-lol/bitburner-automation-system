# Bitburner Automation System

Automation system built in the programming game *Bitburner*.

---

## Overview

This project evolved from simple scripts into a scalable automation system capable of handling large networks (TB → PB scale).

Core responsibilities:
- network preparation
- profit orchestration
- infrastructure automation
- distributed execution
- monitoring
- XP farming
- optional stock trading

---

## Features

- automatic target discovery and scoring
- full-network preparation before profit runs
- coordinated batch-based execution (hack / grow / weaken cycles)
- distributed workload across all rooted servers
- RAM-aware scaling
- automated server purchasing and upgrading
- real-time monitoring
- XP optimization system
- stock trading via 4S API

---

## Core Components

### apex-hwgw.js
Main profit engine
- batch-based extraction logic
- multi-target scheduling
- RAM-aware execution
- integrates preparation + profit

### prep-all.js
Full-network preparation
- reduces security to minimum
- grows money to ~99%
- exits automatically when complete

### infra-manager.js
Infrastructure automation
- network scanning
- rooting servers
- script deployment
- server purchasing and upgrading

### restart.js
Execution gatekeeper
- waits until prep phase finishes
- automatically starts main engine

### xp-grinder.js
XP farming system
- consumes configurable share of total network RAM
- optimized for long-term leveling
- requires manual tuning depending on network size

### stock-trader.js
Long-only trading system
- uses 4S Market Data API
- risk-controlled position management

### trade-sellout.js
Reset utility
- liquidates all stock positions (long & short)
- ensures clean exit before reset

---

## Workers

Execution layer:
- hack.js / grow.js / weaken.js
- hack2.js / grow2.js / weaken2.js (batch-compatible, delayed execution)

---

## Design Principles

- one active orchestrator at a time
- prep before profit
- distributed execution across the network
- RAM-aware scheduling
- modular architecture
- scalable to very large environments

---

## Purpose

This project demonstrates:
- distributed system design
- resource-aware scheduling
- automation architecture
- performance optimization
- iterative system evolution

---

## Status

Active side project focused on automation and system design.
