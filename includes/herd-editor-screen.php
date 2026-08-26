<?php
/**
 * Herd Editor screen shell.
 *
 * Renders inside WordPress's own admin chrome (admin bar and menu stay). Every
 * control below is a real WordPress control: the title and slug inputs post
 * under their native names, the hidden #content input carries the serialized
 * Gutenberg document, and the Update/Preview buttons are the native publish-box
 * nodes relocated into the command bar by src/rail.js.
 *
 * @var WP_Post $post
 */

defined( 'ABSPATH' ) || exit;

$herd_screen_id  = get_current_screen()->id;
$herd_status     = get_post_status_object( $post->post_status );
$herd_home       = preg_replace( '#^https?://#', '', untrailingslashit( home_url( '/' ) ) );
$herd_list_url   = 'post' === $post->post_type
	? admin_url( 'edit.php' )
	: add_query_arg( 'post_type', $post->post_type, admin_url( 'edit.php' ) );
$herd_block_url   = remove_query_arg( array( 'page', 'post', 'classic-editor' ), get_edit_post_link( $post->ID, 'raw' ) );
$herd_classic_url = add_query_arg( 'classic-editor', '', get_edit_post_link( $post->ID, 'raw' ) );
$herd_tabs        = herd_editor_rail_tab_labels();
$herd_assignments = herd_editor_rail_assignments( $herd_screen_id, $post );
?>
<div class="wrap herd-editor-screen">
	<h1 class="screen-reader-text"><?php esc_html_e( 'Herd Editor', 'herd-editor' ); ?></h1>

	<form id="post" method="post" action="post.php">
		<?php wp_nonce_field( 'update-post_' . $post->ID ); ?>
		<input type="hidden" name="action" value="editpost" />
		<input type="hidden" name="post_ID" value="<?php echo esc_attr( $post->ID ); ?>" />
		<input type="hidden" name="herd-editor" value="1" />
		<input type="hidden" name="content" id="content" value="<?php echo esc_attr( $post->post_content ); ?>" />

		<header class="herd-bar">
			<a class="herd-bar__back" href="<?php echo esc_url( $herd_list_url ); ?>" aria-label="<?php esc_attr_e( 'Back to the post list', 'herd-editor' ); ?>">&larr;</a>

			<div class="herd-bar__id">
				<div id="titlediv">
					<div id="titlewrap">
						<label class="screen-reader-text" for="title"><?php esc_html_e( 'Add title', 'herd-editor' ); ?></label>
						<input type="text" name="post_title" size="30" value="<?php echo esc_attr( $post->post_title ); ?>" id="title" spellcheck="true" autocomplete="off" placeholder="<?php esc_attr_e( 'Add title', 'herd-editor' ); ?>" />
					</div>
				</div>
				<p class="herd-bar__slug">
					<span><?php echo esc_html( $herd_home ); ?>/</span>
					<label class="screen-reader-text" for="post_name"><?php esc_html_e( 'Slug', 'herd-editor' ); ?></label>
					<input type="text" name="post_name" value="<?php echo esc_attr( $post->post_name ); ?>" id="post_name" placeholder="<?php esc_attr_e( 'slug', 'herd-editor' ); ?>" />
				</p>
			</div>

			<div class="herd-bar__actions">
				<?php /* Herd's save state, undo and redo are portalled in here by the editor app. */ ?>
				<span id="herd-bar-react"></span>
				<span class="herd-bar__status<?php echo 'publish' === $post->post_status ? '' : ' is-muted'; ?>"><?php echo esc_html( $herd_status ? $herd_status->label : $post->post_status ); ?></span>
				<?php /* src/rail.js moves #preview-action and #publishing-action here. */ ?>
				<span class="herd-bar__native" id="herd-bar-native"></span>
			</div>
		</header>

		<nav class="herd-mode" aria-label="<?php esc_attr_e( 'Choose editor', 'herd-editor' ); ?>">
			<span><?php esc_html_e( 'Editing with', 'herd-editor' ); ?></span>
			<span class="herd-seg">
				<span aria-current="page"><?php esc_html_e( 'Herd', 'herd-editor' ); ?></span>
				<a href="<?php echo esc_url( $herd_block_url ); ?>"><?php esc_html_e( 'Block', 'herd-editor' ); ?></a>
				<a href="<?php echo esc_url( $herd_classic_url ); ?>"><?php esc_html_e( 'Classic', 'herd-editor' ); ?></a>
			</span>
			<span><?php esc_html_e( 'Same Gutenberg document either way.', 'herd-editor' ); ?></span>
		</nav>

		<div class="herd-cols">
			<main class="herd-main">
				<div id="herd-editor-root"></div>
				<?php /* Destination for meta boxes the herd_editor_rail_tabs filter routes to 'main'. */ ?>
				<div class="herd-main__boxes" id="herd-main-boxes"></div>
			</main>

			<aside class="herd-rail" id="herd-rail">
				<div class="herd-rail__tabs" role="tablist" aria-label="<?php esc_attr_e( 'Post settings', 'herd-editor' ); ?>" hidden>
					<?php foreach ( $herd_tabs as $herd_tab_id => $herd_tab_label ) : ?>
						<button type="button" class="herd-rail__tab" role="tab" data-tab="<?php echo esc_attr( $herd_tab_id ); ?>" id="herd-tab-<?php echo esc_attr( $herd_tab_id ); ?>" aria-controls="herd-panel-<?php echo esc_attr( $herd_tab_id ); ?>" aria-selected="false" tabindex="-1" hidden><?php echo esc_html( $herd_tab_label ); ?></button>
					<?php endforeach; ?>
				</div>
				<?php foreach ( array_keys( $herd_tabs ) as $herd_tab_id ) : ?>
					<div class="herd-rail__panel" role="tabpanel" data-panel="<?php echo esc_attr( $herd_tab_id ); ?>" id="herd-panel-<?php echo esc_attr( $herd_tab_id ); ?>" aria-labelledby="herd-tab-<?php echo esc_attr( $herd_tab_id ); ?>" tabindex="0" hidden></div>
				<?php endforeach; ?>
			</aside>
		</div>

		<?php /* Which rail tab each meta box belongs in; see herd_editor_rail_assignments(). */ ?>
		<script type="application/json" id="herd-rail-map"><?php echo wp_json_encode( $herd_assignments, JSON_HEX_TAG ); ?></script>
		<?php
		/*
		 * Meta boxes are rendered once, here, exactly as they were before the redesign:
		 * every context twice, once against the Herd screen id (where core registered
		 * its boxes) and once against the post type (where ACF and other plugins
		 * registered theirs). src/rail.js then distributes the resulting .postbox nodes
		 * into the rail tabs above. They never leave form#post, so saving is unchanged.
		 */
		?>
		<div class="herd-staging" id="herd-staging">
			<?php
			foreach ( array( 'side', 'normal', 'advanced' ) as $herd_context ) {
				herd_editor_meta_boxes( $herd_screen_id, $post->post_type, $herd_context, $post );
			}
			?>
		</div>
		<script>
			/* If the editor bundle never runs, reveal the meta boxes so the publish
			   box is still reachable. src/rail.js removes this element on success. */
			window.addEventListener( 'load', function () {
				var staging = document.getElementById( 'herd-staging' );
				if ( staging ) {
					staging.style.display = 'block';
				}
			} );
		</script>
	</form>
</div>
