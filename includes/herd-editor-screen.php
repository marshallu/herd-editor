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

$herd_screen_id   = herd_editor_screen_id( $post );
$herd_home        = preg_replace( '#^https?://#', '', untrailingslashit( home_url( '/' ) ) );
$herd_list_url    = 'post' === $post->post_type
	? admin_url( 'edit.php' )
	: add_query_arg( 'post_type', $post->post_type, admin_url( 'edit.php' ) );
$herd_type        = get_post_type_object( $post->post_type );
$herd_singular    = $herd_type ? $herd_type->labels->singular_name : __( 'Post', 'herd-editor' );
/* translators: %s: post type singular name, e.g. Page. */
$herd_title_label = sprintf( __( '%s Title', 'herd-editor' ), $herd_singular );
$herd_tabs        = herd_editor_rail_tab_labels();
$herd_assignments = herd_editor_rail_assignments( $herd_screen_id, $post );
$herd_saved       = herd_editor_saved_notice( $post );
?>
<?php
/*
 * `herd-editor-booting` holds back the parts src/rail.js is about to move, so
 * the screen does not paint its no-JS layout -- slug as a bare input, rail with
 * no tabs, empty main column -- and then visibly reassemble itself a moment
 * later. src/herd-editor.js drops the class once the DOM is arranged. Every
 * failure path drops it too: the class must never be what is left behind.
 */
