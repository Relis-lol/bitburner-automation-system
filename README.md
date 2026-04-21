# Bitburner Automation System

Automation system built within the programming game Bitburner.

---

## Overview

This project contains a set of automation scripts that evolved from simple self-hacking scripts into a multi-server orchestration system with multiple target-allocation strategies.

The system is able to:
- automatically discover and target profitable servers
- execute coordinated hack / grow / weaken cycles
- distribute scripts across owned servers
- purchase and upgrade servers
- manage access via backdoors
- generate connection paths for navigation

---

## Architecture

### Orchestrators
Central control scripts managing automated operations with different strategies.

- **GM2.js**  
  Hybrid orchestration strategy.  
  - Home and purchased servers focus on the best available target  
  - Rooted servers with money can attack themselves  
  - Servers without useful money are redirected to the best target  
  This makes GM2 efficient during early and mid progression phases.

- **godmode.js**  
  Concentrated orchestration strategy.  
  - All available rooted servers attack a single best target  
  - Includes automated server purchasing and upgrades  
  Strong in later stages, but inefficient after augmentation resets due to lack of initial money.

---

### Workers
Execution layer used by the orchestrators.

- **hack.js** – performs hack operations  
- **grow.js** – performs grow operations  
- **weaken.js** – performs weaken operations  

---

### Access Tools
Scripts for navigation and access progression.

- **backdoors.js** – automatically connects and installs backdoors (requires Singularity access)  
- **backdoorscan.js** – lists servers where backdoors can be installed  
- **path.js** – generates copy-ready connection paths to target servers  

---

### Monitoring
Scripts for visibility into current network resources and hacking progress.

- **stats.js** – live status window showing rooted servers, purchased infrastructure, RAM usage, available money, and overall hacking progress

---

### Legacy
Older scripts documenting project evolution.

- **basic_hack.js** – first simple self-targeting hacking script  
- **script_update.js** – early script deployment system across rooted servers  

---

## Script RAM Usage

RAM usage is a core constraint in Bitburner and directly impacts execution scaling.

| Script              | RAM Usage |
|--------------------|----------|
| GM2.js             | 11.2 GB  |
| godmode.js         | 11.2 GB  |
| backdoors.js       | 67.85 GB |
| backdoorscan.js    | 3.85 GB  |
| basic_hack.js      | 2.45 GB  |
| script_update.js   | 4.4 GB   |
| path.js            | 1.8 GB   |
| hack.js            | 1.75 GB  |
| grow.js            | 1.75 GB  |
| weaken.js          | 1.75 GB  |
| stats.js          | 4.15 GB  |

---

## Purpose

This project demonstrates:

- automation logic  
- distributed execution across multiple nodes  
- resource-based decision making  
- target prioritization strategies  
- system evolution from simple scripts to orchestrated workflows  

While built inside a game environment, the concepts reflect real-world patterns such as:

- task orchestration  
- workload distribution  
- automation systems  

---

## Status

Active side project used to explore automation patterns and system design concepts.
