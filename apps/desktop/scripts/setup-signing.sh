#!/bin/bash
# Adapted from romirthedev/notch at 6c74c30; see native/notch/README.md.
# Creates the "Sia Dev Signing" self-signed code-signing identity in the
# login keychain. Once it exists, pnpm dev signs every build with
# it, so the app's designated requirement (and therefore its TCC grants —
# Accessibility, Screen Recording, Automation) stays stable across rebuilds
# instead of resetting on each ad-hoc signature.
#
# Idempotent: re-running is a no-op if the identity already exists.
# Run once: scripts/setup-signing.sh
set -euo pipefail

CN="Sia Dev Signing"
KC="$(security default-keychain -d user | tr -d ' "\n')"

if security find-identity -p codesigning "$KC" 2>/dev/null | grep -q "$CN"; then
    echo "✓ '$CN' already present in $KC — nothing to do."
    exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PW="sia-dev"   # transient: only guards the in-flight PKCS#12 bundle

cat > "$TMP/codesign.cnf" <<'EOF'
[ req ]
distinguished_name = dn
x509_extensions    = v3
prompt             = no
[ dn ]
CN = Sia Dev Signing
[ v3 ]
basicConstraints   = critical,CA:false
keyUsage           = critical,digitalSignature
extendedKeyUsage   = critical,codeSigning
EOF

echo "→ generating self-signed code-signing cert (10y)"
openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$TMP/key.pem" -out "$TMP/cert.pem" \
    -days 3650 -config "$TMP/codesign.cnf" 2>/dev/null

# OpenSSL 3 defaults to PKCS#12 algorithms Apple's Security framework can't
# verify; -legacy + a real passphrase + sha1 MAC produce an importable bundle.
# LibreSSL (/usr/bin/openssl) has no -legacy flag but already defaults to the
# compatible algorithms — so fall back without it.
LEGACY=(-legacy -macalg sha1)
if ! openssl pkcs12 -export "${LEGACY[@]}" \
        -inkey "$TMP/key.pem" -in "$TMP/cert.pem" \
        -name "$CN" -out "$TMP/identity.p12" -passout "pass:$PW" 2>/dev/null; then
    openssl pkcs12 -export \
        -inkey "$TMP/key.pem" -in "$TMP/cert.pem" \
        -name "$CN" -out "$TMP/identity.p12" -passout "pass:$PW"
fi

echo "→ importing into $KC"
# Limit access to codesign; do not authorize all applications.
# Keychain may request a one-time approval for the local signing identity.
security import "$TMP/identity.p12" -k "$KC" -P "$PW" -T /usr/bin/codesign

echo "✓ '$CN' installed. It is self-signed and shows CSSMERR_TP_NOT_TRUSTED —"
echo "  that's expected and fine; codesign only needs the stable cert, not trust."
echo "  Rebuild once (pnpm dev) and re-grant permissions a final"
echo "  time; from then on the grants persist across rebuilds."
