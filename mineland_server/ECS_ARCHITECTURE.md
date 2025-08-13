# ECS Architecture - Mine Land Server

## Overview

The Mine Land server has been refactored to use an Entity-Component-System (ECS) architecture while maintaining performance optimizations through global registries.

## Architecture Components

### Core ECS
- **Entity**: Container for components (ID-based)
- **Component**: Data structures (Position, Tile, Player, Network)
- **System**: Logic processors (Movement, GameLogic, Network)
- **EntityManager**: Coordinates entities and systems

### Performance Registries
- **TileRegistry**: O(1) tile lookups by position
- **PlayerRegistry**: O(1) player lookups by ID/clientId/sessionId
- Cached data for rendering without ECS queries

### Systems

#### MovementSystem
- Validates and processes player movement
- Security: Adjacent-only movement validation
- Integrates with TileRegistry for walkability checks

#### GameLogicSystem  
- Handles tile flipping, flagging, explosions
- Security: Adjacent-only interaction validation
- Auto-reveal for empty tiles
- Mine explosion cascading

#### NetworkSystem
- Manages client synchronization
- Security: Sanitizes tile data before transmission
- Viewport management with player-specific filtering

## Security Features Maintained

### Data Sanitization
- Only revealed, flagged, or adjacent tiles sent to clients
- Mine locations hidden until revealed
- Mine counts obfuscated as percentages
- Spawn points removed from client data

### Action Validation
- Server-side movement validation
- Server-side interaction validation  
- Enhanced logging for suspicious activity
- Rate limiting through request queuing

## Performance Optimizations

### Global Registries
- **TileRegistry**: O(1) position-based tile lookups
- **PlayerRegistry**: O(1) player lookups by various IDs
- Cached component data to avoid ECS queries during rendering

### Efficient Queries
- Viewport culling with player-specific sanitization
- Region-based tile queries
- Player proximity calculations

## Migration Guide

### Starting ECS Server
```bash
npm start              # Uses ECS architecture (index_ecs.ts)
npm run start:legacy   # Uses legacy architecture (index.ts)
```

### Key Differences
- **Entity-based**: Players and tiles are now entities with components
- **System-driven**: Game logic split into focused systems  
- **Registry-cached**: Performance-critical lookups use global registries
- **Security-enhanced**: All client data is sanitized through systems

## Benefits

### Maintainability
- Clear separation of concerns
- Modular system architecture
- Easy to add new features/components

### Performance
- O(1) lookups maintained through registries
- Efficient viewport processing
- Batch processing of actions

### Security  
- Centralized data sanitization
- Enhanced validation logging
- Server-authoritative game state

### Scalability
- Easy to add new game mechanics
- Systems can be easily modified/replaced
- Clean entity lifecycle management

## Development

### Adding New Components
1. Create component interface in `components/`
2. Add creation helper function
3. Register with relevant systems

### Adding New Systems
1. Extend `System` base class
2. Implement `shouldProcessEntity()` for filtering
3. Add to EntityManager in GameManager

### Registry Integration
- Use registries for performance-critical lookups
- Update caches when component data changes
- Maintain registry consistency with ECS state