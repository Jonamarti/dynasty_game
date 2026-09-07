/**
 * Camera: converts between world tiles and screen pixels, and follows a target.
 *
 * Follow is a lerp rather than a snap so that the view drifts after the player
 * instead of jerking, which matters a lot at 16px tiles where a one-pixel jump
 * is visible.
 */
export const TILE = 16;

/** Fraction of the remaining distance the view closes each 1/60th of a second. */
const FOLLOW_SMOOTHING = 0.12;

export class Camera {
  /** Centre of the view, in world tiles. */
  x = 0;
  y = 0;
  zoom = 2;

  /**
   * Whether the camera is tied to the player.
   *
   * Dragging the map releases it, so you can go and look at the far side of the
   * island while your character carries on; re-centring re-attaches it. A
   * camera that snaps back to the player every frame makes surveying land, or
   * watching another band, impossible.
   */
  following = true;

  viewWidth = 0;
  viewHeight = 0;

  setViewport(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
  }

  /** Pixels covered by one tile at the current zoom. */
  get scale(): number {
    return TILE * this.zoom;
  }

  /**
   * Drifts the view towards a target.
   *
   * `delta` is seconds of real time, and it is not decoration. The lerp used to
   * apply a flat 0.12 *per frame*, so the camera chased at half the speed on a
   * 30fps machine as on a 60fps one and at twice the speed on a 120Hz display:
   * the same code produced three different games. Raising the retention to the
   * power of the elapsed time makes the pursuit take the same wall-clock time
   * everywhere, and reduces to the old constant exactly at 60fps.
   */
  follow(targetX: number, targetY: number, delta: number): void {
    if (!this.following) return;
    const t = 1 - Math.pow(1 - FOLLOW_SMOOTHING, Math.max(0, delta) * 60);
    this.x += (targetX - this.x) * t;
    this.y += (targetY - this.y) * t;
  }

  /** Moves the view by a screen-pixel delta, releasing the follow. */
  panByPixels(dx: number, dy: number): void {
    this.following = false;
    this.x -= dx / this.scale;
    this.y -= dy / this.scale;
  }

  /** Re-attaches to the player and snaps there. */
  recentre(targetX: number, targetY: number): void {
    this.following = true;
    this.snapTo(targetX, targetY);
  }

  snapTo(targetX: number, targetY: number): void {
    this.x = targetX;
    this.y = targetY;
  }

  worldToScreenX(worldX: number): number {
    return (worldX - this.x) * this.scale + this.viewWidth / 2;
  }

  worldToScreenY(worldY: number): number {
    return (worldY - this.y) * this.scale + this.viewHeight / 2;
  }

  screenToWorldX(screenX: number): number {
    return (screenX - this.viewWidth / 2) / this.scale + this.x;
  }

  screenToWorldY(screenY: number): number {
    return (screenY - this.viewHeight / 2) / this.scale + this.y;
  }

  /** Inclusive tile bounds currently on screen, with a one-tile margin. */
  visibleTiles(): { minX: number; minY: number; maxX: number; maxY: number } {
    const halfW = this.viewWidth / (2 * this.scale);
    const halfH = this.viewHeight / (2 * this.scale);
    return {
      minX: Math.floor(this.x - halfW) - 1,
      minY: Math.floor(this.y - halfH) - 1,
      maxX: Math.ceil(this.x + halfW) + 1,
      maxY: Math.ceil(this.y + halfH) + 1,
    };
  }

  clampTo(width: number, height: number): void {
    const halfW = this.viewWidth / (2 * this.scale);
    const halfH = this.viewHeight / (2 * this.scale);
    // If the map is narrower than the view, centre it rather than clamping to
    // an inverted range.
    this.x = halfW * 2 >= width ? width / 2 : Math.max(halfW, Math.min(width - halfW, this.x));
    this.y = halfH * 2 >= height ? height / 2 : Math.max(halfH, Math.min(height - halfH, this.y));
  }
}
