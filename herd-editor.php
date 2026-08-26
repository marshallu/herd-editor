<?php
/**
 * Plugin Name: Herd Editor
 * Description: A dedicated Herd Editor mode for editing existing ACF blocks alongside Classic and Block Editor.
 * Version: 0.1.0
 * Requires at least: 7.1
 * Requires PHP: 7.4
 * Requires Plugins: advanced-custom-fields-pro
 * Text Domain: herd-editor
 */

defined( 'ABSPATH' ) || exit;

define( 'HERD_EDITOR_VERSION', '0.1.0' );
define( 'HERD_EDITOR_URL', plugin_dir_url( __FILE__ ) );
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

function herd_editor_block_metadata( $content ) {
	$names = array();
	herd_editor_collect_block_names( parse_blocks( $content ), $names );
	$registry = WP_Block_Type_Registry::get_instance();
	$result = array();
	$groups = herd_editor_block_groups();
	$order = herd_editor_block_group_order();
	$fallback = end( $order );
	$registered = $registry->get_all_registered();
	foreach ( array_keys( $registered ) as $name ) {
		$names[ $name ] = true;
	}
	foreach ( array_keys( $names ) as $name ) {
		$type = $registry->get_registered( $name );
		$icon = 'block-default';
		if ( $type && isset( $type->icon ) && is_string( $type->icon ) && preg_match( '/^[a-z0-9-]+$/', $type->icon ) ) {
			$icon = preg_replace( '/^dashicons-/', '', $type->icon );
		}
		$result[ $name ] = array(
			'title'            => $type ? $type->title : '',
			'icon'             => $icon,
			'category'         => $type ? (string) $type->category : '',
			'group'            => isset( $groups[ $name ] ) ? $groups[ $name ] : $fallback,
			'registered'       => (bool) $type,
			'multiple'         => ! $type || ! isset( $type->supports['multiple'] ) || false !== $type->supports['multiple'],
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

function herd_editor_current_post() {
	$post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	return $post_id ? get_post( $post_id ) : null;
}

function herd_editor_render_screen() {
	$post = herd_editor_current_post();
	if ( ! herd_editor_has_acf_pro() || ! herd_editor_supports_post( $post ) ) {
		wp_die( esc_html__( 'You cannot edit this item in Herd Editor.', 'herd-editor' ), 403 );
	}

	global $post;
	$post = herd_editor_current_post();
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
				'postContent' => $post->post_content,
				'blockEditorUrl' => remove_query_arg( array( 'page', 'post', 'classic-editor' ), get_edit_post_link( $post->ID, 'raw' ) ),
				'classicEditorUrl' => add_query_arg( 'classic-editor', '', get_edit_post_link( $post->ID, 'raw' ) ),
				'blockTypes' => herd_editor_block_metadata( $post->post_content ),
				'blockGroupOrder' => herd_editor_block_group_order(),
				'modifiedHuman' => sprintf(
					/* translators: %s: human readable time difference. */
					__( 'Saved %s ago', 'herd-editor' ),
					human_time_diff( (int) get_post_modified_time( 'U', true, $post ) )
				),
				/** Filter how many ACF blocks Expand all mounts before asking for confirmation. */
				'expandWarnAt' => (int) apply_filters( 'herd_editor_expand_warn_at', 8 ),
				'icons' => herd_editor_icon_set(),
			)
		) . ';',
		'before'
	);
}
add_action( 'admin_enqueue_scripts', 'herd_editor_enqueue_assets' );

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

	return array_filter( $icons, 'is_string' );
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

/** Make Herd available while viewing either native editor. */
function herd_editor_switch_link( $post ) {
	if ( ! herd_editor_has_acf_pro() || ! herd_editor_supports_post( $post ) ) {
		return;
	}
	// On the Herd screen itself the command bar already carries the mode switcher
	// and the save state, so the publish box must not repeat either.
	if ( isset( $_GET['page'] ) && 'herd-editor' === $_GET['page'] ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		return;
	}
	echo '<div class="misc-pub-section herd-editor-switch"><a href="' . esc_url( herd_editor_url( $post->ID ) ) . '">' . esc_html__( 'Switch to Herd Editor', 'herd-editor' ) . '</a></div>';
}
add_action( 'post_submitbox_misc_actions', 'herd_editor_switch_link' );

/** Return a normal post-form save to the Herd route. */
function herd_editor_keep_editor_mode_after_save( $location ) {
	if ( isset( $_REQUEST['herd-editor'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$post_id = isset( $_REQUEST['post_ID'] ) ? absint( $_REQUEST['post_ID'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( $post_id ) {
			return herd_editor_url( $post_id );
		}
	}
	return $location;
}
add_filter( 'redirect_post_location', 'herd_editor_keep_editor_mode_after_save' );
