<?php
/**
 * Uninstall: deliberately removes nothing.
 *
 * This file exists to record a decision rather than to act on one, because the
 * first thing anyone asks on reading the Spacer field is what deleting the
 * plugin does to a site's field groups.
 *
 * IT LEAVES THEM ALONE. Deleting a plugin must not rewrite a host site's field
 * groups. A field group that has been edited into a shape somebody wants is
 * worth more than tidiness, and the failure modes are not symmetrical: leaving a
 * spacer behind costs a stray label over an empty box, while stripping fields
 * out of somebody's field group on uninstall is unrecoverable and arrives
 * without warning.
 *
 * Deactivation is deliberately different: it converts stored spacers to empty
 * Message fields, and reactivating converts them back. The asymmetry is the
 * point. A deactivated plugin can be reactivated, so a spacer left behind is a
 * trap somebody will spring by re-saving an unrelated field -- see
 * herd_editor_convert_spacers_to_messages(). A deleted plugin cannot be
 * reactivated, so the field groups it leaves are all the site has, and the
 * failure modes are not symmetrical: a stray label over an empty box costs
 * little, while stripping fields out of somebody's field group on uninstall is
 * unrecoverable and arrives without warning.
 *
 * Neither path touches `acf-json` or PHP-local field groups. Sites that want
 * spacers gone for good run the explicit, resumable WP-CLI migration and
 * verify it.
 *
 * There are two options and one user option, and they are removed here.
 *
 * The default-editor choice means nothing without the editor it names, and was
 * mirrored into Classic Editor's own settings on every save where that plugin
 * is present -- so a site that had chosen Herd is already pointed at the Block
 * editor and keeps behaving that way once these are gone.
 *
 * The settings row is Herd's own configuration: which post types it was offered
 * for, how the inserter was grouped, which stylesheets its screen dropped. Every
 * one of those describes a screen that no longer exists. On multisite it is a
 * site option rather than an option, so both are removed.
 *
 * Nothing else needs cleaning up. Herd stores no transients, no tables, and no
 * postmeta of its own: widths live in ACF's `wrapper['width']` and a spacer
 * holds no value at all.
 *
 * @package herd-editor
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'herd-editor-default' );
delete_option( 'herd-editor-settings-site' );
/*
 * The same row again, network-wide. On multisite Herd's configuration is a
 * network setting -- there is no per-site screen for it -- so that is where the
 * value actually is, and delete_option() above would not have reached it.
 */
if ( is_multisite() ) {
	delete_site_option( 'herd-editor-settings-site' );
}
delete_metadata( 'user', 0, $GLOBALS['wpdb']->get_blog_prefix() . 'herd-editor-settings', '', true );
