# Bitburner Automation System

Automation system built within the programming game Bitburner.

---

## Overview

This project contains a set of automation scripts that evolved from simple self-hacking scripts into a modular system with separated responsibilities:

- infrastructure management  
- orchestration  
- execution  
- monitoring  

The system is able to:
- automatically discover and target profitable servers  
- execute coordinated hack / grow / weaken cycles  
- distribute scripts across owned servers  
- purchase and upgrade servers  
- manage access via backdoors  
- generate connection paths for navigation  

---

## Architecture

### Infrastructure

- **infra-manager.js**  
  Handles network scanning, rooting, script distribution, and server purchasing/upgrading.

---

### Orchestration

- **GM3.js**  
  Improved orchestration system designed to avoid over-hacking and resource waste.  
  - limits extraction (~50%)  
  - stabilizes targets using weaken fallback  
  - reduces aggressive resource usage  
  - logs target switching  

---

### Execution

- **apex-batcher.js**  
  Efficient batch-based hacking system.  
  - fixed profit extraction (~5%)  
  - calculated hack/grow/weaken ratios  
  - adapts to server size  
  - includes recovery logic  

- **titan.js**  
  Adaptive high-throughput execution system with integrated monitoring.  
  - dynamically selects the best target  
  - distributes workload across all rooted servers  
  - applies recovery logic before batch execution  
  - performs ratio-based batching (~2% extraction)  
  - dynamically fills available RAM with batch cycles  
  - tracks performance (threads/sec) and resource usage in real time  

---

### Workers

- **hack.js** – performs hack operations  
- **grow.js** – performs grow operations  
- **weaken.js** – performs weaken operations  

---

### Access Tools

- **backdoors.js** – installs backdoors automatically (requires Singularity)  
- **backdoorsscan.js** – lists available backdoor targets  
- **path.js** – generates connection paths  

---

### Monitoring

- **stats.js** – live system overview (RAM, servers, money, progress)  
- **titan.js (built-in)** – integrated performance metrics (threads/sec, RAM usage, activity tracking)

---

### Legacy

Older or replaced scripts kept for reference.

- **GM2.js**  
  Earlier orchestration system.  
  Caused excessive resource usage and over-drained targets due to lack of load control.

- **godmode.js**  
  Fully centralized brute-force strategy.  
  Inefficient after resets and unable to stabilize targets properly.

- **basic_hack.js** – initial self-targeting script  
- **script_update.js** – early deployment system  

---

## Script RAM Usage

| Script              | RAM Usage |
|--------------------|----------|
| GM3.js             | 12.2 GB  |
| infra-manager.js   | 9.5 GB   |
| apex-batcher.js    | 5.8 GB   |
| titan-batcher.js   | 5.8 GB   |
| GM2.js             | 11.2 GB  |
| godmode.js         | 11.2 GB  |
| stats.js           | 4.15 GB  |
| script_update.js   | 4.4 GB   |
| backdoorsscan.js   | 3.85 GB  |
| basic_hack.js      | 2.45 GB  |
| path.js            | 1.8 GB   |
| hack.js            | 1.75 GB  |
| grow.js            | 1.75 GB  |
| weaken.js          | 1.75 GB  |
| backdoors.js       | 67.85 GB |

---

## Purpose

This project demonstrates:

- distributed execution across multiple nodes  
- resource-aware scheduling  
- infrastructure automation  
- system evolution and problem solving  
- real-time performance monitoring  
- separation of concerns (infra / orchestration / execution / monitoring)  

---

## Status

Active side project focused on automation and system design concepts.
