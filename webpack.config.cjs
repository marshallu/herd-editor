const defaultConfig = require( '@wordpress/scripts/config/webpack.config' );

module.exports = {
	...defaultConfig,
	entry: { index: './src/index.js', 'herd-editor': './src/herd-editor.js' },
};
