# Mine Land - Project Overview

## Game Specification
**Game Rules:** `./GAME_RULES.md`  
Complete specification of Mine Land game mechanics, rules, and multiplayer features.

## Project Structure
This project consists of two main components:

### Frontend Application
**Location:** `./mineland/`  
**Context File:** `./mineland/CLAUDE.md`

SvelteKit web application with full-screen canvas interface. Features modern Svelte runes for reactivity and responsive design.

### Backend Server
**Location:** `./mineland_server/`  
**Context File:** `./mineland_server/CLAUDE.md`

WebSocket server using the Kalm framework for real-time communication with the frontend.

## Development Workflow
1. **Frontend Development:** Navigate to `./mineland/` and refer to its CLAUDE.md
2. **Backend Development:** Navigate to `./mineland_server/` and refer to its CLAUDE.md
3. **Full Stack:** Both components work together - frontend connects to WebSocket server

## Quick Start
```bash
# Start frontend (in ./mineland/)
cd mineland && npm run dev

# Start backend server (in ./mineland_server/)
cd mineland_server && npm start
```

## Architecture
- **Frontend:** SvelteKit + Canvas + WebSocket client
- **Backend:** Node.js + TypeScript + Kalm WebSocket server
- **Communication:** Real-time WebSocket connection between client and server

## Rules for CLAUDE CLI

- Perform atomic changes when asked to fix a bug.
- Ask clarifying questions when multiple viable options are present.
- Do NOT take creative liberties around game rules.
- Do not bypass business logic in order to fix a bug.
- Do not remove console logs unless asked to.