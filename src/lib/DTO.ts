import type { z } from 'zod';
import { config } from './config.js';
import { ValidationError } from './http/errors.js';

/**
 * Base class for Data Transfer Objects with Zod validation
 *
 * Provides automatic validation, JSON serialization, and schema integration.
 * Auto-validates on construction if DTO_AUTO_VALIDATE config is true (default).
 *
 * @example
 * ```typescript
 * const UserSchema = z.object({
 *   name: z.string().min(1),
 *   email: z.string().email(),
 *   age: z.number().int().positive().optional()
 * });
 *
 * class UserDTO extends DTO<typeof UserSchema> {
 *   constructor(data?: z.input<typeof UserSchema>) {
 *     super(UserSchema, data);
 *   }
 * }
 *
 * // Auto-validates by default
 * const user = new UserDTO({ name: 'John', email: 'john@example.com' });
 * console.log(user.toJSON()); // { name: 'John', email: 'john@example.com' }
 * ```
 */
export abstract class DTO<TSchema extends z.ZodTypeAny> {
  /** The Zod schema used for validation */
  protected readonly schema: TSchema;

  /**
   * Creates a new DTO instance
   *
   * @param schema - The Zod schema to validate against
   * @param data - Optional initial data to populate the DTO
   * @throws {ValidationError} If auto-validation is enabled and data is invalid
   */
  constructor(schema: TSchema, data?: z.input<TSchema>) {
    this.schema = schema;

    if (data) {
      if (config.DTO_AUTO_VALIDATE) {
        // Parse and validate data, then assign the parsed result
        // This ensures defaults, transformations, and preprocessing are applied
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const parsed = this.schema.parse(data);
          Object.assign(this, parsed);
        } catch (error) {
          if (error instanceof Error) {
            throw new ValidationError(error.message, (error as { issues?: unknown }).issues);
          }
          throw error;
        }
      } else {
        // If validation is disabled, assign raw data
        Object.assign(this, data);
      }
    }
  }

  /**
   * Validates the DTO data against the schema
   *
   * @throws {ValidationError} If validation fails with Zod error details
   *
   * @example
   * ```typescript
   * const user = new UserDTO({ name: '', email: 'invalid' });
   * try {
   *   user.validate();
   * } catch (error) {
   *   if (error instanceof ValidationError) {
   *     console.log(error.details); // Zod validation issues
   *   }
   * }
   * ```
   */
  validate(): void {
    try {
      // Parse only the data, not the schema property
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { schema: _, ...data } = this;
      this.schema.parse(data);
    } catch (error) {
      if (error instanceof Error) {
        throw new ValidationError(error.message, (error as { issues?: unknown }).issues);
      }
      throw error;
    }
  }

  /**
   * Converts the DTO to a plain JSON object
   *
   * @returns Plain object representation of the DTO
   *
   * @example
   * ```typescript
   * const user = new UserDTO({ name: 'John', email: 'john@example.com' });
   * const json = user.toJSON();
   * // { name: 'John', email: 'john@example.com' }
   * ```
   */
  toJSON(): z.output<TSchema> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { schema, ...data } = this;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return data as z.output<TSchema>;
  }

  /**
   * Creates a DTO instance from a plain JSON object
   *
   * @param json - The JSON object to create the DTO from
   * @returns A new DTO instance
   *
   * @example
   * ```typescript
   * const json = { name: 'John', email: 'john@example.com' };
   * const user = UserDTO.fromJSON(json);
   * ```
   */
  static fromJSON<T extends z.input<z.ZodTypeAny>>(
    this: new (data?: T) => DTO<z.ZodTypeAny>,
    json: T,
  ): DTO<z.ZodTypeAny> {
    return new this(json);
  }
}
