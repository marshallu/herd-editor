<?php
/**
 * Plugin Name: Herd Editor
 * Description: A dedicated Herd Editor mode for editing existing ACF blocks alongside Classic and Block Editor.
 * Version: 1.0.0
 * Requires at least: 7.1
 * Requires PHP: 7.4
 * Requires Plugins: advanced-custom-fields-pro
 * Text Domain: herd-editor
 */

defined( 'ABSPATH' ) || exit;

define( 'HERD_EDITOR_VERSION', '1.0.0' );
define( 'HERD_EDITOR_URL', plugin_dir_url( __FILE__ ) );
/** This file's path, for the activation and deactivation hooks in includes/herd-editor-spacer.php. */
define( 'HERD_EDITOR_FILE', __FILE__ );
define( 'HERD_EDITOR_DIR', plugin_dir_path( __FILE__ ) );
/**
 * The oldest ACF Pro this plugin is tested against.
 *
 * `Requires Plugins` above keeps the plugin from activating without ACF Pro at
 * all, but that header cannot express a version. Everything Herd reaches into —
 * the `acf/ajax/fetch-block` form endpoint, the field settings tabs, the
 * `acf/prepare_field` variations — is 6.0 or older, and 6.0 is where ACF settled
 * the field group editor markup this plugin renders into.
 */
define( 'HERD_EDITOR_MIN_ACF', '6.0' );

/** @var string */
global $herd_editor_screen_hook;

/**
 * The spike is intentionally unavailable without ACF Pro. It must never create
 * a second persistence model when the authoritative ACF block implementation is absent.
 */
function herd_editor_has_acf_pro() {
	if ( ! function_exists( 'acf_get_setting' ) || ! acf_get_setting( 'pro' ) ) {
		return false;
	}
	/*
	 * Degrade rather than fatal on an ACF older than Herd was built for. The
	 * editor simply does not offer itself, which is the same thing that happens
	 * without ACF Pro at all, and the site keeps both native editors.
	 */
	return defined( 'ACF_VERSION' ) && version_compare( ACF_VERSION, HERD_EDITOR_MIN_ACF, '>=' );
}

/*
 * Width as a layout control. Loaded unconditionally and on every admin request,
 * not just Herd's own screen: the control it replaces belongs to the ACF field
 * group editor, which is a screen Herd does not own. Its one filter checks for
 * ACF itself, so this is inert when ACF is absent.
 */
require_once HERD_EDITOR_DIR . 'includes/herd-editor-width.php';

/*
 * Which fields hold no value, and the Spacer field type. Both load on every
 * request rather than on Herd's screen: a field type has to be registered
 * wherever a field group might render — the Block Editor, Classic, the REST
 * API, a front-end `get_field()` call — or the field group holding one reports
 * an unknown type on every surface but this plugin's own.
 */
require_once HERD_EDITOR_DIR . 'includes/herd-editor-layout-fields.php';
require_once HERD_EDITOR_DIR . 'includes/herd-editor-spacer.php';

/*
 * Which editor opens by default, and what a new post opens with. Loaded on
 * every request rather than Herd's own screen: the setting is edited on
 * Settings > Writing and on a user profile, and the redirect that honours it
 * has to be in place before post.php chooses an editor.
 */
require_once HERD_EDITOR_DIR . 'includes/herd-editor-default.php';

/*
 * What a save has to say for itself. Loaded on every admin request rather than
 * Herd's own screen: the redirect it feeds is chosen inside post.php, long
 * before the screen this plugin owns is asked to render anything.
 */
require_once HERD_EDITOR_DIR . 'includes/herd-editor-saved.php';

function herd_editor_post_types( $post_types ) {
	return array_values( array_unique( array_filter( (array) $post_types ) ) );
}

function herd_editor_allowed_post_types() {
	return herd_editor_post_types( apply_filters( 'herd_editor_post_types', array( 'page', 'post' ) ) );
}

/**
 * Determine whether the current user may open Herd Editor for a post.
 *
 * @param WP_Post $post Post being edited.
 * @return bool
 */
function herd_editor_supports_post( $post ) {
	if ( ! $post instanceof WP_Post || ! in_array( $post->post_type, herd_editor_allowed_post_types(), true ) ) {
		return false;
	}
	$user = wp_get_current_user();
	$allowed = user_can( $user, 'manage_options' ) && user_can( $user, 'edit_post', $post->ID );
	/**
	 * Filter access to Herd Editor for pilot users.
	 *
	 * @param bool    $allowed Whether access is allowed by default.
	 * @param WP_User $user    Current user.
	 * @param WP_Post $post    Post being edited.
	 */
	return (bool) apply_filters( 'herd_editor_user_can_access', $allowed, $user, $post );
}

function herd_editor_url( $post_id ) {
	return add_query_arg( array( 'page' => 'herd-editor', 'post' => absint( $post_id ) ), admin_url( 'admin.php' ) );
}

/**
 * Take over a lock without leaving Herd's editor route.
 *
 * Core's post.php handler always redirects to its native editor. Herd uses the
 * identical nonce action and lock API, but owns this route so a successful
 * takeover returns to the editor the user chose.
 */
