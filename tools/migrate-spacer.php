<?php
/**
 * Optional, idempotent Spacer removal migration.
 *
 * Usage: wp eval-file tools/migrate-spacer.php -- --dry-run
 *        wp eval-file tools/migrate-spacer.php -- --verify
 *
 * Only database-backed fields are changed. ACF JSON and PHP-local groups are
 * reported but never rewritten; update those source-controlled definitions by
 * hand before disabling the compatibility shim.
 */
if ( ! defined( 'WP_CLI' ) || ! WP_CLI ) { exit( 1 ); }
if ( ! function_exists( 'herd_editor_stored_fields' ) ) { WP_CLI::error( 'Activate Herd Editor before running this migration.' ); }
$args = isset( $argv ) ? $argv : array();
$dry_run = in_array( '--dry-run', $args, true );
$verify = in_array( '--verify', $args, true );
$state_key = 'herd_editor_spacer_migration_v1';
$state = (array) get_option( $state_key, array( 'converted' => array() ) );
$found = array_filter( herd_editor_stored_fields(), static function( $field ) { return 'spacer' === $field['type']; } );
if ( $verify ) {
	WP_CLI::line( sprintf( '%d database Spacer field(s) remain.', count( $found ) ) );
	if ( $found ) { WP_CLI::halt( 1 ); }
	WP_CLI::success( 'No database-backed Spacer fields remain. Check acf-json and PHP-local groups separately.' );
	return;
}
foreach ( $found as $field ) {
	$key = ! empty( $field['key'] ) ? $field['key'] : (string) $field['ID'];
	if ( isset( $state['converted'][ $key ] ) ) { continue; }
	WP_CLI::line( sprintf( '%s %s (%s)', $dry_run ? 'Would convert' : 'Converting', $field['label'] ?: $key, $key ) );
	if ( $dry_run ) { continue; }
	$field = herd_editor_spacer_update_field( $field );
	$field['type'] = 'message'; $field['message'] = ''; $field['esc_html'] = 0;
	unset( $field['herd_spacer_style'] );
	$result = acf_update_field( $field );
	if ( ! $result || 'message' !== acf_get_field( $field['ID'] )['type'] ) { WP_CLI::error( 'Failed converting ' . $key ); }
	$state['converted'][ $key ] = time(); update_option( $state_key, $state, false );
}
if ( $dry_run ) { WP_CLI::success( 'Dry run complete; no fields changed.' ); }
else { WP_CLI::success( 'Migration complete. Run again with --verify.' ); }
