# Alpha rollback

Keep the previous signed, notarized artifact and its release notes until the replacement build has
passed clean-install and upgrade acceptance.

## Application rollback

1. Stop active turns and quit Sia.
2. Preserve both `~/Library/Application Support/Sia` (the current v2 build) and, when upgrading from
   a legacy build, `~/Library/Application Support/@sia/desktop`. Do not delete or edit Keychain items
   as part of routine rollback. The two layouts are not interchangeable; keep each data directory
   with the application version that wrote it unless a reviewed migration explicitly says otherwise.
3. Reinstall the previous signed artifact from the private release archive.
4. Launch it and verify provider detection, agents, threads, and one read-only workflow.

If the older version cannot read data written by the newer version, restore the application and data
backup together. An unreadable encrypted database must be preserved for recovery, never silently
discarded.

## Cloud rollback

CloudFormation resources with retained research data, KMS keys, and deletion protection must not be
deleted as an application rollback. Repoint the desktop only by distributing another signed build
with a verified cloud configuration. Use a reviewed CloudFormation change set to roll Lambda/API
code back, then verify sign-in, a read-only request, deletion-worker health, the dead-letter queue,
and its monitored alarm.

Never report account deletion as successful while the worker or control plane is unavailable.
