import { Entity } from '../../ecs/Entity';

describe('Entity', () => {
  let entity: Entity;

  beforeEach(() => {
    entity = new Entity();
  });

  describe('Component Management', () => {
    test('should add components correctly', () => {
      const component = { x: 10, y: 20 };
      
      entity.addComponent('position', component);
      
      expect(entity.hasComponent('position')).toBe(true);
      expect(entity.getComponent('position')).toBe(component);
    });

    test('should handle multiple components', () => {
      const positionComp = { x: 10, y: 20 };
      const playerComp = { id: 'test', username: 'TestUser', alive: true };
      
      entity.addComponent('position', positionComp);
      entity.addComponent('player', playerComp);
      
      expect(entity.hasComponent('position')).toBe(true);
      expect(entity.hasComponent('player')).toBe(true);
      expect(entity.getComponent('position')).toBe(positionComp);
      expect(entity.getComponent('player')).toBe(playerComp);
    });

    test('should remove components correctly', () => {
      const component = { value: 'test' };
      
      entity.addComponent('test', component);
      expect(entity.hasComponent('test')).toBe(true);
      
      entity.removeComponent('test');
      expect(entity.hasComponent('test')).toBe(false);
      expect(entity.getComponent('test')).toBeUndefined();
    });

    test('should return undefined for non-existent components', () => {
      expect(entity.hasComponent('nonexistent')).toBe(false);
      expect(entity.getComponent('nonexistent')).toBeUndefined();
    });

    test('should overwrite existing components', () => {
      const component1 = { value: 'first' };
      const component2 = { value: 'second' };
      
      entity.addComponent('test', component1);
      expect(entity.getComponent('test')).toBe(component1);
      
      entity.addComponent('test', component2);
      expect(entity.getComponent('test')).toBe(component2);
      expect(entity.getComponent('test')).not.toBe(component1);
    });
  });

  describe('Entity Identity', () => {
    test('should have unique IDs', () => {
      const entity1 = new Entity();
      const entity2 = new Entity();
      
      expect(entity1.id).not.toBe(entity2.id);
      expect(typeof entity1.id).toBe('number');
      expect(typeof entity2.id).toBe('number');
      expect(entity1.id).toBeGreaterThan(0);
    });

    test('should maintain ID immutability', () => {
      const originalId = entity.id;
      
      // Try to modify ID (shouldn't work due to readonly)
      expect(entity.id).toBe(originalId);
      
      // Add components shouldn't change ID
      entity.addComponent('test', { value: 'test' });
      expect(entity.id).toBe(originalId);
    });
  });

  describe('Component Queries', () => {
    test('should correctly identify components after multiple operations', () => {
      entity.addComponent('position', { x: 0, y: 0 });
      entity.addComponent('player', { id: 'test', alive: true });
      entity.addComponent('network', { clientId: 'client123' });
      
      expect(entity.hasComponent('position')).toBe(true);
      expect(entity.hasComponent('player')).toBe(true);
      expect(entity.hasComponent('network')).toBe(true);
      expect(entity.hasComponent('render')).toBe(false);
      
      entity.removeComponent('player');
      
      expect(entity.hasComponent('position')).toBe(true);
      expect(entity.hasComponent('player')).toBe(false);
      expect(entity.hasComponent('network')).toBe(true);
    });

    test('should handle component types correctly', () => {
      interface PositionComponent {
        x: number;
        y: number;
      }
      
      interface PlayerComponent {
        id: string;
        username: string;
        alive: boolean;
        score: number;
      }
      
      const positionComp: PositionComponent = { x: 10, y: 20 };
      const playerComp: PlayerComponent = { id: 'test', username: 'User', alive: true, score: 100 };
      
      entity.addComponent('position', positionComp);
      entity.addComponent('player', playerComp);
      
      // Test type safety (TypeScript should handle this, but we can test runtime behavior)
      const retrievedPosition = entity.getComponent<PositionComponent>('position');
      const retrievedPlayer = entity.getComponent<PlayerComponent>('player');
      
      expect(retrievedPosition?.x).toBe(10);
      expect(retrievedPosition?.y).toBe(20);
      expect(retrievedPlayer?.id).toBe('test');
      expect(retrievedPlayer?.username).toBe('User');
      expect(retrievedPlayer?.alive).toBe(true);
      expect(retrievedPlayer?.score).toBe(100);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty component objects', () => {
      const emptyComp = {};
      
      entity.addComponent('empty', emptyComp);
      
      expect(entity.hasComponent('empty')).toBe(true);
      expect(entity.getComponent('empty')).toBe(emptyComp);
    });

    test('should handle null and undefined values in components', () => {
      interface TestComponent {
        nullValue: null;
        undefinedValue: undefined;
        zeroValue: number;
        emptyString: string;
        falsyValue: boolean;
      }
      
      const component: TestComponent = { 
        nullValue: null, 
        undefinedValue: undefined, 
        zeroValue: 0, 
        emptyString: '', 
        falsyValue: false 
      };
      
      entity.addComponent('test', component);
      
      const retrieved = entity.getComponent<TestComponent>('test');
      expect(retrieved?.nullValue).toBeNull();
      expect(retrieved?.undefinedValue).toBeUndefined();
      expect(retrieved?.zeroValue).toBe(0);
      expect(retrieved?.emptyString).toBe('');
      expect(retrieved?.falsyValue).toBe(false);
    });

    test('should handle component removal of non-existent components gracefully', () => {
      // Should not throw error
      expect(() => {
        entity.removeComponent('nonexistent');
      }).not.toThrow();
      
      // State should remain consistent
      expect(entity.hasComponent('nonexistent')).toBe(false);
    });
  });
});