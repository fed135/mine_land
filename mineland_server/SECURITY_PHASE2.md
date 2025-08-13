# Mine Land Server - Security Phase 2 Implementation

## Overview

Phase 2 of the Mine Land server security implementation introduces comprehensive anti-cheat measures, behavior validation, and monitoring systems. This phase builds upon the basic data sanitization from Phase 1 to create a robust, multi-layered security architecture.

## Security Components

### 1. Rate Limiting System (`RateLimiter.ts`)

**Purpose**: Prevent abuse through action flooding and rapid-fire requests.

**Features**:
- Configurable rate limits per action type
- Time-window based limiting (sliding window)
- Per-player action history tracking
- Automatic cleanup of old data

**Default Limits**:
- Movement: 10 actions per second
- Tile interactions: 5 actions per second per type
- General: 20 total actions per second

**Usage**:
```typescript
const limiter = new RateLimiter();
const allowed = limiter.isAllowed(playerId, 'move', actionData);
```

### 2. Behavior Validation (`BehaviorValidator.ts`)

**Purpose**: Detect and prevent impossible or suspicious player behaviors.

**Validations**:
- **Movement Validation**: Prevents teleportation, ensures adjacent-only movement
- **Rapid Movement Detection**: Flags movements faster than 50ms intervals
- **Tile Interaction Validation**: Ensures players can only interact with adjacent tiles
- **Action Consistency**: Prevents impossible actions (e.g., flipping revealed tiles)

**Suspicious Activity Tracking**:
- Low/Medium/High severity classification
- Pattern analysis for repeated violations
- Automatic logging of high-severity events

### 3. Game State Integrity Checker (`IntegrityChecker.ts`)

**Purpose**: Ensure server-side game state remains consistent and valid.

**Checks**:
- **Tile State Consistency**: Validates tile states and mine counts
- **Player State Validation**: Checks scores, flag counts, positions
- **Game State Coherence**: Validates mine density, flag consistency
- **Adjacent Mine Count Verification**: Ensures numbered tiles are accurate

**Violation Types**:
- Invalid tile states
- Impossible mine counts
- Players outside world bounds
- Flag count mismatches

### 4. Session Management (`SessionManager.ts`)

**Purpose**: Implement secure, encrypted session tokens to prevent session hijacking.

**Features**:
- **Cryptographic Security**: HMAC-SHA256 signed tokens
- **Session Lifecycle**: Creation, validation, refresh, invalidation
- **Constant-Time Comparison**: Prevents timing attacks
- **Metadata Tracking**: IP address, user agent, timestamps
- **Automatic Cleanup**: Expired session removal

**Session Structure**:
```typescript
interface SecureSession {
  sessionId: string;      // Unique identifier
  token: string;          // HMAC-signed security token
  data: SessionData;      // Player information
  expiresAt: number;      // Expiration timestamp
}
```

### 5. Replay Protection (`ReplayProtection.ts`)

**Purpose**: Prevent action replay attacks and duplicate action submissions.

**Protection Methods**:
- **Action Hashing**: SHA256 hashes of action payloads
- **Timing Analysis**: Detects actions within 100ms windows
- **Sequence Validation**: Prevents impossible action sequences
- **Duplicate Detection**: Blocks identical actions within time windows
- **Pattern Detection**: Identifies flag/unflag spam patterns

**Features**:
- Action history tracking
- Replay attempt counting
- Automatic violation escalation

### 6. Security Monitoring (`SecurityMonitor.ts`)

**Purpose**: Comprehensive logging, alerting, and risk assessment system.

**Event Types**:
- Rate limit violations
- Suspicious behavior
- Integrity violations
- Replay attempts
- Session events

**Risk Management**:
- **Player Risk Scores**: 0-100 scale based on violation severity
- **Alert System**: Automatic alert generation for repeated violations
- **Security Dashboard**: Real-time monitoring interface

**Alert Thresholds**:
- 5 low-severity events → Medium alert
- 3 medium-severity events → High alert
- 2 high-severity events → Critical alert
- 1 critical event → Critical alert

### 7. Unified Security Manager (`SecurityManager.ts`)

**Purpose**: Coordinate all security systems through a single interface.

**Capabilities**:
- **Unified Validation**: Single entry point for all action validation
- **Security Orchestration**: Coordinates multiple security checks
- **Player Management**: Banning, unbanning, risk assessment
- **Dashboard Integration**: Centralized monitoring and statistics
- **Component Access**: Advanced usage through direct component access

## Integration with Game Systems

### GameManager Integration

The `GameManager` has been enhanced with security integration:

1. **Constructor Enhancement**: Accepts `SecurityConfig` for security setup
2. **Action Validation**: All player actions go through security validation
3. **Secure Sessions**: Session creation and validation methods
4. **Security Dashboard**: Access to security metrics and player status
5. **Automatic Integrity Checks**: Periodic game state validation

### Server Integration

The main server (`index.ts`) implements:

