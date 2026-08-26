<?php
/**
 * Check that Billboard's Layout control paints what the block actually renders.
 *
 * Un-migrated content stores no `layout` value, and ACF substitutes a field's
 * `default_value` before `acf/load_value` runs -- so without
 * `herdpress_billboard_pre_load_layout()` the control shows Grid for every Split
 * and Modern block, and saving that form writes Grid over the real layout.
 *
 * Mirrors acf/ajax/fetch-block: set up the block's meta, then read the field the
 * way the form field does, and compare against what the front end renders.
 *
 *   wp eval-file tools/verify-billboard-layout.php
 *
 * @package herd-editor
 */
global $wpdb;
$field = acf_get_field( 'field_695f0b1a11a01' );
if ( ! $field ) { WP_CLI::error( 'layout field not registered' ); }

$ok = 0; $bad = array();

foreach ( get_sites( array( 'number' => 500 ) ) as $site ) {
	switch_to_blog( $site->blog_id );
	$rows = $wpdb->get_results(
		"SELECT ID, post_content FROM {$wpdb->posts}
		 WHERE post_status IN ('publish','draft','pending','private')
		   AND post_content LIKE '%wp:acf/billboard %' ORDER BY ID"
	);
	foreach ( $rows as $row ) {
		$n = 0;
		foreach ( parse_blocks( get_post( $row->ID )->post_content ) as $block ) {
			if ( 'acf/billboard' !== ( $block['blockName'] ?? '' ) ) { continue; }
			$n++;
			$data = $block['attrs']['data'] ?? array();
			if ( ! is_array( $data ) ) { continue; }

			// What the front end renders.
			if ( empty( $data['background_image_layout'] ) ) { $expected = 'grid'; }
			else { $expected = empty( $data['modern'] ) ? 'split' : 'modern'; }
			if ( isset( $data['layout'] ) ) { $expected = $data['layout']; }

			// What the editor form loads.
			$block_id = 'block_' . ( $block['attrs']['id'] ?? md5( $row->ID . $n ) );
			acf_setup_meta( $data, $block_id, true );
			$form_value = acf_get_value( $block_id, $field );
			acf_reset_meta( $block_id );

			if ( $form_value === $expected ) { $ok++; }
			else { $bad[] = "site{$site->blog_id}-post{$row->ID}#{$n}: form={$form_value} rendered={$expected}"; }
		}
	}
	restore_current_blog();
}

WP_CLI::log( "editor matches render: {$ok}   mismatched: " . count( $bad ) );
foreach ( array_slice( $bad, 0, 8 ) as $b ) { WP_CLI::warning( $b ); }
if ( ! $bad ) { WP_CLI::success( 'The control paints the layout the block actually renders.' ); }
