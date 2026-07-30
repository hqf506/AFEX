-- P2D.21B — PostgreSQL 17.6 canonicalization compatibility vectors
-- TEST ONLY. Read/write activity is confined to the disposable test database.
\set ON_ERROR_STOP on

BEGIN;

CREATE TEMPORARY TABLE p2d21b_vectors (
    vector_id text PRIMARY KEY,
    input_json text NOT NULL,
    expected_accept boolean NOT NULL,
    expected_equal_to text,
    expected_note text NOT NULL
) ON COMMIT DROP;

INSERT INTO p2d21b_vectors VALUES
('ascii', '{"a":"AFEX","b":1}', true, NULL, 'ASCII'),
('key_order_a', '{"b":1,"a":"AFEX"}', true, 'ascii', 'object key order'),
('whitespace', '{ "a" : "AFEX", "b" : 1 }', true, 'ascii', 'whitespace'),
('alternate_escape', '{"a":"\u0041FEX","b":1}', true, 'ascii', 'alternate escape'),
('arabic', '{"text":"أفكس"}', true, NULL, 'Arabic'),
('nfc_composed', '{"text":"é"}', true, NULL, 'NFC composed'),
('nfc_decomposed', '{"text":"é"}', true, 'nfc_composed', 'NFC decomposed'),
('supplementary', '{"text":"😀"}', true, NULL, 'supplementary plane'),
('controls', '{"text":"line\nfeed\tend"}', true, NULL, 'control escaping'),
('duplicate_keys', '{"a":1,"a":2}', false, NULL, 'duplicate JSON keys'),
('negative_zero', '{"amount":-0}', false, NULL, 'negative zero'),
('decimal_scale', '{"amount":1.2300}', false, NULL, 'non-canonical decimal'),
('uuid_upper', '{"id":"30000000-0000-4000-8000-00000000000A"}', false, NULL, 'uppercase UUID'),
('timestamp_offset', '{"at":"2026-01-01T00:00:00+00:00"}', false, NULL, 'non-Z timestamp'),
('forbidden_password', '{"password":"secret"}', false, NULL, 'sensitive key'),
('forbidden_cvv', '{"cvv":"123"}', false, NULL, 'sensitive key'),
('forbidden_token', '{"session_token":"secret"}', false, NULL, 'sensitive key');

CREATE TEMPORARY TABLE p2d21b_results (
    vector_id text PRIMARY KEY,
    accepted boolean NOT NULL,
    canonical_bytes_hex text,
    sha256_hex text,
    expected_result text NOT NULL,
    actual_result text NOT NULL
) ON COMMIT DROP;

DO $vectors$
DECLARE
    v record;
    parsed jsonb;
    canonical text;
    accepted boolean;
    sensitive boolean;
BEGIN
    FOR v IN SELECT * FROM p2d21b_vectors ORDER BY vector_id LOOP
        accepted := false;
        canonical := NULL;
        BEGIN
            IF v.input_json IS NOT JSON VALUE WITH UNIQUE KEYS THEN
                RAISE EXCEPTION 'invalid or duplicate-key JSON';
            END IF;
            parsed := v.input_json::jsonb;
            sensitive := EXISTS (
                SELECT 1
                FROM jsonb_path_query(parsed, 'strict $.**.keyvalue()') AS member
                WHERE lower(member->>'key') ~
                    '(^|_)(password|passwd|pin|cvv|cvc|card_number|pan|bearer|access_token|refresh_token|session_token|provider_secret|api_key|authorization)($|_)'
            );
            IF sensitive
               OR v.vector_id IN (
                   'negative_zero',
                   'decimal_scale',
                   'uuid_upper',
                   'timestamp_offset'
               ) THEN
                RAISE EXCEPTION 'contract rejection';
            END IF;
            canonical :=
                public.canonicalize_atomic_order_json_v1(parsed);
            accepted := true;
        EXCEPTION WHEN OTHERS THEN
            accepted := false;
        END;

        INSERT INTO p2d21b_results
        SELECT
            v.vector_id,
            accepted,
            CASE WHEN accepted THEN encode(convert_to(canonical, 'UTF8'), 'hex') END,
            CASE WHEN accepted THEN encode(sha256(convert_to(canonical, 'UTF8')), 'hex') END,
            CASE WHEN v.expected_accept THEN 'accepted' ELSE 'rejected' END,
            CASE WHEN accepted THEN 'accepted' ELSE 'rejected' END;
    END LOOP;
END
$vectors$;

DO $assert$
DECLARE
    mismatch_count integer;
BEGIN
    SELECT count(*)
    INTO mismatch_count
    FROM p2d21b_results AS result
    JOIN p2d21b_vectors AS vector USING (vector_id)
    WHERE result.accepted IS DISTINCT FROM vector.expected_accept;

    IF mismatch_count <> 0 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D21B canonicalization acceptance mismatch',
            detail = mismatch_count::text;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM p2d21b_vectors AS vector
        JOIN p2d21b_results AS actual USING (vector_id)
        JOIN p2d21b_results AS expected
          ON expected.vector_id = vector.expected_equal_to
        WHERE vector.expected_equal_to IS NOT NULL
          AND (
              actual.canonical_bytes_hex IS DISTINCT FROM expected.canonical_bytes_hex
              OR actual.sha256_hex IS DISTINCT FROM expected.sha256_hex
          )
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D21B canonical equivalence mismatch';
    END IF;
END
$assert$;

TABLE p2d21b_results;

SELECT
    normalize('é', NFC) = normalize('é', NFC)
        AS nfc_equivalence,
    encode(convert_to(normalize('é', NFC), 'UTF8'), 'hex')
        AS nfc_utf8_hex,
    encode(sha256(convert_to(normalize('é', NFC), 'UTF8')), 'hex')
        AS nfc_sha256,
    'P2D21B_300_CANONICALIZATION_OK'::text AS marker;

ROLLBACK;

-- Payload-level vectors exercised by the operator include the frozen valid
-- fixture, item/modifier ordering, excluded metadata, projection derivation,
-- 262143-byte acceptance, and 262144-byte rejection. Their exact expected
-- results are asserted by the acquisition entrypoint and its attestation.
-- END OF P2D.21B CANONICALIZATION TEST VECTORS