1. **Secure Session Creation**: New players receive encrypted session tokens
2. **Session Validation**: All actions require valid session credentials
3. **Security Monitoring**: Real-time logging of security events
4. **Admin Dashboard**: Security dashboard endpoint for monitoring

## Security Flow

### Player Authentication Flow

1. **New Player Connection**: 
   - Create secure session with HMAC-signed token
   - Send session credentials to client
   - Log session creation

2. **Reconnection**:
   - Validate existing session token
   - Restore player state if valid
   - Log successful/failed reconnection attempts

### Action Validation Flow

For every player action:

1. **Session Validation**: Verify session token authenticity
2. **Rate Limiting**: Check if action exceeds rate limits
3. **Replay Protection**: Ensure action isn't a replay or duplicate
4. **Behavior Validation**: Validate action is physically possible
5. **Integrity Checks**: Ensure action maintains game state consistency

### Security Event Processing

1. **Event Logging**: All security events logged with metadata
2. **Risk Scoring**: Player risk scores updated based on violations
3. **Alert Generation**: Automatic alerts for repeated violations
4. **Auto-banning**: High-risk players automatically banned

## Configuration

### Security Configuration Options

```typescript
interface SecurityConfig {
  enableRateLimiting: boolean;      // Default: true
  enableBehaviorValidation: boolean; // Default: true
  enableIntegrityChecks: boolean;    // Default: true
  enableSessionSecurity: boolean;    // Default: true
  enableReplayProtection: boolean;   // Default: true
  enableMonitoring: boolean;         // Default: true
  sessionSecret?: string;            // Crypto key for sessions
}
```

### Environment Variables

- `SESSION_SECRET`: Cryptographic key for session tokens
- `ADMIN_KEY`: Access key for security dashboard

## Performance Considerations

### Optimizations Implemented

1. **Efficient Data Structures**: Maps and Sets for O(1) lookups
2. **Automatic Cleanup**: Periodic cleanup of old data (5-minute intervals)
3. **Cached Calculations**: Risk scores and statistics cached
4. **Sliding Windows**: Efficient time-window based calculations
5. **Registry Integration**: Leverages existing O(1) tile/player registries

### Memory Management

- Action history limited to recent timeframes
- Session data automatically expires
- Regular cleanup prevents memory leaks
- Configurable history retention periods

## Security Benefits

### Attack Mitigation

1. **Rate Limiting**: Prevents DoS and spam attacks
2. **Behavior Validation**: Stops teleportation, speed hacking
3. **Integrity Checks**: Detects state manipulation
4. **Session Security**: Prevents session hijacking
5. **Replay Protection**: Blocks action replay attacks
6. **Real-time Monitoring**: Immediate threat detection

### Cheat Prevention

- **Impossible Movement**: Adjacent-only validation
- **Speed Hacking**: Timing-based movement validation
- **Action Flooding**: Rate limiting per action type
- **State Manipulation**: Server-side integrity validation
- **Session Attacks**: Cryptographically secure sessions

## Monitoring and Alerting

### Security Dashboard

Access via WebSocket message `security-dashboard` with admin key:

```json
{
  "stats": {
    "totalEvents": 1250,
    "recentEvents": 45,
    "activeAlerts": 3,
    "highRiskPlayers": 2
  },
  "highRiskPlayers": [
    { "playerId": "player123", "riskScore": 85 }
  ],
  "activeAlerts": [...],
  "bannedPlayers": [...]
}
```

### Log Monitoring

Security events are logged with structured data:

```
🟠 SECURITY [BEHAVIOR]: Player attempted teleportation from (10,10) to (50,50)
{
  "playerId": "player123",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "data": { "fromX": 10, "fromY": 10, "toX": 50, "toY": 50 }
}
```

## Best Practices

### For Administrators

1. **Monitor Security Dashboard**: Regular checks for high-risk players
2. **Review Alert Patterns**: Look for coordinated attack attempts
3. **Adjust Rate Limits**: Tune based on legitimate player behavior
4. **Session Key Rotation**: Regularly rotate session secrets
5. **Log Analysis**: Monitor for unusual patterns

### For Developers

1. **Security-First Design**: Always validate through SecurityManager
2. **Error Handling**: Handle security violations gracefully
3. **Performance Monitoring**: Watch for security overhead
4. **Testing**: Include security scenarios in testing
5. **Documentation**: Keep security docs updated

## Future Enhancements

### Phase 3 Considerations

1. **Machine Learning**: AI-based behavior analysis
2. **Distributed Security**: Multi-server security coordination
3. **Advanced Forensics**: Detailed attack reconstruction
4. **Client-Side Security**: Browser fingerprinting
5. **Network Analysis**: Traffic pattern analysis

### Extensibility

The security system is designed for easy extension:

- New security components can be added to SecurityManager
- Custom validation rules can be implemented
- Additional event types and severity levels supported
- Flexible configuration for different deployment scenarios

---

**Note**: This security implementation significantly enhances the Mine Land server's resistance to cheating and abuse while maintaining performance and usability. All security measures are server-authoritative and cannot be bypassed by client modifications.