import { describe, expect, it } from 'vitest';
import { isWeakPin, LoginRequest, Pin, PIN_LENGTH, randomPin } from '@vff/shared';

describe('login PIN', () => {
  it('is exactly 6 digits', () => {
    expect(PIN_LENGTH).toBe(6);
    expect(Pin.safeParse('482915').success).toBe(true);
    expect(Pin.safeParse('012345').success).toBe(true);
    expect(Pin.safeParse('12345').success).toBe(false);
    expect(Pin.safeParse('1234567').success).toBe(false);
    expect(Pin.safeParse('12a456').success).toBe(false);
    expect(LoginRequest.safeParse({ phone: '9876543210', pin: '12345' }).success).toBe(false);
  });

  it('knows the easy-to-guess ones', () => {
    for (const p of ['111111', '000000', '123456', '654321', '890123', '121212', '123123', '909090']) expect(isWeakPin(p)).toBe(true);
    for (const p of ['482915', '037261', '112358', '120934']) expect(isWeakPin(p)).toBe(false);
  });

  it('generates random 6-digit PINs that are not easy to guess', () => {
    const pins = Array.from({ length: 1000 }, randomPin);
    for (const p of pins) {
      expect(p).toMatch(/^[0-9]{6}$/);
      expect(isWeakPin(p)).toBe(false);
    }
    expect(new Set(pins).size).toBeGreaterThan(990);
  });
});
