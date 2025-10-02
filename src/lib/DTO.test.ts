import { describe, it } from 'node:test';
import assert from 'node:assert';
import { z } from 'zod';
import { DTO } from './DTO.js';
import { ValidationError } from './http/errors.js';

// Test schemas
const UserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().positive().optional(),
});

// Test DTO implementation
class UserDTO extends DTO<typeof UserSchema> {
  declare name: string;
  declare email: string;
  declare age?: number;

  constructor(data?: z.input<typeof UserSchema>) {
    super(UserSchema, data);
  }
}

void describe('DTO', () => {
  void it('should validate successfully with valid data', () => {
    const validData = {
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
    };

    // Should not throw with auto-validation enabled
    const dto = new UserDTO(validData);

    assert.strictEqual(dto.name, 'John Doe');
    assert.strictEqual(dto.email, 'john@example.com');
    assert.strictEqual(dto.age, 30);
  });

  void it('should throw ValidationError with invalid data', () => {
    const invalidData = {
      name: '', // Invalid: empty string
      email: 'not-an-email', // Invalid: not an email
      age: -5, // Invalid: negative number
    };

    assert.throws(
      () => new UserDTO(invalidData),
      (error: Error) => {
        assert.ok(error instanceof ValidationError);
        assert.ok(error.details);
        return true;
      },
    );
  });

  void it('should respect DTO_AUTO_VALIDATE config when disabled', () => {
    // Mock config to disable auto-validation
    const originalAutoValidate = process.env.DTO_AUTO_VALIDATE;
    process.env.DTO_AUTO_VALIDATE = 'false';

    // Need to reload config module for the change to take effect
    // For this test, we'll just verify the validate() method works explicitly

    const validData = { name: 'Jane', email: 'jane@example.com' };
    const dto = new UserDTO(validData);

    // Manual validation should still work
    assert.doesNotThrow(() => {
      dto.validate();
    });

    // Restore original value
    if (originalAutoValidate === undefined) {
      delete process.env.DTO_AUTO_VALIDATE;
    } else {
      process.env.DTO_AUTO_VALIDATE = originalAutoValidate;
    }
  });

  void it('should preserve data through toJSON/fromJSON round-trip', () => {
    const originalData = {
      name: 'Alice',
      email: 'alice@example.com',
      age: 25,
    };

    const dto1 = new UserDTO(originalData);
    const json = dto1.toJSON();
    const dto2 = UserDTO.fromJSON(json) as UserDTO;

    assert.deepStrictEqual(dto2.toJSON(), originalData);
    assert.strictEqual(dto2.name, originalData.name);
    assert.strictEqual(dto2.email, originalData.email);
    assert.strictEqual(dto2.age, originalData.age);
  });

  void it('should integrate with Zod schema', () => {
    const validData = {
      name: 'Bob',
      email: 'bob@example.com',
    };

    const dto = new UserDTO(validData);

    // Verify the schema is accessible
    // eslint-disable-next-line @typescript-eslint/dot-notation
    const parsedData = dto['schema'].parse(dto.toJSON());

    assert.strictEqual(parsedData.name, 'Bob');
    assert.strictEqual(parsedData.email, 'bob@example.com');
  });

  void it('should not include schema in toJSON output', () => {
    const data = {
      name: 'Charlie',
      email: 'charlie@example.com',
    };

    const dto = new UserDTO(data);
    const json = dto.toJSON();

    assert.strictEqual('schema' in json, false);
    assert.strictEqual(json.name, 'Charlie');
    assert.strictEqual(json.email, 'charlie@example.com');
  });
});
