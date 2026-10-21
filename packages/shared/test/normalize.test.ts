import { describe, expect, it } from 'vitest';
import {
  detectDateFormat,
  formatDate,
  fuzzyScore,
  matchOption,
  normalizeBoolean,
  normalizeDate,
  normalizeEmail,
  normalizePhone,
  normalizeValue,
  wordsToDigits,
} from '../src';

describe('fuzzy matching', () => {
  it('treats transliteration variants as near-equal', () => {
    expect(fuzzyScore('Tiruvallur', 'Thiruvallur')).toBeGreaterThan(0.95);
    expect(fuzzyScore('Kanchipuram', 'Kancheepuram')).toBeGreaterThan(0.95);
  });
  it('scores unrelated words low', () => {
    expect(fuzzyScore('Chennai', 'Madurai')).toBeLessThan(0.75);
  });
  it('matches options across languages', () => {
    const opts = [
      { value: 'M', label: 'Male' },
      { value: 'F', label: 'Female' },
    ];
    expect(matchOption('ஆண்', opts).option?.label).toBe('Male');
    expect(matchOption('penn', opts).option?.label).toBe('Female');
    expect(matchOption('female', opts).score).toBe(1);
  });
  it('matches option values as well as labels', () => {
    const opts = [
      { value: 'IN', label: 'India' },
      { value: 'US', label: 'United States' },
    ];
    expect(matchOption('united states', opts).option?.value).toBe('US');
  });
});

describe('numbers and phones', () => {
  it('converts spoken digits including double/triple', () => {
    expect(wordsToDigits('nine eight double seven triple zero')).toBe('9877000');
    expect(wordsToDigits('ஒன்பது எட்டு ஏழு')).toBe('987');
    expect(wordsToDigits('onbadhu ettu ezhu')).toBe('987');
  });
  it('normalizes phones', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('9876543210');
    expect(normalizePhone('09876543210')).toBe('9876543210');
    expect(normalizePhone('nine eight seven six five four three two one zero')).toBe('9876543210');
  });
});

describe('email', () => {
  it('turns spoken symbols into an address', () => {
    expect(normalizeEmail('Ramesh at gmail dot com')).toBe('ramesh@gmail.com');
    expect(normalizeEmail('ramesh underscore k at the rate yahoo dot co dot in')).toBe('ramesh_k@yahoo.co.in');
    expect(normalizeEmail('ramesh at gmail புள்ளி com')).toBe('ramesh@gmail.com');
    expect(normalizeEmail('ramesh@gmail.com')).toBe('ramesh@gmail.com');
  });
});

describe('dates', () => {
  it('parses common forms', () => {
    expect(normalizeDate('1990-03-15')).toBe('1990-03-15');
    expect(normalizeDate('15/03/1990')).toBe('1990-03-15');
    expect(normalizeDate('15 March 1990')).toBe('1990-03-15');
    expect(normalizeDate('March 15th, 1990')).toBe('1990-03-15');
    expect(normalizeDate('15 மார்ச் 1990')).toBe('1990-03-15');
    expect(normalizeDate('03/15/1990', { dayFirst: false })).toBe('1990-03-15');
  });
  it('rejects impossible dates', () => {
    expect(normalizeDate('31/02/2020')).toBeNull();
    expect(normalizeDate('hello')).toBeNull();
  });
  it('formats for placeholders', () => {
    expect(detectDateFormat('DD/MM/YYYY')).toBe('DD/MM/YYYY');
    expect(formatDate('1990-03-15', 'DD/MM/YYYY')).toBe('15/03/1990');
    expect(formatDate('1990-03-15', 'mm-dd-yyyy')).toBe('03-15-1990');
  });
});

describe('booleans and semantic normalization', () => {
  it('handles yes/no in Tamil and English', () => {
    expect(normalizeBoolean('Yes')).toBe('true');
    expect(normalizeBoolean('இல்லை')).toBe('false');
    expect(normalizeBoolean('maybe')).toBeNull();
  });
  it('normalizes by semantic type', () => {
    expect(normalizeValue('full_name', 'ramesh kumar')).toBe('Ramesh Kumar');
    expect(normalizeValue('gst', '33 abcde 1234 f1z5')).toBe('33ABCDE1234F1Z5');
    expect(normalizeValue('pincode', 'six double zero zero one two')).toBe('600012');
  });
});
