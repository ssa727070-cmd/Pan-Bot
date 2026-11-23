import { z } from 'zod';

/** Shared Zod validation for feature configuration. All values are bounded to avoid abuse. */

export const snowflake = z
  .string()
  .regex(/^\d{17,20}$/, 'Expected a Discord snowflake (17-20 digits)');

export const boundedInteger = (min: number, max: number): z.ZodNumber =>
  z.number().int().min(min).max(max);

export const panelLabel = z.string().trim().min(1).max(45);
export const panelDescription = z.string().trim().max(100);
export const suggestionText = z.string().trim().min(10).max(1000);

/** Blocked words are literal phrases only: no regex syntax is accepted or evaluated. */
export const blockedWord = z
  .string()
  .trim()
  .min(2)
  .max(50)
  .regex(/^[\p{L}\p{N} *_-]+$/u, 'Solo letras, números, espacios, guiones y asteriscos');

export const suggestionStatus = z.enum(['pending', 'approved', 'rejected', 'implemented']);

export function isValidSnowflake(value: string): boolean {
  return snowflake.safeParse(value).success;
}
