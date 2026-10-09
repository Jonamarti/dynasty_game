import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ANIMAL_KINDS, ANIMAL_POSES, paintAnimal, type AnimalPose } from '../../../art/src/animals/animals.ts';

const legacyHashes: Partial<Record<(typeof ANIMAL_KINDS)[number], readonly [string, string, string]>> = {
  deer: ['bf90de6ebd8da63f7473e12683f2d2c04ee06a02564a00facf164a8a41970dea', '1ffde0a19c87e9a79b79d64377618380a5466ceb5daca8ffc1a3a68004ce1a92', 'fdfe10a986a1edb3cbb493e039793b1e8a75fc9e9cde9a4fccec8688a6a09e93'],
  boar: ['e0a9da1d3d2c0bb4755d3b652b54d88ce2238577bb333fb1c82cfdade37c6d85', '77f76d0085fd27044b4cc16987fc2e09d83486ab6e68cc4d25cb8b23c0b47452', '5f556a4954428d8c9bed056aaeeb3635f7e43a5a8b627d58c93c110de3031ff2'],
  hare: ['e5fc1a18840aec97ca5509347124582e37a5f3dd27858136c03f44b750af98f5', '8c6eaeeca3b97070d69a250fbfa4d550bcb9a64bb38884bea2812602205b3926', 'b1023321f9008ae72b943e3a69c572cfb28c9706dbfb197c90bad942beaa9940'],
  wolf: ['3b4fa24fcd8d6411309991b2fddca2e59079872b0b44b9c3d9d83ff5d1f0a542', '68c014edcf69d68dfc7fc847bbb0518856b6a14202e0d91aca63ff33a0352489', '077e52ebfccec9c258c295bdf5cdd2fd211b4608100d1027c9a8c78bcb4cd244'],
  bear: ['169efef4e8bd7777277af9260c8d2224462dd3ac1e6ac838c5f88d2b713dcef8', '065b1ec900c91d899ce037ccb5fd74a782d60d64ced73117dc330b84d22b0626', '932a50020a8ca07ffc7264ebce4ca5b3fb2483fa092b2e4857e550301339251b'],
  lynx: ['d465df2cd176b4f0c898e0fe207bed618c907f5177025646a266ef8cf011ea3f', 'eeb3a7544a03c1e1d540bea9ba3811837f61e56dcf5e991b7223e8c64a84d76a', '55a0c194b6c6161d74e17db0d6603b4b10ce97c75dbffa297142a68b48427342'],
};

const hashSvg = (svg: string): string => createHash('sha256').update(svg).digest('hex');

describe('animal activity art generator', () => {
  it('preserves the existing idle and four walk SVGs byte-for-byte', () => {
    for (const kind of ANIMAL_KINDS) {
      const hashes = legacyHashes[kind];
      if (!hashes) continue;
      const [idle, walk1, walk3] = hashes;
      expect(hashSvg(paintAnimal(kind, 'idle'))).toBe(idle);
      expect(hashSvg(paintAnimal(kind, 0, false))).toBe(idle);
      for (const frame of [0, 2]) {
        expect(hashSvg(paintAnimal(kind, `w${frame}` as AnimalPose))).toBe(idle);
      }
      expect(hashSvg(paintAnimal(kind, 'w1'))).toBe(walk1);
      expect(hashSvg(paintAnimal(kind, 1, true))).toBe(walk1);
      expect(hashSvg(paintAnimal(kind, 'w3'))).toBe(walk3);
      expect(hashSvg(paintAnimal(kind, 3, true))).toBe(walk3);
    }
  });

  it('draws the new activity families as poses of body parts, without scaling the sprite', () => {
    for (const kind of ANIMAL_KINDS) {
      const idle = paintAnimal(kind, 'idle');
      const eating = paintAnimal(kind, 'e2');
      const running = paintAnimal(kind, 'r2');
      const walking = paintAnimal(kind, 'w2');
      const attack = paintAnimal(kind, 'a2');
      const sleeping = paintAnimal(kind, 's2');

      expect(eating).not.toBe(idle);
      expect(eating).toMatch(/data-part="head" transform="rotate\(/);
      expect(running).not.toBe(walking);
      expect(running).toContain('data-part="run-legs"');
      expect(attack).not.toBe(running);
      expect(attack).toContain('data-part="strike-legs"');
      expect(sleeping).toMatch(/data-part="sleep-posture" transform="translate\(0 \d+\)"/);
      expect(sleeping).toContain('data-part="folded-legs"');
      expect(sleeping).toContain('data-part="breathing"');
      expect(sleeping).not.toMatch(/transform="scale\(/);
    }
  });

  it('closes the eye and lowers the head while eating/resting', () => {
    for (const kind of ANIMAL_KINDS) {
      const eat = paintAnimal(kind, 'e2');
      const sleep = paintAnimal(kind, 's2');
      // The animal-specific grazing angles are substantial: these are neck/head hinges,
      // not a whole-sprite squash intended to imitate a lowered head.
      expect(eat.match(/data-part="head" transform="rotate\((-?\d+)/)?.[1]).toBeDefined();
      expect(Math.abs(Number(eat.match(/data-part="head" transform="rotate\((-?\d+)/)?.[1]))).toBeGreaterThan(25);
      expect(sleep).toContain('data-part="closed-eye"');
    }
    expect(ANIMAL_POSES).toContain('s0');
    expect(ANIMAL_POSES).toContain('s3');
  });
});
