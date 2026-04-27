# Bitburner Automation System

Automation system built in the programming game *Bitburner*.

---

## Overview

This project evolved from simple scripts into a scalable automation system capable of handling large networks (TB → PB scale).

Core responsibilities:
- automated progression (early → mid → late game)
- network preparation
- profit orchestration
- infrastructure automation
- distributed execution
- monitoring
- XP farming
- optional stock trading and market manipulation

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
- market manipulation with automated buy/sell + long/short
- small utility tools for reset and progression support
- lock system for resource coordination

---

## Core Components

### adaptive-rush.js
Full progression engine (early → midgame automation)
- auto-rooting and expansion
- dynamic phase system (XP → Prep → Bridge)
- prepares network automatically
- hands off into main system when ready

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

### stock-trader-shorts.js
Advanced stock trading system
- supports long and short positions
- forecast-based entries and exits
- risk-controlled position sizing
- requires 4S Market Data API
- short trading requires the related unlock

---

## Utilities

### stats.js
Monitoring utility
- shows RAM usage, server status, and income

### trade-sellout.js
Reset utility
- liquidates all stock positions before reset
- closes both long and short positions

### notes.js
Reference utility
- shows key faction servers for progression

### backdoors.js / backdoorsscan.js / path.js
Access helpers
- install or identify backdoors
- generate connection paths

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
- coordinated stock & server operations with lock system

---

## Purpose

This project demonstrates:
- distributed system design
- resource-aware scheduling
- automation architecture
- performance optimization
- iterative system evolution
- stock trading & market manipulation orchestration

---

## Status

Active side project focused on automation and system design, now including advanced market control features.
