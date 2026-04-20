# Bitburner Automation System

Automation system built within the programming game Bitburner.

---

## Overview

This project contains a set of automation scripts that evolved from simple self-hacking scripts into a multi-server orchestration system.

The system is able to:
- automatically discover and target profitable servers
- execute coordinated hack / grow / weaken cycles
- distribute scripts across owned servers
- purchase and utilize additional servers
- manage access via backdoors
- generate connection paths for navigation

---

## Architecture

### Orchestrators
Central control scripts managing all operations.

- **GM2.js**  
  Distributed orchestration approach.  
  Servers that still hold money are instructed to hack themselves, while owned servers and servers without money are redirected toward the richest external target.  
  This makes GM2 more practical during earlier progression phases when self-farming available servers is still valuable.

- **godmode.js**  
  Full concentration strategy.  
  Uses all available hacked servers and owned resources to attack the single richest target.  
  This becomes stronger later on, but performs poorly right after installing augmentations because the network starts with no money and cannot benefit from self-farming.

---

### Workers
Execution layer used by the orchestrators.

- **hack.js** – executes hacking operations  
- **grow.js** – increases server money  
- **weaken.js** – reduces security level  

---

### Access Tools
Scripts for navigation and access management.

- **backdoors.js** – installs backdoors on all accessible servers  
- **backdoorscan.js** – lists servers without backdoors  
- **path.js** – generates connection paths to target servers  

---

### Legacy
Older scripts showing project evolution.

- **basic_hack.js** – first simple self-targeting script  
- **script_update.js** – early script distribution helper  

---

## Purpose

This project demonstrates:

- automation logic
- distributed execution across multiple nodes
- resource-based decision making
- progression from simple scripts to orchestrated systems

While built inside a game environment, the concepts reflect real-world patterns such as:

- task orchestration
- workload distribution
- system automation

---

## Status

Active side project used to explore automation patterns and system design concepts.
