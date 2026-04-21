# Bitburner Automation System

Automation system built within the programming game Bitburner.

---

## Overview

This project evolved from simple self-hacking scripts into a modular automation system with separated responsibilities:

- infrastructure management
- target orchestration
- distributed execution
- monitoring

The system dynamically scans the network, gains root access, distributes scripts, manages purchased servers, and executes optimized hacking strategies.

---

## Architecture

### Infrastructure

Core system responsible for preparing and maintaining the network.

- **infra-manager.js**  
  Handles:
  - network scanning  
  - automatic rooting (port opening + nuke)  
  - script distribution across servers  
  - purchasing and upgrading servers  

  Acts as the foundation layer of the system.

---

### Orchestrators

High-level decision logic for target selection and execution strategy.

- **GM2.js**  
  Hybrid orchestration strategy:
  - home + purchased servers attack main target  
  - rooted servers with money can self-farm  
  - fallback to main target for empty servers  

  Simple and effective for early/mid-game.

- **GM3.js**  
  Improved orchestration system:
  - limits over-hacking by calculating required hack threads  
  - caps extraction (~50% of max money)  
  - uses leftover threads for weaken to stabilize targets  
  - includes target change logging  

  Designed to reduce resource overcommit and improve stability.

---

### Execution / Batching

Optimized hacking logic with controlled resource usage.

- **apex-batcher.js**  
  Balanced batch system:
  - fixed profit target (~5% per cycle)  
  - calculates required hack/grow/weaken threads  
  - adapts to server size (full batch vs small contribution)  
  - includes emergency recovery (security / low money)  

  This is the most efficient execution layer in the project.

---

### Workers

Low-level execution scripts.

- **hack.js** – performs hack operations  
- **grow.js** – performs grow operations  
- **weaken.js** – performs weaken operations  

---

### Access Tools

Scripts for navigation and progression.

- **backdoors.js** – installs backdoors automatically (requires Singularity)  
- **backdoorscan.js** – lists available backdoor targets  
- **path.js** – generates connection paths  

---

### Monitoring

Visibility into system state.

- **stats.js**  
  Live overview:
  - rooted servers  
  - purchased infrastructure  
  - RAM usage  
  - server money states  
  - hacking progress  

---

### Legacy

Early scripts kept for reference.

- **basic_hack.js** – initial self-targeting script  
- **script_update.js** – early deployment system  

---

## Script RAM Usage

RAM usage directly affects scaling and execution capacity.

| Script              | RAM Usage |
|--------------------|----------|
| GM3.js             | 12.2 GB  |
| infra-manager.js   | 9.4 GB   |
| apex-batcher.js    | 5.8 GB   |
| GM2.js             | 11.2 GB  |
| godmode.js         | 11.2 GB  |
| stats.js           | 4.15 GB  |
| script_update.js   | 4.4 GB   |
| backdoorscan.js    | 3.85 GB  |
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
- system evolution from simple scripts to modular architecture  
- separation of concerns (infra / orchestration / execution / monitoring)  

While built in a game environment, the structure reflects real-world backend and infrastructure patterns.

---

## Status

Active side project used to explore automation, orchestration, and system design concepts.
