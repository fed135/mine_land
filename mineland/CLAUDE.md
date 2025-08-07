# Mine Land - Development Context

## Project Overview
This is a SvelteKit web application called "Mine Land" that features a full-screen canvas element as the primary interface.

## Technology Stack
- **Frontend Framework:** SvelteKit (latest version)
- **Svelte Features:** Runes enabled ($state, $derived, $effect)
- **Build Tool:** Vite (included with SvelteKit)
- **Package Manager:** npm

## Key Implementation Details

### Core Features
- Full-screen canvas that takes up entire viewport (100% width/height)
- Responsive design for desktop and mobile
- Modern Svelte runes for state management
- Minimal, clean UI with canvas as main interactive element

### File Structure
```
/
├── mineland/                 (SvelteKit app directory)
│   ├── src/
│   │   ├── routes/
│   │   │   └── +page.svelte  (main page with canvas)
│   │   ├── app.html          (contains "Mine Land" page title)
│   │   └── app.css           (global styles for full-screen canvas)
│   ├── static/               (static assets)
│   ├── package.json
│   └── svelte.config.js
└── mineland_server/          (server component)
```

## Development Guidelines
- Use Svelte runes ($state, $derived, $effect) instead of legacy reactivity
- Canvas should have no margins/padding around it
- Ensure canvas is properly sized and responsive
- Keep bundle size minimal
- When installing a node module, ensure the latest version is installed
- Focus on efficient canvas rendering

## Browser Requirements
- Modern browsers supporting ES2020+
- Canvas API support required
- Responsive design compatibility

## Dependencies
- **kalm:** ^8.0.0 - WebSocket framework for real-time communication
- **@kalm/ws:** ^8.0.0 - WebSocket transport for Kalm

## Networking
- Uses Kalm framework for WebSocket communication with game server
- Connects to `ws://localhost:8080` for real-time multiplayer
- 60hz client-side tick rate matching server

## Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production  
- `npm run preview` - Preview production build