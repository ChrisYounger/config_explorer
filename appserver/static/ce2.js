// Copyright (C) 2018 Chris Younger

// Loading monaco from the CDN
/*
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.15.0/min/vs' }});
window.MonacoEnvironment = {
	getWorkerUrl: function(workerId, label) {
		return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
			self.MonacoEnvironment = { baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.15.0/min/' };
			importScripts('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.15.0/min/vs/base/worker/workerMain.js');`
		)}`; 
	}
}*/

// The splunk webserver prepends all scripts with a call to i18n_register() for internationalisation. This fails for web-workers becuase they dont know about this function yet.
// The options are patch the function on-the-fly like so, or to edit the file on the filesystem (which makes upgrading monaco harder)
(function() { 
	var mode = "min"; // or dev
	require.config({ 
		paths: {
			'vs': '../app/config_explorer/node_modules/monaco-editor/'+mode+'/vs', 
		}
	});
	window.MonacoEnvironment = {
		getWorkerUrl: function(workerId, label) {
			return "data:text/javascript;charset=utf-8," + encodeURIComponent(
				//"console.log('shimming i18n_register for worker'); "+
				"function i18n_register(){/*console.log('i18n_register shimmed');*/} "+
				"self.MonacoEnvironment = { baseUrl: '" + window.location.origin + "/static/app/config_explorer/node_modules/monaco-editor/"+mode+"/' }; "+
				"importScripts('" + window.location.origin + "/static/app/config_explorer/node_modules/monaco-editor/"+mode+"/vs/base/worker/workerMain.js');"
			);
		}
	};
})();

