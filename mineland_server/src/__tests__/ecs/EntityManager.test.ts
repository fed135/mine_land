import { EntityManager } from '../../ecs/EntityManager';
import { Entity } from '../../ecs/Entity';
import { System } from '../../ecs/System';

// Mock system for testing
class MockSystem extends System {
  protected shouldProcessEntity(entity: Entity): boolean {
    return entity.hasComponent('test');
  }

  // No update method needed - entities are managed automatically
}

describe('EntityManager', () => {
  let entityManager: EntityManager;
  let mockSystem: MockSystem;

  beforeEach(() => {
    entityManager = new EntityManager();
    mockSystem = new MockSystem();
  });

  afterEach(() => {
    entityManager.clear();
  });

  describe('Entity Management', () => {
    test('should create entities with unique IDs', () => {
      const entity1 = entityManager.createEntity();
      const entity2 = entityManager.createEntity();
      
      expect(entity1).toBeInstanceOf(Entity);
      expect(entity2).toBeInstanceOf(Entity);
      expect(entity1.id).not.toBe(entity2.id);
    });

    test('should track created entities', () => {
      const entity = entityManager.createEntity();
      const entities = entityManager.getEntities();
      
      expect(entities).toContain(entity);
      expect(entities.size).toBe(1);
    });

    test('should destroy entities properly', () => {
      const entity = entityManager.createEntity();
      expect(entityManager.getEntities()).toContain(entity);
      
      entityManager.destroyEntity(entity);
      // Entity destruction is now immediate
      expect(entityManager.getEntities()).not.toContain(entity);
    });

    test('should clear all entities', () => {
      entityManager.createEntity();
      entityManager.createEntity();
      entityManager.createEntity();
      
      expect(entityManager.getEntities().size).toBe(3);
      
      entityManager.clear();
      expect(entityManager.getEntities().size).toBe(0);
    });
  });

  describe('System Management', () => {
    test('should add and track systems', () => {
      entityManager.addSystem('mock', mockSystem);
      
      expect(entityManager.getSystem('mock')).toBe(mockSystem);
    });

    test('should remove systems', () => {
      entityManager.addSystem('mock', mockSystem);
      expect(entityManager.getSystem('mock')).toBe(mockSystem);
      
      entityManager.removeSystem('mock');
      expect(entityManager.getSystem('mock')).toBeUndefined();
    });
  });

  describe('System Processing', () => {
    beforeEach(() => {
      entityManager.addSystem('mock', mockSystem);
    });

    test('should track systems (update loop removed for synchronous server)', () => {
      // Verify that system is properly registered
      expect(entityManager.getSystem('mock')).toBe(mockSystem);
      expect(mockSystem.getEntities().size).toBe(0);
    });

    test('should process entities matching system criteria', () => {
      // Create entity that should be processed
      const entity1 = entityManager.createEntity();
      entity1.addComponent('test', { value: 'test1' });
      entityManager.reevaluateEntity(entity1); // Re-check after adding components
      
      // Create entity that should not be processed
      const entity2 = entityManager.createEntity();
      entity2.addComponent('other', { value: 'other' });
      entityManager.reevaluateEntity(entity2); // Re-check after adding components
      
      // System should automatically contain only entities that match criteria
      expect(mockSystem.getEntities()).toContain(entity1);
      expect(mockSystem.getEntities()).not.toContain(entity2);
      expect(mockSystem.getEntities().size).toBe(1);
    });

    test('should handle entities with multiple components', () => {
      const entity = entityManager.createEntity();
      entity.addComponent('test', { value: 'test' });
      entity.addComponent('position', { x: 10, y: 20 });
      entity.addComponent('render', { visible: true });
      entityManager.reevaluateEntity(entity); // Re-check after adding components
      
      // System should automatically contain entity since it has required 'test' component
      expect(mockSystem.getEntities()).toContain(entity);
      expect(mockSystem.getEntities().size).toBe(1);
    });
  });

  describe('Performance Characteristics', () => {
    test('should handle large numbers of entities efficiently', () => {
      const entityCount = 1000;
      const entities: Entity[] = [];
      
      // Add system before creating entities
      entityManager.addSystem('mock', mockSystem);
      
      // Create many entities
      const startTime = performance.now();
      for (let i = 0; i < entityCount; i++) {
        const entity = entityManager.createEntity();
        if (i % 2 === 0) {
          entity.addComponent('test', { value: i });
          entityManager.reevaluateEntity(entity);
        }
        entities.push(entity);
      }
      const creationTime = performance.now() - startTime;
      
      // Ensure creation is reasonably fast
      expect(creationTime).toBeLessThan(100); // 100ms for 1000 entities
      
      // Ensure entity management is efficient
      const queryStartTime = performance.now();
      const systemEntities = mockSystem.getEntities();
      const queryTime = performance.now() - queryStartTime;
      
      expect(queryTime).toBeLessThan(50); // 50ms for querying
      expect(systemEntities.size).toBe(entityCount / 2);
    });
  });
});