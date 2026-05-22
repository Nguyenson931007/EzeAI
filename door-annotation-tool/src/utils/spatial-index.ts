import RBush from 'rbush';

export interface SpatialItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
}

class SpatialIndex {
  private tree = new RBush<SpatialItem>();

  insert(id: string, points: { x: number, y: number }[]) {
    const minX = Math.min(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y));
    const maxX = Math.max(...points.map(p => p.x));
    const maxY = Math.max(...points.map(p => p.y));
    
    this.tree.insert({ minX, minY, maxX, maxY, id });
  }

  search(x: number, y: number, padding: number = 5): string[] {
    const results = this.tree.search({
      minX: x - padding,
      minY: y - padding,
      maxX: x + padding,
      maxY: y + padding
    });
    return results.map(r => r.id);
  }

  clear() {
    this.tree.clear();
  }

  rebuild(annotations: any[]) {
    this.clear();
    annotations.forEach(ann => {
      this.insert(ann.id, ann.polygon);
    });
  }
}

export const spatialIndex = new SpatialIndex();
