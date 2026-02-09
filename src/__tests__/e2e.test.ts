import { describe, it, expect } from "vitest";
import {
  generateKeypair,
  generateProjectKey,
  encryptEnv,
  decryptEnv,
  encryptProjectKey,
  decryptProjectKey,
} from "../lib/crypto.js";

describe("End-to-end encryption flow", () => {
  it("full flow: user A creates project, user B joins and decrypts env", () => {
    // Step 1: Generate user A keypair
    const userA = generateKeypair();
    expect(userA.publicKey.length).toBe(32);
    expect(userA.secretKey.length).toBe(32);

    // Step 2: Generate a project key
    const projectKey = generateProjectKey();
    expect(projectKey.length).toBe(32);

    // Step 3: Encrypt project key with user A's public key (self-encryption)
    // In a real scenario, user A encrypts the project key for themselves
    const encryptedKeyForA = encryptProjectKey(
      projectKey,
      userA.publicKey,
      userA.secretKey
    );
    expect(typeof encryptedKeyForA).toBe("string");

    // Step 4: Decrypt project key with user A's secret key
    const decryptedKeyByA = decryptProjectKey(
      encryptedKeyForA,
      userA.publicKey,
      userA.secretKey
    );
    expect(decryptedKeyByA).toEqual(projectKey);

    // Step 5: Use project key to encrypt env content
    const envContent = [
      "DATABASE_URL=postgres://user:password@localhost:5432/mydb",
      "REDIS_URL=redis://localhost:6379",
      "API_SECRET=super-secret-key-12345",
      "STRIPE_KEY=sk_test_abc",
      "NODE_ENV=production",
    ].join("\n");

    const encryptedEnv = encryptEnv(envContent, projectKey);
    expect(typeof encryptedEnv).toBe("string");

    // Step 6: Decrypt env content, verify matches original
    const decryptedEnv = decryptEnv(encryptedEnv, projectKey);
    expect(decryptedEnv).toBe(envContent);

    // Step 7: Generate user B keypair (new team member)
    const userB = generateKeypair();
    expect(userB.publicKey.length).toBe(32);
    expect(userB.secretKey.length).toBe(32);

    // Step 8: User A encrypts project key for user B (key exchange)
    // User A uses their secret key + user B's public key
    const encryptedKeyForB = encryptProjectKey(
      projectKey,
      userB.publicKey,
      userA.secretKey
    );
    expect(typeof encryptedKeyForB).toBe("string");
    expect(encryptedKeyForB).not.toBe(encryptedKeyForA);

    // Step 9: User B decrypts the project key using their secret key + user A's public key
    const decryptedKeyByB = decryptProjectKey(
      encryptedKeyForB,
      userA.publicKey,
      userB.secretKey
    );
    expect(decryptedKeyByB).toEqual(projectKey);

    // Step 10: User B decrypts the env content with the project key
    const decryptedEnvByB = decryptEnv(encryptedEnv, decryptedKeyByB);
    expect(decryptedEnvByB).toBe(envContent);
  });

  it("multi-user flow: 3 users sharing encrypted env", () => {
    const userA = generateKeypair();
    const userB = generateKeypair();
    const userC = generateKeypair();
    const projectKey = generateProjectKey();

    const envContent = "SECRET=shared-across-3-users\nDB=postgres://local";

    // User A encrypts env
    const encryptedEnv = encryptEnv(envContent, projectKey);

    // User A distributes project key to each user
    const encKeyForA = encryptProjectKey(
      projectKey,
      userA.publicKey,
      userA.secretKey
    );
    const encKeyForB = encryptProjectKey(
      projectKey,
      userB.publicKey,
      userA.secretKey
    );
    const encKeyForC = encryptProjectKey(
      projectKey,
      userC.publicKey,
      userA.secretKey
    );

    // All three encrypted keys are different
    expect(encKeyForA).not.toBe(encKeyForB);
    expect(encKeyForB).not.toBe(encKeyForC);
    expect(encKeyForA).not.toBe(encKeyForC);

    // Each user decrypts their project key
    const keyByA = decryptProjectKey(
      encKeyForA,
      userA.publicKey,
      userA.secretKey
    );
    const keyByB = decryptProjectKey(
      encKeyForB,
      userA.publicKey,
      userB.secretKey
    );
    const keyByC = decryptProjectKey(
      encKeyForC,
      userA.publicKey,
      userC.secretKey
    );

    // All project keys are identical
    expect(keyByA).toEqual(projectKey);
    expect(keyByB).toEqual(projectKey);
    expect(keyByC).toEqual(projectKey);

    // All users can decrypt the env
    expect(decryptEnv(encryptedEnv, keyByA)).toBe(envContent);
    expect(decryptEnv(encryptedEnv, keyByB)).toBe(envContent);
    expect(decryptEnv(encryptedEnv, keyByC)).toBe(envContent);
  });

  it("env versioning: multiple encrypted versions, all decryptable", () => {
    const userA = generateKeypair();
    const projectKey = generateProjectKey();

    const envV1 = "API_KEY=v1-key";
    const envV2 = "API_KEY=v2-key\nNEW_VAR=added";
    const envV3 = "API_KEY=v3-key\nNEW_VAR=added\nANOTHER=value";

    const encV1 = encryptEnv(envV1, projectKey);
    const encV2 = encryptEnv(envV2, projectKey);
    const encV3 = encryptEnv(envV3, projectKey);

    // All encrypted versions are different
    expect(encV1).not.toBe(encV2);
    expect(encV2).not.toBe(encV3);

    // All decrypt correctly
    expect(decryptEnv(encV1, projectKey)).toBe(envV1);
    expect(decryptEnv(encV2, projectKey)).toBe(envV2);
    expect(decryptEnv(encV3, projectKey)).toBe(envV3);
  });

  it("cross-user cannot decrypt without proper keys", () => {
    const userA = generateKeypair();
    const userB = generateKeypair();
    const userC = generateKeypair();
    const projectKey = generateProjectKey();

    // Encrypt project key for user B from user A
    const encryptedForB = encryptProjectKey(
      projectKey,
      userB.publicKey,
      userA.secretKey
    );

    // User C should NOT be able to decrypt it
    expect(() =>
      decryptProjectKey(encryptedForB, userA.publicKey, userC.secretKey)
    ).toThrow();

    // User C should NOT be able to decrypt even with user B's public key
    expect(() =>
      decryptProjectKey(encryptedForB, userB.publicKey, userC.secretKey)
    ).toThrow();
  });
});
