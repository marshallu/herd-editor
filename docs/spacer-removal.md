# Removing the Spacer field safely

Keep the Herd Spacer compatibility shim active for as long as any field group
uses `type: spacer`. It is deliberately independent of the Herd editing screen;
turning off the screen must not rewrite ACF field groups.

For database-backed groups, first inventory without changing data:

```sh
wp eval-file wp-content/plugins/herd-editor/tools/migrate-spacer.php -- --dry-run
```

Run the migration when the inventory is approved. It records each completed
field in an option, so re-running it is safe after an interruption:

```sh
wp eval-file wp-content/plugins/herd-editor/tools/migrate-spacer.php
wp eval-file wp-content/plugins/herd-editor/tools/migrate-spacer.php -- --verify
```

The command never changes `acf-json` or PHP-local field groups. Update those
source-controlled definitions yourself, deploy them, and then verify native and
Herd edit/save/reload flows before disabling the shim.
