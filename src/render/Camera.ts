/**
 * Camera: converts between world tiles and screen pixels, and follows a target.
 *
 * Follow is a lerp rather than a snap so that the view drifts after the player
 * instead of jerking, which matters a lot at 16px tiles where a one-pixel jump
 * is visible.
 */
export const TILE = 16;

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

  follow(targetX: number, targetY: number, smoothing = 0.12): void {
    if (!this.following) return;
    this.x += (targetX - this.x) * smoothing;
    this.y += (targetY - this.y) * smoothing;
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
