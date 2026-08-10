# Encryption-key rotation

Sensitive fields use an envelope containing the numeric key version and
AES-256-GCM authenticated ciphertext.

1. Generate a new 32-byte hex key in the secret manager.
2. Add the current key to `APP_PREVIOUS_ENCRYPTION_KEYS_JSON` under its existing
   numeric version.
3. Increment `APP_ENCRYPTION_KEY_VERSION` and set `APP_ENCRYPTION_KEY` to the new
   key in staging.
4. Verify reads of old ciphertext and writes of new ciphertext. Exercise a test
   call, privacy export, proposal review, and redaction.
5. Deploy the same secret versions to production and run a bounded re-encryption
   job or rotate on read. Monitor decrypt audit events and failures.
6. After the approved retention/rollback window and a verified backup, remove
   the old key. Record operator, approver, counts, failures, and restoration test.

Never print key material or decrypted values. A lost key is a data-loss incident;
a disclosed key is a security incident requiring containment and assessment.
