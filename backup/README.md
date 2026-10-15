# Backup encryption key

`age-recipient.txt` holds the **public** half of an [age](https://age-encryption.org) key pair.
The weekly backup workflow encrypts every database export to it. The **private** key stays with
the Admin, offline. It is never committed, and never stored in GitHub, Cloudflare or the portal.

Create the pair once (docs/OPERATIONS.md → Backups):

```sh
age-keygen -o dsol-backup-key.txt   # the private key: keep it offline (password manager, USB in a safe)
age-keygen -y dsol-backup-key.txt   # prints the public key (age1…): put it in age-recipient.txt and commit
```

Until `age-recipient.txt` holds a real `age1…` key, the backup workflow fails on purpose instead of
uploading anything.
