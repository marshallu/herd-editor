const defaultConfig = require( '@wordpress/scripts/config/webpack.config' );

/*
 * Sass prefixes a compressed sheet with a UTF-8 BOM whenever it holds a
 * non-ASCII character (the em dash and ✓ in `content`, dashicon glyphs).
 * Harmless at the start of a file, but VIP's CSS concatenation joins sheets
 * and strands the BOM mid-file, where it becomes part of the first selector
 * -- `.herd-editor-screen`, the rule carrying every --herd-* token.
 */
const rules = defaultConfig.module.rules.map( ( rule ) => ( {
	...rule,
	use: [].concat( rule.use || [] ).map( ( use ) =>
		use && use.loader && /sass-loader/.test( use.loader )
			? { ...use, options: { ...use.options, sassOptions: { ...( use.options && use.options.sassOptions ), charset: false } } }
			: use
	),
} ) );

module.exports = {
	...defaultConfig,
	module: { ...defaultConfig.module, rules },
	entry: { index: './src/index.js', 'herd-editor': './src/herd-editor.js' },
};
