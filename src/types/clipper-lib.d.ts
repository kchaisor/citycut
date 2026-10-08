declare module "clipper-lib" {
  namespace ClipperLib {
    class ClipperOffset {
      constructor(miterLimit?: number, arcTolerance?: number);
      AddPath(path: Paths[0], joinType: JoinType, endType: EndType): void;
      AddPaths(paths: Paths, joinType: JoinType, endType: EndType): void;
      Execute(solution: Paths, delta: number): void;
    }
    class Clipper {
      static Area(path: Paths[0]): number;
    }
    type Paths = Array<Array<{ X: number; Y: number }>>;
    enum JoinType {
      jtSquare = 0,
      jtRound = 1,
      jtMiter = 2,
    }
    enum EndType {
      etClosedPolygon = 0,
      etClosedLine = 1,
      etOpenButt = 2,
      etOpenSquare = 3,
      etOpenRound = 4,
    }
  }
  export = ClipperLib;
}
