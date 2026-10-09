//= require_tree ./app

// Offline build: must run before any other app code so that every request goes through the allowlist
import './OfflineAllowlist/InstallOfflineAllowlist'

// css
import '../stylesheets/index.css.scss'

// entry point
import './App'
