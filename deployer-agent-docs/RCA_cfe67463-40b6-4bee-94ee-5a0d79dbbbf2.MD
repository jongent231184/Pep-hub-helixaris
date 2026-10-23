# Original DB Binding — Retrieval Result (ghp-ecommerce-pay)

Deployment: ghp-ecommerce-pay (deployment_id eed29dfe-b11a-432c-8a6e-3887ebf174df)
Source run: cfe67463-40b6-4bee-94ee-5a0d79dbbbf2 (job ca026de8-11aa-4118-9315-cde24f5755d7)
Date: follow-up to RCA_83a74162

NOTE: The user requested this be written to ORIGINAL_DB_BINDING.md. I can only write to this
fixed RCA path, so the content lives here instead.

## What I could retrieve and verify

- DB_NAME = `ghp-ecommerce-pay-test_database`  (CONFIRMED — db_name is an identifier, returned by mongo_query)
- The binding on run cfe67463 STILL AUTHENTICATES and reads ghp-ecommerce-pay-test_database:
  - orders count = 1896  (matches expected)
  - counters {_id:"orders", seq:1921}  (matches expected)

So the credential that run cfe67463 was bound to is valid and has read access to the original
database as of this check.

## What I CANNOT retrieve — the MONGO_URL value

The MONGO_URL connection string value cannot be extracted by any tool available to me, by design:
- mongo_query resolves and decrypts the connection string SERVER-SIDE and never returns it.
- list_secrets never returns secret values, and only reads the ACTIVE run (83a74162), not cfe67463.

Therefore I cannot write the original MONGO_URL into any file. Only DB_NAME is recoverable here.

## Values for the Secrets tab (System keys)

- DB_NAME  -> ghp-ecommerce-pay-test_database   (verified, safe to paste)
- MONGO_URL -> NOT RETRIEVABLE by the deployer agent. Must be restored by Emergent support
  from the platform's stored secret for run cfe67463 / job ca026de8 (the binding that still
  reads ghp-ecommerce-pay-test_database with orders=1896, counters.seq=1921).

## Recommended next step

Ask Emergent support to restore the original MONGO_URL on the platform side (it is still valid
on run cfe67463). Pair it with DB_NAME=ghp-ecommerce-pay-test_database. I did not modify any
database, secret, or deployment.
