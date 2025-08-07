# Mine Land - Game Rules & Mechanics

## Game Overview
Mine Land is a multiplayer minesweeper adaptation. Players dig through terrain to move across a shared board, tagging mines and finding treasures to score points in a global leaderboard.

## Core Game Mechanics

### 1. World Generation
- Procedurally generated grid of 1000 x 1000 tiles.
- There are 10 player spawn location tiles, spread evenly.
- Players's viewport can only see roughly 5 tiles ahead in all 4 directions.

### 2. Minesweeper basic rules
- All tiles begin covered (unturned, unflipped), except for player spawn locations.
- All players start with a score of 0.
- Every round of gameplay is timed, with the timer showing on top, counting up.
- Covered tiles are not walkable.
- Flipping a tile reveals what is hidden beneath. This can one of the following:
  - A bomb: An explosion occurs, it has a 3 tile circular radius. The explosion kills all players in radius also flipping all covered tiles. This triggers whatever effect the tile was hiding. Chain reactions can be expected. Exploded bomb tiles become explosion site tiles.
  - An empty space: The tile becomes walkable.
  - A numbered space: The tile has a number shown on the ground, indicating the number of mines in direct proximity (left, right, up, down and diagonals). Numbers range from 1 to 8.
  - A flag: The flag is immediately colelcted by the player and the tile becomes an empty space.
- Only tiles directly neighboring the player (left, right, up, down and diagonals) can be uncovered (flipped) or flagged.
- Flagging a tile is the other type of action that can be performed on covered tiles. Players each have a personal inventory of flags, starting with 3 each.
- Flags can only be put on covered tiles. The tile will display a small red flag.
- Flagging a covered bomb tile will render the small flag green.
- Covered tiles with flags become walkable.
- Flagged tiles can be unflagged and the player recovers the flag in their inventory, even if the flag was placed by a different player.
- Once all bombs are flagged or have detonated, the game ends.
- Players that die cannot respawn until the next match. Their score is frozen on the leaderboard.

### 3. Player Movement
- Players can move from tile to tile with the keyboard arrows or by using WASD.
- Movement is limited to neighboring, walkable tiles (up, down, left, right).
- Players can stand on the same tile.
- Uncovering a tile is done by pressing the left click on a tile.
- Flagging a tile is done by right clicking on a tile.

### 4. Scoring system
- A leaderboard shows the scores of all players that realized at least 1 point this match. From highest to lowest.
- A player flipping a tile gives that player 1 point.
- Flagging a mine gives 3 points.

### 5. Multiplayer Features
- Players start on a ramdom spawn tile.
- When disconnecting, the player is removed from the game, but their placed flags are persisted.
- Returning players preserve their location and inventory.
- Players can see each other's actions in real-time.
- Shared world state across all connected players.
- Flags placed by players stay on the board, even if they die or are disconnected.
