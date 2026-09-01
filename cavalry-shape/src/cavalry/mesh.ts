/**
 * Turning a {@link Geometry} into `cavalry.Path`s and a `cavalry.Mesh`.
 *
 * This module touches the `cavalry` namespace and nothing else -- no `api`, no
 * `ui` -- which is what makes it usable from *both* Cavalry contexts: the
 * script that runs the panel, and the JS Shape sandbox (`plugin/shape.ts`),
 * where `cavalry` and `ctx` are all there is.
 */

import type { Geometry, GeometryPath } from "../core/geometry.ts";
import { parsePathData, type PathVerb } from "../core/svg-path.ts";

/** Maps SVG user units onto the target space. Applied as `scale` then `translate`. */
export interface Transform {
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
}

export const IDENTITY: Transform = { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0 };

export interface MeshOptions {
  /**
   * Move the outlines so the ink's bounding box is centred on the layer's
   * origin. Typst's coordinates start at the page's top-left corner, which
   * would otherwise put the layer's anchor (and so its rotation and scale
   * pivot) off the corner of the formula.
   */
  centre: boolean;
  /**
   * Give each outline the colour Typst rendered it in. Off by default: with no
   * material the paths inherit the layer's own Fill/Stroke, which is what
   * lets the standard Cavalry UI drive the formula's appearance.
   */
  colours: boolean;
  /**
   * Negate y, mapping SVG's y-down onto a y-up scene. See `SCENE` in
   * `config.ts` -- if formulas come out upside down, this is the switch.
   */
  flipY: boolean;
}

export const DEFAULT_MESH_OPTIONS: MeshOptions = { centre: true, colours: false, flipY: false };

/** Replays parsed verbs onto a fresh `cavalry.Path`. */
export function buildPath(verbs: readonly PathVerb[], transform: Transform = IDENTITY): cavalry.Path {
  const path = new cavalry.Path();
  const x = (value: number): number => transform.translateX + value * transform.scaleX;
  const y = (value: number): number => transform.translateY + value * transform.scaleY;

  for (const { type, coords } of verbs) {
    if (type === "M") {
      path.moveTo(x(coords[0]), y(coords[1]));
    } else if (type === "L") {
      path.lineTo(x(coords[0]), y(coords[1]));
    } else if (type === "C") {
      path.cubicTo(x(coords[0]), y(coords[1]), x(coords[2]), y(coords[3]), x(coords[4]), y(coords[5]));
    } else if (type === "Q") {
      path.quadTo(x(coords[0]), y(coords[1]), x(coords[2]), y(coords[3]));
    } else {
      path.close();
    }
  }

  return path;
}

/**
 * Builds the mesh a formula layer draws.
 *
 * Centring uses the paths' own bounding boxes rather than Typst's page box:
 * the page is auto-sized with a small margin and does not always contain ink
 * that renders outside its nominal frame, so the page centre and the ink
 * centre are not the same point.
 */
export function buildMesh(geometry: Geometry, options: MeshOptions = DEFAULT_MESH_OPTIONS): cavalry.Mesh {
  const transform: Transform = {
    scaleX: 1,
    scaleY: options.flipY ? -1 : 1,
    translateX: 0,
    translateY: 0,
  };

  const paths = geometry.paths.map(entry => buildPath(parsePathData(entry.d), transform));

  if (options.centre) {
    const centre = inkCentre(paths);
    if (centre) {
      for (const path of paths) {
        path.translate(-centre.x, -centre.y);
      }
    }
  }

  return assembleMesh(paths, geometry.paths, options.colours);
}

/** Collects built paths into a mesh, pairing each with its style by index. */
function assembleMesh(
  paths: readonly cavalry.Path[],
  styles: readonly GeometryPath[],
  colours: boolean,
): cavalry.Mesh {
  const mesh = new cavalry.Mesh();

  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    if (path.empty()) {
      continue;
    }
    const style = styles[i] as GeometryPath | undefined;
    // No material means "inherit", i.e. the layer's Fill and Stroke tabs drive
    // the look. Only opt out when the user asked for Typst's own colours.
    if (colours && style) {
      mesh.addPath(path, materialFor(style));
    } else {
      mesh.addPath(path);
    }
  }
  return mesh;
}

function inkCentre(paths: readonly cavalry.Path[]): { x: number; y: number } | null {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;

  for (const path of paths) {
    if (path.empty()) {
      continue;
    }
    const box = path.boundingBox();
    left = Math.min(left, box.left);
    right = Math.max(right, box.right);
    top = Math.min(top, box.top);
    bottom = Math.max(bottom, box.bottom);
  }

  return Number.isFinite(left) ? { x: (left + right) / 2, y: (top + bottom) / 2 } : null;
}

/**
 * `@scenery/cavalry-types` types every `Material` property as `undefined`
 * (the docs it is generated from describe the value in prose), so the real
 * shape is spelled out here rather than casting at every assignment.
 */
interface WritableMaterial {
  fill: boolean;
  stroke: boolean;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
}

function materialFor(style: GeometryPath): cavalry.Material {
  const result = new cavalry.Material();
  const writable = result as unknown as WritableMaterial;

  writable.fill = style.fill !== undefined;
  if (style.fill !== undefined) {
    writable.fillColor = style.fill;
  }
  writable.stroke = style.stroke !== undefined;
  if (style.stroke !== undefined) {
    writable.strokeColor = style.stroke;
    writable.strokeWidth = style.strokeWidth ?? 1;
  }
  return result;
}
