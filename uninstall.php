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
 * Deactivation is where the real work happens — see `herd_editor_deactivate()`
 * in includes/herd-editor-spacer.php, which converts every stored spacer into an
 * empty ACF Message field so that a site running without Herd has no field of an
 * unknown type in it. WordPress runs deactivation before uninstall, so by the
 * time this file would matter, the conversion has already happened.
 *
 * Nothing else needs cleaning up. Herd stores no options, no transients, no
 * tables, and no postmeta of its own: widths live in ACF's `wrapper['width']`
 * and a spacer holds no value at all.
 *
 * @package herd-editor
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;