function herd_editor_handle_post_lock_takeover() {
	if ( ! is_admin() || 'herd-editor' !== ( isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '' ) || empty( $_GET['get-post-lock'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		return;
	}
	$post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	$post    = $post_id ? get_post( $post_id ) : null;
	if ( ! $post || ! herd_editor_supports_post( $post ) ) {
		wp_die( esc_html__( 'You cannot edit this item in Herd Editor.', 'herd-editor' ), 403 );
	}
	check_admin_referer( 'lock-post_' . $post_id );
	wp_set_post_lock( $post_id );
	wp_safe_redirect( herd_editor_url( $post_id ) );
	exit;
}
add_action( 'admin_init', 'herd_editor_handle_post_lock_takeover', 1 );

/** Return a fresh native lock token unless another editor currently owns it. */
function herd_editor_active_post_lock( $post_id ) {
	if ( wp_check_post_lock( $post_id ) ) {
		return '';
	}
	$lock = wp_set_post_lock( $post_id );
	return $lock ? implode( ':', $lock ) : '';
}

/**
 * Reject a stale Herd submission before post.php can write post content or meta.
 *
 * Core's lock check deliberately reports only *other* users. Herd also verifies
 * the submitted token against _edit_lock so an old tab owned by the same user
 * cannot overwrite a newer editing session.
 */
function herd_editor_validate_post_lock_before_save() {
	if ( 'editpost' !== ( isset( $_POST['action'] ) ? sanitize_key( wp_unslash( $_POST['action'] ) ) : '' ) || empty( $_POST['herd-editor'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing
		return;
	}
	$post_id   = isset( $_POST['post_ID'] ) ? absint( $_POST['post_ID'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Missing
	$submitted = isset( $_POST['active_post_lock'] ) ? (string) wp_unslash( $_POST['active_post_lock'] ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing
	$current   = $post_id ? (string) get_post_meta( $post_id, '_edit_lock', true ) : '';
	$parts     = explode( ':', $submitted );
	$window    = (int) apply_filters( 'wp_check_post_lock_window', 150 );
	$valid     = 2 === count( $parts )
		&& ctype_digit( $parts[0] )
		&& ctype_digit( $parts[1] )
		&& (int) $parts[1] === get_current_user_id()
		&& (int) $parts[0] > time() - $window
		&& '' !== $current
		&& hash_equals( $current, $submitted );

	if ( ! $valid ) {
		wp_die( esc_html__( 'This post is no longer locked by your editing session. Reload it from the post list before saving.', 'herd-editor' ), 409 );
	}
}
add_action( 'admin_init', 'herd_editor_validate_post_lock_before_save', 1 );

/** Flatten a parsed Gutenberg tree in the same order as the browser document. */
function herd_editor_acf_blocks_from_tree( $blocks, &$result ) {
	foreach ( (array) $blocks as $block ) {
		if ( ! empty( $block['blockName'] ) && 0 === strpos( $block['blockName'], 'acf/' ) ) {
			$result[] = $block;
		}
		herd_editor_acf_blocks_from_tree( isset( $block['innerBlocks'] ) ? $block['innerBlocks'] : array(), $result );
	}
}

/** Compare a stored value against a conditional-logic rule value, ACF's way. */
function herd_editor_condition_equals( $value, $rule_value ) {
	if ( is_array( $value ) ) {
		return in_array( $rule_value, array_map( 'strval', $value ), true );
	}
	return (string) $value === $rule_value;
}

/** The number a `>` or `<` rule compares against: a row/choice count, or the value itself. */
function herd_editor_condition_size( $value ) {
	return is_array( $value ) ? (float) count( $value ) : (float) $value;
}

/** Test one conditional-logic rule against the values stored for $block_id. */
function herd_editor_condition_is_met( $rule, $block_id, $seen = array() ) {
	if ( empty( $rule['field'] ) ) { return true; }
	$field = acf_get_field( $rule['field'] );
	/* A rule pointing at a field that no longer exists is one ACF's form drops
	 * rather than fails. */
	if ( ! $field || '' === (string) $field['name'] ) { return true; }
	/* ACF's form reads null from a disabled control, and hiding a field disables
	 * it, so a rule reading a hidden field sees nothing. That is what collapses a
	 * chain of toggles: turning off the master switch hides the style buttons,
	 * which in turn hide the gallery whose only rule reads them. */
	$value      = herd_editor_field_is_visible( $field, $block_id, $seen ) ? acf_get_value( $block_id, $field ) : null;
	$rule_value = isset( $rule['value'] ) ? (string) $rule['value'] : '';
	/* ACF's browser rules read a control, where "0" is a value and only a blank
	 * control is empty; PHP's own emptiness would hide every unchecked toggle. */
	$has_value = ! ( null === $value || false === $value || '' === $value || ( is_array( $value ) && ! $value ) );
	$contains  = is_array( $value )
		? in_array( $rule_value, array_map( 'strval', $value ), true )
		: ( '' !== $rule_value && false !== strpos( (string) $value, $rule_value ) );

	switch ( isset( $rule['operator'] ) ? $rule['operator'] : '==' ) {
		case '==':
		case '===':
			return herd_editor_condition_equals( $value, $rule_value );
		case '!=':
		case '!==':
			return ! herd_editor_condition_equals( $value, $rule_value );
		case '==empty':
			return ! $has_value;
		case '!=empty':
			return $has_value;
		case '==contains':
			return $contains;
		case '!=contains':
			return ! $contains;
		case '==pattern':
			return '' !== $rule_value && 1 === @preg_match( '/' . str_replace( '/', '\\/', $rule_value ) . '/', (string) $value ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- An unusable pattern must not decide visibility.
		case '>':
			return herd_editor_condition_size( $value ) > (float) $rule_value;
		case '<':
			return herd_editor_condition_size( $value ) < (float) $rule_value;
	}
	/* An operator Herd does not know cannot be allowed to wave a field through:
	 * treat it as shown, and let the field answer for itself. */
	return true;
}

/**
 * Whether a block field's editor would show it, so its rules apply.
 *
 * ACF's form disables the inputs of a conditionally hidden field, so a browser
 * save never validates one. This sweep sees no form, so it has to make the same
 * decision itself — otherwise a required field behind a toggle nobody turned on
 * blocks publishing forever, with no visible field to fix.
 */
function herd_editor_field_is_visible( $field, $block_id, $seen = array() ) {
	if ( empty( $field['conditional_logic'] ) || ! is_array( $field['conditional_logic'] ) ) { return true; }
	/* Rules that point back at each other would recurse forever; the field on the
	 * path already being asked about counts as shown, which ends the walk. */
	if ( isset( $seen[ $field['key'] ] ) ) { return true; }
	$seen[ $field['key'] ] = true;
	foreach ( $field['conditional_logic'] as $group ) { // Groups are ORed together.
		if ( ! is_array( $group ) || ! $group ) { return true; }
		$met = true;
		foreach ( $group as $rule ) { // Rules within a group are ANDed.
			if ( ! herd_editor_condition_is_met( $rule, $block_id, $seen ) ) { $met = false; break; }
		}
		if ( $met ) { return true; }
	}
	return false;
}

/** Validate all ACF block values, including forms that Herd has not mounted. */
function herd_editor_validate_document_acf( $content, $client_ids = array() ) {
	$blocks = array();
	herd_editor_acf_blocks_from_tree( parse_blocks( (string) $content ), $blocks );
	$errors = array();
	if ( ! function_exists( 'acf_get_block_fields' ) || ! function_exists( 'acf_validate_value' ) || ! function_exists( 'acf_setup_meta' ) ) {
		return $errors;
	}
	foreach ( $blocks as $index => $block ) {
		$data   = isset( $block['attrs']['data'] ) && is_array( $block['attrs']['data'] ) ? $block['attrs']['data'] : array();
		$fields = (array) acf_get_block_fields( array( 'name' => $block['blockName'], 'data' => $data ) );
		if ( ! $fields ) { continue; }
		/* ACF caches loaded values under "{$post_id}:{$field_name}", repeater
		 * sub-values included, and acf_reset_meta() does not clear that store — so
		 * every block gets an id no earlier block has used. */
		static $namespace = 0;
		$block_id = 'block_herd-editor-validate-' . ( ++$namespace );
		/* Block attributes store repeaters and flexible content flattened
		 * ( "portraits" => 3, "portraits_0_title" => "…" ), but ACF's validators
		 * expect the nested rows a <form> would post. Reading each value back out
		 * of ACF's local meta store rebuilds that shape; reaching into $data
		 * directly hands a repeater its row count instead of its rows, and every
		 * filled repeater fails its own `min`. */
		acf_setup_meta( $data, $block_id );
		foreach ( $fields as $field ) {
			if ( empty( $field['key'] ) || '' === (string) $field['name'] ) { continue; }
			/* Hiding a field hides everything inside it, so this one test also
			 * excuses the sub-fields ACF validates recursively below. */
			if ( ! herd_editor_field_is_visible( $field, $block_id ) ) { continue; }
			acf_reset_validation_errors();
			$valid = acf_validate_value( acf_get_value( $block_id, $field ), $field, '' );
			/* acf_validate_value() only ever returns a bool — the message it built
			 * lives in ACF's error store, which also carries sub-field failures a
			 * repeater reports without failing itself. */
			$reported = acf_get_validation_errors();
			if ( true === $valid && empty( $reported ) ) { continue; }
			$errors[] = array(
				'blockId' => isset( $client_ids[ $index ] ) ? sanitize_key( $client_ids[ $index ] ) : '',
				'field' => $field['key'],
				'message' => ! empty( $reported[0]['message'] ) ? (string) $reported[0]['message'] : __( 'This field is required.', 'herd-editor' ),
			);
		}
		acf_reset_validation_errors();
		acf_reset_meta( $block_id );
	}
	return $errors;
}

/** AJAX validation is deliberately separate from saving: drafts stay permissive. */
function herd_editor_ajax_validate_document() {
	check_ajax_referer( 'herd_editor_validate_document', 'nonce' );
	$post_id = isset( $_POST['postId'] ) ? absint( $_POST['postId'] ) : 0;
	$post = $post_id ? get_post( $post_id ) : null;
	if ( ! $post || ! herd_editor_supports_post( $post ) ) { wp_send_json_error( array( 'message' => __( 'You cannot validate this post.', 'herd-editor' ) ), 403 ); }
	$content = isset( $_POST['content'] ) ? wp_unslash( $_POST['content'] ) : '';
	$ids = isset( $_POST['clientIds'] ) && is_array( $_POST['clientIds'] ) ? wp_unslash( $_POST['clientIds'] ) : array();
	wp_send_json_success( array( 'errors' => herd_editor_validate_document_acf( $content, $ids ) ) );
}
add_action( 'wp_ajax_herd_editor_validate_document', 'herd_editor_ajax_validate_document' );

/** Render core's lock dialog while keeping every return path in Herd or its list. */
function herd_editor_post_lock_dialog( $post, $list_url ) {
	if ( ! function_exists( '_admin_notice_post_locked' ) ) {
		return;
	}
	ob_start();
	_admin_notice_post_locked();
	$dialog = ob_get_clean();
	if ( ! $dialog ) {
		return;
	}
	$takeover_url = add_query_arg( 'get-post-lock', '1', wp_nonce_url( herd_editor_url( $post->ID ), 'lock-post_' . $post->ID ) );
	$dialog = preg_replace( '/(<a class="button button-primary wp-tab-last" href=")[^"]+/', '$1' . esc_url( $takeover_url ), $dialog, 1 );
	/* Core treats an unfamiliar editor URL as a safe "Go back" destination; Herd's
	 * lost-lock state must instead offer only the post list. */
	$dialog = preg_replace( '/(<p>\s*<a class="button" href=")[^"]+/', '$1' . esc_url( $list_url ), $dialog, 1 );
	echo $dialog; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Core generated the markup above.
}

function herd_editor_asset( $entry ) {
	$file = HERD_EDITOR_DIR . 'build/' . $entry . '.asset.php';
	return file_exists( $file ) ? require $file : array( 'dependencies' => array(), 'version' => HERD_EDITOR_VERSION );
}

function herd_editor_collect_block_names( $blocks, &$names ) {
	foreach ( $blocks as $block ) {
		if ( ! empty( $block['blockName'] ) ) {
			$names[ $block['blockName'] ] = true;
		}
		if ( ! empty( $block['innerBlocks'] ) ) {
			herd_editor_collect_block_names( $block['innerBlocks'], $names );
		}
	}
}

/**
 * Display order of the inserter's groups.
 *
 * The last entry is the fallback: any block the map below does not name lands
 * there, so a newly registered block still appears in the inserter rather than
 * vanishing until someone remembers to classify it.
 *
 * @return string[]
 */
function herd_editor_block_group_order() {
	return apply_filters(
		'herd_editor_block_group_order',
		array(
			__( 'Layout', 'herd-editor' ),
			__( 'Content', 'herd-editor' ),
			__( 'Media', 'herd-editor' ),
			__( 'Lists', 'herd-editor' ),
			__( 'Calls to action', 'herd-editor' ),
			__( 'Embeds', 'herd-editor' ),
			__( 'Other', 'herd-editor' ),
		)
	);
}

/**
 * Block name to inserter group.
 *
 * Every theme block declares `"category": "herdpress"`, so the registry cannot
 * group sixty-five blocks into anything an editor can scan. This map is the
 * grouping, and it lives here rather than in sixty-five block.json files so that
 * regrouping is one edit and so the plugin does not depend on a theme
 * convention. It does not have to be exhaustive — see the fallback above.
 *
 * @return array<string,string>
 */
function herd_editor_block_groups() {
	$layout  = __( 'Layout', 'herd-editor' );
	$content = __( 'Content', 'herd-editor' );
	$media   = __( 'Media', 'herd-editor' );
	$lists   = __( 'Lists', 'herd-editor' );
	$cta     = __( 'Calls to action', 'herd-editor' );
	$embeds  = __( 'Embeds', 'herd-editor' );

	return apply_filters(
		'herd_editor_block_groups',
		array(
			'acf/accordion'            => $layout,
			'acf/tabs'                 => $layout,
			'acf/expandable-content'   => $layout,
			'acf/content-with-sidebar' => $layout,
			'acf/page-with-sidebar'    => $layout,
			'acf/split-feature'        => $layout,
			'acf/media-and-text'       => $layout,
			'acf/alternator'           => $layout,
			'acf/scrolling-content'    => $layout,

			'acf/basic-content'        => $content,
			'acf/visual-editor'        => $content,
			'acf/hero'                 => $content,
			'acf/price-hero'           => $content,
			'acf/splash'               => $content,
			'acf/billboard'            => $content,
			'acf/billboard-fact-row'   => $content,
			'acf/banner'               => $content,
			'acf/blockquote'           => $content,
			'acf/testimonial'          => $content,
			'acf/teaser'               => $content,
			'acf/icon-box'             => $content,
			'acf/highlights'           => $content,
			'acf/value'                => $content,
			'acf/moments'              => $content,
			'acf/dean-note'            => $content,
			'acf/professor-spotlight'  => $content,
			'acf/accreditation-block'  => $content,
			'acf/table'                => $content,

			'acf/photo-grid'           => $media,
			'acf/video-grid'           => $media,
			'acf/feature-video'        => $media,
			'acf/logo-grid'            => $media,
			'acf/mosaic'               => $media,
			'acf/portraits'            => $media,

			'acf/cards-collection'     => $lists,
			'acf/stacked-cards'        => $lists,
			'acf/feature-items'        => $lists,
			'acf/blog'                 => $lists,
			'acf/posts'                => $lists,
			'acf/news-lists'           => $lists,
			'acf/localist'             => $lists,
			'acf/profiles'             => $lists,
			'acf/contact-grid'         => $lists,
			'acf/program-listing'      => $lists,
			'acf/categorized-list'     => $lists,
			'acf/checklist'            => $lists,
			'acf/highlight-list'       => $lists,
			'acf/link-collection'      => $lists,
			'acf/list-with-content'    => $lists,
			'acf/rankings'             => $lists,
			'acf/timeline'             => $lists,

			'acf/call-to-action'       => $cta,
			'acf/blog-cta'             => $cta,
			'acf/social'               => $cta,
			'acf/alerts'               => $cta,
			'acf/gravity-form'         => $cta,
			'acf/slate-form'           => $cta,
			'acf/salesforce-form'      => $cta,
			'acf/find-my-counselor'    => $cta,
			'acf/major-search'         => $cta,
			'acf/metro-tuition-checker' => $cta,

			'acf/html'                 => $embeds,
			'acf/iframe'               => $embeds,
			'acf/shortcode'            => $embeds,
		)
	);
}

/**
 * Registered blocks that Herd must keep out of its inserter.
 *
 * These blocks may remain registered for older documents and the native editor,
 * but are not choices for creating new Herd content. Keeping this policy
 * separate from the grouping map prevents an omitted block from falling into
 * the inserter's "Other" group.
 *
 * @return string[]
 */
function herd_editor_hidden_inserter_blocks() {
	return apply_filters(
		'herd_editor_hidden_inserter_blocks',
		array(
			'acf/split-feature',
			'acf/blockquote',
			'acf/slate-form',
			'acf/salesforce-form',
			'acf/program-page-content',
		)
	);
}

/**
 * The native block editor is the policy authority.  Herd receives the same
 * allowed-type decision rather than treating registration as permission to
 * insert a block.
 *
 * @return true|false|string[]
 */
function herd_editor_allowed_block_types( $post ) {
	if ( ! class_exists( 'WP_Block_Editor_Context' ) || ! function_exists( 'get_block_editor_settings' ) ) {
		return true;
	}
	$settings = get_block_editor_settings( array(), new WP_Block_Editor_Context( array( 'post' => $post ) ) );
	return isset( $settings['allowedBlockTypes'] ) ? $settings['allowedBlockTypes'] : true;
}

/** Return ACF's persistence mode without assuming a particular ACF release. */
function herd_editor_acf_storage_mode( $name ) {
	if ( ! function_exists( 'acf_get_block_type' ) ) {
		return 'unknown';
	}
	$type = acf_get_block_type( $name );
	if ( ! is_array( $type ) ) {
		return 'unknown';
	}
	return ! empty( $type['usePostMeta'] ) ? 'post_meta' : 'comment';
}

function herd_editor_block_metadata( $content, $post = null ) {
	$names = array();
	herd_editor_collect_block_names( parse_blocks( $content ), $names );
	$registry = WP_Block_Type_Registry::get_instance();
	$result = array();
	$groups = herd_editor_block_groups();
	$order = herd_editor_block_group_order();
	$fallback = end( $order );
	$registered = $registry->get_all_registered();
	$allowed = $post instanceof WP_Post ? herd_editor_allowed_block_types( $post ) : true;
	$hidden_inserter_blocks = herd_editor_hidden_inserter_blocks();
	foreach ( array_keys( $registered ) as $name ) {
		$names[ $name ] = true;
	}
	foreach ( array_keys( $names ) as $name ) {
		$type = $registry->get_registered( $name );
		$storage_mode = 0 === strpos( $name, 'acf/' ) ? herd_editor_acf_storage_mode( $name ) : 'comment';
		$allowed_here = true === $allowed || ( is_array( $allowed ) && in_array( $name, $allowed, true ) );
		$result[ $name ] = array(
			'title'            => $type ? $type->title : '',
			'icon'             => herd_editor_block_icon( $type ),
			'category'         => $type ? (string) $type->category : '',
			'group'            => isset( $groups[ $name ] ) ? $groups[ $name ] : $fallback,
			'registered'       => (bool) $type,
			'multiple'         => ! $type || ! isset( $type->supports['multiple'] ) || false !== $type->supports['multiple'],
			'inserter'         => ! in_array( $name, $hidden_inserter_blocks, true ) && ( ! $type || ! isset( $type->supports['inserter'] ) || false !== $type->supports['inserter'] ),
			'allowed'          => $allowed_here,
			'parent'           => $type ? array_values( (array) $type->parent ) : array(),
			'ancestor'         => $type ? array_values( (array) $type->ancestor ) : array(),
			'storageMode'      => $storage_mode,
			'readOnly'         => 0 === strpos( $name, 'acf/' ) && 'comment' !== $storage_mode,
			'provides_context' => $type ? (array) $type->provides_context : array(),
			'uses_context'     => $type ? array_values( (array) $type->uses_context ) : array(),
		);
	}
	return $result;
}

/**
 * Labels for the rail tabs, in display order.
 *
 * The `main` pseudo-tab is deliberately absent: it is a valid assignment target
 * that sends a meta box back to the main column instead of the rail.
 *
 * @return array<string,string>
 */
function herd_editor_rail_tab_labels() {
	return apply_filters(
		'herd_editor_rail_tab_labels',
		array(
			'page'    => __( 'Page', 'herd-editor' ),
			'seo'     => __( 'SEO', 'herd-editor' ),
			'more'    => __( 'More', 'herd-editor' ),
			'history' => __( 'History', 'herd-editor' ),
		)
	);
}

/** Meta box ids WordPress core registers that describe the post itself. */
function herd_editor_page_meta_boxes() {
	return array( 'submitdiv', 'slugdiv', 'pageparentdiv', 'postimagediv', 'authordiv', 'formatdiv', 'categorydiv', 'postexcerpt', 'commentstatusdiv', 'commentsdiv', 'trackbacksdiv', 'postcustom' );
}

/**
 * Choose a rail tab for one meta box.
 *
 * SEO is matched on the heading text as well as the id so a plugin's own naming
 * does not have to be guessed.
 *
 * @param string $id    Meta box id.
 * @param string $title Meta box heading.
 * @return string Tab id.
 */
function herd_editor_default_rail_tab( $id, $title ) {
	if ( 'revisionsdiv' === $id ) {
		return 'history';
	}
	if ( preg_match( '/\bseo\b/i', $id . ' ' . wp_strip_all_tags( (string) $title ) ) ) {
		return 'seo';
	}
	if ( in_array( $id, herd_editor_page_meta_boxes(), true ) || 0 === strpos( $id, 'tagsdiv-' ) ) {
		return 'page';
	}
	return 'more';
}

/**
 * Every meta box registered for this screen, as id => heading.
 *
 * Both targets are read for the same reason both are rendered: core registers
 * against the Herd screen id, ACF and other plugins against the post type.
 *
 * @param string $screen_id Herd screen id.
 * @param string $post_type Post type.
 * @return array<string,string>
 */
function herd_editor_registered_meta_boxes( $screen_id, $post_type ) {
	$boxes = array();
	foreach ( array( $screen_id, $post_type ) as $target ) {
		if ( empty( $GLOBALS['wp_meta_boxes'][ $target ] ) ) {
			continue;
		}
		foreach ( (array) $GLOBALS['wp_meta_boxes'][ $target ] as $priorities ) {
			foreach ( (array) $priorities as $box_group ) {
				foreach ( (array) $box_group as $box ) {
					// Removed boxes are stored as false rather than unset.
					if ( is_array( $box ) && ! empty( $box['id'] ) ) {
						$boxes[ $box['id'] ] = isset( $box['title'] ) ? (string) $box['title'] : '';
					}
				}
			}
		}
	}
	return $boxes;
}

/**
 * Map every registered meta box to a rail tab.
 *
 * @param string  $screen_id Herd screen id.
 * @param WP_Post $post      Post being edited.
 * @return array<string,string> Meta box id => tab id.
 */
function herd_editor_rail_assignments( $screen_id, $post ) {
	$boxes = herd_editor_registered_meta_boxes( $screen_id, $post->post_type );
	$map   = array();
	foreach ( $boxes as $id => $title ) {
		$map[ $id ] = herd_editor_default_rail_tab( $id, $title );
	}
	/**
	 * Filter which rail tab each meta box lands in.
	 *
	 * Valid values are the keys of herd_editor_rail_tab_labels(), plus `main`,
	 * which moves the box out of the rail and into the main column below the
	 * block list -- the escape hatch for field groups too wide for the rail.
	 *
	 * @param array<string,string> $map   Meta box id => tab id.
	 * @param array<string,string> $boxes Meta box id => heading.
	 * @param WP_Post              $post  Post being edited.
	 */
	return (array) apply_filters( 'herd_editor_rail_tabs', $map, $boxes, $post );
}

/**
 * Render one meta box context for both targets.
 *
 * do_meta_boxes() prints its own `{context}-sortables` wrapper, so calling it
 * twice would emit duplicate ids. The wrapper id is rewritten instead; nothing
 * on this screen uses it, because postbox sorting is not loaded here.
 *
 * @param string  $screen_id Herd screen id.
 * @param string  $post_type Post type.
 * @param string  $context   Meta box context.
 * @param WP_Post $post      Post being edited.
 */
function herd_editor_meta_boxes( $screen_id, $post_type, $context, $post ) {
	$index = 0;
	foreach ( array( $screen_id, $post_type ) as $target ) {
		$index++;
		ob_start();
		do_meta_boxes( $target, $context, $post );
		$html = ob_get_clean();
		echo str_replace( ' id="' . $context . '-sortables"', ' id="herd-sortables-' . esc_attr( $context . '-' . $index ) . '"', $html ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	}
}

/** Register a hidden admin page so WordPress supplies its normal admin chrome. */
function herd_editor_register_screen() {
	global $herd_editor_screen_hook;
	$herd_editor_screen_hook = add_submenu_page( null, __( 'Herd Editor', 'herd-editor' ), __( 'Herd Editor', 'herd-editor' ), 'edit_posts', 'herd-editor', 'herd_editor_render_screen' );
}
add_action( 'admin_menu', 'herd_editor_register_screen' );

/**
 * The post this screen is editing.
 *
 * Memoised because the answer is not simply the row in the database: a post
 * that has never been saved is given the starting document its post type asks
 * for, and both callers -- the render path and the asset enqueue, which build
 * the hidden #content input and window.HerdEditor.postContent -- have to be
 * handed the same one. Nothing is written; the seed reaches the database on the
 * first save, exactly as core's own `default_content` does.
 *
 * @return WP_Post|null
 */
function herd_editor_current_post() {
	static $current = false;
	if ( false !== $current ) {
		return $current;
	}

	$post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	$current = $post_id ? get_post( $post_id ) : null;

	if ( $current && 'auto-draft' === $current->post_status ) {
		/*
		 * A brand new post is a real row: core inserts it with the literal title
		 * "Auto Draft" and blanks that on the object before rendering. Herd
		 * renders from the object too, so it has to do the same or the title
		 * field opens pre-filled with a word nobody typed.
		 */
		if ( __( 'Auto Draft' ) === $current->post_title ) {
			$current->post_title = '';
		}
		if ( '' === trim( (string) $current->post_content ) ) {
			$current->post_content = herd_editor_starter_content( $current );
		}
	}

	return $current;
}

function herd_editor_render_screen() {
	global $post;
	$post = herd_editor_current_post();
	if ( ! herd_editor_has_acf_pro() || ! herd_editor_supports_post( $post ) ) {
		wp_die( esc_html__( 'You cannot edit this item in Herd Editor.', 'herd-editor' ), 403 );
	}
	/* Keep the token that is rendered in form#post in step with Heartbeat. When
	 * somebody else owns it, core's dialog is rendered instead and no save token
	 * is issued until the user explicitly takes over. */
	$herd_active_post_lock = herd_editor_active_post_lock( $post->ID );

	require_once ABSPATH . 'wp-admin/includes/meta-boxes.php';
	// ACF only auto-registers post field groups on the native post screen.
	// Herd uses the same post form, so register those groups explicitly here.
	$acf_post_form = function_exists( 'acf_get_instance' ) ? acf_get_instance( 'ACF_Form_Post' ) : null;
	if ( $acf_post_form && method_exists( $acf_post_form, 'add_meta_boxes' ) ) {
		$acf_post_form->add_meta_boxes( $post->post_type, $post );
	}
	register_and_do_post_meta_boxes( $post );
	remove_meta_box( 'slugdiv', get_current_screen()->id, 'normal' );
	require HERD_EDITOR_DIR . 'includes/herd-editor-screen.php';
}

/**
 * Mark the Herd screen on `<body>`.
 *
 * `.herd-editor-screen` sits on the `div.wrap` this screen renders, which is
 * where every Herd stylesheet scopes itself. The theme's admin CSS has to make
 * the opposite statement -- "not here" -- and a `:not()` on an ancestor it
 * cannot name is not a selector. So the screen says so on the body, and
 * `admin-marshall.css` fences its ACF overrides behind
 * `body:not(.herd-editor-active)`: those rules were written for the Classic and
 * Block editors, they carry `!important`, and on this screen they paint over
 * everything Herd renders.
 *
 * @param string $classes Space-separated body classes.
 * @return string The classes, with Herd's own appended when this is its screen.
 */
function herd_editor_body_class( $classes ) {
	global $herd_editor_screen_hook, $hook_suffix;
	if ( $hook_suffix !== $herd_editor_screen_hook || ! herd_editor_has_acf_pro() ) {
		return $classes;
	}
	if ( ! herd_editor_supports_post( herd_editor_current_post() ) ) {
		return $classes;
	}
	return trim( $classes . ' herd-editor-active' );
}
add_filter( 'admin_body_class', 'herd_editor_body_class' );

/** Load Herd-only assets on the dedicated mode, never on frontend requests. */
function herd_editor_enqueue_assets( $hook_suffix ) {
	global $herd_editor_screen_hook;
	if ( $hook_suffix !== $herd_editor_screen_hook || ! herd_editor_has_acf_pro() ) {
		return;
	}
	$post = herd_editor_current_post();
	if ( ! herd_editor_supports_post( $post ) ) {
		return;
	}

	wp_enqueue_media();
	wp_enqueue_script( 'heartbeat' );
	// Core autosave owns its per-user revision and session-storage recovery
	// protocol. Herd deliberately supplies its normal post fields below instead
	// of creating a second document store.
	wp_enqueue_script( 'autosave' );
	if ( function_exists( 'acf_enqueue_scripts' ) ) {
		acf_enqueue_scripts();
	}

	$asset = herd_editor_asset( 'herd-editor' );
	wp_enqueue_script(
		'herd-editor-screen',
		HERD_EDITOR_URL . 'build/herd-editor.js',
		array_values( array_unique( array_merge( array( 'acf-input' ), $asset['dependencies'] ) ) ),
		$asset['version'],
		true
	);

	wp_enqueue_style( 'herd-editor', HERD_EDITOR_URL . 'build/herd-editor.css', array( 'acf-input', 'dashicons' ), $asset['version'] );
	wp_add_inline_script(
		'herd-editor-screen',
		'if ( window.acf ) { acf.set( "ajaxurl", ' . wp_json_encode( admin_url( 'admin-ajax.php' ) ) . ' ); acf.set( "nonce", ' . wp_json_encode( wp_create_nonce( 'acf_nonce' ) ) . ' ); }',
		'before'
	);
	wp_add_inline_script(
		'herd-editor-screen',
		'window.HerdEditor = ' . wp_json_encode(
			array(
				'postId' => $post->ID,
				'postType' => $post->post_type,
				'templateLock' => ( $post_type = get_post_type_object( $post->post_type ) ) ? $post_type->template_lock : false,
				'postContent' => $post->post_content,
				'blockEditorUrl' => herd_editor_native_url( $post->ID, 'block' ),
				'classicEditorUrl' => herd_editor_native_url( $post->ID, 'classic' ),
				'blockTypes' => herd_editor_block_metadata( $post->post_content, $post ),
				'blockGroupOrder' => herd_editor_block_group_order(),
				'modifiedHuman' => herd_editor_saved_label( $post ),
				'statusLabel' => herd_editor_status_label( $post ),
				'isPublished' => 'publish' === $post->post_status,
				/*
				 * A draft has nowhere to send anyone, so View is absent rather than
				 * broken; herd_editor_view_url() is the one place that decides.
				 */
				'viewUrl' => herd_editor_view_url( $post ),
				'singular' => herd_editor_singular_lower( $post ),
				/** Filter how many ACF blocks Expand all mounts before asking for confirmation. */
				'expandWarnAt' => (int) apply_filters( 'herd_editor_expand_warn_at', 8 ),
				'validationNonce' => wp_create_nonce( 'herd_editor_validate_document' ),
				'icons' => herd_editor_icon_set(),
			)
		) . ';',
		'before'
	);
}
add_action( 'admin_enqueue_scripts', 'herd_editor_enqueue_assets' );

/**
 * The SVG vocabulary a block icon may use.
 *
 * `wp_kses()` has no notion of SVG, so the shapes and their geometry have to be
 * spelled out. Presentation attributes are shared by every element because these
 * icon sets hang stroke and fill wherever it suits them.
 *
 * @return array<string,array<string,bool>> Tag name to allowed attributes.
 */
function herd_editor_svg_tags() {
	$common = array_fill_keys(
		array(
			'xmlns', 'viewbox', 'width', 'height', 'class', 'role', 'focusable',
			'aria-hidden', 'fill', 'fill-rule', 'fill-opacity', 'clip-rule',
			'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
			'stroke-opacity', 'opacity', 'transform',
		),
		true
	);
	$shapes = array(
		'svg'      => array(),
		'g'        => array(),
		'title'    => array(),
		'defs'     => array(),
		'symbol'   => array(),
		'use'      => array( 'href' => true, 'xlink:href' => true ),
		'path'     => array( 'd' => true ),
		'circle'   => array( 'cx' => true, 'cy' => true, 'r' => true ),
		'ellipse'  => array( 'cx' => true, 'cy' => true, 'rx' => true, 'ry' => true ),
		'rect'     => array( 'x' => true, 'y' => true, 'rx' => true, 'ry' => true ),
		'line'     => array( 'x1' => true, 'y1' => true, 'x2' => true, 'y2' => true ),
		'polyline' => array( 'points' => true ),
		'polygon'  => array( 'points' => true ),
	);
	$tags = array();
	foreach ( $shapes as $tag => $extra ) {
		$tags[ $tag ] = array_merge( $common, $extra );
	}
	return $tags;
}

/**
 * The icon a block type offers, in a shape the screen can draw.
 *
 * Blocks on this site declare either a dashicon slug or inline SVG in block.json;
 * WordPress allows both, and roughly a third of the theme's blocks take the second
 * route. Anything else — an icon registered from JS, an object naming colours we do
 * not honour, nothing at all — falls back to the default glyph.
 *
 * @param WP_Block_Type|null $type Registered type, when there is one.
 * @return array{dashicon?:string,svg?:string}
 */
function herd_editor_block_icon( $type ) {
	$icon = $type && isset( $type->icon ) ? $type->icon : null;

	/* WordPress also allows `array( 'src' => …, 'foreground' => … )`; we want the src. */
	if ( is_array( $icon ) && isset( $icon['src'] ) ) {
		$icon = $icon['src'];
	}
	if ( ! is_string( $icon ) || '' === trim( $icon ) ) {
		return array( 'dashicon' => 'block-default' );
	}
	$icon = trim( $icon );

	if ( preg_match( '/^[a-z0-9-]+$/', $icon ) ) {
		return array( 'dashicon' => preg_replace( '/^dashicons-/', '', $icon ) );
	}
	if ( 0 === stripos( $icon, '<svg' ) ) {
		$svg = trim( wp_kses( $icon, herd_editor_svg_tags() ) );
		if ( '' !== $svg ) {
			return array( 'svg' => $svg );
		}
	}
	return array( 'dashicon' => 'block-default' );
}

/**
 * The named SVG icons an editor can choose from.
 *
 * Several ACF selects on this site pick from the theme's icon set by name, which
 * asks an editor to choose a picture by reading its slug. Handing the markup to
 * the browser lets Herd draw the icons instead. The theme owns the set; a site
 * without it simply gets no picker.
 *
 * @return array<string, string> Icon name to inline SVG.
 */
function herd_editor_icon_set() {
	if ( ! function_exists( 'mu_icons' ) ) {
		return array();
	}
	$icons = mu_icons();

	/**
	 * Filter the icon set published to the Herd Editor screen.
	 *
	 * @param array $icons Icon name to inline SVG markup.
	 */
	$icons = apply_filters( 'herd_editor_icons', is_array( $icons ) ? $icons : array() );

	/*
	 * The editor inserts these with `innerHTML`, so they go through the same
	 * allowlist as a registered block's icon rather than being trusted for
	 * coming from the theme. A filter is a supported way in, and the set is
	 * only as safe as whatever last wrote to it. Anything that survives
	 * `wp_kses()` as an empty string is dropped rather than drawn as a hole.
	 */
	$safe = array();
	foreach ( $icons as $name => $icon ) {
		if ( ! is_string( $icon ) ) {
			continue;
		}
		$svg = trim( wp_kses( $icon, herd_editor_svg_tags() ) );
		if ( '' !== $svg ) {
			$safe[ $name ] = $svg;
		}
	}

	return $safe;
}

/**
 * Build rich text fields lazily inside Herd.
 *
 * ACF instantiates a TinyMCE per wysiwyg field as the form mounts. A cards block
 * with four rows is four editors before anything has been typed, and it is the
 * single largest cost of opening one. ACF already supports deferring that
 * through the field's own `delay` setting, so Herd asks for it rather than
 * fighting TinyMCE from the outside.
 *
 * Scoped to Herd's own fetch-block requests through the flag that
 * `buildFetchBlockPayload()` adds, so the Block Editor is unaffected.
 *
 * @param array $field The ACF field array.
 * @return array The field, possibly deferred.
 */
function herd_editor_delay_editors( $field ) {
	// phpcs:ignore WordPress.Security.NonceVerification.Missing -- ACF verifies its own AJAX nonce; this only reads a routing flag.
	if ( empty( $_POST['herd_editor'] ) || ! wp_doing_ajax() ) {
		return $field;
	}
	$field['delay'] = 1;
	return $field;
}
add_filter( 'acf/prepare_field/type=wysiwyg', 'herd_editor_delay_editors' );

/**
 * Let a field group say which of its groups opens on load.
 *
 * A group in Herd is a fold, and which fold starts open is a judgement about the
 * block that only whoever built the field group can make. Until now it was
 * inferred — open iff it was the only group on the form — so a block with three
 * groups opened none of them and the most important one was a click away, every
 * time.
 *
 * The setting is Herd's alone: nothing in the Block Editor or Classic renders a
 * fold for a group, so there is nothing there for it to change. It lives under
 * Presentation because that is where ACF puts settings that decide how a field
 * looks rather than what it holds.
 */

/**
 * Give the setting a value on every group, saved or not.
 *
 * Every field group that predates this has no such key, and `acf_render_field_setting()`
 * would otherwise fall through to its own default on each render.
 *
 * @param array $field The ACF field array.
 * @return array The field, with the setting present.
 */
function herd_editor_group_defaults( $field ) {
	if ( ! isset( $field['herd_open_by_default'] ) ) {
		$field['herd_open_by_default'] = 0;
	}
	return $field;
}
add_filter( 'acf/validate_field/type=group', 'herd_editor_group_defaults' );

/**
 * Draw the toggle under the Group field's Presentation tab.
 *
 * @param array $field The ACF field array.
 * @return void
 */
function herd_editor_group_setting( $field ) {
	acf_render_field_setting(
		$field,
		array(
			'label'        => __( 'Open by default', 'herd-editor' ),
			'instructions' => __( 'Show this group expanded when the form loads. Herd Editor only; the block editor is unaffected.', 'herd-editor' ),
			'name'         => 'herd_open_by_default',
			'type'         => 'true_false',
			'ui'           => 1,
		)
	);
}
add_action( 'acf/render_field_presentation_settings/type=group', 'herd_editor_group_setting' );

/**
 * Publish the setting to the rendered wrapper for `src/ui/acf/group.js` to read.
 *
 * Unscoped, unlike `herd_editor_delay_editors()` above: `data-herd-open` is inert
 * markup that only Herd's JS looks at, and the gate that filter uses would miss
 * the groups in rail meta boxes, which render with the Herd screen rather than
 * through a fetch-block request.
 *
 * @param array $field The ACF field array.
 * @return array The field, carrying the attribute when the setting is on.
 */
function herd_editor_group_open_attribute( $field ) {
	if ( ! empty( $field['herd_open_by_default'] ) ) {
		$field['data']['herd-open'] = 1;
	}
	return $field;
}
add_filter( 'acf/prepare_field/type=group', 'herd_editor_group_open_attribute' );

/** Add the third choice to Gutenberg's editor menu. */
function herd_editor_enqueue_block_switcher() {
	global $post;
	if ( ! herd_editor_has_acf_pro() || ! herd_editor_supports_post( $post ) ) {
		return;
	}
	$asset = herd_editor_asset( 'index' );
	wp_enqueue_script( 'herd-editor-switcher', HERD_EDITOR_URL . 'build/index.js', $asset['dependencies'], $asset['version'], true );
	$path = isset( $_GET['herd-block-path'] ) ? sanitize_text_field( wp_unslash( $_GET['herd-block-path'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	if ( ! preg_match( '/^\d+(?:\.\d+)*$/', $path ) ) {
		$path = '';
	}
	wp_add_inline_script( 'herd-editor-switcher', 'window.HerdEditor = ' . wp_json_encode( array( 'herdUrl' => herd_editor_url( $post->ID ), 'blockPath' => $path ) ) . ';', 'before' );
}
add_action( 'enqueue_block_editor_assets', 'herd_editor_enqueue_block_switcher' );

/** Add Herd as a third editor choice in post/page list-table actions. */
function herd_editor_add_list_table_link( $actions, $post ) {
	if ( ! herd_editor_has_acf_pro() || ! herd_editor_supports_post( $post ) ) {
		return $actions;
	}
	/*
	 * Classic Editor's own two links point at post.php, which Herd's
	 * replace_editor filter would bounce straight back here when Herd is the
	 * default. The stand-down arg is what makes them mean what they say.
	 */
	foreach ( array( 'classic-editor-block', 'classic-editor-classic' ) as $action ) {
		if ( isset( $actions[ $action ] ) ) {
			$actions[ $action ] = preg_replace_callback(
				'/href="([^"]+)"/',
				static function ( $match ) {
					return 'href="' . esc_url( add_query_arg( HERD_EDITOR_FORGET_ARG, '1', html_entity_decode( $match[1] ) ) ) . '"';
				},
				$actions[ $action ]
			);
		}
	}

	$title = _draft_or_post_title( $post->ID );
	$actions['herd-editor'] = sprintf(
		'<a href="%1$s" aria-label="%2$s">%3$s</a>',
		esc_url( herd_editor_url( $post->ID ) ),
		esc_attr( sprintf( __( 'Edit &#8220;%s&#8221; in Herd Editor', 'herd-editor' ), $title ) ),
		esc_html__( 'Edit (Herd Editor)', 'herd-editor' )
	);
	return $actions;
}
add_filter( 'post_row_actions', 'herd_editor_add_list_table_link', 20, 2 );
add_filter( 'page_row_actions', 'herd_editor_add_list_table_link', 20, 2 );

/**
 * The way into Herd, and the way back out again.
 *
 * One section in the publish box, pointing at whichever editor you are not in:
 * Herd from the native editors, the Block Editor from Herd. A switch that only
 * goes one way is a trap, and on the Herd screen this box is the Page tab of
 * the rail, which is where someone looks for a setting about the whole post.
 *
 * The Block link is built by herd_editor_native_url(), whose stand-down args
 * are what keep it from being redirected straight back here when Herd is the
 * site's default editor. Unsaved work is already guarded: the editor app holds
 * a beforeunload handler while the document is dirty.
 *
 * @param WP_Post $post Post being edited.
 */
function herd_editor_switch_link( $post ) {
	if ( ! herd_editor_has_acf_pro() || ! herd_editor_supports_post( $post ) ) {
		return;
	}
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended
	$on_herd = isset( $_GET['page'] ) && 'herd-editor' === $_GET['page'];
	$url     = $on_herd ? herd_editor_native_url( $post->ID, 'block' ) : herd_editor_url( $post->ID );
	$label   = $on_herd ? __( 'Switch to Block Editor', 'herd-editor' ) : __( 'Switch to Herd Editor', 'herd-editor' );

	echo '<div class="misc-pub-section herd-editor-switch"><a href="' . esc_url( $url ) . '">' . esc_html( $label ) . '</a></div>';
}
add_action( 'post_submitbox_misc_actions', 'herd_editor_switch_link' );

/**
 * Return a normal post-form save to the Herd route.
 *
 * The URL is rebuilt rather than amended, because core's points at post.php and
 * Herd's screen is somewhere else entirely. What core wrote into it still has to
 * survive the move: `$location` is where WordPress says what just happened, and
 * an editor who is told nothing after pressing Update has no way to know it
 * worked. See herd_editor_carry_message_from().
 */
function herd_editor_keep_editor_mode_after_save( $location ) {
	if ( isset( $_REQUEST['herd-editor'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$post_id = isset( $_REQUEST['post_ID'] ) ? absint( $_REQUEST['post_ID'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( $post_id ) {
			return herd_editor_carry_message_from( $location, $post_id );
		}
	}
	return $location;
}
add_filter( 'redirect_post_location', 'herd_editor_keep_editor_mode_after_save' );
