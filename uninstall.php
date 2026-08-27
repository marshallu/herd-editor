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
 * Deactivation does not rewrite field groups. The Spacer compatibility shim can
 * remain active independently of the Herd screen; sites that really want to
 * remove it must run the explicit, resumable WP-CLI migration and verify it.
 *
 * There is one option and one user option, and they are removed here: the
 * default-editor choice, which means nothing without the editor it names. Both
 * were mirrored into Classic Editor's own settings on every save, so a site
 * that had chosen Herd is already pointed at the Block editor and keeps
 * behaving that way once these are gone.
 *
 * Nothing else needs cleaning up. Herd stores no transients, no tables, and no
 * postmeta of its own: widths live in ACF's `wrapper['width']` and a spacer
 * holds no value at all.
 *
 * @package herd-editor
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'herd-editor-default' );
delete_metadata( 'user', 0, $GLOBALS['wpdb']->get_blog_prefix() . 'herd-editor-settings', '', true );