require([
	"splunkjs/mvc",
	"jquery",
	"vs/editor/editor.main",
	"app/config_explorer/sortable.min",
	"app/config_explorer/OverlayScrollbars"
], function(
	mvc,
	$,
	wat,
	Sortable,
	OverlayScrollbars
) {

	// Inject all the HTML contents
	$(".dashboard-body").html(
		"<div class='ce_spinner spinner'>"+
			"<div class='bounce1'></div>"+
			"<div class='bounce2'></div>"+
			"<div class='bounce3'></div>"+
		"</div>"+
		"<div class='ce_app_bar'></div>"+
		"<div class='ce_wrap'>"+
			"<div class='ce_tree_pane'>"+
				"<div class='ce_tree_icons'>"+
					"<i title='Previous folder' class='ce_clickable_icon ce_folder_up icon-arrow-left'></i>"+
					"<i title='Refresh' class='ce_clickable_icon ce_refresh_tree icon-rotate-counter'></i>"+
					"<i title='Filter files' class='ce_clickable_icon ce_filter icon-text'></i>"+
					"<i title='Splunk conf files' class='ce_show_confs ce_clickable_icon icon-bulb'></i>"+
					"<i title='Recent files' class='ce_recent_files ce_clickable_icon icon-list'></i>"+
					"<!--<i title='Uncommitted changes' class='ce_clickable_icon ce_disabled icon-distributed-environment'></i>-->"+
					"<i title='Create new folder in current directory' class='ce_add_folder ce_clickable_icon icon-folder'></i>"+
					"<i title='Create new file in current directory' class='ce_add_file ce_clickable_icon icon-report'></i>"+
					"<i title='Run a shell command' class='ce_app_run ce_clickable_icon icon-expand-right'></i>"+
					"<i title='Upload a file' class='ce_upload_file ce_clickable_icon icon-plus'></i>"+
					"<i title='Sort' class='ce_sort_files ce_clickable_icon icon-sort'></i>"+
				"</div>"+
				"<div class='ce_file_path'></div>"+
				"<div class='ce_file_list'>"+
					"<div class='ce_file_wrap'></div>"+
				"</div>"+
			"</div>"+
				"<div class='ce_resize_column'></div>"+
			"<div class='ce_container'>"+
				"<div class='ce_home_tab ce_active'>"+
					"<i title='Home' class='ce_home_icon ce_clickable_icon icon-star'></i>"+
				"</div>"+
				"<div class='ce_tabs'></div>"+
				"<div class='ce_contents'></div>"+
				"<div class='ce_contents_home'>"+
					"<img class='ce_bg_image' src='/static/app/config_explorer/mirage-upgrade.png' />"+
					"<div class='ce_app_name'><span class='ce_app_title'>Config Explorer</span> for <i class='icon-splunk'></i></div>"+
					"<div class='ce_tagline'>by Chris Younger</div>"+
					"<div class='ce_marginbottom'>"+
						"<span class='ce_app_settings'><span class='btn'>Settings</span> Change the Config Explorer settings.</span> Theme: "+
							"<span class='ce_theme ce_link' data-theme='vs-dark'>dark</span> | "+
							"<span class='ce_theme ce_link'  data-theme='vs'>light</span> | "+
							"<span class='ce_theme ce_link' data-theme='hc-black'>high contrast</span>"+
					"</div>"+
					"<div class='ce_marginbottom ce_app_changelog'>"+
						"<span class='btn'>Change log</span> Review changes made using Config Explorer."+
					"</div>"+
					"<div class='ce_actions_wrapper'>"+
						"<div>"+
							"<div class='ce_app_devlinks'>"+
								"Developer actions"+
							"</div>"+
							"<div class='ce_actions_area'>"+
								"<div class='ce_marginbottom ce_app_errors'>"+
									"<span class='btn'>btool check</span>"+
									"Show invalid Splunk configuration"+
								"</div>"+
								"<div class='ce_marginbottom'>"+
									"<span class='ce_splunk_reload btn'>debug/refresh</span>"+
									"Reload all endpoints"+
								"</div>"+
								"<div class=''>"+
									"<span class='ce_splunk_reload btn' data-endpoint='bump'>bump</span>"+
									"Splunk cache bump for css and js files."+
								"</div>"+
							"</div>"+
						"</div>"+
						"<div>"+
							"<div class='ce_app_devlinks'>"+
								"Custom actions"+
							"</div>"+
							"<div class='ce_custom_actions ce_actions_area'>"+
							"</div>"+
						"</div>"+
					"</div>"+
					"<div>"+
						"<a href='/static/docs/style/style-guide.html' target='_blank'>Splunk style guide</a> | "+
						"<a href='search?q=search%20index%3D_internal%20source%3D*config_explorer.log' target='_blank'>Logging</a> | "+
						"<a href='https://github.com/ChrisYounger/config_explorer' target='_blank'>Config Explorer help, bugs and enhancements</a>"+
					"</div>"+
				"</div>"+
			"</div>"+
		"</div>"+
		"<div class='ce_toaster'><i class='icon-check'></i><span>Saved</span></div>"+
		"<div class='ce_context_menu_overlay ce_hidden'></div>"+
		"<div class='ce_context_menu_wrap'></div>"+
    "</div>");

	// Mapping of all the tab types
	// can_rerun - has a right click open in the editor for "rerun". This will close and reopen the tab.  If this is "true" it must also exist in the hooksCfg list with the same name!
	// reopen - tracked through hash and in "recent files". If this is "true" it must also exist in the hooksCfg list with the same name!
	var tabCfg = {
		'btool': 				{ can_rerun: true,  can_reopen: true,  },
		'btool-hidepaths': 		{ can_rerun: true,  can_reopen: true,  },
		'btool-hidedefaults': 	{ can_rerun: true,  can_reopen: true,  },
		'btool-hidesystemdefaults': { can_rerun: true,  can_reopen: true,  },
		'btool-check': 			{ can_rerun: true,  can_reopen: false, },
		'spec': 				{ can_rerun: false, can_reopen: true,  },
		'run': 					{ can_rerun: true,  can_reopen: false, },
		'deployserver': 		{ can_rerun: true,  can_reopen: false, },
		'read': 				{ can_rerun: false, can_reopen: true,  },
		'settings':				{ can_rerun: false, can_reopen: false, },
		'change-log': 			{ can_rerun: false, can_reopen: false, },
		'diff': 				{ can_rerun: false, can_reopen: false, },
		'history': 				{ can_rerun: false, can_reopen: false, },
		'git': 					{ can_rerun: false, can_reopen: false, },
		'live': 				{ can_rerun: false, can_reopen: false, },
		'live-diff': 			{ can_rerun: false, can_reopen: false, },
		'refresh': 				{ can_rerun: true,  can_reopen: false, },
		'internal': 			{ can_rerun: false, can_reopen: false, },
	};
	// This is what will be executed in the following circumstances:
	//  - the URL hash on load (can_reopen=true above)
	//  - opening from the Recent file list (can_reopen=true above)
	//  - Editor>RightClick>Rerun option is chosen  (can_rerun=true above)
	//  - custom [hook:<unique_name>] right-click option
	var hooksCfg = {
		'btool': function(arg1){ 
			runBToolList(arg1, 'btool'); 
		},
		'btool-hidepaths': function(arg1){
			runBToolList(arg1, 'btool-hidepaths');			
		},
		'btool-hidedefaults':function(arg1){
			runBToolList(arg1, 'btool-hidedefaults');
		},
		'btool-hidesystemdefaults':function(arg1){
			runBToolList(arg1, 'btool-hidesystemdefaults');
		},		
		'btool-check': function(arg1){
			runBToolCheck();
		},
		'spec': function(arg1){
			displaySpecFile(arg1);
		},
		'run': function(arg1, arg2){
			runShellCommandNow(arg1, arg2);
		},
		'run-safe': function(arg1){
			runShellCommand(arg1, true);
		},
		'deployserver': function(arg1){
			runReloadDeployServer(arg1);
		},
		'read': function(arg1){
			readFile(arg1);
		},		
		'live': function(arg1){
			runningVsLayered(arg1, false);
		},
		'live-diff': function(arg1){
			runningVsLayered(arg1, true);
		},
		'bump': function(){
			debugRefreshBumpHook("bump");
		},
		'refresh': function(arg1){
			debugRefreshBumpHook(arg1);
		},
		'cd': function(arg1){
			changeDirectory(arg1);
		},
	};
	// globals
	var debug_gutters = false;
	var service = mvc.createService({owner: "nobody"});
	var editors = [];  
	var inFolder = (localStorage.getItem('ce_current_path') || './etc/apps');
	var openingFolder;
	var folderContents;
	var run_history = (JSON.parse(localStorage.getItem('ce_run_history')) || []);
	var closed_tabs = (JSON.parse(localStorage.getItem('ce_closed_tabs')) || []);
	var preferences = getPreferences();
	var activeTab = -1;
	var filecache = {};
	var conf = {};
	var confFiles = {};
	var confFilesSorted = [];
	var inFlightRequests = 0;
	var comparisonLeftFile = null;
	var tabid = 0;
	var leftpane_ignore = false;
	var max_recent_files_show = 50;
	var hooksActive = [];
	var tabCreationCount = 0;
	var approvedPostSaveHooks = {};
	var fileModsCheckTimer;
	var fileModsCheckTimerPeriod = 10000;
	var fileModsCheckTimerInProgress = false;
	var sortMode = "name";
	var sortAsc = true;
	var doLineHighlight = "";
	var $dashboard_body = $('.dashboard-body');
	var $ce_tree_pane = $(".ce_tree_pane");
	var $ce_container = $('.ce_container');
	var $ce_resize_column = $('.ce_resize_column');
	var $ce_file_list = $(".ce_file_list");
	var $ce_file_wrap = $(".ce_file_wrap");
	var $ce_file_path = $(".ce_file_path");
	var $ce_tree_icons = $(".ce_tree_icons");
	var $ce_contents = $(".ce_contents");
	var $ce_contents_home = $(".ce_contents_home");
	var $ce_spinner = $(".ce_spinner");
	var $ce_tabs = $(".ce_tabs");
	var $ce_home_tab = $(".ce_home_tab");
	var $ce_context_menu_overlay = $(".ce_context_menu_overlay");

	// Set the "save" hotkey at a global level instead of on the editor, this way the editor doesnt need to have focus.
	$(window).on('keydown', function(event) {
		if (event.ctrlKey || event.metaKey) {
			switch (String.fromCharCode(event.which).toLowerCase()) {
			case 's':
				event.preventDefault();
				saveActiveTab();
				break;
			}
		}

	// Prevent people from navigating away when they have unsaved changes
    }).on("beforeunload", function() {
        for (var i = 0; i < editors.length; i++) {
			if (editors[i].hasChanges) {
				return "Unsaved changes will be lost.";
			}
		}
    });

	function setLeftPathWidth(size) {
		size = Math.min(Math.max(size, 0), $(window).width() * 0.8);
		$ce_tree_pane.css("width", size + "px");
		$ce_resize_column.css("left", size + "px");
		$ce_container.css("left", (size + 3) + "px");
		filePathRTLCheck();
	}
	
	// Handler for resizing the tree pane/editor divider
	$ce_resize_column.on("mousedown", function(e) {
		e.preventDefault();
		$(document).on("mousemove.colresize", function(e) {
			setLeftPathWidth(e.pageX);
			localStorage.setItem('ce_lwidth', e.pageX);
		});
	});

	$(document).on("mouseup",function(e) {
		$(document).off('mousemove.colresize');
	});
	
	$('.ce_app_errors .btn').on('click', function(){ 
		runBToolCheck();
	});
	$('.ce_app_settings .btn').on('click', function(){ 
		readFile("");
	});
	$(".ce_theme").on('click', function(){ 
		setThemeMode($(this).attr("data-theme"));
	});
	$('.ce_app_changelog .btn').on('click', function(){ 
		showChangeLog();
	});
	$(".ce_splunk_reload").on("click", function(){ 
		debugRefreshBumpHook( $(this).attr("data-endpoint") );
	});
	$ce_home_tab.on("click", function(){ 
		activateTab(-1);
	});
	
	// Click handlers for New File/New Folder buttons
	$ce_tree_icons.on("click", "i", function(e){
		e.stopPropagation();
		var elem = $(this);
		if (elem.hasClass("ce_disabled")) {
			return;
		}
		if (elem.hasClass("ce_add_file")) {
			fileSystemCreateNew(inFolder, true);
		} else if (elem.hasClass("ce_add_folder")) {
			fileSystemCreateNew(inFolder, false);
		} else if (elem.hasClass("ce_upload_file")) {
			fileSystemUpload(inFolder);
		} else if (elem.hasClass("ce_refresh_tree")) {
			refreshFolder();
		} else if (elem.hasClass("ce_folder_up")) {
			readFolder(inFolder.replace(/[\/\\][^\/\\]*$/,''), 'back');
		} else if (elem.hasClass("ce_filter")) {
			if (elem.hasClass("ce_selected")) {
				leftPaneFileList();
				filterModeOff();
			} else {
				var $in = $('<input class="ce_treesearch_input" autocorrect="off" autocapitalize="off" spellcheck="false" type="text" wrap="off" aria-label="Filter text" placeholder="Filter text" title="Filter text">');
				$ce_file_path.css("margin-top", "30px");
				$ce_file_list.css("top", "100px");
				elem.addClass("ce_selected");
				$in.appendTo($ce_tree_pane).focus().on("input ",function(){
					leftPaneFileList($(this).val().toLowerCase());
				}).on("keydown", function(e){
					// select the top item
					if (e.which === 13) {
						$ce_file_wrap.find(".ce_leftnav").eq(0).click();
					// If user hits backspace with nothing in box then navigate back
					} else if (e.which === 8 && $in.val() === "") {
						// navigate back
						$(".ce_folder_up").click();
					}
				});
			}
		} else if (elem.hasClass("ce_show_confs")) {
			if (elem.hasClass("ce_selected")) {
				elem.removeClass("ce_selected");
				leftPaneFileList();
				
			} else {
				filterModeOff();
				elem.addClass("ce_selected");
				leftPaneConfList();
			}
		} else if (elem.hasClass("ce_recent_files")) {
			if (elem.hasClass("ce_selected")) {
				leftPaneFileList();
				elem.removeClass("ce_selected");
			} else {
				filterModeOff();
				leftPaneRecentList();
				elem.addClass("ce_selected");
			}
		} else if (elem.hasClass('ce_app_run')) {
			runShellCommand();
		} else if (elem.hasClass('ce_sort_files')) {
			var $menu = $("<div class='ce_sort_menu_wrap'>Sort by:"+
				"<div><i class='icon-chevron-down ce_clickable_icon ce_sortby_name'></i><i class='icon-chevron-up ce_clickable_icon ce_sortby_name'></i>Name</div>"+
				"<div><i class='icon-chevron-down ce_clickable_icon ce_sortby_size'></i><i class='icon-chevron-up ce_clickable_icon ce_sortby_size'></i>Size</div>"+
				"<div><i class='icon-chevron-down ce_clickable_icon ce_sortby_time'></i><i class='icon-chevron-up ce_clickable_icon ce_sortby_time'></i>Modified date</div></div>").appendTo($dashboard_body);
			$menu.find(".ce_sortby_" + sortMode + "." + (sortAsc ? 'icon-chevron-down' : 'icon-chevron-up')).addClass("ce_sortby_selected");
			$menu.css({right: $(window).width() - parseInt($ce_tree_pane.css("width")) + 2, top: 41});
			$menu.on("click", ".ce_clickable_icon", function(){
				var $t = $(this);
				sortMode = $t.hasClass("ce_sortby_name") ? "name" : $t.hasClass("ce_sortby_size") ? "size" : "time";
				sortAsc = !!($t.hasClass("icon-chevron-down"));
				readFolderLoad(inFolder);
			});
			$ce_context_menu_overlay.removeClass("ce_hidden");
			$(document).one("click contextmenu", function(e2) {
				$ce_context_menu_overlay.addClass("ce_hidden");
				$menu.remove();
				e2.preventDefault();
			});
		}
	});
	
	function filterModeOff() {
		$(".ce_filter").removeClass("ce_selected");
		$(".ce_treesearch_input").remove();
		$ce_file_path.css("margin-top", "");
		$ce_file_list.css("top", "");
	}

	function filterModeReset(){
		$(".ce_treesearch_input").val("");
	}
	
	function addHookAction(hook, file, actions, matchtype) {
		if (hook._match.test(file) && hook.matchtype == matchtype) {	
			actions.push($("<div></div>").text(replaceTokens(hook.label, file)).on("click", function(){ 
				runAction(hook.action, file); 
			}));
		}
	}

	// add folder hooks to the path display
	$ce_file_path.on("contextmenu", function (e) {
		var actions = [];
		for (var j = 0; j < hooksActive.length; j++) {
			addHookAction(hooksActive[j], inFolder, actions, "folder");
		}
		if (confIsTrue('git_autocommit', false) && conf.git_autocommit_work_tree === "") {
			actions.push($("<div>Show change log</div>").on("click", function(){ 
				showChangeLog();
			}));
		}
		buildLeftContextMenu(actions, e);
	});
	
	// Click handler for left pane items
	$ce_file_list.on("click", ".ce_leftnav", function(){
		var elem = $(this);
		// click on a conf file
		if (elem.hasClass("ce_conf")) {
			runBToolList($(this).attr('file'), 'btool');
		// click on file
		} else if (elem.hasClass("ce_is_report")) {
			readFile(elem.attr('file'));
		// recent files list
		} else if (elem.hasClass("ce_leftnav_reopen")) {
			hooksCfg[elem.attr('type')](elem.attr('file'));
		// Folder
		} else {
			if (! leftpane_ignore) {
				readFolder(elem.attr('file'), 'fwd');
			}
		}
	// Right click menu for left pane
	}).on("contextmenu", ".ce_leftnav", function (e) {
		var $leftnavElem = $(this);
		var isFile = $leftnavElem.hasClass("ce_is_report");
		var thisFile = $leftnavElem.attr('file');
		var actions = [];
		if (isFile) {
			// Add the custom hook actions
			for (var j = 0; j < hooksActive.length; j++) {
				addHookAction(hooksActive[j], thisFile, actions, "file");
			}
		}
		if ($leftnavElem.hasClass("ce_is_folder")) {
			for (var j = 0; j < hooksActive.length; j++) {
				addHookAction(hooksActive[j], thisFile, actions, "folder");
			}
		}
		if ($leftnavElem.hasClass("ce_leftnav_editable") && confIsTrue('write_access', false)) {
			// can rename, can trash
			actions.push($("<div>Rename</div>").on("click", function(){ 
				fileSystemRename(thisFile); 
			}));
			actions.push($("<div>Delete</div>").on("click", function(){ 
				filesystemDelete(thisFile); 
			}));
			
		}
		if ($leftnavElem.hasClass("ce_conf")) {
			for (var j = 0; j < hooksActive.length; j++) {
				addHookAction(hooksActive[j], thisFile, actions, "conf");
			}
			actions.push($("<div>Show btool (hide paths)</div>").on("click", function(){ 
				runBToolList(thisFile, 'btool-hidepaths');
			}));
			actions.push($("<div>Show btool (hide all defaults)</div>").on("click", function(){ 
				runBToolList(thisFile, 'btool-hidedefaults');
			}));
			actions.push($("<div>Show btool (hide system defaults)</div>").on("click", function(){ 
				runBToolList(thisFile, 'btool-hidesystemdefaults');
			}));
			
			if (conf.btool_dir_for_master_apps) {
				actions.push($("<div>[master-apps] Show btool</div>").on("click", function(){ 
					runBToolList(thisFile + ":" + conf.btool_dir_for_master_apps, 'btool', conf.btool_dir_for_master_apps, "/splunk/etc/master-apps/");
				}));
				actions.push($("<div>[master-apps] Show btool (hide all defaults)</div>").on("click", function(){ 
					runBToolList(thisFile + ":" + conf.btool_dir_for_master_apps, 'btool-hidedefaults', conf.btool_dir_for_master_apps, "/splunk/etc/master-apps/");
				}));
			}
			if (conf.btool_dir_for_deployment_apps) {
				actions.push($("<div>[deployment-apps] Show btool</div>").on("click", function(){ 
					runBToolList(thisFile + ":" + conf.btool_dir_for_deployment_apps, 'btool', conf.btool_dir_for_deployment_apps, "/splunk/etc/deployment-apps/");
				}));
				actions.push($("<div>[deployment-apps] Show btool (hide all defaults)</div>").on("click", function(){ 
					runBToolList(thisFile + ":" + conf.btool_dir_for_deployment_apps, 'btool-hidedefaults', conf.btool_dir_for_deployment_apps, "/splunk/etc/deployment-apps/");
				}));
			}
			if (conf.btool_dir_for_shcluster_apps) {
				actions.push($("<div>[shcluster-apps] Show btool</div>").on("click", function(){ 
					runBToolList(thisFile + ":" + conf.btool_dir_for_shcluster_apps, 'btool');
				}));
				actions.push($("<div>[shcluster-apps] Show btool (hide all defaults)</div>").on("click", function(){ 
					runBToolList(thisFile + ":" + conf.btool_dir_for_shcluster_apps, 'btool-hidedefaults');
				}));
			}

			actions.push($("<div>Show .spec file</div>").on("click", function(){
				displaySpecFile(thisFile);
			}));
			actions.push($("<div>Show live (running) config</div>").on("click", function(){
				runningVsLayered(thisFile, false);
			}));
			actions.push($("<div>Compare live config against btool output</div>").on("click", function(){
				runningVsLayered(thisFile, true);
			}));
		}

		if (isFile) {
			if (confIsTrue('git_autocommit', false)) {
				// can show history
				actions.push($("<div>View file history</div>").on("click", function(){
					getFileHistory(thisFile, inFolder);
				}));
			}
			// download file
			actions.push($("<div>Download</div>").on("click", function(){
				serverAction({action: 'filedownload', path: inFolder, param1: thisFile}).then(function(b64data){
					var byteCharacters = atob(b64data);
					var byteArrays = [];
					for (let offset = 0; offset < byteCharacters.length; offset += 512) {
						var slice = byteCharacters.slice(offset, offset + 512);
						var byteNumbers = new Array(slice.length);
						for (let i = 0; i < slice.length; i++) {
							byteNumbers[i] = slice.charCodeAt(i);
						}
						var byteArray = new Uint8Array(byteNumbers);
						byteArrays.push(byteArray);
					}
					var blob = new Blob(byteArrays, {type: "application/octet-stream"});
					var filename = dodgyBasename(thisFile);
					if (typeof window.navigator.msSaveBlob !== 'undefined') {
						// IE workaround for "HTML7007: One or more blob URLs were revoked by closing the blob for which they were created. These URLs will no longer resolve as the data backing the URL has been freed."
						window.navigator.msSaveBlob(blob, filename);
					} else {
						var URL = window.URL || window.webkitURL;
						var downloadUrl = URL.createObjectURL(blob);
						// use HTML5 a[download] attribute to specify filename
						var a = document.createElement("a");
						// safari doesn't support this yet
						if (typeof a.download === 'undefined') {
							window.location = downloadUrl;
						} else {
							a.href = downloadUrl;
							a.download = filename;
							document.body.appendChild(a);
							a.click();
						}
						setTimeout(function () { URL.revokeObjectURL(downloadUrl); }, 100); // cleanup
					}
				});
			}));
			// can compare
			actions.push($("<div>Mark for comparison</div>").on("click", function(){ 
				comparisonLeftFile = thisFile; 
			}));
			if (comparisonLeftFile && comparisonLeftFile !== thisFile) {
				actions.push($("<div>Compare to " + htmlEncode(dodgyBasename(comparisonLeftFile)) + "</div>").on("click", function(){
					compareFiles(thisFile, comparisonLeftFile);
				}));
			}
		}
		if (actions.length) {
			buildLeftContextMenu(actions, e, $leftnavElem);
		}
	});

	// Event handlers for the editor tabs
	$ce_tabs.on("click", ".ce_close_tab", function(e){
		e.stopPropagation();
		closeTabWithConfirmation($(this).parent().index());
	
	// Middle click to close tab
	}).on("auxclick", ".ce_tab", function(e){
		if (e.which !== 3) {
			e.stopPropagation();
			closeTabWithConfirmation($(this).index());	
		}
	// Clicking tab
	}).on("click", ".ce_tab", function(){
		activateTab($(this).index());
		
	// On hover show the cross
	}).on("mouseenter", ".ce_tab", function(){
		$(this).append("<i class='ce_close_tab icon-close ce_clickable_icon ce_right_icon'></i>");

	}).on("mouseleave", ".ce_tab", function(){
		$(this).find('.ce_close_tab').remove();
	});
	
	function buildLeftContextMenu(actions, e, $t) {
		e.preventDefault(); // To prevent the default context menu.
		if (! actions.length) {
			return;
		}
		e.stopPropagation();
		var $menu = $(".ce_context_menu_wrap");
		$menu.empty().append(actions);		
		$(".ce_leftnav_highlighted").removeClass("ce_leftnav_highlighted");
		if ($t) {
			$t.addClass("ce_leftnav_highlighted");
		}
		var windowHeight = $(window).height();
		if((e.clientY + 200) > windowHeight) {
			$menu.css({opacity:1, left:30 + e.clientX, bottom:$(window).height()-e.clientY, right:"auto", top:"auto"});
		} else {
			$menu.css({opacity:1, left:30 + e.clientX, bottom:"auto", right:"auto", top: e.clientY - 30});
		}
		$ce_context_menu_overlay.removeClass("ce_hidden");
		$(document).one("click contextmenu", function(e2) {
			$menu.removeAttr("style");
			$ce_context_menu_overlay.addClass("ce_hidden");
			if ($t) {
				$t.removeClass("ce_leftnav_highlighted");
			}
			e2.preventDefault();
		});
	}
	
	function compareFiles(rightFile, leftFile) {
		var ecfg = createTab('diff', rightFile + " " + leftFile, "<span class='ce-dim'>diff:</span> " + rightFile + " " + leftFile);
		// get both files 
		Promise.all([
			serverActionWithoutFlicker({action: 'read', path: leftFile}),
			serverActionWithoutFlicker({action: 'read', path: rightFile}),
		]).then(function(contents){
			updateTabAsDiffer(ecfg, leftFile + "\n" + contents[0], rightFile + "\n" + contents[1]);
		}).catch(function(){ 
			closeTabByCfg(ecfg);
		});
	}
	
	function debugRefreshBumpHook(endpoint){
		// get localisation url
		var url = "/" + document.location.pathname.split("/")[1] + "/";
		var label = "";
		if (endpoint && endpoint !== "all") {
			if (endpoint === "bump") {
				url += "_bump";
				label = "bump";
			} else {
				url += "debug/refresh?entity=" + endpoint;
				label = "<span class='ce-dim'>debug/refresh:</span> " + endpoint;
			}
		} else {
			label = "<span class='ce-dim'>debug/refresh:</span> all";
			url += "debug/refresh";
			endpoint = "all";
		}
		var ecfg = createTab('refresh', endpoint, label);
		$.post(url, function(data){
			if (endpoint === "bump") {
				updateTabAsEditor(ecfg, $('<div/>').html(data).text(), 'plaintext');
			} else {
				updateTabAsEditor(ecfg, data.replace(/'''[\s\S]*'''/,""), 'plaintext');
			}
		}).fail(function(jqXHR, textStatus, errorThrown) {
			closeTabByCfg(ecfg);
			showModal({
				title: "Error",
				body: "<div class='alert alert-error'><i class='icon-alert'></i>" + label + " - Error occurred!<br><br>Status code: " + jqXHR.status + "<br><br><pre>" + htmlEncode(errorThrown) + "</pre></div>",
			});
		});
	}

	function changeDirectory(dir){
		if (dir) {
			readFolder(dir.replace(/[\/\\]$/g, ""), 'fwd');
		}
	}
	
	function replaceTokens(str, file){
		var basefile = dodgyBasename(file);
		var dirname = dodgyDirname(file);
		return str.replace(/\$\{FILE\}/g, file).replace(/\$\{BASEFILE\}/g, basefile).replace(/\$\{DIRNAME\}/g, dirname);
	}
	
	function runAction(actionStr, file) {
		var parts = actionStr.split(":");
		var action = parts.shift();
		var args = parts.join(":");
		if (file !== undefined) {
			args = replaceTokens(args, file);
		}
		hooksCfg[action](args);
	}

	// Keep track of what tabs are open in local storage. 
	function openTabsListChanged(){
		var t = [];
		for (var j = 0; j < editors.length; j++){
			editors[j].position = editors[j].tab.index();
		}
		editors.sort(function(a,b){
			if (a.position > b.position) { 
				return 1; 
			} else if (b.position > a.position) { 
				return -1;
			} else {
				return 0;
			}
		}); 
		activeTab = $ce_tabs.children(".ce_active").index();
		for (var i = 0; i < editors.length; i++){
			if (tabCfg[editors[i].type].can_reopen) {
				t.push({label: editors[i].label, type: editors[i].type, file: editors[i].file});
			}
		}
		localStorage.setItem('ce_open_tabs', JSON.stringify(t));
		updateUrlHash();
	}

	function updateUrlHash(){
		var hashparts = [inFolder],
			last_used_idx, 
			newest;
		for (var i = 0; i < editors.length; i++){
			if (tabCfg[editors[i].type].can_reopen) {
				if (! newest || newest < editors[i].last_opened) {
					newest = editors[i].last_opened;
					last_used_idx = (hashparts.length - 1) / 2;
				}
				hashparts.push(editors[i].type);
				hashparts.push(editors[i].file);
			}
		}
		hashparts.unshift(last_used_idx);
		if (history.replaceState) {
			history.replaceState(null, null, '#' + hashparts.join("|"));
		} else {
			location.hash = '#' + encodeURIComponent(hashparts.join("|"));
		}
	}
	
	function readUrlHash(){
		var parts = decodeURIComponent(document.location.hash.substr(1)).split("|");
		if (parts.length > 1) {
			inFolder = parts[1];
			for (var i = 2; (i + 1) < parts.length; i+=2) {
				// check to make sure its allowed first! This protects against someone crafting a bad url (e.g. a "run" command) and sending it to a victim
				if (tabCfg[parts[i]].can_reopen) {
					var file_parts = parts[i+1].split("@");
					if (file_parts.length > 1) {
						doLineHighlight = file_parts[1];
						hooksCfg[parts[i]](file_parts[0]);
						
					} else {
						hooksCfg[parts[i]](parts[i+1]);
					}
					
				}
			}
			var tabIdx = parseInt(parts[0],10);
			if (parts.length > 2 && !isNaN(tabIdx)) {
				activateTab(tabIdx);
			}
		}
	}

	function getPreferences() {
		var preferences;
		try {
			preferences = JSON.parse(localStorage.getItem('ce_preferences'));
		} catch(e) {}
		if (! preferences || $.isEmptyObject(preferences)) {
			preferences = {
				"cursorBlinking": "blink",
				"cursorSmoothCaretAnimation": false,
				"minimap": {
					"renderCharacters": true,
					"showSlider": "mouseover"
				}
			};
		}
		return preferences;
	}
	// This is an action that will occur after saving the file
	function openPreferences() {
		var ecfg = editors[activeTab];
		showModal({
			title: "Preferences",
			size: 500,
			body: "<div>Preferences will only affect sessions from this browser."+
					"<br><br><span class='ce_pref_item'>Enable word-wrap <label class='ce_pref_label'><input type='checkbox' class='ce_wordWrap'></label></span>"+
					"<br><span class='ce_pref_item'>Enable visible whitespace <label class='ce_pref_label'><input type='checkbox' class='ce_renderWhitespace'></label></span>"+
					"<br><span class='ce_pref_item'>Reuse tabs for post-save actions <label class='ce_pref_label'><input type='checkbox' class='ce_reuseWindow'></label></span>"+
					"<br><span class='ce_pref_item'>Hover tooltip <label class='ce_pref_label'><input type='checkbox' class='ce_hideSpecTooltip'></label></span>"+
					"<br><br><span class='ce_pref_item'>Advanced editor options (See <a href='https://microsoft.github.io/monaco-editor/api/interfaces/monaco.editor.ieditoroptions.html' target='_blank'>here</a>)<br>"+
					"<textarea class='ce_pref_advanced'></textarea></span>"+
				  "</div>",
			onShow: function(){
				// On load set the fields to the current values 
				var preferences = getPreferences();
				if (preferences.hasOwnProperty("wordWrap") && preferences.wordWrap === "on") {
					$(".ce_pref_item .ce_wordWrap").prop('checked', true);
				}
				if (preferences.hasOwnProperty("renderWhitespace") && preferences.renderWhitespace === "all") {
					$(".ce_pref_item .ce_renderWhitespace").prop('checked', true);
				}
				if (preferences.hasOwnProperty("ce_reuseWindow") && preferences.ce_reuseWindow) {
					$(".ce_pref_item .ce_reuseWindow").prop('checked', true);
				}
				if (!(preferences.hasOwnProperty("hover") && preferences.hover.hasOwnProperty("enabled") && ! preferences.hover.enabled)) {
					$(".ce_pref_item .ce_hideSpecTooltip").prop('checked', true);
				}
				delete preferences.wordWrap;
				delete preferences.renderWhitespace;
				delete preferences.ce_reuseWindow;
				if (preferences.hasOwnProperty("hover")) {
					delete preferences.hover.enabled;
					if ($.isEmptyObject(preferences.hover)) {
						delete preferences.hover;
					}
				}
				$(".ce_pref_item .ce_pref_advanced").val(JSON.stringify(preferences,null,3));
			}, 
			actions: [{
				onClick: function(){
					try {
						preferences = JSON.parse($(".ce_pref_item .ce_pref_advanced").val());
					} catch (e) {
						preferences = {};
					}
					preferences.wordWrap = ($(".ce_pref_item input.ce_wordWrap:checked").length > 0) ? "on" : "off";
					preferences.renderWhitespace = ($(".ce_pref_item input.ce_renderWhitespace:checked").length > 0) ? "all" : "none";
					preferences.ce_reuseWindow = ($(".ce_pref_item input.ce_reuseWindow:checked").length > 0);
					if (! preferences.hasOwnProperty("hover")) {
						preferences.hover = {};
					}
					if ($(".ce_pref_item input.ce_hideSpecTooltip:checked").length === 0) {
						preferences.hover.enabled = false;
					} else {
						preferences.hover.enabled = true;
					}
					localStorage.setItem('ce_preferences', JSON.stringify(preferences));
					// Update all currently open windows
					for (var i = 0; i < editors.length; i++) {
						if (editors[i].hasOwnProperty("editor")) {
							editors[i].editor.updateOptions(preferences);
						}
					}
					$(".modal").modal('hide');
				},
				cssClass: 'btn-primary',
				label: "Save"
			},{
				onClick: function(){ $(".modal").modal('hide'); },
				label: "Cancel"
			}]
		});
	}

	// This is an action that will occur after saving the file
	function setPostSaveAction() {
		var ecfg = editors[activeTab];
		var suggestions = [];
		for (var j = 0; j < hooksActive.length; j++) {
			if (hooksActive[j]._match.test(ecfg.file) && hooksActive[j].matchtype == "file" && isTrueValue(hooksActive[j].showWithSave)) {
				suggestions.push("Suggest: <code class='ce_postsave_suggestion'>" + htmlEncode(replaceTokens(hooksActive[j].action, ecfg.file)) + "</code><br>");
			}
		}
		showModal({
			title: "Set post-save action",
			size: 800,
			body: "<div>Enter a command to automatically run after successful save of this file only. This action will be saved in your browser local storage "+
						"(it will not affect other users or other browsers you use, but it will be remembered after browser refresh). "+
						"Run commands will be executed from the SPLUNK_HOME directory.<br><br>"+
					"File: <code>" + htmlEncode(ecfg.file) + "</code>"+
					"<br><br>"+
					suggestions.join('') + 
					"<br><br><div class='ce_autohookoptions'>" +
						"<select class='ce_postsave_arg0'>"+
							"<option value='nothing' selected='selected'>No action</option>"+
							"<option value='run'>Run command</option>"+
							"<option value='run-safe'>Run command with prompt</option>"+
							"<option value='bump'>Bump Splunk cache</option>"+
							"<option value='refresh'>Debug/Refresh endpoint/s</option>"+
							"<option value='btool'>Btool list</option>"+
							"<option value='btool-hidepaths'>Btool list (no paths)</option>"+
							"<option value='btool-hidedefaults'>Btool list (hide all defaults)</option>"+
							"<option value='btool-hidesystemdefaults'>Btool list (hide system defaults)</option>"+
							"<option value='spec'>Open Spec file</option>"+
							"<option value='read'>Open file</option>"+
							"<option value='live'>Show running config</option>"+
							"<option value='live-diff'>Show running config as diff</option>"+
							"<option value='deployserver'>Run reload deploy server</option>"+
						"</select>"+
						"<input type='text' value='' class='ce_postsave_arg1 ce_prompt_input input input-text'/></div>"+
					"</div>"+
					"<div>Run in background tab: <select class='ce_postsave_background'><option value='yes' selected='selected'>Yes</option><option value='no'>No</option></select></div>"+
					"<div>The following options will check the returned content from a post-save action for a specific string and will show a success or failure icon on the tab. Only one value is required for the icon to be displayed.</div>"+
					"<div>Content match for success: <input type='text' value='' class='ce_postsave_strmatch_good ce_prompt_input input input-text'/></div>"+
					"<div>Content match for failure: <input type='text' value='' class='ce_postsave_strmatch_bad ce_prompt_input input input-text'/></div>"+
				  "</div>",
			onShow: function(){
				// On load set the fields to the current values
				var p = getPostSave(ecfg.file);
				if (p !== null) {
					$(".ce_postsave_arg0").val(p[0]);
					$(".ce_postsave_arg1").val(p[1]);
					$(".ce_postsave_background").val(p[2]);
					$(".ce_postsave_strmatch_good").val(p[3]);
					$(".ce_postsave_strmatch_bad").val(p[4]);
				}
				$(".ce_postsave_suggestion").on("click", function(){
					var s = $(this).html();
					var sparts = s.split(":");
					$(".ce_postsave_arg0").val(sparts.shift());
					$(".ce_postsave_arg1").val(sparts.join(":"));
				});
			}, 
			actions: [{
				onClick: function(){
					var postsave = (JSON.parse(localStorage.getItem('ce_postsave')) || {});
					var arg0 = $(".ce_postsave_arg0").val();
					var arg1 = $(".ce_postsave_arg1").val();
					var background = $(".ce_postsave_background").val();
					var strmatch_good = $(".ce_postsave_strmatch_good").val();
					var strmatch_bad = $(".ce_postsave_strmatch_bad").val();
					if (arg0 === "nothing") {
						delete postsave[ecfg.file];
					} else {
						postsave[ecfg.file] = [arg0, arg1, background, strmatch_good, strmatch_bad];
					}
					localStorage.setItem('ce_postsave', JSON.stringify(postsave));
					$(".modal").modal('hide');
				},
				cssClass: 'btn-primary',
				label: "Save"
			},{
				onClick: function(){ $(".modal").modal('hide'); },
				label: "Cancel"
			}]
		});
	}

	// Read local storage to get any post-save action that exists for this file
	function getPostSave(file) {
		var postsave = (JSON.parse(localStorage.getItem('ce_postsave')) || {});
		if (postsave.hasOwnProperty(file)){
			// Handle legacy format
			if (typeof postsave[file] === "string") {
				var parts = postsave[file].split(":");
				var action = parts.shift();
				var args = replaceTokens(parts.join(":"), file);
				return [action,args];
			} else {
				var parts = postsave[file];
				parts[1] = replaceTokens(parts[1], file);
				return parts;
			}
		}
		return null;
	}

	// Run button
	function runShellCommand(contents, useSHOME) {
		var history_idx = run_history.length,
			in_progress_cmd = '',
			$input,
			cwd = "";
		if (inFolder !== "."){
			cwd = "<p>Working directory:</p>"+
				"<div><label><input type='radio' name='ce_cwd' value='0' " + (useSHOME ? "checked='checked'" : "") + "class='ce_run_cwd_radio ce_run_cwd_radio_shome'>$SPLUNK_HOME</label></div>"+
				"<div><label><input type='radio' name='ce_cwd' value='1' " + (useSHOME ? "" : "checked='checked'") + "class='ce_run_cwd_radio'>" + htmlEncode(inFolder) + "</label></div><br>";	
		}
		showModal({
			title: "Run ",
			size: 600,
			body: "<div>Enter a command to run on the server. <span class='red bold'>Warning:</span> Be careful with commands that do not exit as they will become orphaned processes. This does not have a timeout.<br><br>" +
					cwd +
					"<input type='text' value='' class='ce_prompt_input input input-text' style='width: 100%; background-color: #3d424d; color: #cccccc;'/>"+
					"</div>",
			onShow: function(){ 
				$input = $('.ce_prompt_input');
				if (contents) {
					$input.val(contents);
				}
				// Provide a history of run commands
				$input.focus().on('keydown', function(e) {
					// on enter, submit form
					if (e.which === 13) {
						$('.modal').find('button:first-child').click();
					} else if (e.which === 38) {// up arrow
						if (history_idx === run_history.length) {
							in_progress_cmd = $input.val();
						}
						history_idx--;
						if (history_idx < 0) {history_idx = 0;}
						$input.val(run_history[history_idx]);
					} else if (e.which === 40) { // down arrow
						if (history_idx === run_history.length) { return; }
						history_idx++;
						if (history_idx === run_history.length) {
							$input.val(in_progress_cmd);
						} else {
							$input.val(run_history[history_idx]);
						}
					}
				});
			},
			actions: [{
				onClick: function(){
					var runDir = $(".ce_run_cwd_radio_shome:checked").length;
					$('.modal').one('hidden.bs.modal', function() {
						var command = $input.val();
						if (command) {
							if (runDir) {
								runShellCommandNow(command, "");
							} else {
								runShellCommandNow(command, inFolder);
							}
						}
					}).modal('hide');
				},
				cssClass: 'btn-primary',
				label: "Run"
			},{
				onClick: function(){ $(".modal").modal('hide'); },
				label: "Cancel"
			}]
		});
	}

	// Run button
	function runReloadDeployServer() {
		showModal({
			title: "Reload deploy-server",
			size: 1000,
			body: "<div class='ce-deployserver'>Select server class to reload.<br><br><a href='#' class='ce-server-classes-all'>All server classes</a><div class='ce-server-classes'></div></div>",
			onShow: function(){ 
				var $serverClasses = $(".ce-server-classes");
				$ce_spinner.clone().appendTo($serverClasses);

				service.get('/services/deployment/server/serverclasses', {count:0, f:"name"}, function(err, r) {
					if (err) {
						// TODO
						console.error(err);
					}
					var str = "";
					console.log("resp",r.data);
					if (r && r.data && r.data.entry) {
						for (var i = 0; i < r.data.entry.length; i++) {
							str += "<a href='#'>" + htmlEncode(r.data.entry[i].name) + "</a>";
						}
					}
					$serverClasses.html(str);
					$(".ce-deployserver").on("click","a",function(e){
						e.preventDefault();
						e.stopPropagation();
						var $this = $(this);
						$(".modal").modal('hide');
						if ($this.hasClass("ce-server-classes-all")) {
							runReloadDeployServerNow();
						} else {
							runReloadDeployServerNow($this.text());
							//runShellCommandNow("./bin/splunk reload deploy-server -class \"" + $this.text() + "\"");
						}
					});
				});
			},
			actions: [{
				onClick: function(){ $(".modal").modal('hide'); },
				label: "Cancel"
			}]
		});
	}

	function runReloadDeployServerNow(srvclass) {
		if (typeof srvclass === undefined) {
			srvclass = "";
		}
		var command = "reload deploy-server"
		if (tabAlreadyOpen('deployserver', "")) {
			closeTabByName('deployserver', "");
		}		
		var ecfg = createTab('deployserver', "", '<span class="ce-dim">$</span> ' + htmlEncode(command));
		serverActionWithoutFlicker({action: 'deployserver', path: srvclass}).then(function(contents){
			updateTabAsEditor(ecfg, contents, 'plaintext');
		}).catch(function(){
			closeTabByCfg(ecfg);
		});
	}


	function runShellCommandNow(command, fromFolder){
		var ecfg = createTab('run', command, '<span class="ce-dim">$</span> ' + htmlEncode(command));
		//var cancel = $("<div class='ce_cancel ce_internal_link'>Cancel</div>").appendTo(ecfg.container);
		var timer = $("<div class='ce_timer'></div>").appendTo(ecfg.container);
		var started = Date.now();
		var interval = setInterval(function() {
			var tt = Math.round((Date.now() - started) / 1000);
			if (tt > 2) {
				timer.html(tt + " sec");
			}
		},1000);
		// trim length
		if (run_history.length > 50) {
			run_history.shift();
		}
		// only save if the command is different to what was last run
		if (command !== run_history[(run_history.length - 1)]) {
			run_history.push(command);
		}
		// save to localstorage
		localStorage.setItem('ce_run_history', JSON.stringify(run_history));
		if (typeof fromFolder === "undefined") {
			fromFolder = "";
		}
		ecfg.fromFolder = fromFolder;	
		serverActionWithoutFlicker({action: 'run', path: command, param1: fromFolder}).then(function(contents){
			clearInterval(interval);
			updateTabAsEditor(ecfg, contents, 'plaintext');
		}).catch(function(){
			clearInterval(interval);
			closeTabByCfg(ecfg);
		});
	}

	// Check config
	function runBToolCheck() {
		var ecfg = createTab('btool-check', 'btool-check', 'btool check ');
		serverActionWithoutFlicker({action: 'btool-check'}).then(function(contents){
			contents = contents.replace(/^(No spec file for|Checking):.*\r?\n/mg,'').replace(/^\t\t/mg,'').replace(/\n{2,}/g,'\n\n');
			if ($.trim(contents)) {
				updateTabAsEditor(ecfg, contents, 'plaintext');
			} else {
				closeTabByCfg(ecfg);
				showModal({
					title: "Info",
					body: "<div class='alert alert-info'><i class='icon-alert'></i>No configuration errors found</div>",
					size: 300
				});
			}
		}).catch(function(){ 
			closeTabByCfg(ecfg);
		});
	}

	function getRunningConfig(path) {
		path = path.replace(/\.conf$/i,"");
		return new Promise(function(resolve, reject){
			service.get('/services/configs/conf-' + path, null, function(err, r) {
				if (err) {
					reject(err);
				}
				var str = "";
				if (r && r.data && r.data.entry) {
					for (var i = 0; i < r.data.entry.length; i++) {
						str += "[" + r.data.entry[i].name + "]\n";
						var props = Object.keys(r.data.entry[i].content);
						props.sort();
						for (var j = 0; j < props.length; j++) {
							if (props[j].substr(0,4) !== "eai:" && !(props[j] === "disabled" && ! r.data.entry[i].content[props[j]])) {
								str += props[j] + " = " + r.data.entry[i].content[props[j]] + "\n";
							}
						}
					}
					if (str) {
						resolve(str);
					} else {
						reject();
					}
				} else {
					reject();
				}
			});
		});
	}

	function runningVsLayered(path, compare){
		path = path.replace(/\.conf$/i,"");
		var type = 'live';
		var tab_path_fmt = '<span class="ce-dim">live:</span> ' + path;
		if (compare) {
			type = 'live-diff';
			tab_path_fmt = '<span class="ce-dim">live/btool:</span> ' + path;
		}
		if (! tabAlreadyOpen(type, path)) {
			var ecfg = createTab(type, path, tab_path_fmt);
			serverActionWithoutFlicker({action: 'btool-list', path: path}).then(function(contents){
				var c = formatBtoolList(contents, "btool-hidepaths");
				if ($.trim(c)) {
					getRunningConfig(path).then(function(contents_running){
						if (compare) {
							updateTabAsDiffer(
								ecfg, 
								"# Filesystem config\n" + formatLikeRunningConfig(contents),
								"# Running config\n" + contents_running
							);
						} else {
							updateTabAsEditor(ecfg, contents_running, 'ini');
						}
					}).catch(function(){
						closeTabByCfg(ecfg);
						showModal({
							title: "Warning",
							body: "<div class='alert alert-warning'><i class='icon-alert'></i>Could not get retreieve running config for " + htmlEncode(path) + "</div>",
							size: 300
						});
					});	
				} else {
					closeTabByCfg(ecfg);
					showModal({
						title: "Error",
						body: "<div class='alert alert-error'><i class='icon-alert'></i>No btool data returned for " + htmlEncode(path) + "</div>",
						size: 300
					});
				}
			}).catch(function(){
				closeTabByCfg(ecfg);
			});
		}	
	}
	
	function runBToolList(inPath, type, origPath, replacementPath){
		var parts = inPath.split(":");
		var conf_file = parts.shift().replace(/\.conf$/i, "");
		var path = parts.join(":");
		// There are three special "paths" which we replace with the dynamic value
		if (path === "deployment-apps"){
			if (conf.btool_dir_for_deployment_apps) {
				path = conf.btool_dir_for_deployment_apps;
				origPath = conf.btool_dir_for_deployment_apps;
				replacementPath = "/splunk/etc/deployment-apps/";
			} else {
				path = "";
			}
		}
		if (path === "master-apps") {
			if (conf.btool_dir_for_master_apps) {
				path = conf.btool_dir_for_master_apps;
				origPath = conf.btool_dir_for_master_apps;
				replacementPath = "/splunk/etc/master-apps/";
			} else {
				path = "";
			}
		}
		if (path === "shcluster") {
			if (conf.btool_dir_for_shcluster_apps) {
				path = conf.btool_dir_for_shcluster_apps;
			} else {
				path = "";
			}
		}
		var tab_path_fmt = '<span class="ce-dim">btool:</span> ' + conf_file + (type === "btool" ? "" : " <span class='ce-dim'>(" + type.substr(6) + ")</span>");
		if (tabAlreadyOpen(type, conf_file + ":" + path)) {
			closeTabByName(type, conf_file + ":" + path);
		}
		var ecfg = createTab(type, conf_file + ":" + path, tab_path_fmt);
		serverActionWithoutFlicker({action: 'btool-list', path: conf_file, param1: path}).then(function(contents){
			if (typeof origPath !== "undefined") {
				contents = adjustBtoolPaths(contents, origPath, replacementPath);
			}
			var c = formatBtoolList(contents, type);
			if ($.trim(c)) {
				updateTabAsEditor(ecfg, c, 'ini');
				ecfg.btoollist = contents;
				serverAction({action: 'spec-hinting', path: conf_file}).then(function(h){
					ecfg.hinting = buildHintingLookup(conf_file, h);
				});
			} else {
				closeTabByCfg(ecfg);
				showModal({
					title: "Warning",
					body: "<div class='alert alert-warning'><i class='icon-alert'></i>No contents for \"<strong>" + tab_path_fmt + "</strong>\"</div>",
					size: 300
				});
			}
		}).catch(function(){ 
			console.error(arguments);
			closeTabByCfg(ecfg);
		});
	}
	
	function displaySpecFile(path) {
		path = path.replace(/\.conf$/i,"");
		var tab_path_fmt = '<span class="ce-dim">spec:</span> ' + path;
		if (! tabAlreadyOpen('spec', path)) {
			var ecfg = createTab('spec', path, tab_path_fmt);
			serverActionWithoutFlicker({action: 'spec', path: path}).then(function(contents) {
				if ($.trim(contents)) {
					updateTabAsEditor(ecfg, contents, 'ini');
				} else {
					closeTabByCfg(ecfg);
					showModal({
						title: "Error",
						body: "<div class='alert alert-error'><i class='icon-alert'></i>No spec file found!</div>",
						size: 300
					});
				}
			}).catch(function(){ 
				closeTabByCfg(ecfg);
			});
		}
	}

	// Update and display the left pane in filesystem mode
	function showTreePaneSpinner(direction) {
		if (! leftpane_ignore) {
			leftpane_ignore = direction || "none";
			$ce_file_wrap.addClass("ce_move_" + leftpane_ignore);
			$ce_spinner.clone().appendTo($ce_tree_pane);
			$ce_tree_icons.find('i').addClass("ce_disabled");
		}
	}

	function refreshFolder(){
		readFolderFromServer(inFolder);
	}

	function getTreeCache(path) {
		var patharray = path.split("/");
		var base = filecache;
		if (filecache === null) {
			return base;
		}
		for (var i = 1; i < patharray.length; i++) {
			if (base.hasOwnProperty(patharray[i])) {
				base = base[patharray[i]];
			} else {
				base = null;
				break;
			}
		}
		return base;
	}

	// Read the folder from the cache
	function readFolder(path, direction) {
		filterModeReset();
		var base = getTreeCache(path);
		if (base === null || ! base.hasOwnProperty(".")){
			readFolderFromServer(path, direction);
		} else {
			folderContents = [];
			for (var key in base) {
				if (base.hasOwnProperty(key) && key !== ".") {
					folderContents.push({
						sortkey: key.toLocaleLowerCase(),
						dir: true,
						name: key
					});
				}
			}
			if (base.hasOwnProperty(".")) {
				for (var j = 0; j < base["."].length; j++) {
					folderContents.push({
						sortkey: base["."][j].toLocaleLowerCase(),
						dir: false,
						name: base["."][j]
					});
				}
			}
			readFolderLoad(path);
			// Even though we just loaded the folder contents from cache, we still request data from the server which will be updated once it is ready.
			// this keeps the UI fast and makes sure that stuff hasnt changed after the cache was generated. It also allows for sorting by size/timestamp
			readFolderFromServerWithoutSpinner(path, direction);
		}
	}

	function readFolderFromServer(path, direction) {
		showTreePaneSpinner(direction);
		openingFolder = path;
		return readFolderFromServerActual(path, direction);
	}

	function readFolderFromServerWithoutSpinner(path, direction) {
		openingFolder = path;
		return readFolderFromServerActual(path, direction);
	}

	function readFolderFromServerActual(path, direction) {
		return serverAction({action: 'read', path: path}).then(function(contents){
			// Make sure the user didnt navigate to another folder while waiting for the server query
			if (openingFolder !== path) { return; }
			var i;
			// if filecache is null it means user turned it off by setting conf to -1
			if (filecache !== null) {
				var base = getTreeCache(path);
				// base can be null if the screen was opened when we were already deep in the uncached zone
				if (base !== null) {
					var folders = ["."];
					base["."] = [];
					for (i = 0; i < contents.length; i++) {
						if (!contents[i][0]) {
							base["."].push(contents[i][1]);
						} else {
							folders.push(contents[i][1]);
							if (! base.hasOwnProperty(contents[i][1])) {
								base[contents[i][1]] = {};
							}
						}
					}
					// Go through and delete any keys that might no longer exist
					for (var key in base) {
						if (base.hasOwnProperty(key) && folders.indexOf(key) === -1) {
							delete base[key];
						}
					}
				}
			}
			folderContents = [];
			for (i = 0; i < contents.length; i++) {
				folderContents.push({
					sortkey: contents[i][1].toLocaleLowerCase(),
					dir: !!(contents[i][0]),
					name: contents[i][1],
					time: contents[i][2],
					size: contents[i][3],
				});
			}
			readFolderLoad(path);
		}).catch(function(msg){
			leftPaneRemoveSpinner();
			$ce_file_wrap.empty();
			$ce_file_path.empty();
			$("<div class='ce_treenothing'><i class='icon-warning'></i>Error occured. <span class='ce_link ce_tree_retry'>Retry</span> / <span class='ce_link ce_tree_reset'>Home</span></div>").appendTo($ce_file_wrap);
			$ce_file_wrap.find(".ce_tree_retry").on("click", function(){
				return readFolderFromServer(path, direction);
			});
			$ce_file_wrap.find(".ce_tree_reset").on("click", function(){
				return readFolderFromServer(".");
			});
		});
	}

	function readFolderLoad(path){
		inFolder = path;
		updateUrlHash();
		localStorage.setItem('ce_current_path', inFolder);
		folderContents.sort(function(a, b) {
			if (a.dir === b.dir) {
				if (sortMode === "size" || sortMode === "time") {
					if (sortAsc) {
						return a[sortMode] > b[sortMode] ? -1 : a[sortMode] < b[sortMode] ? 1 : a.sortkey > b.sortkey ? 1 : a.sortkey < b.sortkey ? -1 : 0;
					}
					return a[sortMode] > b[sortMode] ? 1 : a[sortMode] < b[sortMode] ? -1 : a.sortkey > b.sortkey ? 1 : a.sortkey < b.sortkey ? -1 : 0;
				}
				// sort by name
				if (sortAsc) {
					return a.sortkey > b.sortkey ? 1 : a.sortkey < b.sortkey ? -1 : 0;
				}
				return a.sortkey > b.sortkey ? -1 : a.sortkey < b.sortkey ? 1 : 0;
			}
			return b.dir ? 1 : -1;
		});
		leftPaneFileList();
	}

	function filePathRTLCheck() {
		var span = $ce_file_path.find("span");
		if (span.attr("title")) {
			if (span.width() > $ce_file_path.width()) {
				$ce_file_path.addClass('ce_rtl');
			} else {
				$ce_file_path.removeClass('ce_rtl');
			}
		}
	}
	
	function leftPaneRemoveSpinner(){
		if (leftpane_ignore) {
			if (leftpane_ignore === 'fwd') {
				$ce_file_wrap.css({transition: "all 0ms", transform: "translate(200px, 0px)", opacity: 0});
			} else if (leftpane_ignore === 'back') {
				$ce_file_wrap.css({transition: "all 0ms", transform: "translate(-200px, 0px)", opacity: 0});
			} else {
				$ce_file_wrap.css({transition: "all 0ms", transform: "", opacity: 0});
			}
			$ce_file_wrap.removeClass("ce_move_none ce_move_fwd ce_move_back");
			$ce_tree_pane.find(".ce_spinner, .ce_fs_slow_message").remove();
			setTimeout(function(){
				$ce_file_wrap.css({transition: "", transform: "", opacity: ""});
			},0);
			leftpane_ignore = false;	
		}
	}

	function formatSize(bytes) {
		if (bytes === 0) return '0 <span class="ce_leftnav_size_unit">B</span>';
		const k = 1024;
		const dm = 2;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' <span class="ce_leftnav_size_unit">' + sizes[i] + '</span>';
	}

	function formatDate(val) {
		var d = new Date(val*1000);
		return d.toLocaleString();
	}

	function leftPaneFileList(filter){
		leftPaneRemoveSpinner();
		$ce_file_wrap.empty();
		$ce_file_path.empty();
		$ce_tree_icons.find('i').removeClass("ce_disabled");
		if (inFolder === ".") {
			$(".ce_folder_up").addClass("ce_disabled");
		} else {
			$(".ce_folder_up").removeClass("ce_disabled");
		}
		$("<span></span><bdi></bdi>").appendTo($ce_file_path);
		$ce_file_path.find("span, bdi").attr("title", inFolder).text(inFolder + '/');
		filePathRTLCheck();
		var files = false;
		var filter_re;
		if (filter) {
			filter_re = new RegExp(escapeRegExp(filter), 'gi'); 
		}
		for (var i = 0; i < folderContents.length; i++) {
			var item = folderContents[i].name;
			if (! filter || item.toLowerCase().indexOf(filter) > -1) {
				var icon = (folderContents[i].dir) ? "folder" : "report";
				var text = htmlEncode(item);
				files = true;
				if (filter) {
					text = text.replace(filter_re, "<span class='ce_treehighlight'>$&</span>");
				}
				$("<div class='ce_leftnav ce_leftnav_editable ce_is_" + icon + "'>"+
					"<i class='icon-" + icon + "'></i> " +
					"<div class='ce_leftnav_name'>" + text + "</div>"+
					"<div class='ce_leftnav_size'>" + (folderContents[i].size > -1 && folderContents[i].hasOwnProperty("size") ? formatSize(folderContents[i].size) : "") + "</div>"+
					"<div class='ce_leftnav_time'>" + (folderContents[i].time > -1 && folderContents[i].hasOwnProperty("time") ? formatDate(folderContents[i].time) : "") + "</div>"+
				"</div>").attr("file", inFolder + "/" + item).appendTo($ce_file_wrap);
			}
		}
		if (!files) {
			if (filter) {
				$("<div class='ce_treenothing'><i class='icon-warning'></i>Not found: <span class='ce_treenothing_text'>" + htmlEncode(filter) + "<span></div>").appendTo($ce_file_wrap);
			} else {
				$("<div class='ce_treeempty'><i class='icon-warning'></i>Folder empty</div>").appendTo($ce_file_wrap);
			}
		}
	}

	// The conf file list
	function leftPaneConfList() {
		$ce_file_wrap.empty();
		$ce_file_path.removeClass('ce_rtl').empty();
		$(".ce_folder_up, .ce_refresh_tree, .ce_add_folder, .ce_add_file, .ce_filter, .ce_recent_files, .ce_app_run").addClass("ce_disabled");
		$("<span>Splunk conf files</span>").appendTo($ce_file_path);
		for (var i = 0; i < confFilesSorted.length; i++) {
			$("<div class='ce_leftnav ce_conf'></div>").text(confFilesSorted[i]).attr("file", confFilesSorted[i]).prepend("<i class='icon-bulb'></i> ").appendTo($ce_file_wrap);
		}
	}

	// Click handler for Recent Files button in top right
	function leftPaneRecentList() {
		$ce_file_wrap.empty();
		$ce_file_path.removeClass('ce_rtl').empty();
		$(".ce_folder_up, .ce_refresh_tree, .ce_add_folder, .ce_add_file, .ce_filter, .ce_show_confs, .ce_app_run").addClass("ce_disabled");
		$("<span>Recent files</span>").appendTo($ce_file_path);
		var counter = 0;
		var openlabels = [];
		for (var j = 0; j < editors.length; j++) {
			openlabels.push(editors[j].label);
		}
		for (var i = closed_tabs.length - 1; i >= 0 ; i--) {
			if (counter > max_recent_files_show) {
				break;
			}
			// hide item if they are actually open at the moment
			if (openlabels.indexOf(closed_tabs[i].label) === -1) {
				counter++;
				var icon = "report";
				if (closed_tabs[i].type !== "read") {
					icon = "bulb";
				}
				$("<div class='ce_leftnav ce_leftnav_reopen'><i class='icon-" + icon + "'></i> " + htmlEncode(closed_tabs[i].label).replace(/^read:\s/,"") + "</div>").attr("file", closed_tabs[i].file).attr("title", closed_tabs[i].file).attr("type", closed_tabs[i].type).appendTo($ce_file_wrap);
			}
		}
		if (counter === 0) {
			$("<div class='ce_treeempty'><i class='icon-warning'></i>Nothing here</div>").appendTo($ce_file_wrap);
		}
	}

	// Handle clicking an file or folder in the left pane
	function readFile(path){
		var label = dodgyBasename(path);
		var type = "read";
		if (path === "") {
			label = "Settings";
			type = "settings";
		}		
		if (! tabAlreadyOpen(type, path)) {
			var ecfg = createTab(type, path, label);
			serverActionWithoutFlicker({action: 'read', path: path}).then(function(contents){
				updateTabAsEditor(ecfg, contents);
				if (ecfg.hasOwnProperty('matchedConf')) {
					highlightBadConfig(ecfg);
					if (confFiles.hasOwnProperty(ecfg.matchedConf)) {
						serverAction({action: 'spec-hinting', path: ecfg.matchedConf}).then(function(c){
							ecfg.hinting = buildHintingLookup(ecfg.matchedConf, c);
						});
					}
				} 
			}).catch(function(){ 
				closeTabByCfg(ecfg);
			});
		}
	}

	// Create new file or folder with a prompt window
	function fileSystemCreateNew(parentPath, type){
		if (type){
			type = "file";
		} else {
			type = "folder";
		}
		showModal({
			title: "New " + type,
			size: 300,
			body: "<div>Enter new " + type + " name:<br><br><input type='text' value='' class='ce_prompt_input input input-text' style='width: 100%; background-color: #3d424d; color: #cccccc;'/></div>",
			onShow: function(){ 
				$('.ce_prompt_input').focus().on('keydown', function(e) {
					if (e.which === 13) {
						$('.modal').find('button:first-child').click();
					}
				}); 
			},
			actions: [{
				onClick: function(){
					$('.modal').one('hidden.bs.modal', function() {
						var fname = $('.ce_prompt_input').val();
						if (fname) {
							showTreePaneSpinner();
							serverAction({action: 'new' + type, path: parentPath, param1: fname}).then(function(){
								refreshFolder();
								showToast('Success');
							}).catch(function(){
								refreshFolder();
							});
						}
					}).modal('hide');
				},
				cssClass: 'btn-primary',
				label: "Create"
			},{
				onClick: function(){ $(".modal").modal('hide'); },
				label: "Cancel"
			}]
		});
	}
	
	function fileSystemUpload(parentPath){
		showModal({
			title: "File upload ",
			size: 300,
			body: "<div>Select file:<br><br>"+
					"<input type='file' style='width: 100%;' class='ce_file_upload_input'/><br><br><br>"+
					"<label><input type='checkbox' class='ce_file_upload_extract' />Extract file after upload</label><br><br>"+
					"</div>",
			actions: [{
				onClick: function(){
					$('.modal').one('hidden.bs.modal', function() {
						var file = $('.ce_file_upload_input')[0].files[0];
						var reader = new FileReader();
						var extract = "";
						var ecfg;
						if ($('.ce_file_upload_extract:checked').length) {
							extract = "e";
							ecfg = createTab('run', "", '<span class="ce-dim">Extracted files:</span> ' + htmlEncode(file.name));
						}
						reader.onloadend = function() {
							var upFileB64 = reader.result;
							showTreePaneSpinner();
							serverAction({action: 'fileupload' + extract, path: parentPath, param1: file.name, file: upFileB64}).then(function(contents){
								if (ecfg) {
									updateTabAsEditor(ecfg, contents, "plaintext");
								} else {
									showToast('Success');
								}
								refreshFolder();
							}).catch(function(){
								if (ecfg) {
									closeTabByCfg(ecfg);
								}
								refreshFolder();
							});
						}
						reader.readAsDataURL(file);
					}).modal('hide');
				},
				cssClass: 'btn-primary',
				label: "Upload"
			},{
				onClick: function(){ $(".modal").modal('hide'); },
				label: "Cancel"
			}]
		});
	}

	// Rename a file or folder with a prompt window
	function fileSystemRename(parentPath) {
		if (fileIsOpenAndHasChanges(parentPath)) { return; }
		var bn = dodgyBasename(parentPath);
		showModal({
			title: "Rename",
			size: 400,
			body: "<div>Enter new name for <code>" + bn + "</code><br><br><input type='text' value='" + bn + "' class='ce_prompt_input input input-text' style='width: 100%; background-color: #3d424d; color: #cccccc;'/></div>",
			onShow: function(){ 
				$('.ce_prompt_input').focus().on('keydown', function(e) {
					// submit form on enter key
					if (e.which === 13) {
						$('.modal').find('button:first-child').click();
					}
				}); 
			},
			actions: [{
				onClick: function(){
					$('.modal').one('hidden.bs.modal', function() {
						var newname = $('.ce_prompt_input').val();
						if (newname && newname !== bn) {
							showTreePaneSpinner();
							serverAction({action: 'rename', path: parentPath, param1: newname}).then(function(){
								refreshFolder();
								showToast('Success');
								// if "path" is open in an editor, it needs to be closed without warning
								closeTabByName("read", parentPath);
							}).catch(function(){
								refreshFolder();
							});
						}
					}).modal('hide');
				},
				cssClass: 'btn-primary',
				label: "Rename"
			},{
				onClick: function(){ $(".modal").modal('hide'); },
				label: "Cancel"
			}]
		});
	}

	// Delete a file or folder with a popup windows
	function filesystemDelete(file) {
		if (fileIsOpenAndHasChanges(file)) { return; }
		showModal({
			title: "Delete",
			size: 550,
			body: "<div>Are you sure you want to delete: <code>" + file + "</code><br><br>To confirm type 'yes':<br><br><input type='text' value='' class='ce_prompt_input input input-text' style='width: 60px; background-color: #3d424d; color: #cccccc;'/></div>",
			onShow: function(){ 
				$('.ce_prompt_input').focus().on("keyup blur", function(){
					if ($('.ce_prompt_input').val().toLowerCase() === "yes") {
						$('.modal').find(".btn-danger").removeClass('btn-disabled');
					} else {
						$('.modal').find(".btn-danger").addClass('btn-disabled');
					}
				}).on('keydown', function(e) {
					if (e.which === 13) {
						$('.modal').find('button:first-child').click();
					}
				});
			},
			actions: [{
				onClick: function(){
					if ($('.ce_prompt_input').val().toLowerCase() !== "yes") {
						return;
					}
					$('.modal').one('hidden.bs.modal', function() {
						showTreePaneSpinner();
						serverAction({action: 'delete', path: file}).then(function(){
							refreshFolder();
							showToast('Success');
							// if "path" is open in an editor, it needs to be closed without warning
							closeTabByName("read", file);
						}).catch(function(){
							refreshFolder();
						});
					}).modal('hide');
				},
				cssClass: 'btn-danger btn-disabled',
				label: "Delete"
			},{
				onClick: function(){ $(".modal").modal('hide'); },
				label: "Cancel"
			}]
		});	
	}

	function showChangeLog() {
		var ecfg = createTab('change-log', "", "Change log");
		serverActionWithoutFlicker({action: 'git-log', path: inFolder}).then(function(contents){
			updateTabAsEditor(ecfg, contents, "git-log");
		}).catch(function(){ 
			closeTabByCfg(ecfg);
		});
	}
	
	// Git history of a specific file optionally between two commit tags
	function getFileHistory(file, folder){
		var ecfg = createTab('history', file, "<span class='ce-dim'>history:</span> " + dodgyBasename(file));
		serverActionWithoutFlicker({action: 'git-history', path: file, param1: folder}).then(function(contents){
			contents = $.trim(contents);
			if (! contents) {
				showModal({
					title: "Warning",
					body: "<div class='alert alert-warning'><i class='icon-alert'></i>No change history found for: <br><br><code>" + htmlEncode(file) + "</code></div>",
					size: 400
				});
				closeTabByCfg(ecfg);
				return;
			}
			updateTabAsEditor(ecfg, contents, "git-diff");
		}).catch(function(){ 
			closeTabByCfg(ecfg);
		});
	}

	function activateTab(idx){
		if (idx < -1 || idx > (editors.length - 1)) {
			return;
		}
		$ce_contents.children().addClass("ce_hidden");
		$ce_contents_home.addClass("ce_hidden");
		$ce_tabs.children().removeClass("ce_active");
		$ce_home_tab.removeClass("ce_active");
		activeTab = idx;
		if (idx !== -1) {
			editors[idx].tab.addClass('ce_active');
			editors[idx].container.removeClass('ce_hidden');
			editors[idx].last_opened = Date.now();
		} else {
			$ce_home_tab.addClass('ce_active');
			$ce_contents_home.removeClass('ce_hidden');
		}
		doPipeTabSeperators();
		updateUrlHash();
		if (editors[idx] && editors[idx].hasOwnProperty("editor")) {
			editors[idx].editor.focus();
		}
	}

	// The pipe seperators are between active tabs but not on the currently active tab or the one to its left.
	function doPipeTabSeperators(){
		$(".ce_pipe, .ce_pipe_left").remove();
		for (var i = 0; i < editors.length; i++) {
			if ((activeTab - 1) !== i && activeTab !== i) {
				editors[i].tab.append('<span class="ce_pipe"></span>');
			}
		}
		if (activeTab >= 0) {
			$ce_home_tab.append('<span class="ce_pipe_left"></span>');
			if (activeTab > 0) {
				$ce_home_tab.append('<span class="ce_pipe"></span>');
			}
		}
	}

	// Check if tab is open with unsaved changes
	function fileIsOpenAndHasChanges(file) {
		for (var i = 0; i < editors.length; i++) {
			if (editors[i].file === file) {
				if (editors[i].hasChanges) {
					showModal({
						title: "Warning",
						body: "<div class='alert alert-warning'><i class='icon-alert'></i> Cannot rename or delete file becuase it is currently open with unsaved changes.</div>",
						size: 350
					});	
					return true;
				}
			}
		}
		return false;
	}

	// A tab was opened but there was nothing to put in it, so it is closed.
	function closeTabByCfg(ecfg) {
		for (var i = 0; i < editors.length; i++) {
			if (editors[i].id === ecfg.id) {
				closeTabNow(i);
				return;
			}
		}
	}

	function closeTabByName(type, file) {
		for (var i = 0; i < editors.length; i++) {
			if (editors[i].file === file && editors[i].type === type) {
				closeTabNow(i);
				return;
			}
		}
	}

	function closeTabByHookDetails(arg0, arg1) {
		if (preferences.ce_reuseWindow) {
			if (arg0 === "bump") {
				closeTabByName("refresh", "bump")
			} else if (arg0 === "run-safe") {
				closeTabByName("run", arg1)
			} else {
				closeTabByName(arg0, arg1);
			}
		}
	}

	// Check if tab is already open, and if so, active it instead.
	function tabAlreadyOpen(type, file) {
		// check if file is already open
		for (var i = 0; i < editors.length; i++) {
			if (editors[i].type === type && editors[i].file === file) {
				activateTab(i);
				return true;
			}
		} 
		return false;
	}

	function closeTabWithConfirmation(idx){
		if (editors[idx].hasChanges) {
			showModal({
				title: "Unsaved changes",
				body: "<div>Discard unsaved changes?</div>",
				size: 300,
				actions: [{
					onClick: function(){
						$(".modal").modal('hide');
						closeTabNow(idx);
					},
					cssClass: 'btn-danger',
					label: "Discard"
				},{
					onClick: function(){ $(".modal").modal('hide'); },
					label: "Cancel"
				}]
			});
		} else {
			closeTabNow(idx);
		}
	}
	
	// when tabs are closed, remember in local storage for recent files list
	function logClosedTab(ecfg){ 
		// make sure unique items only appear once
		var splicy = -1;
		for (var j = 0; j < closed_tabs.length; j++) {
			if (ecfg.label === closed_tabs[j].label) {
				splicy = j;
			}
		}
		if (splicy > -1){
			closed_tabs.splice(splicy, 1);
		}
		if (tabCfg.hasOwnProperty(ecfg.type) && tabCfg[ecfg.type].can_reopen) {
			closed_tabs.push({label: ecfg.label, type: ecfg.type, file: ecfg.file});
		}
		// trim length
		// There is a buffer of 10 so we can have things to show if the tabs are opened and thus removed from the list
		if (closed_tabs.length > (max_recent_files_show + 10)) {
			closed_tabs.shift();
		}
		//persist to localstorage
		localStorage.setItem('ce_closed_tabs', JSON.stringify(closed_tabs));		
	}

	function closeTabNow(idx) {
		logClosedTab(editors[idx]);
		if (editors[idx].hasOwnProperty("editor")) {
			editors[idx].editor.dispose();
		}
		if (editors[idx].hasOwnProperty("model")) {
			editors[idx].model.dispose();
		}
		editors[idx].tab.remove();
		editors[idx].container.remove();
		editors.splice(idx, 1);
		openTabsListChanged();
		// if there are still tabs open, find the most recently used tab and activate that one
		if ($ce_tabs.children().length === 0) {
			activateTab(-1);
		// if there is already a tab selected
		} else if ($ce_tabs.children(".ce_active").length === 0) {
			var last_used_idx, 
				newest;
			for (var i = 0; i < editors.length; i++) {
				if (! newest || newest < editors[i].last_opened) {
					newest = editors[i].last_opened;
					last_used_idx = i;
				}
			}
			activateTab(last_used_idx);
		}
	}

	function createTab(type, file, label){
		var ecfg = {
			type: type, 
			file: file,
			label: type + ": " + file,
			id: tabid++
		};
		editors.push(ecfg);
		ecfg.container = $("<div></div>").appendTo($ce_contents);
		ecfg.container.append($ce_spinner.clone());
		// Remove the "restore session" link
		$(".ce_restore_session").remove();
		ecfg.tab = $("<div class='ce_tab ce_active'>" + label + "</div>").attr("title", ecfg.label).data({"tab": ecfg}).appendTo($ce_tabs);
		ecfg.hasChanges = false;
		ecfg.server_content = '';
		activateTab(editors.length-1);
		openTabsListChanged();
		return ecfg;
	}

	function addHookActionToEditor(hook, ecfg) {
		if (hook._match.test(ecfg.file) && hook.matchtype == "file") {
			var lab = replaceTokens(hook.label, ecfg.file);
			if (isTrueValue(hook.showWithSave) && ecfg.canBeSaved) {
				ecfg.editor.addAction({
					id: "Save and " + lab,
					contextMenuOrder: 0.2,
					contextMenuGroupId: 'navigation',
					label: "Save and " + lab,
					run: function() {
						saveActiveTab(function(){
							runAction(hook.action, ecfg.file);
						});
					}
				});
			}
			ecfg.editor.addAction({
				id: lab,
				contextMenuOrder: 0.3,
				contextMenuGroupId: 'navigation',
				label: lab,
				run: function() {
					runAction(hook.action, ecfg.file);
				}
			});
		}
	}

	function updateTabAsEditor(ecfg, contents, language) {
		// uses the built-in language detection where possible
		if (! language) {
			if (/\.(?:conf|meta|spec)/.test(ecfg.file)) {
				language = "ini";
			}
		}
		var re = /([^\/\\]+).conf$/;
		var found = ecfg.file.match(re);
		ecfg.canBeSaved = (ecfg.type === "read" || ecfg.type === "settings");
		if (found && ecfg.canBeSaved && found[1] !== 'app') {
			ecfg.matchedConf = found[1];
		}
		if (ecfg.canBeSaved) {
			// Start the process of checking filemodtimes
			// A filemodcheck might be about to occur, but delay it another 100ms in case its the first load a bunch of tabs are opening at once.
			clearTimeout(fileModsCheckTimer);
			fileModsCheckTimer = setTimeout(function(){ checkFileMods(); }, 100);
		}
		ecfg.saving = false;
		ecfg.decorations = [];
		ecfg.container.empty();
		// The monaco URL must be unique or it will silently close. We use the same file when running different versions of btool and in other circumstances so need to prefix with a unique id.
		var url = "T" + (tabCreationCount++) + "/" + ecfg.file;
		ecfg.model = monaco.editor.createModel(contents, language, monaco.Uri.file(url));
		// Default things to be ini syntax highlighting rather than none
		if (ecfg.model.getModeId() === "plaintext" && ! language) {
			monaco.editor.setModelLanguage(ecfg.model, "ini");
		}
		var options = $.extend({}, preferences, {
			automaticLayout: true,
			model: ecfg.model,
			lineNumbersMinChars: 3,
			ariaLabel: ecfg.file,
			//readOnly: ! ecfg.canBeSaved,
			glyphMargin: true,
			hover: { delay: 700 }
		});
		ecfg.editor = monaco.editor.create(ecfg.container[0], options);
		ecfg.server_content = ecfg.editor.getValue();

		// check if we need to scroll to a particular location and highlight a line
		if (doLineHighlight !== "") {
			var line_nums = doLineHighlight.split(",");
			//console.log(doLineHighlight, line_nums);
			if (line_nums.length > 1) {
				ecfg.editor.setSelection(new monaco.Selection(Number(line_nums[0]),1,(Number(line_nums[1]) + 1),1));
				ecfg.editor.revealLineInCenter(Number(line_nums[0]), 0);
				ecfg.editor.focus();
			}
			doLineHighlight = "";
		}

		if (ecfg.canBeSaved) {
			ecfg.editor.onDidChangeModelContent(function() {
				// check against saved copy
				if (ecfg.editor.getValue() !== ecfg.server_content) {
					if (!ecfg.hasChanges) {
						ecfg.tab.append("<i class='ce_right_icon ce_clickable_icon icon-alert-circle'></i>");
						ecfg.hasChanges = true;
					}
				} else {
					if (ecfg.hasChanges) {
						ecfg.tab.find('.icon-alert-circle').remove();
						ecfg.hasChanges = false;
					}
				}
				// Turn off the glyphs until next save
				ecfg.decorations = ecfg.editor.deltaDecorations(ecfg.decorations, []);
			});
		}
		ecfg.editor.addAction({
			id: 'prev-tab',
			label: 'Switch tab to left of current',
			keybindings: [monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.LeftArrow],
			run: function() {
				if (editors.length > 1) {
					activateTab((activeTab === 0) ? editors.length - 1 : activeTab - 1);
				}
				return null;
			}
		});
		ecfg.editor.addAction({
			id: 'next-tab',
			label: 'Switch tab to right of current',
			keybindings: [monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.RightArrow],
			run: function() {
				if (editors.length > 1) {
					activateTab((activeTab === editors.length - 1) ? 0 : activeTab + 1);
				}
				return null;
			}
		});
		ecfg.editor.addAction({
			id: 'last-used-tab',
			label: 'Switch tab to last active',
			keybindings: [monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.UpArrow],
			run: function() {
				var last_used_idx, 
					newest;
				if (editors.length > 1) {
					for (var i = 0; i < editors.length; i++){
						if (activeTab !== i) {
							if (! newest || newest < editors[i].last_opened) {
								newest = editors[i].last_opened;
								last_used_idx = i;
							}
						}
					}
					activateTab(last_used_idx);
				}
				return null;
			}
		});
		ecfg.editor.addAction({
			id: 'close-tab',
			label: 'Close tab',
			keybindings: [monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KEY_W],
			run: function() {
				closeTabByCfg(ecfg);
				return null;
			}
		});
		if (ecfg.canBeSaved) {
			ecfg.editor.addAction({
				id: 'save-file',
				contextMenuOrder: 0.1,
				contextMenuGroupId: 'navigation',
				label: 'Save file',
				run: function() {
					saveActiveTab();
				}
			});
			ecfg.editor.addAction({
				id: 'save-file-action',
				contextMenuOrder: 1,
				contextMenuGroupId: '99_prefs',
				label: 'Set post-save action',
				run: function() {
					setPostSaveAction();
				}
			});
			ecfg.editor.addAction({
				id: 'link-to-highlight',
				contextMenuOrder: 3,
				contextMenuGroupId: '99_prefs',
				label: 'Create link to line/selection',
				run: function() {
					var editor_selection = ecfg.editor.getSelection();
					var hashparts = window.location.href.replace(/#.*/,"") + "#0|" + inFolder + "|" + ecfg.type + "|" + ecfg.file + "@" + editor_selection.startLineNumber + "," + editor_selection.endLineNumber;
					console.log(hashparts);
					copyTextToClipboard(hashparts);
				}
			});
		}
		ecfg.editor.addAction({
			id: 'open-prefs-action',
			contextMenuOrder: 2,
			contextMenuGroupId: '99_prefs',
			label: 'Preferences',
			run: function() {
				openPreferences();
			}
		});
		for (var j = 0; j < hooksActive.length; j++) {
			var hook = hooksActive[j];
			addHookActionToEditor(hook, ecfg);
		}
		if (ecfg.type === "read") {
			ecfg.editor.addAction({
				id: 'reload',
				contextMenuOrder: 0.2,
				contextMenuGroupId: 'navigation',
				label: 'Reload from disk',
				run: function() {
					closeTabByCfg(ecfg);
					hooksCfg[ecfg.type](ecfg.file, ecfg.fromFolder);
				}
			});
		}
		// Add a right-click option 
		if (tabCfg[ecfg.type].can_rerun) {
			ecfg.editor.addAction({
				id: 'rerun',
				contextMenuOrder: 0.1,
				contextMenuGroupId: 'navigation',
				label: 'Rerun',
				run: function() {
					closeTabByCfg(ecfg);
					hooksCfg[ecfg.type](ecfg.file, ecfg.fromFolder);
				}
			});
		}
		openTabsListChanged();
		ecfg.tab.trigger("ce_loaded");
	}
	
	function saveActiveTab(cb){
		if (activeTab === null || activeTab === -1) {
			return;
		}
		var ecfg = editors[activeTab];
		if (ecfg.canBeSaved) {
			if (! ecfg.saving) {
				var saved_value = ecfg.editor.getValue();
				ecfg.saving = true;
				ecfg.tab.append("<i class='ce_right_icon ce_right_two ce_tab_saving_icon icon-two-arrows-cycle' title='Saving...'></i>");
				serverAction({action: 'save', path: ecfg.file, file: saved_value}).then(function(){
					// After file has been saved, delete its filemod time and get a new filemod time
					delete ecfg.filemod;
					// remove unsaved changes icon from tab
					ecfg.tab.find('.ce_modified_on_disk').remove();
					clearTimeout(fileModsCheckTimer);
					fileModsCheckTimer = setTimeout(function(){ checkFileMods(); }, 100);
					
					ecfg.saving = false;
					ecfg.tab.find('.ce_tab_saving_icon').remove();
					showToast('Saved');
					ecfg.server_content = saved_value;
					ecfg.tab.find('.icon-alert-circle').remove();
					ecfg.hasChanges = false;	
					highlightBadConfig(ecfg);
					if (ecfg.file === "") {
						loadPermissionsAndConfList();
					}
					if (cb) {
						cb();
					}
					// Run any post-save hook
					var p = getPostSave(ecfg.file);
					if (p !== null) {
						if (p[0] === "run" && ! approvedPostSaveHooks.hasOwnProperty(p[0] + "|" + p[1])) {
							showModal({
								title: "Confirm post-save action ",
								body: "<div>The following action is configured to run after every save:<br><br><code>" + htmlEncode(p[0]) + ":" + htmlEncode(p[1]) + "</code></div>",
								size: 500,
								actions: [{
									onClick: function(){
										$(".modal").modal('hide');
										approvedPostSaveHooks[p[0] + "|" + p[1]] = true;
										runPostSaveAction(p);
									},
									cssClass: 'btn-primary',
									label: "Approve"
								},{
									onClick: function(){ $(".modal").modal('hide'); },
									label: "Cancel"
								}]
							});
						} else {
							runPostSaveAction(p);
						}
					}
				}, function(){
					ecfg.saving = false;
					ecfg.tab.find('.ce_tab_saving_icon').remove();
				});
			}
			return null;
		} else {
			showModal({
				title: "Warning",
				body: "<div class='alert alert-warning'><i class='icon-alert'></i>This file cannot be saved</div>",
				size: 300
			});	
		}
	}

	function runPostSaveAction(parts) {
		var ptab = activeTab;
		closeTabByHookDetails(parts[0], parts[1]);
		hooksCfg[parts[0]](parts[1]);
		var ntab = activeTab;
		// quickly swap back to prev tab
		if (parts[2] === "yes") {
			activateTab(ptab);
		}
		if (parts[3] || parts[4]) {
			// Check the contents of the tab
			editors[ntab].tab.on("ce_loaded", function(){
				// Get the contents, update the tab
				var contents = editors[ntab].editor.getValue();
				var status = "";
				// Good match
				if (parts[3]){
					if (contents.indexOf(parts[3]) > -1) {
						status = "good";
					} else {
						status = "bad";
					}
				}
				// Bad match
				if (parts[4]){
					if (contents.indexOf(parts[4]) > -1) {
						status = "bad";
					} else if (status !== "bad") {
						status = "good";
					}
				}
				if (status === "good"){
					editors[ntab].tab.append("<i class='ce_right_icon ce_clickable_icon icon-check' style='color:green'></i>");
				} else if (status === "bad") {
					editors[ntab].tab.append("<i class='ce_right_icon ce_clickable_icon icon-x-circle' style='color:red'></i>");
				}
			});
		}
	}

	function updateTabHTML(ecfg, contents) {
		ecfg.container.html(contents).css("overflow", "auto");
		ecfg.tab.trigger("ce_loaded");
	}

	function updateTabAsDiffer(ecfg, left, right) {
		var originalModel = monaco.editor.createModel(left);
		var modifiedModel = monaco.editor.createModel(right);
		ecfg.container.empty();
		ecfg.editor = monaco.editor.createDiffEditor(ecfg.container[0],{
			automaticLayout: true,
		});
		ecfg.editor.setModel({
			original: originalModel,
			modified: modifiedModel
		});
		ecfg.tab.trigger("ce_loaded");
	}
	
	// Make sure the server action that results in a tab open, takes a minimum amount of time so as not to flicker and look dumb
	function serverActionWithoutFlicker(postData) {
		var promise = serverAction(postData);
		var promiseTimeout = new Promise(function(resolve) {
			setTimeout(resolve, 800);
		});
		var promiseCombined = Promise.all([promise, promiseTimeout]);
		return promiseCombined.then(function(values) {
			return values[0];
		});
	}

	// Make a rest call to our backend python script
	function serverAction(postData) {
		return new Promise(function(resolve, reject) {
			inFlightRequests++;
			$('.ce_saving_icon').removeClass('ce_hidden');
			console.log(postData);
			service.post('/services/config_explorer', postData, function(err, r) {
				inFlightRequests--;
				if (inFlightRequests === 0) {
					$('.ce_saving_icon').addClass('ce_hidden');
				}
				var errText = '';
				//console.log(err, r);
				if (err) {
					if (err.data.hasOwnProperty('messages')) {
						errText = "<pre>" + htmlEncode(err.data.messages["0"].text) + "</pre>";
					} else {
						errText = "<pre>" + htmlEncode(JSON.stringify(err)) + "</pre>";
					}
				} else {
					if (! r.data) {
						errText = "<pre>Error communicating with Splunk</pre>";

					} else if (! (r.data.hasOwnProperty('result') || r.data.hasOwnProperty('reason'))) {
						errText = "<pre>" + htmlEncode(r.data) + "</pre>";

					} else if (r.data.reason === "missing_perm_read") {
						errText = "<p>To use this application you must be have the capability \"<strong>admin_all_objects</strong>\" via a <a href='/manager/config_explorer/authorization/roles'>role</a>.</p>";

					} else if (r.data.reason === "missing_perm_run") {
						errText = "<p>You must enable the <code>run_commands</code> setting</p>";

					} else if (r.data.reason === "missing_perm_write") {
						errText = "<p>You must enable the <code>write_access</code> setting</p>";

					} else if (r.data.reason === "config_locked") {
						errText = "<p>Unable to write to the settings file becuase it is locked and must be edited externally: <code>etc/apps/config_explorer/local/config_explorer.conf</code></p>";

					} else if (r.data.reason === "binary_file") {
						errText = "<p>Unable to open binary file (right-click and 'download' file instead)</p>";

					} else if (r.data.reason !== "") {
						errText = "<pre>" + htmlEncode(r.data.reason) + "</pre>";
					}
				}
				if (errText) {
					// dont show the error for background requests such as filemods
					if (postData.action !== "filemods") {
						showModal({
							title: "Error",
							body: "<div class='alert alert-error'><i class='icon-alert'></i>An error occurred!<br><br>" + postData.action + ": " + (postData.hasOwnProperty("path") ? postData.path : "") + "<br><br><br>" + errText + "</pre></div>",
						});
					}
					reject(Error("error"));
				} else {
					// if there was some unexpected git output, then open a window to display it
					if (r.data.git && r.data.git_status !== -1) {
						var git_autocommit_show_output = "auto";
						if (conf.hasOwnProperty("git_autocommit_show_output")) {
							git_autocommit_show_output = conf['git_autocommit_show_output'].toLowerCase();
						}
						if (git_autocommit_show_output === "true" || (git_autocommit_show_output === "auto" && r.data.git_status > 0)) {
							var git_output = "<h2>";
							if (git_autocommit_show_output === "auto") {
								git_output = "Warning: Unexpected return code when attempting to autocommit changes to version control. ";
							}
							git_output = "Git output is below:</h2>";
							for (var j = 0; j < r.data.git.length; j++) {
								git_output += "<div class='ce_gitoutput-" + r.data.git[j].type + "'>" + htmlEncode($.trim(r.data.git[j].content)) + "</div>";
							}
							var ecfg = createTab('git', '', 'git output');
							updateTabHTML(ecfg, "<div class='ce_gitoutput'>" + git_output + "</div>");
						}
					}
					resolve(r.data.result);	
				}
			});
		});
	}

	// Try to build a conf file from calling the rest services. turns out this is pretty unreliable.
	function formatLikeRunningConfig(contents) {
		return contents.replace(/^.+?splunk[\/\\]etc[\/\\].*?\.conf\s+(?:(.+) = (.*)|(\[.+))\r?\n/img,function(all, g1, g2, g3){
			if (g3 !== undefined) { return g3 + "\n"; }
			if (g2.toLowerCase() == "true") { return g1 + " = 1\n";}
			if (g2.toLowerCase() == "false") { return g1 + " = 0\n";}
			return g1 + " = " + g2 + "\n";
		});
	}

	function adjustBtoolPaths(contents, inPath, outPath) {
		return contents.replace(new RegExp(regexEscape(inPath) + "[\\/\\\\]apps[\\/\\\\]", 'g'), outPath);
	}

	// Formats the output of "btool list" depending on what checkboxes are selected in the left pane
	function formatBtoolList(contents, type) {
		var indent = 80;
		return contents.replace(/\\/g,'/').replace(/^.+?splunk[\/]etc[\/](.*?\.conf)\s+(.+)(\r?\n)/img,function(all, g1, g2, g3){
			var path = '';
			// I am pretty sure that stanzas cant be set to default when containing a child that isnt
			if (type === "btool-hidesystemdefaults" && /system[\/\\]default[\/\\]/.test(g1)) {
				return '';
			}
			if (type === "btool-hidedefaults" && /[\/\\]default[\/\\]/.test(g1)) {
				return '';
			}
			if (type !== "btool-hidepaths") {
				path = (" ".repeat(Math.max(1, (indent - g2.length)))) + "  " + g1;
			}
			return g2 + path + g3;
		});
	}

	function addGutter(newdecorations, i, className, message) {
		newdecorations.push({ range: new monaco.Range((1+i),1,(1+i),1), options: { isWholeLine: true, glyphMarginClassName: className, glyphMarginHoverMessage: [{value: message }]  }});
	}

	function regexEscape(s) {
		return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
	}


	// After loading a .conf file or after saving and before any changes are made, red or green colour will
	// be shown in the gutter about if the current line can be found in the output of btool list.
	function highlightBadConfig(ecfg){
//console.log("enter", confIsTrue('conf_validate_on_save', true), ecfg.hasOwnProperty('matchedConf'));
		if (! confIsTrue('conf_validate_on_save', true)) {
			return;
		}
		if (! ecfg.hasOwnProperty('matchedConf')) {
			return;
		}
		var run_path = "";
		var run_path_parts = ecfg.file.split(/[\/\\]/);
		if (run_path_parts[0] === ".") {
			run_path_parts.shift();
		}
		if (run_path_parts.length > 1) {
			run_path = run_path_parts[1];
		}
		// console.log("runpath is ",run_path);
		// possible locations you can run btool: etc/master-apps, etc/slave-apps, etc/apps, etc/system/local, etc/user, etc/shcluster/apps
//console.log(run_path, conf.btool_dir_for_master_apps);
		// can also run btool on slave-apps, but who has config explorer installed on an indexer anyway?
		if (run_path === "apps" || run_path === "system") {
			serverAction({action: 'btool-list', path: ecfg.matchedConf}).then(function(btoolcontents){
				highlightBadConfigContinue(ecfg, btoolcontents, run_path);
			});

		} else if (run_path === "deployment-apps" && conf.btool_dir_for_deployment_apps) {
			serverAction({action: 'btool-list', path: ecfg.matchedConf, param1: conf.btool_dir_for_deployment_apps}).then(function(btoolcontents){
				if (btoolcontents) {
					// nix only paths. this feature wont work with win becuase you cant symlink
					var btoolcontents2 = adjustBtoolPaths(btoolcontents, conf.btool_dir_for_deployment_apps, "/splunk/etc/deployment-apps/");
					if (btoolcontents2 !== btoolcontents) {
						highlightBadConfigContinue(ecfg, btoolcontents2, run_path);
						return;
					}
				}
				highlightBadConfigContinue(ecfg, "", run_path);
			});

		} else if (run_path === "master-apps" && conf.btool_dir_for_master_apps) {
			serverAction({action: 'btool-list', path: ecfg.matchedConf, param1: conf.btool_dir_for_master_apps}).then(function(btoolcontents){
				if (btoolcontents) {
					var btoolcontents2 = adjustBtoolPaths(btoolcontents, conf.btool_dir_for_master_apps, "/splunk/etc/master-apps/");
					// if the replace did nothing, then the btool gutters are probably going to be all wrong anyway
					if (btoolcontents2 !== btoolcontents) {
						highlightBadConfigContinue(ecfg, btoolcontents2, run_path);
						return;
					}
				}
				highlightBadConfigContinue(ecfg, "", run_path);
			});

		} else if (run_path === "shcluster" && conf.btool_dir_for_shcluster_apps) {
			serverAction({action: 'btool-list', path: ecfg.matchedConf, param1: conf.btool_dir_for_shcluster_apps}).then(function(btoolcontents){
				//console.log("btoolcontents",btoolcontents);
				highlightBadConfigContinue(ecfg, btoolcontents, run_path);
			});

		} else {
			highlightBadConfigContinue(ecfg, "", run_path);
		}
	}

	function highlightBadConfigContinue(ecfg, btoolcontents, run_path){
		var rexSplunkHome = /^(.+?)[\\\/]etc[\\\/]/;
		var foundSplunkHome;
		var lookup = {};
		var splunk_home = "";
		var seenStanzas = {};
		var seenProps =  {};
		var normalBtoolChecks = true;
		var masterappsPropsTransformsChecks = false;
		var masterappsPropsSourcetypeChecks = false;
		var allConfigsAreUnnecisary = false;

		// There is some special logic if we are in the master-apps directory
		if (run_path === "master-apps") {
			if (conf.hasOwnProperty("_master_apps_gutter_useful_props_and_transforms") && (ecfg.matchedConf === "props" || ecfg.matchedConf === "transforms")) {
				// will check for master_apps_gutter_useful_props_and_transforms
				masterappsPropsTransformsChecks = true;
			}
			// split the master_apps_allowed_config  by commas, then split each by full colon. ecfg.matchedConf
			if (conf.hasOwnProperty("_master_apps_gutter_used_sourcetypes") && ecfg.matchedConf === "props") {
				// will check for master_apps_gutter_useful_props_and_transforms
				masterappsPropsSourcetypeChecks = true;
			}
			if (conf.hasOwnProperty("_master_apps_gutter_unnecissary_config_files") && conf._master_apps_gutter_unnecissary_config_files.test(ecfg.matchedConf)) {
				allConfigsAreUnnecisary = true;
			}
		}

		if (! $.trim(btoolcontents)) {
			console.log("no btool contents for ", ecfg.matchedConf);
			normalBtoolChecks = false;
		}

		if (normalBtoolChecks) {
			btoolcontents = btoolcontents.replace(/\\/g,'/');
			// Build lookup of btool output
			lookup = buildBadCodeLookup(btoolcontents);
			if (debug_gutters) {
				console.log("Btool:", lookup);
				if (ecfg.hasOwnProperty('hinting')) {
					console.log("Spec:", ecfg.hinting);
				}
			}
			// try to figure out the SPLUNK_HOME value
			// Its common that in inputs.conf, some stanzas are defined with $SPLUNK_HOME which btool always expands
			foundSplunkHome = btoolcontents.match(rexSplunkHome);
			splunk_home = "";
			if (foundSplunkHome && foundSplunkHome.length == 2) {
				splunk_home = foundSplunkHome[1];
			}
		}

		// Go through everyline of the editor
		var contents = ecfg.editor.getValue(),
			rows = contents.split(/\r?\n/),
			currentStanza = "",
			currentStanzaTrimmed = "",
			// This regex is complex becuase sometimes properties have a unique string on the end of them 
			// e.g "EVAL-src = whatever"
			// found[1] will be "EVAL-src"
			// found[2] will be "EVAL"
			reProps = /^\s*((\w+)[^=\s]*)\s*=/,
			newdecorations = [],
			currentStanzaAsExpectedInBtool,
			extraProp,
			extraStanz;
		for (var i = 0; i < rows.length; i++) {
			if (rows[i].substr(0,1) === "[") {
				if (rows[i].substr(0,9) === "[default]") {
					currentStanza = "";
				} else {
					currentStanza = $.trim(rows[i]);
				}
				currentStanzaTrimmed = currentStanza.replace(/^(\[\w+).*$/,"$1");
				// Stanzas that have $SPLUNK_HOME in them will be expanded by btool (stanzas in inputs.conf often have $SPLUNK_HOME in them)
				currentStanzaAsExpectedInBtool = currentStanza.replace(/\$SPLUNK_HOME/i, splunk_home);
				// Stanzas with windows path seperators are converted to unix seperators by btool
				currentStanzaAsExpectedInBtool = currentStanzaAsExpectedInBtool.replace(/\\/g, '/');
				// Stanzas that use relative paths, will be expanded by btool. (e.g. inputs.conf [script://./bin/go.sh] from current script location)
				currentStanzaAsExpectedInBtool = currentStanzaAsExpectedInBtool.replace(/\/\/\.\//, "//" + splunk_home + ecfg.file.substr(1).replace(/[^\/\\]*\/[^\/\\]*$/,''));
				
				if (seenStanzas.hasOwnProperty(currentStanza)) {
					addGutter(newdecorations, i, 'ceOrangeLine', "Duplicate Stanza in this file");
				} else if (masterappsPropsSourcetypeChecks) {
					// This does does not work with source:: or host:: stanzas, or those that look like they might be a regular expression (not perfect)
					if (! conf._master_apps_gutter_used_sourcetypes.test(currentStanza) && currentStanza.substr(0,9) !== "[source::" && currentStanza.substr(0,7) !== "[host::" && currentStanza.substr(0,2) !== "[(") {
						addGutter(newdecorations, i, 'ceBlueLine', "This stanza \"" + currentStanza + "\" does not match a sourcetype in master_apps_gutter_used_sourcetypes (which is " + conf._master_apps_gutter_used_sourcetypes_date + " days old)");
					}
				} else if (allConfigsAreUnnecisary) {
					addGutter(newdecorations, i, 'ceBlueLine', "In most environments, the properties in this file are not needed on indexers.");
				}
				seenStanzas[currentStanza] = 1;
				seenProps = {};
			} else {
				var found = rows[i].match(reProps);
				if (found) {
					if (found[1].substr(0,1) !== "#") {
						var g_sev = 2;
						var g_messages = [];
						var prop = found[1];
						// Check for duplicated key in stanza
						if (seenProps.hasOwnProperty(found[1])) {
							//addGutter(newdecorations, i, 'ceOrangeLine', "Duplicate key in stanza");
							g_sev = Math.max(g_sev, 5);
							g_messages.push("Duplicate key in stanza");
						} else {
							seenProps[found[1]] = 1;

							if (normalBtoolChecks) {
								// Look if stanza/property exists in btool
								if (! lookup.hasOwnProperty(currentStanzaAsExpectedInBtool)){
									//addGutter(newdecorations, i, 'ceRedLine', "Not found in \"btool\" output (btool does not list the stanza \"" + currentStanzaAsExpectedInBtool +"\")");
									g_sev = Math.max(g_sev, 6);
									g_messages.push("Not found in \"btool\" output (btool does not list the stanza " + currentStanzaAsExpectedInBtool +")");

								} else if (! lookup[currentStanzaAsExpectedInBtool].hasOwnProperty(found[1])){
									// [default] is a special case and is reflected through all other stanzas in the file
									if (currentStanzaAsExpectedInBtool !== "") {
										//addGutter(newdecorations, i, 'ceRedLine', "Not found in \"btool\" output (btool with stanza [" + currentStanzaAsExpectedInBtool +"] does not have property \"" + found[1] + "\")");
										g_sev = Math.max(g_sev, 6);
										g_messages.push("Not found in \"btool\" output (could not find property in stanza " + currentStanzaAsExpectedInBtool +"");
									}
									
								} else if (lookup[currentStanzaAsExpectedInBtool][found[1]] !== ecfg.file && lookup[currentStanzaAsExpectedInBtool][found[1]].substr(2) !== ecfg.file) {
									//addGutter(newdecorations, i, 'ceRedLine', "Not found in \"btool\" output (set in :" + lookup[currentStanzaAsExpectedInBtool][found[1]] + ")");
									g_sev = Math.max(g_sev, 6);
									g_messages.push("Not found in \"btool\" output (set in :" + lookup[currentStanzaAsExpectedInBtool][found[1]] + " and i am :" + ecfg.file + ")");

								}  else {
									// addGutter(newdecorations, i, 'ceGreeenLine', "Found in \"btool\" output");
									g_messages.push("Found in \"btool\" output");
								}
							}
					
							// If a spec file exists
							if (ecfg.hasOwnProperty('hinting') && found.length > 2) {
								foundSpec = false;
								// Look in the unstanzaed part of the spec
								if (ecfg.hinting[""].hasOwnProperty(found[2])) {
									//addGutter(newdecorations, i, 'ceGreeenLine', "Found in \"btool\" output and spec file. (Stanza=\"\" Property=\"" + found[2] + "\")");
									g_messages.push("Exists in spec file");
									prop = found[2];

								// Look in the stanzaed part of the spec
								} else if (ecfg.hinting.hasOwnProperty(currentStanza) && ecfg.hinting[currentStanza].hasOwnProperty(found[2])) {
									//addGutter(newdecorations, i, 'ceGreeenLine', "Found in \"btool\" output and spec file. (Stanza=\"" + currentStanza + "\" Property=\"" + found[2] + "\")");
									g_messages.push("Exists in spec file (Stanza=" + currentStanza + ")");
									prop = found[2];

								// Look for a trimmed version of the stanza in the spec. e.g. [endpoint:blah_rest] might be in the spec as [endpoint]
								} else if (ecfg.hinting.hasOwnProperty(currentStanzaTrimmed) && ecfg.hinting[currentStanzaTrimmed].hasOwnProperty(found[2])) {
									//addGutter(newdecorations, i, 'ceGreeenLine', "Found in \"btool\" output and spec file. (Stanza=\"" + currentStanzaTrimmed + "\" Property=\"" + found[2] + "\")");
									g_messages.push("Exists in spec file (Stanza=" + currentStanzaTrimmed + ")");
									prop = found[2];

								// Now go through those same three checks, but look for the whole thing. For Example in web.conf found[2] is "tools" where as found[1] is "tools.sessions.timeout"
								} else if (ecfg.hinting[""].hasOwnProperty(found[1])) {
									//addGutter(newdecorations, i, 'ceGreeenLine', "Found in \"btool\" output and spec file. (Stanza=\"\" Property=\"" + found[1] + "\")");
									g_messages.push("Exists in spec file");

								// Look in the stanzaed part of the spec
								} else if (ecfg.hinting.hasOwnProperty(currentStanza) && ecfg.hinting[currentStanza].hasOwnProperty(found[1])) {
									//addGutter(newdecorations, i, 'ceGreeenLine', "Found in \"btool\" output and spec file. (Stanza=\"" + currentStanza + "\" Property=\"" + found[1] + "\")");
									g_messages.push("Exists in spec file (Stanza=" + currentStanza + ")");

								// Look for a trimmed version of the stanza in the spec. e.g. [endpoint:blah_rest] might be in the spec as [endpoint]
								} else if (ecfg.hinting.hasOwnProperty(currentStanzaTrimmed) && ecfg.hinting[currentStanzaTrimmed].hasOwnProperty(found[1])) {
									//addGutter(newdecorations, i, 'ceGreeenLine', "Found in \"btool\" output and spec file. (Stanza=\"" + currentStanzaTrimmed + "\" Property=\"" + found[1] + "\")");
									g_messages.push("Exists in spec file (Stanza=" + currentStanzaTrimmed + ")");

								} else {
									if (found[2] === found[1]) {
										extraProp = "Looked for property ";
									} else {
										extraProp = "Looked for property (or \"" + found[2] + "\" ";
									}
									if (currentStanza === currentStanzaTrimmed) {
										extraStanz = "in stanzas \"\" or " + currentStanza + "";
									} else {
										extraStanz = "in stanzas \"\", " + currentStanza + " and " + currentStanzaTrimmed + "";
									}
									//addGutter(newdecorations, i, 'ceDimGreeenLine', "Found in \"btool\" output, but not found in spec file. "+ extraProp + extraStanz);
									g_sev = Math.max(g_sev, 3);
									g_messages.push("Not found in spec file ("+ extraProp + extraStanz + ")");
								}
							}
							if (masterappsPropsTransformsChecks) {
								if (! conf._master_apps_gutter_useful_props_and_transforms.test(found[2])) {
									g_sev = Math.max(g_sev, 4);
									g_messages.push("In most environments, this property is not needed on indexers (there is no harm in having it there though).");
								}
							}
							if (allConfigsAreUnnecisary) {
								g_sev = Math.max(g_sev, 4);
								g_messages.push("In most environments, the properties in this file are not needed on indexers.");
							}
						}
						// add gutters now
						if (g_messages.length) {
							var g_color = g_sev == 6 ? "ceRedLine" : g_sev == 5 ? "ceOrangeLine" : g_sev == 4 ? "ceBlueLine" : g_sev == 3 ? "ceDimGreeenLine" : "ceGreeenLine";
							addGutter(newdecorations, i, g_color, "`" + prop + "`: " + g_messages.join(". "));
						}
					}
				}
			}
		}
		ecfg.decorations = ecfg.editor.deltaDecorations(ecfg.decorations, newdecorations);
	}
	
	// The bad code lookup builds a structure of the btool list output so it can be quickly referenced to see what config
	// from the current editor is being recognised by btool or not.
	function buildBadCodeLookup(contents){
		//(conf file path)(property)(stanza)
		var rex = /^.+?splunk([\/\\]etc[\/\\].*?\.conf)\s+(?:([^=\s\[]+)\s*=|(\[[^\]]+\]))/gim,
			res,
			currentStanza = "",
			currentField = "",
			ret = {"": {"":""}};
		while(res = rex.exec(contents)) {
			if (res[2]) {
				currentField = res[2];
				ret[currentStanza][currentField] = '.' + res[1]; 
			} else if (res[3]) {
				if (res[3].substr(0,9) === "[default]") {
					currentStanza = "";
				} else {
					currentStanza = res[3];
				}
				currentField = "";
				ret[currentStanza] = {"":""}; // dont care about stanzas and where they come from
			} //else {
				//console.log("unexpected row:", res[0]);
			//}
		}
		return ret;
	}

	// parse the spec file and build a lookup to use for code completion
	function buildHintingLookup(conf, contents){
		// left side is for properties, right size for stanzas
		var rex = /^(?:([\w\.]+).*=|(\[\w+))?.*$/gm,
			res,
			currentStanza = "",
			currentField = "";
		confFiles[conf] = {"": {"":{t:"", c:""}}};
		while(res = rex.exec(contents)) {
			// need this because our rex can match a zero length string
			if (res.index == rex.lastIndex) {
				rex.lastIndex++;
			}
			if (res[1] || res[2]) {
				if (res[1]) {
					currentField = res[1];
					confFiles[conf][currentStanza][currentField] = {t:"", c:""};
				} else {
					if (res[2].substr(0,9) === "[default]") {
						currentStanza = "";
					} else {
						currentStanza = res[2];
					}
					currentField = "";
					if (! confFiles[conf].hasOwnProperty(currentStanza)) {
						confFiles[conf][currentStanza] = {"":{t:"", c:""}};
					}
				}
				confFiles[conf][currentStanza][currentField].t = res[0];
			} else {
				confFiles[conf][currentStanza][currentField].c += res[0] + "\n";
			}
		}	
		return confFiles[conf];
	}

	// When hovering lines in a .conf file, Monaco will lookup the current property in the README/*.conf.spec files. 
	// Becuase the README/*.conf.spec files are not perfect, neither is this documentation!
	monaco.languages.registerHoverProvider('ini', {
		provideHover: function(model, position, token) {
			return new Promise(function(resolve, reject) {
				// do somthing
				if (editors[activeTab].hasOwnProperty('hinting')) {
					// get all text up to hovered line becuase we need to find what stanza we are in
					var contents = model.getValueInRange(new monaco.Range(1, 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber))),
						rex = /^(?:([\w\.]+)|(\[\w+))?.*$/gm,
						currentStanza = "",
						currentField = "",
						hintdata,
						res;
					while(res = rex.exec(contents)) {
						// need this because our rex can match a zero length string
						if (res.index == rex.lastIndex) {
							rex.lastIndex++;
						}
						if (res[1]) {
							currentField = res[1];
						} else if (res[2]) {
							if (res[2].substr(0,9) === "[default]") {
								currentStanza = "";
							} else {
								currentStanza = res[2];
							}
							currentField = "";
						}
					}
					if (editors[activeTab].hinting.hasOwnProperty(currentStanza) && editors[activeTab].hinting[currentStanza].hasOwnProperty(currentField)) {
						hintdata = editors[activeTab].hinting[currentStanza][currentField];

					} else if (editors[activeTab].hinting[""].hasOwnProperty(currentField)) {
						hintdata = editors[activeTab].hinting[""][currentField];

					} else {
						resolve();
						return;
					}
					resolve({
						// This is what will be highlighted
						range: new monaco.Range(position.lineNumber, 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber)),
						contents: [
							{ value: '**' + hintdata.t + '**' },
							{ value: '\n' + hintdata.c.replace(/^#/mg,'') + '\n' }
						]
					});
				} else {
					resolve();
				}
			});
		}
	});

	// When hitting CTRL-SPACE in .conf files, monaco will suggest all valid keys - with doco!
	// Becuase the README/*.conf.spec files are not perfect, neither is this hinting!
	monaco.languages.registerCompletionItemProvider('ini', {
		provideCompletionItems: function(model, position) {
			if (editors[activeTab].hasOwnProperty('hinting')) {
				// get all text up to hovered line becuase we need to find what stanza we are in
				var contents = model.getValueInRange(new monaco.Range(1, 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber))),
					ret = [],
					rex = /[\s\S]*\n\s*(\[\w+)/,
					currentStanza = "",
					found = contents.match(rex);
				if (found && editors[activeTab].hinting.hasOwnProperty(found[1])) {
					if (found[1].substr(0,9) === "[default]") {
						currentStanza = "";
					} else {
						currentStanza = found[1];
					}		
				}				
				for (var key in editors[activeTab].hinting[currentStanza]) {
					if (editors[activeTab].hinting[currentStanza].hasOwnProperty(key) && key) {
						ret.push({
							label: key,
							insertText: key + " = ",
							kind: monaco.languages.CompletionItemKind.Property,
							documentation: "" + editors[activeTab].hinting[currentStanza][key].t + "\n\n" + editors[activeTab].hinting[currentStanza][key].c + "\n",
						});
					}
				}
				return { suggestions: ret };
			}
			return { suggestions: [] };
		}
	});

	// Register a new simple language for prettying up git diffs
	monaco.languages.register({ id: 'git-diff' });
	monaco.languages.setMonarchTokensProvider('git-diff', {
		tokenizer: {
			root: [
				[/^\+[^\n]+/, "comment"], // additions
				[/^\-[^\n]+/, "metatag"], // deletions
				[/^(?:commit|Author|Date)[^\n]+/, "strong"], // important messages 
				[/@@.+?@@/, "constant"],   // line number
				[/^\s[^\n]+/, "delimiter.xml"], // other lines
			]
		}
	});

	// Register a new simple language for prettying up git log
	monaco.languages.register({ id: 'git-log' });
	monaco.languages.setMonarchTokensProvider('git-log', {
		tokenizer: {
			root: [
				[/^commit[^\n]+/, "constant"], // additions
				[/(?:\++(?=[\-\s]*$)|\(\+\))/, "comment"], // plus (?:\++(?=[\-\s]*$)|(?<=\()\+(?=\)))
				[/(?:(\-+)\s*$|\(\-\))/, "metatag"], // minus (?:(\-+)\s*$|(?<=\()\-(?=\)))
			]
		}
	});
    // dubious
	function dodgyBasename(f) {
		return f.replace(/.*[\/\\]/,'');
	}

	function dodgyDirname(f) {
		return f.replace(/[^\/\\]*$/,'');
	}

	//create a in-memory div, set it's inner text(which jQuery automatically encodes)
	//then grab the encoded contents back out.  The div never exists on the page.
	function htmlEncode(value){
		return $('<div/>').text(value).html();
	}

	function escapeRegExp(str) {
		return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
	}

	function confIsTrue(param, defaultValue) {
		if (!conf.hasOwnProperty(param)) {
			return defaultValue;
		}
		return isTrueValue(conf[param]);
	}

	function isTrueValue(param) {
		return (["1", "true", "yes", "t", "y"].indexOf($.trim(param.toLowerCase())) > -1);
	}

	function copyTextToClipboard(text) {
		if (!navigator.clipboard) {
			fallbackCopyTextToClipboard(text);
		} else {
			navigator.clipboard.writeText(text).then(function() {
				showToast('Copied to clipboard!');
			}, function (err) {
				console.error('Async: Could not copy to clipboard.', err);
			});
		}
	}

	function fallbackCopyTextToClipboard(text) {
		var textArea = document.createElement("textarea");
		textArea.value = text;
		document.body.appendChild(textArea);
		textArea.focus();
		textArea.select();
		try {
			var successful = document.execCommand('copy');
			if (successful) {
				showToast('Copied to clipboard!');
			} else {
				console.error('Fallback2: Could not copy to clipboard.', err);
			}
		} catch (err) {
			console.error('Fallback: Could not copy to clipboard.', err);
		}
		document.body.removeChild(textArea);
	}
	
	function showToast(message) {
		var t = $('.ce_toaster');
		t.find('span').text(message);
		t.addClass('ce_show');
		setTimeout(function(){
			t.removeClass('ce_show');
		},3000);
	}

	var showModal = function self(o) {
		var options = $.extend({
				title : '',
				body : '',
				remote : false,
				backdrop : true,
				size : 500,
				onShow : false,
				onHide : false,
				actions : false
			}, o);
		self.onShow = typeof options.onShow == 'function' ? options.onShow : function () {};
		self.onHide = typeof options.onHide == 'function' ? options.onHide : function () {};
		if (self.$modal === undefined) {
			self.$modal = $('<div class="modal fade"><div class="modal-dialog"><div class="modal-content"></div></div></div>').appendTo('body');
			self.$modal.on('shown.bs.modal', function (e) {
				self.onShow.call(this, e);
			});
			self.$modal.on('hidden.bs.modal', function (e) {
				self.onHide.call(this, e);
			});
		}
		self.$modal.css({'width': options.size + "px", 'margin-left': -1 * (options.size / 2) + "px"});
		self.$modal.data('bs.modal', false);
		self.$modal.find('.modal-dialog').removeClass().addClass('modal-dialog ');
		self.$modal.find('.modal-content').html('<div class="modal-header"><button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button><h4 class="modal-title">${title}</h4></div><div class="modal-body">${body}</div><div class="modal-footer"></div>'.replace('${title}', options.title).replace('${body}', options.body));

		var footer = self.$modal.find('.modal-footer');
		if (Object.prototype.toString.call(options.actions) == "[object Array]") {
			for (var i = 0, l = options.actions.length; i < l; i++) {
				options.actions[i].onClick = typeof options.actions[i].onClick == 'function' ? options.actions[i].onClick : function () {};
				$('<button type="button" class="btn ' + (options.actions[i].cssClass || '') + '">' + (options.actions[i].label || '{Label Missing!}') + '</button>').appendTo(footer).on('click', options.actions[i].onClick);
			}
		} else {
			$('<button type="button" class="btn btn-primary" data-dismiss="modal">Close</button>').appendTo(footer);
		}
		self.$modal.modal(options);
	};

	// "vs" | "vs-dark" (default) | "hc-black"
	function setThemeMode(mode){
		// Remove existing theme class from parent
		$dashboard_body.removeClass(function (index, className) {
			return (className.match (/(^|\s)ce_theme_\S+/g) || []).join(' ');
		});
		$dashboard_body.addClass("ce_theme_" + mode);
		// Set theme for editors
		monaco.editor.setTheme(mode);
		// save to local storage
		localStorage.setItem('ce_theme', mode);
	};

	function checkFileMods() {
		var files = {};
		var problems = [];
		var hasFiles = false;
		// check if change detection is disabled
		if (!confIsTrue('detect_changed_files', true)) {
			return;
		}
		clearTimeout(fileModsCheckTimer);
		fileModsCheckTimer = setTimeout(checkFileMods, fileModsCheckTimerPeriod);
		for (var j = 0; j < editors.length; j++){
			if (editors[j].type === "read") {
				files[editors[j].file] = 0;
				hasFiles = true;
			}
		}
		if (hasFiles && ! fileModsCheckTimerInProgress) {
			fileModsCheckTimerInProgress = true;
			serverAction({action: 'filemods', paths: JSON.stringify(files)}).then(function(filemods) {
				fileModsCheckTimerInProgress = false;
				var editorMap = {};
				for (var i = 0; i < editors.length; i++) {
					if (editors[i].type === "read") {
						editorMap[editors[i].file] = editors[i];
					}
				}
				for (var file in files) {
					if (files.hasOwnProperty(file)) {
						if (filemods.hasOwnProperty(file)) {
							if (filemods[file] === "") {
								// file was deleted
								if (editorMap[file].tab.find(".ce_modified_on_disk").length === 0) {
									problems.push("Deleted: <code>" + htmlEncode(file) + "</code>");
									editorMap[file].tab.append("<i class='ce_modified_on_disk ce_right_icon ce_right_two ce_clickable_icon icon-alert' style='color:orange' title='File might have been deleted or moved since it was opened. Either save or attempt to reload from disk.'></i>");
								}
							} else if (! editorMap[file].hasOwnProperty("filemod")) {
								// first time we have checked filemod on this file. so store the response
								editorMap[file].filemod = filemods[file];
							} else if (filemods[file] > editorMap[file].filemod + 10) { // add a buffer of 10 seconds
								// file has updated behind the scenes
								if (editorMap[file].tab.find(".ce_modified_on_disk").length === 0) {
									problems.push("Changed: <code>" + htmlEncode(file) + "</code>");
									editorMap[file].tab.append("<i class='ce_modified_on_disk ce_right_icon ce_right_two ce_clickable_icon icon-alert' style='color:orange' title='File might have changed on disk since it was opened. Either save or reload from disk.'></i>");
								}
							}
						}
					}
				}
				if (problems.length) {
					showModal({
						title: "Warning",
						body: "<div class='alert alert-warning'><i class='icon-alert'></i>Warning: An open file has unexpectedly changed on disk. Either save or reload from disk.<br><br>" + problems.join("<br>") + "</div>",
						size: 600
					});
				}
			}).catch(function(){
				fileModsCheckTimerInProgress = false;
			});
		}
	};

	// Build the list of config files, 
	// This function is also called after settings are changed.
	function loadPermissionsAndConfList(){
		return serverAction({action:'init'}).then(function(data) {
			var rex = /^Checking: .*[\/\\]([^\/\\]+?).conf\s*$/gmi,
				res;
			conf = data.conf.global;
			if (! conf.hasOwnProperty('git_autocommit_work_tree')) {
				conf.git_autocommit_work_tree = "";
			} else {
				conf.git_autocommit_work_tree = $.trim(conf.git_autocommit_work_tree);
			}
			$dashboard_body.addClass('ce_no_write_access ce_no_run_access ce_no_settings_access ce_no_git_access ');
			if (confIsTrue('write_access', false)) {
				$dashboard_body.removeClass('ce_no_write_access');
			}
			if (confIsTrue('run_commands', false)) {
				$dashboard_body.removeClass('ce_no_run_access');
			}
			if (! confIsTrue('hide_settings', false)) {
				$dashboard_body.removeClass('ce_no_settings_access');
			}
			if (confIsTrue('git_autocommit', false) && conf.git_autocommit_work_tree !== "") {
				$dashboard_body.removeClass('ce_no_git_access');
			}

			if (conf.btool_dir_for_deployment_apps) {
				conf.btool_dir_for_deployment_apps = $.trim(conf.btool_dir_for_deployment_apps).replace(/\/$/, "");
			}
			if (conf.btool_dir_for_master_apps) {
				conf.btool_dir_for_master_apps = $.trim(conf.btool_dir_for_master_apps).replace(/\/$/, "");
			}
			if (conf.btool_dir_for_shcluster_apps) {
				conf.btool_dir_for_shcluster_apps = $.trim(conf.btool_dir_for_shcluster_apps).replace(/\/$/, "");
			}

			if (conf.hasOwnProperty('master_apps_gutter_useful_props_and_transforms')) {
				conf.master_apps_gutter_useful_props_and_transforms = $.trim(conf.master_apps_gutter_useful_props_and_transforms);
				if (conf.master_apps_gutter_useful_props_and_transforms !== "") {
					try {
						conf._master_apps_gutter_useful_props_and_transforms = new RegExp(conf.master_apps_gutter_useful_props_and_transforms, '');
					} catch (e) {
						console.error("Config file property: \"master_apps_gutter_useful_props_and_transforms\" has bad regular expression and will be ignored.");
					}
				}
			}

			if (conf.hasOwnProperty('master_apps_gutter_used_sourcetypes')) {
				conf.master_apps_gutter_used_sourcetypes = $.trim(conf.master_apps_gutter_used_sourcetypes);
				if (conf.master_apps_gutter_used_sourcetypes !== "") {
					try {
						conf._master_apps_gutter_used_sourcetypes = new RegExp(conf.master_apps_gutter_used_sourcetypes, '');
						// attempt to load the date
						if (! conf.hasOwnProperty('master_apps_gutter_used_sourcetypes_date')) {
							conf.master_apps_gutter_used_sourcetypes_date = "";
						}
						var date_set = new Date(conf.master_apps_gutter_used_sourcetypes_date).valueOf();
						if (isNaN(date_set)) {
							conf._master_apps_gutter_used_sourcetypes_date = "Unknown";
						} else {
							conf._master_apps_gutter_used_sourcetypes_date = Math.floor(((new Date().valueOf()) - date_set) / 86400000);
						}

					} catch (e) {
						console.error("Config file property: \"master_apps_gutter_used_sourcetypes\" has bad regular expression and will be ignored.");
					}
				}
			} 

			if (conf.hasOwnProperty('master_apps_gutter_unnecissary_config_files')) {
				conf.master_apps_gutter_unnecissary_config_files = $.trim(conf.master_apps_gutter_unnecissary_config_files);
				if (conf.master_apps_gutter_unnecissary_config_files !== "") {
					try {
						conf._master_apps_gutter_unnecissary_config_files = new RegExp(conf.master_apps_gutter_unnecissary_config_files, '');
					} catch (e) {
						console.error("Config file property: \"master_apps_gutter_unnecissary_config_files\" has bad regular expression and will be ignored.");
					}
				}
			}

			// Build the quick access hooksActive object
			hooksActive = [];
			var hookDefaults = data.conf.hook || {};
			for (var stanza in data.conf) {
				if (data.conf.hasOwnProperty(stanza)) {
					if (stanza.substr(0,5) === "hook:") {
						data.conf[stanza] = $.extend({}, hookDefaults, data.conf[stanza]);
						if (! isTrueValue(data.conf[stanza].disabled)) {
							var action = data.conf[stanza].action.split(":")[0];
							if (! hooksCfg.hasOwnProperty(action)) {
								console.error("Stanza: [" + stanza + "] has unknown action value and will be ignored.");
								continue;
							}
							if (action.substr(0,3) === "run") {
								if (! confIsTrue('run_commands', false)) {
									//console.error("Stanza: [" + stanza + "] has 'run' action but run_commands is false");
									continue;
								}
								if (action === "run") {
									data.conf[stanza].label = "$" + data.conf[stanza].label;
								}
							}
							try {
								data.conf[stanza]._match = new RegExp(data.conf[stanza].match, 'i');
								hooksActive.push(data.conf[stanza]);
							} catch (e) {
								console.error("Stanza: [" + stanza + "] has bad regular expression and will be ignored.");
							}
						}
					}
				}
			}
			hooksActive.sort(function(a, b) {
				if (a.order < b.order)
					return -1;
				if (a.order > b.order)
					return 1;
				return 0;
			});
			var actions = [];
			var actionDefaults = data.conf.action || {};
			var ce_custom_actions = $(".ce_custom_actions");
			// Build the actions buttons on the home tab
			if (! confIsTrue('run_commands', false)) {
				ce_custom_actions.parent().css("display","none");
			} else {
				ce_custom_actions.parent().css("display","block");
				for (var stanza in data.conf) {
					if (data.conf.hasOwnProperty(stanza)) {
						if (stanza.substr(0,7) === "action:") {
							var act = $.extend({}, actionDefaults, data.conf[stanza]);
							if (! isTrueValue(act.disabled)) {
								actions.push(act);
							}
						}
					}
				}
				actions.sort(function(a, b) {
					if (a.order < b.order)
						return -1;
					if (a.order > b.order)
						return 1;
					return 0;
				});
				if (actions.length === 0) {
					ce_custom_actions.html("No custom actions defined");
				} else {
					ce_custom_actions.empty();
					for (var i = 0; i < actions.length; i++) {
						// add to the home screen
						(function(a, i, l){
							var button = $("<span class='ce_custom_action btn'></span>").text(a.label).on("click", function(){
								runAction(a.action);
							});
							var elem = $("<div class='" + ((i+1 < l) ? "ce_marginbottom" : "") + "'></div>").text(a.description).prepend(button);
							elem.appendTo(ce_custom_actions);
						})(actions[i], i, actions.length);
					}
				}
			}
			confFiles = {};
			confFilesSorted = [];
			while((res = rex.exec(data.files)) !== null) {
				if (! confFiles.hasOwnProperty(res[1])) {
					confFiles[res[1]] = null;
					confFilesSorted.push(res[1]);
				}
			}
			confFilesSorted.sort();
		});
	}	

	// First load after init has occcured, setup the page
	loadPermissionsAndConfList().then(function(){
		$ce_spinner.detach();
		$dashboard_body.removeClass("ce_loading");
		
		setThemeMode(localStorage.getItem('ce_theme') || "vs-dark");
		setLeftPathWidth(localStorage.getItem('ce_lwidth') || 280);

		// on page load, log that tabs that were open previously
		var ce_open_tabs = (JSON.parse(localStorage.getItem('ce_open_tabs')) || []);
		if (ce_open_tabs.length) {
			// move any previously open tabs into the close tabs list
			for (var i = 0; i < ce_open_tabs.length; i++){
				logClosedTab(ce_open_tabs[i]);
			}
			var $restore = $("<span class='ce_restore_session'><i class='icon-rotate'></i> <span>Restore " + (ce_open_tabs.length === 1 ? "1 tab" : ce_open_tabs.length + " tabs") + "</span></span>").appendTo($ce_tabs);
			$restore.on("click", function(){
				for (var j = 0; j < ce_open_tabs.length; j++) {
					hooksCfg[ce_open_tabs[j].type](ce_open_tabs[j].file);
				}
			});
		}

		// Allow tabs to be rearranged
		Sortable.create($ce_tabs[0], {
			draggable: ".ce_tab",
			animation: 150,
			onEnd: function () {
				// figure out how things moved and reorder list
				openTabsListChanged();
				doPipeTabSeperators();
			}
		});	

		// Add tooltips
		$ce_tree_icons.find('i').tooltip({delay: 100, placement: 'bottom'});

		$("body").css("overflow","");

		readUrlHash();
		
		// Left pane styled scrollbar
		OverlayScrollbars($ce_file_list[0],{ className : "os-theme-light", overflowBehavior : { x: "hidden"} });

		// Show a warning the first time someone opens the app
		if (! localStorage.getItem('ce_seen_warning')) {
			localStorage.setItem('ce_seen_warning', "1");
			showModal({
				title: "Dragons ahead!",
				size: 600,
				body: 
					"<div><span class='red bold'>Warning:</span> This is designed for advanced users.<br><br>This app can allow you to change Splunk files on the "+
					"filesystem. When you change files, if you don't know what you are doing, then you may break your Splunk environment. <br><br>" +
					(!(confIsTrue('write_access', false) || confIsTrue('hide_settings', false)) ? "By default, <code>write_access=false</code> so files cannot be saved. Open the '<a href='#' class='ce_quicksettings'>Settings</a>' screen to enable.<br><br>" : "") + 
					'<br><br><span class="ce_disclaimer">THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR ' +
					'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, ' +
					'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE ' +
					'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER ' +
					'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, ' +
					'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE ' +
					'SOFTWARE.</span>' +
					"</div>",
				onShow: function(){ 
					$('.ce_quicksettings').on("click",function(e){
						e.preventDefault();
						readFile("");
						$(".modal").modal('hide');
					});
				},
				actions: [{
					onClick: function(){ $(".modal").modal('hide'); },
					cssClass: 'btn-primary',
					label: "OK"
				}]
			});
		}
		// Build the left pane
		showTreePaneSpinner();
		if (Number(conf.cache_file_depth) > 0) {
			var fsCompleted = false;
			serverAction({action:'fs'}).then(function(contents){
				filecache = contents;
				readFolder(inFolder);
				fsCompleted = true;
			});	
			setTimeout(function(){
				if (!fsCompleted) {
					$("<div class='ce_fs_slow_message'><div>Taking too long?</div>Reduce <code>cache_file_depth</code> in Settings</div>").appendTo($ce_tree_pane);
				}
			}, 3000);
		} else {
			if (Number(conf.cache_file_depth) === -1) {
				filecache = null;
			}
			readFolder(inFolder);
		}
		// Keep track if the page is visible or not. This will affect how often we check for changes to open files
		$(document).on('visibilitychange', function(){
			if (document.hidden) {
				fileModsCheckTimerPeriod = 60000;
				clearTimeout(fileModsCheckTimer);
				setTimeout(function(){ checkFileMods(); }, fileModsCheckTimerPeriod);
			} else {
				fileModsCheckTimerPeriod = 10000;
				// When the tab gains focus, immidiatly check for udpated files
				checkFileMods();
			}
		});
	});
});
