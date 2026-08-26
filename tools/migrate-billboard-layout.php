<?php
/**
 * Collapse Billboard's `background_image_layout` + `modern` booleans into `layout`.
 *
 * Cleanup, not a correctness requirement: `herdpress_billboard_layout()` derives the
 * same value from the old pair at render time, so migrated and un-migrated blocks
 * render identically. That is what makes this safe to run in stages, safe to re-run,
 * and safe to skip for revisions.
 *
 * Rewrites only the `acf/billboard` block comments it matches, leaving every other
 * byte of post_content untouched — the document is never reserialized wholesale.
 *
 *   wp eval-file tools/migrate-billboard-layout.php              # dry run
 *   wp eval-file tools/migrate-billboard-layout.php -- --write   # apply
 *
 * @package herd-editor
 */

$write      = in_array( '--write', $args, true );
$revisions  = in_array( '--include-revisions', $args, true );
$layout_key = 'field_695f0b1a11a01';

$statuses = array( 'publish', 'draft', 'pending', 'private' );
if ( $revisions ) {
	$statuses[] = 'inherit';
}

global $wpdb;

$tally   = array( 'grid' => 0, 'split' => 0, 'modern' => 0 );
$posts   = 0;
$skipped = 0;

foreach ( get_sites( array( 'number' => 500 ) ) as $site ) {
	switch_to_blog( $site->blog_id );

	$in   = "'" . implode( "','", array_map( 'esc_sql', $statuses ) ) . "'";
	$rows = $wpdb->get_results(
		"SELECT ID, post_content FROM {$wpdb->posts}
		 WHERE post_status IN ({$in}) AND post_content LIKE '%wp:acf/billboard %' ORDER BY ID"
	);

	foreach ( $rows as $row ) {
		$changed = false;

		$content = preg_replace_callback(
			'#<!--\s+wp:acf/billboard\s+(\{.*?\})\s+/-->#s',
			function ( $m ) use ( &$changed, &$tally, &$skipped, $layout_key ) {
				$attrs = json_decode( $m[1], true );
				if ( ! is_array( $attrs ) || ! isset( $attrs['data'] ) || ! is_array( $attrs['data'] ) ) {
					$skipped++;
					return $m[0];
				}

				$data = $attrs['data'];
				if ( isset( $data['layout'] ) && in_array( $data['layout'], array( 'grid', 'split', 'modern' ), true ) ) {
					return $m[0]; // Already migrated; re-running must be a no-op.
				}

				// Same precedence as herdpress_billboard_layout(): no background
				// image wins, so the combination the old form could not reach
				// resolves to the grid, which is what it already rendered as.
				if ( empty( $data['background_image_layout'] ) ) {
					$layout = 'grid';
				} else {
					$layout = empty( $data['modern'] ) ? 'split' : 'modern';
				}

				$rebuilt = array();
				foreach ( $data as $key => $value ) {
					// Insert the new pair where the old one sat, keeping field order.
					if ( 'background_image_layout' === $key ) {
						$rebuilt['layout']  = $layout;
						$rebuilt['_layout'] = $layout_key;
						continue;
					}
					if ( in_array( $key, array( '_background_image_layout', 'modern', '_modern' ), true ) ) {
						continue;
					}
					$rebuilt[ $key ] = $value;
				}
				if ( ! isset( $rebuilt['layout'] ) ) {
					$rebuilt = array( 'layout' => $layout, '_layout' => $layout_key ) + $rebuilt;
				}

				$attrs['data'] = $rebuilt;
				$changed       = true;
				$tally[ $layout ]++;

				return '<!-- wp:acf/billboard ' . serialize_block_attributes( $attrs ) . ' /-->';
			},
			$row->post_content
		);

		if ( ! $changed || null === $content ) {
			continue;
		}

		$posts++;
		if ( $write ) {
			// Direct write: wp_update_post() would run the_content filters and
			// kses, and re-slash a document we have already produced verbatim.
			$wpdb->update( $wpdb->posts, array( 'post_content' => $content ), array( 'ID' => $row->ID ) );
			clean_post_cache( $row->ID );
		}
	}

	restore_current_blog();
}

$mode = $write ? 'migrated' : 'would migrate';
WP_CLI::log( sprintf( '%s %d blocks across %d posts:', ucfirst( $mode ), array_sum( $tally ), $posts ) );
foreach ( $tally as $layout => $count ) {
	WP_CLI::log( sprintf( '  %-7s %d', $layout, $count ) );
}
if ( $skipped ) {
	WP_CLI::warning( sprintf( '%d block comments had unreadable attributes and were left alone.', $skipped ) );
}
if ( ! $write ) {
	WP_CLI::log( 'Dry run. Re-run with `-- --write` to apply. Revisions are skipped unless --include-revisions is passed.' );
}
