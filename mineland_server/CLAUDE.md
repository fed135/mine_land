# Mine Land Server - Development Context

## Project Overview
WebSocket server component for the Mine Land application using the Kalm framework.

## Technology Stack
- **Runtime:** Node.js with TypeScript (ES modules)
- **WebSocket Framework:** Kalm v8.0.0 with @kalm/ws
- **Package Manager:** npm
- **Database**: In-memory object (process)

## Dependencies
- **kalm:** ^8.0.0 - WebSocket framework
- **@kalm/ws:** ^8.0.0 - WebSocket transport for Kalm
- **typescript:** ^5.9.0 - TypeScript compiler
- **@types/node:** ^24.0.0 - Node.js type definitions

## File Structure
```
mineland_server/
├── src/
│   └── index.ts          (main server entry point)
├── package.json          (Kalm WebSocket server config)
├── tsconfig.json
└── node_modules/
```

## Development Guidelines
- Uses ES modules (type: "module" in package.json)
- TypeScript for type safety
- Kalm framework for WebSocket communication
- Follow Node.js best practices
- When installing a node module, ensure the latest version is installed
- Maintain clear separation between frontend and backend concerns

## Commands
- `npm start` - Start the WebSocket server (runs src/index.ts)