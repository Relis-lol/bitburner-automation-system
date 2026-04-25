# Bitburner Automation System

Automation system built in the programming game *Bitburner*.

---

## Overview

This project evolved from simple scripts into a scalable automation system capable of handling large networks (TB → PB range).

Core responsibilities:

- network preparation
- profit orchestration (HWGW)
- infrastructure automation
- distributed execution
- monitoring
- XP farming
- optional stock trading

---

## Features

- automatic target discovery and scoring
- full-network prep before profit runs
- coordinated HWGW batch execution
- distributed workload across rooted servers
- RAM-aware scaling
- automated server purchasing and upgrading
- real-time monitoring
- XP optimization system
- stock trading (4S API)

---

## Core Components

### apex-hwgw.js
Main profit engine  
- HWGW batching  
- multi-target scheduling  
- RAM-aware execution  
- prep + profit integration  

### prep-all.js
Full-network preparation  
- reduces security to minimum  
- grows money to ~99%  
- exits automatically when done  

### infra-manager.js
Infrastructure automation  
- network scan  
- rooting  
- script deployment  
- server upgrades  

### restart.js
Execution gatekeeper  
- waits for prep phase  
- launches main engine automatically  

### xp-grinder.js
XP farming system  
- consumes a configurable share of total network RAM  
- optimized for long-term leveling  
- ⚠ requires manual tuning depending on network size and goals  

### stock-trader.js
Long-only trading system  
- uses 4S API  
- risk-limited portfolio  

---

## Workers

Execution layer:

- hack / grow / weaken  
- batch-compatible versions (hack2 / grow2 / weaken2)

---

## Design Principles

- one active orchestrator at a time  
- prep before profit  
- distributed execution  
- RAM-aware scheduling  
- modular architecture  
- scalable to very large networks  

---

## Purpose

This project demonstrates:

- distributed system design  
- resource scheduling  
- automation logic  
- performance optimization  
- iterative system evolution  

---

## Status

Active side project focused on automation and system design.
