"""One-off: make the Android release signing key (PKCS12) in the owner's key folder, never in the repo.

    python scripts/make-keystore.py C:/Users/titus/Klasilid-keys

Writes klasilid-release.p12 (alias "klasilid", RSA 2048, self-signed, 30 years) and appends its password to
README.txt. Refuses to overwrite an existing keystore: a new key would stop installed apps from updating.
"""
import datetime
import os
import secrets
import string
import sys

from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import BestAvailableEncryption, pkcs12
from cryptography.x509.oid import NameOID


def main(folder: str) -> None:
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, "klasilid-release.p12")
    if os.path.exists(path):
        sys.exit(f"{path} already exists; not replacing the signing key.")
    password = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Klasilid"), x509.NameAttribute(NameOID.COUNTRY_NAME, "PH")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + datetime.timedelta(days=365 * 30))
        .sign(key, hashes.SHA256())
    )
    data = pkcs12.serialize_key_and_certificates(b"klasilid", key, cert, None, BestAvailableEncryption(password.encode()))
    with open(path, "wb") as f:
        f.write(data)
    with open(os.path.join(folder, "README.txt"), "a", encoding="utf-8") as f:
        f.write(f"Android keystore: klasilid-release.p12, alias klasilid, password {password}\n")
    print(f"wrote {path}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Klasilid-keys"))