?>
<div class="wrap herd-editor-screen herd-editor-booting">
	<h1 class="screen-reader-text"><?php esc_html_e( 'Herd Editor', 'herd-editor' ); ?></h1>
	<?php
	/*
	 * Core's common.js moves every .notice it finds to just after this marker.
	 * Without one it falls back to guessing at the first heading, which on this
	 * screen would drop another plugin's notice into the middle of the command
	 * bar. Herd's own notice below is a .herd-notice and is left where it is put.
	 */
	?>
	<hr class="wp-header-end" />

	<?php
	/* Required ACF controls can live in a collapsed block panel or a relocated
	 * meta box. Native constraint validation would stop a draft before Herd can
	 * serialize and recover it; Publish uses Herd's explicit ACF validation. */
	?>
	<form id="post" method="post" action="post.php" novalidate>
		<?php wp_nonce_field( 'update-post_' . $post->ID ); ?>
		<input type="hidden" name="action" value="editpost" />
		<?php
		/*
		 * `id` as well as `name`, exactly as core renders it. Core's autosave reads
		 * $('#post_ID') (wp-includes/js/autosave.js) and src/post-lock.js reads the
		 * same element before it will install anything -- without the id, autosave
		 * posts post_id 0 and the lock client returns without binding a single
		 * handler.
		 */
		?>
		<input type="hidden" id="post_ID" name="post_ID" value="<?php echo esc_attr( $post->ID ); ?>" />
		<input type="hidden" name="post_type" id="post_type" value="<?php echo esc_attr( $post->post_type ); ?>" />
		<input type="hidden" name="post_author" id="post_author" value="<?php echo esc_attr( $post->post_author ); ?>" />
		<?php
		/*
		 * `original_post_status`, exactly as core's edit-form-advanced.php prints
		 * it: the status the post was loaded with, which nothing on the server
		 * reads and everything in the publish box needs -- it is how the date line
		 * decides between "Publish on" and "Published on".
		 *
		 * It used to be `post_status`, which was the wrong core field to mirror.
		 * WordPress gives the publish box's status select that same id, so the
		 * document carried it twice and getElementById answered with this one:
		 * core's autosave recorded a status the select had already moved off. The
		 * status now posts from the select alone, and where a user cannot publish
		 * and there is no select, _wp_translate_postdata() keeps the status the
		 * post already had -- which is what this field was posting anyway.
		 */
		?>
		<input type="hidden" name="original_post_status" id="original_post_status" value="<?php echo esc_attr( $post->post_status ); ?>" />
		<input type="hidden" name="auto_draft" id="auto_draft" value="<?php echo 'auto-draft' === $post->post_status ? '1' : ''; ?>" />
		<input type="hidden" name="herd-editor" value="1" />
		<?php if ( ! empty( $herd_active_post_lock ) ) : ?>
			<input type="hidden" id="active_post_lock" name="active_post_lock" value="<?php echo esc_attr( $herd_active_post_lock ); ?>" />
		<?php endif; ?>
		<?php
		/*
		 * Herd has no excerpt field, but core's autosave sends
		 * `excerpt: $('#excerpt').val() || ''` whether or not one exists, and an
		 * autosave of a draft is a real edit_post(). Without somewhere to read the
		 * current value from, every autosave would blank the excerpt -- `post` is
		 * one of Herd's post types and it does support them. Carry it through.
		 */
		?>
		<input type="hidden" id="excerpt" name="excerpt" value="<?php echo esc_attr( $post->post_excerpt ); ?>" />
		<input type="hidden" name="content" id="content" value="<?php echo esc_attr( $post->post_content ); ?>" />

		<?php
		/*
		 * The form's default button: the one a browser clicks when Return is
		 * pressed in a text field.
		 *
		 * Core solves this inside post_submit_meta_box(), which opens with a hidden
		 * Save "so that the browser chooses the right button when form is submitted
		 * with Return key" (wp-admin/includes/meta-boxes.php). That button still
		 * exists here -- but the default button is the first submit in tree order,
		 * and src/rail.js lifts #publishing-action out of the publish box and into
		 * the command bar below, which is above the rail that core's copy travels
		 * to. Publish became the default button, and every single-line text field on
		 * the screen is inside this form: the title, and every ACF field in every
		 * mounted block panel. Return in any of them published the post.
		 *
		 * So core's guarantee is restored where the form now starts, rather than by
		 * guarding one field at a time. `name` is what matters -- presence is all
		 * _wp_translate_postdata() reads -- and the id only has to be free, because
		 * core's own #save is still in the rail.
		 */
		?>
		<div style="display:none;"><input type="submit" name="save" id="herd-default-save" value="<?php esc_attr_e( 'Save', 'herd-editor' ); ?>" /></div>

		<header class="herd-bar">
			<a class="herd-bar__back" href="<?php echo esc_url( $herd_list_url ); ?>" aria-label="<?php esc_attr_e( 'Back to the post list', 'herd-editor' ); ?>">&larr;</a>

			<div class="herd-bar__id">
				<div id="titlediv">
					<div id="titlewrap">
						<?php /* Visible rather than screen-reader-only: an unlabelled borderless input reads as a heading, not a field. */ ?>
						<label class="herd-bar__label" for="title"><?php echo esc_html( $herd_title_label ); ?></label>
						<input type="text" name="post_title" size="30" value="<?php echo esc_attr( $post->post_title ); ?>" id="title" spellcheck="true" autocomplete="off" placeholder="<?php esc_attr_e( 'Add title', 'herd-editor' ); ?>" />
					</div>
				</div>
				<?php
				/*
				 * The slug reads as text until asked for, and there are two ways to ask:
				 * the slug itself, and the Edit link after it. src/rail.js swaps in the
				 * input for either. The link is what makes the line look editable at a
				 * glance -- the slug's own hover border is a hint you have to go looking
				 * for -- so both are kept.
				 *
				 * The markup ships in its no-JS state -- input visible, slug and link
				 * hidden -- so a bundle that never runs leaves an editable slug rather
				 * than a dead one. It is the same field posting under the same name
				 * either way.
				 */
				?>
				<p class="herd-bar__slug" id="herd-slug">
					<span class="herd-bar__slug-home"><?php echo esc_html( $herd_home ); ?>/</span>
					<button type="button" class="herd-bar__slug-text" id="herd-slug-text" hidden>
						<?php /* rail.js rewrites the value span; the name beside it has to survive that. */ ?>
						<span id="herd-slug-value"><?php echo esc_html( $post->post_name ? $post->post_name : __( 'slug', 'herd-editor' ) ); ?></span>
						<span class="screen-reader-text"><?php esc_html_e( 'Edit the slug', 'herd-editor' ); ?></span>
					</button>
					<label class="screen-reader-text" for="post_name"><?php esc_html_e( 'Slug', 'herd-editor' ); ?></label>
					<input type="text" name="post_name" value="<?php echo esc_attr( $post->post_name ); ?>" id="post_name" placeholder="<?php esc_attr_e( 'slug', 'herd-editor' ); ?>" />
					<button type="button" class="herd-bar__slug-edit" id="herd-slug-edit" hidden><?php esc_html_e( 'Edit', 'herd-editor' ); ?></button>
				</p>
			</div>

			<div class="herd-bar__actions">
				<?php /* Herd's status line, undo, redo and the View menu are portalled in here by the editor app. */ ?>
				<span id="herd-bar-react"></span>
				<?php /* src/rail.js moves #publishing-action here. */ ?>
				<span class="herd-bar__native" id="herd-bar-native"></span>
				<?php
				/*
				 * #preview-action is parked here rather than shown. The View menu's
				 * "Preview your changes" presses core's own button, so whatever core has
				 * wired to it is what runs -- and the #wp-preview input it carries stays
				 * inside form#post where a preview submission expects to find it.
				 */
				?>
				<span class="herd-bar__preview-host" id="herd-bar-preview-host"></span>
			</div>
		</header>

		<?php
		/*
		 * The class is .herd-notice, never .notice: core's common.js re-parents
		 * anything it recognises as an admin notice up to .wp-header-end, which
		 * would take this out from under the command bar it belongs to.
		 *
		 * The dismiss button ships hidden and src/rail.js reveals it, the same
		 * way the slug field ships in its no-JS state. A bundle that never runs
		 * leaves a notice you have to reload past, not a button that does
		 * nothing when you press it.
		 */
		?>
		<?php if ( $herd_saved ) : ?>
			<div class="herd-notice is-info herd-saved" id="herd-saved">
				<p class="herd-saved__text"><?php echo wp_kses( $herd_saved['text'], array( 'strong' => array(), 'em' => array() ) ); ?></p>
				<?php if ( $herd_saved['url'] ) : ?>
					<a class="herd-saved__link" href="<?php echo esc_url( $herd_saved['url'] ); ?>" target="_blank" rel="noopener">
						<?php echo esc_html( $herd_saved['label'] ); ?>
						<span class="dashicons dashicons-external" aria-hidden="true"></span>
						<span class="screen-reader-text"><?php esc_html_e( ', opens in a new tab', 'herd-editor' ); ?></span>
					</a>
				<?php endif; ?>
				<button type="button" class="herd-saved__dismiss" id="herd-saved-dismiss" aria-label="<?php esc_attr_e( 'Dismiss this notice', 'herd-editor' ); ?>" hidden>
					<span class="dashicons dashicons-no-alt" aria-hidden="true"></span>
				</button>
			</div>
		<?php endif; ?>

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
				var wrap = document.querySelector( '.herd-editor-screen' );
				if ( wrap ) {
					wrap.classList.remove( 'herd-editor-booting' );
				}
			} );
		</script>
	</form>
	<?php herd_editor_post_lock_dialog( $post, $herd_list_url ); ?>
</div>
