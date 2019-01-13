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
	var scripts = document.getElementsByTagName("script");
	var src = scripts[scripts.length-1].src; 
	window.MonacoEnvironment = {
		getWorkerUrl: function(workerId, label) {
			return "data:text/javascript;charset=utf-8," + encodeURIComponent(
				//"console.log('shimming i18n_register for worker'); "+
				"function i18n_register(){/*console.log('i18n_register shimmed');*/} "+
				"self.MonacoEnvironment = { baseUrl: '" + src.substring(0, src.lastIndexOf('/')) + "/node_modules/monaco-editor/"+mode+"/' }; "+
				"importScripts('" + src.substring(0, src.lastIndexOf('/')) + "/node_modules/monaco-editor/"+mode+"/vs/base/worker/workerMain.js');"
			);
		}
	};
})();

require([
	"splunkjs/mvc",
	"jquery",
	"moment",
	"splunkjs/mvc/simplexml",
	"splunkjs/mvc/layoutview",
	"splunkjs/mvc/simplexml/dashboardview",
	"vs/editor/editor.main",
	"app/config_explorer/sortable.min",
	"app/config_explorer/OverlayScrollbars"
], function(
	mvc,
	$,
	moment,
	DashboardController,
	LayoutView,
	Dashboard,
	wat,
	Sortable,
	OverlayScrollbars
) {
	// Mapping of all the tab types
	// can_rerun - has a right click open in the editor for "rerun". This will close and reopen the tab.  If this is "true" it must also exist in the hooksCfg list with the same name!
	// reopen - tracked through hash and in "recent files". If this is "true" it must also exist in the hooksCfg list with the same name!
	var tabCfg = {
		'btool': 				{ can_rerun: true,  can_reopen: true,  },
		'btool-hidepaths': 		{ can_rerun: true,  can_reopen: true,  },
		'btool-hidedefaults': 	{ can_rerun: true,  can_reopen: true,  },
		'btool-check': 			{ can_rerun: true,  can_reopen: false, },
		'spec': 				{ can_rerun: false, can_reopen: true,  },
		'run': 					{ can_rerun: true,  can_reopen: false, },
		'read': 				{ can_rerun: false, can_reopen: true,  },
		'settings':				{ can_rerun: false, can_reopen: false, },		
		'change-log': 			{ can_rerun: false, can_reopen: false, },
		'diff': 				{ can_rerun: false, can_reopen: false, },
		'history': 				{ can_rerun: false, can_reopen: false, },
		'git': 					{ can_rerun: false, can_reopen: false, },
		'live': 				{ can_rerun: false, can_reopen: false, },
		'live-diff': 			{ can_rerun: false, can_reopen: false, },
		'refresh': 				{ can_rerun: true,  can_reopen: false, },				
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
		'btool-check': function(arg1){
			runBToolCheck();
		},
		'spec': function(arg1){
			displaySpecFile(arg1);
		},
		'run': function(arg1){
			runShellCommandNow(arg1,"");
		},
		'run-safe': function(arg1){
			runShellCommand(arg1, true);
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
	};
	// globals
	var debug_gutters = false;
	var service = mvc.createService({owner: "nobody"});
	var editors = [];  
	var inFolder = (localStorage.getItem('ce_current_path') || './etc/apps');
	var folderContents;
	var run_history = (JSON.parse(localStorage.getItem('ce_run_history')) || []);
	var closed_tabs = (JSON.parse(localStorage.getItem('ce_closed_tabs')) || []);
	var activeTab = -1;
	var filecache = {};
	var conf = {};
	var confFiles = {};
	var confFilesSorted = [];
	var inFlightRequests = 0;
	var comparisonLeftFile = null;
	var tabid = 0;
	var leftpane_ignore = false;
	var max_recent_files_show = 30;
	var hooksActive = [];	
	var $dashboardBody = $('.dashboard-body');
	var $ce_tree_pane = $(".ce_tree_pane");
    var $dirlist = $(".ce_file_list");
	var $filelist = $(".ce_file_wrap");
	var $filePath = $(".ce_file_path");
	var $ce_tree_icons = $(".ce_tree_icons");
    var $container = $(".ce_contents");
	var $spinner = $(".ce_spinner");
    var $tabs = $(".ce_tabs");
	var $ce_contents_home = $(".ce_contents_home");
	var $ce_home_tab = $(".ce_home_tab");
	var tabCreationCount = 0;
	
	// Set the "save" hotkey at a global level instnead of on the editor, this way the editor doesnt need to have focus.
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
	
	// Handler for resizing the tree pane/editor divider
	$('.ce_resize_column').on("mousedown", function(e) {
		e.preventDefault();
		var ce_container = $('.ce_container');
		var ce_resize_column = $('.ce_resize_column');
		$(document).on("mousemove.colresize", function(e) {
			var size = Math.max(e.pageX, 0);
			$ce_tree_pane.css("width", size + "px");
			ce_resize_column.css("left", size + "px");
			ce_container.css("left", (size + 3) + "px");
			filePathRTLCheck();
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
		} else if (elem.hasClass("ce_refresh_tree")) {
			refreshFolder();
		} else if (elem.hasClass("ce_folder_up")) {
			readFolder(inFolder.replace(/[\/\\][^\/\\]+$/,''), 'back');
		} else if (elem.hasClass("ce_filter")) {
			if (elem.hasClass("ce_selected")) {
				leftPaneFileList();
				filterModeOff();				
			} else {
				var $in = $('<input class="ce_treesearch_input" autocorrect="off" autocapitalize="off" spellcheck="false" type="text" wrap="off" aria-label="Filter text" placeholder="Filter text" title="Filter text">');
				$filePath.css("margin-top", "30px");
				$dirlist.css("top", "100px");
				elem.addClass("ce_selected");
				$in.appendTo($ce_tree_pane).focus().on("input ",function(){
					leftPaneFileList($(this).val().toLowerCase());
				}).on("keydown", function(e){
					// select the top item
					if (e.which === 13) {
						$filelist.find(".ce_leftnav").eq(0).click();
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
		}
	});
	
	function filterModeOff() {
		$(".ce_filter").removeClass("ce_selected");
		$(".ce_treesearch_input").remove();
		$filePath.css("margin-top", "");
		$dirlist.css("top", "");
	}

	function filterModeReset(){
		$(".ce_treesearch_input").val("");
	}
	
	function addHookAction(hook, file, actions) {
		if (hook._match.test(file)) {					
			actions.push($("<div></div>").text(replaceTokens(hook.label, file)).on("click", function(){ 
				runHookUnparsed(hook.action, file); 
			}));
		}
	}
				
	// Click handler for left pane items
	$dirlist.on("click", ".ce_leftnav", function(){
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
		var $t = $(this);
		var isFile = $t.hasClass("ce_is_report");
		var thisFile = $t.attr('file');
		var actions = [];
		if (isFile) {
			// Add the custom hook actions
			for (var j = 0; j < hooksActive.length; j++) {
				addHookAction(hooksActive[j], thisFile, actions);
			}
		}
		if ($t.hasClass("ce_leftnav_editable")) {
			// can rename, can trash
			actions.push($("<div>Rename</div>").on("click", function(){ 
				fileSystemRename(thisFile); 
			}));
			actions.push($("<div>Delete</div>").on("click", function(){ 
				filesystemDelete(thisFile); 
			}));
			
		} else if ($t.hasClass("ce_conf")) {
			actions.push($("<div>Show btool (hide paths)</div>").on("click", function(){ 
				runBToolList(thisFile, 'btool-hidepaths');
			}));
			actions.push($("<div>Show btool (hide 'default' settings)</div>").on("click", function(){ 
				runBToolList(thisFile, 'btool-hidedefaults');
			}));
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
					getFileHistory(thisFile);
				}));
			}
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
		if (! actions.length) {
			return;
		}
		var $menu = $(".ce_context_menu_wrap");
		$menu.empty().append(actions);		
		e.preventDefault(); // To prevent the default context menu.
		$(".ce_leftnav_highlighted").removeClass("ce_leftnav_highlighted");
		$t.addClass("ce_leftnav_highlighted");
		var windowHeight = $(window).height();
		if((e.clientY + 200) > windowHeight) {
			$menu.css({opacity:1, left:30 + e.clientX, bottom:$(window).height()-e.clientY, right:"auto", top:"auto"});
		} else {
			$menu.css({opacity:1, left:30 + e.clientX, bottom:"auto", right:"auto", top: e.clientY - 30});
		}
		$(".ce_context_menu_overlap").removeClass("ce_hidden");
		$(document).on("click", function () {
			$menu.removeAttr("style");
			$(".ce_context_menu_overlap").addClass("ce_hidden");
			$t.removeClass("ce_leftnav_highlighted");
			$(document).off("click");           
		});
	});

	// Event handlers for the editor tabs
	$tabs.on("click", ".ce_close_tab", function(e){
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
	
	function compareFiles(rightFile, leftFile) {
		var ecfg = createTab('diff', rightFile + " " + leftFile, "<span class='ce-dim'>diff:</span> " + rightFile + " " + leftFile);
		// get both files 
		Promise.all([
			serverActionWithoutFlicker('read', leftFile),
			serverActionWithoutFlicker('read', rightFile),
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
		if (endpoint) {
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
		});		
	}
	
	function replaceTokens(str, file){
		var basefile = dodgyBasename(file);
		var dirname = dodgyDirname(file);
		return str.replace(/\$\{FILE\}/g, file).replace(/\$\{BASEFILE\}/g, basefile).replace(/\$\{DIRNAME\}/g, dirname);		
	}
	
	function runHookUnparsed(actionStr, file) {
		var parts = actionStr.split(":");
		var action = parts.shift();
		var args = replaceTokens(parts.join(":"), file);
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
		activeTab = $tabs.children(".ce_active").index();
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
					hooksCfg[parts[i]](parts[i+1]);
				}
			}
			var tabIdx = parseInt(parts[0],10);
			if (parts.length > 2 && !isNaN(tabIdx)) {
				activateTab(tabIdx);
			}
		}
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
		serverActionWithoutFlicker("run", command, fromFolder).then(function(contents){
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
		serverActionWithoutFlicker('btool-check').then(function(contents){
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
			serverActionWithoutFlicker('btool-list', path).then(function(contents){
				var c = formatBtoolList(contents, true, false);
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
	
	function runBToolList(path, type){
		path = path.replace(/\.conf$/i,"");
		var ce_btool_default_values = true;
		var ce_btool_path = true;
		if (type === 'btool-hidepaths') {
			ce_btool_default_values = true;
			ce_btool_path = false;
		} else if (type === 'btool-hidedefaults') {
			ce_btool_default_values = false;
			ce_btool_path = true;
		}
		var tab_path_fmt = '<span class="ce-dim">btool:</span> ' + path;
		if (! ce_btool_default_values) { 
			tab_path_fmt += " <span class='ce-dim'>(no defaults)</span>"; 
		} else if (ce_btool_path) { 
			tab_path_fmt += " <span class='ce-dim'>--debug</span>"; 
		}
		if (! tabAlreadyOpen(type, path)) {
			var ecfg = createTab(type, path, tab_path_fmt);
			serverActionWithoutFlicker('btool-list', path).then(function(contents){
				var c = formatBtoolList(contents, ce_btool_default_values, ce_btool_path);
				if ($.trim(c)) {
					updateTabAsEditor(ecfg, c, 'ini');
					ecfg.btoollist = contents;
					serverAction('spec-hinting', path).then(function(h){
						ecfg.hinting = buildHintingLookup(path, h);
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
	}	
	
	function displaySpecFile(path) {
		path = path.replace(/\.conf$/i,"");
		var tab_path_fmt = '<span class="ce-dim">spec:</span> ' + path;
		if (! tabAlreadyOpen('spec', path)) {
			var ecfg = createTab('spec', path, tab_path_fmt);
			serverActionWithoutFlicker('spec', path).then(function(contents) {
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
			$filelist.addClass("ce_move_" + leftpane_ignore);
			$spinner.clone().appendTo($ce_tree_pane);
			$(".ce_folder_up, .ce_refresh_tree, .ce_add_folder, .ce_add_file, .ce_filter, .ce_recent_files, .ce_show_confs, .ce_app_run").addClass("ce_disabled");
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
	
	// Run server action to load a folder
	function readFolder(path, direction) {
		filterModeReset();
		var base = getTreeCache(path);
		if (base === null || ! base.hasOwnProperty(".")){
			readFolderFromServer(path, direction);
		} else {
			folderContents = [];
			for (var key in base) {
				if (base.hasOwnProperty(key) && key !== ".") {
					folderContents.push("D" + key);
				}
			}
			if (base.hasOwnProperty(".")) {
				for (var j = 0; j < base["."].length; j++) {
					folderContents.push("F" + base["."][j]);
				}
			}
			readFolderLoad(path);
		}
	}
	
	function readFolderFromServer(path, direction) {
		showTreePaneSpinner(direction);
		return serverAction('read', path).then(function(contents){
			// if filecache is null it means user turned it off by setting conf to -1
			if (filecache !== null) {
				var base = getTreeCache(path);
				// base can be null if the screen was opened when we were already deep in the uncached zone
				if (base !== null) {
					var folders = ["."];
					var fn;
					base["."] = [];
					for (var i = 0; i < contents.length; i++) {
						fn = contents[i].substr(1);
						if (contents[i].substr(0,1) == "F") {
							base["."].push(fn);
						} else {
							folders.push(fn);
							if (! base.hasOwnProperty(fn)) {
								base[fn] = {};
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
			folderContents = contents;
			readFolderLoad(path);
		}).catch(function(msg){
			leftPaneRemoveSpinner();
			$filelist.empty();
			$filePath.empty();
			$("<div class='ce_treenothing'><i class='icon-warning'></i>Error occured. <span class='ce_link ce_tree_retry'>Retry</span> / <span class='ce_link ce_tree_reset'>Home</span></div>").appendTo($filelist);
			$filelist.find(".ce_tree_retry").on("click", function(){
				return readFolderFromServer(path, direction);
			});
			$filelist.find(".ce_tree_reset").on("click", function(){
				return readFolderFromServer(".");
			});
		});
	}
	
	function readFolderLoad(path){
		inFolder = path;
		updateUrlHash();
		localStorage.setItem('ce_current_path', inFolder);
		folderContents.sort(function(a, b) {
			return a.toLowerCase().localeCompare(b.toLowerCase());
		});	
		leftPaneFileList();
	}

	function filePathRTLCheck() {
		var span = $filePath.find("span");
		if (span.attr("title")) {
			if (span.width() > $filePath.width()) {
				$filePath.addClass('ce_rtl');
			} else {
				$filePath.removeClass('ce_rtl');
			}
		}
	}
	
	function leftPaneRemoveSpinner(){
		if (leftpane_ignore) {
			if (leftpane_ignore === 'fwd') {
				$filelist.css({transition: "all 0ms", transform: "translate(200px, 0px)", opacity: 0});
			} else if (leftpane_ignore === 'back') {
				$filelist.css({transition: "all 0ms", transform: "translate(-200px, 0px)", opacity: 0});
			} else {
				$filelist.css({transition: "all 0ms", transform: "", opacity: 0});
			}
			$filelist.removeClass("ce_move_none ce_move_fwd ce_move_back");
			$ce_tree_pane.find(".ce_spinner").remove();
			setTimeout(function(){
				$filelist.css({transition: "", transform: "", opacity: ""});				
			},0);

			leftpane_ignore = false;	
		}	
	}

	function leftPaneFileList(filter){
		leftPaneRemoveSpinner();
		$filelist.empty();
		$filePath.empty();
		$(".ce_refresh_tree, .ce_add_folder, .ce_add_file, .ce_filter, .ce_recent_files, .ce_show_confs, .ce_app_run").removeClass("ce_disabled");
		if (inFolder === ".") {
			$(".ce_folder_up").addClass("ce_disabled");
		} else {
			$(".ce_folder_up").removeClass("ce_disabled");
		}
		
		$("<span></span><bdi></bdi>").appendTo($filePath);
		$filePath.find("span, bdi").attr("title", inFolder).text(inFolder + '/');
		filePathRTLCheck();
		var files = false;
		var filter_re;
		if (filter) {
			filter_re = new RegExp(escapeRegExp(filter), 'gi'); 
		}
		for (var i = 0; i < folderContents.length; i++) {
			var item = folderContents[i].substr(1);
			if (! filter || item.toLowerCase().indexOf(filter) > -1) {
				var icon = "folder";
				if (folderContents[i].substr(0,1) === "F") {
					icon = "report";
				}
				files = true;
				var text = htmlEncode(item);
				if (filter) {
					text = text.replace(filter_re, "<span class='ce_treehighlight'>$&</span>");
				}
				$("<div class='ce_leftnav ce_leftnav_editable ce_is_" + icon + "'>" + text + "</div>").attr("file", inFolder + "/" + item).prepend("<i class='icon-" + icon + "'></i> ").appendTo($filelist);
			}
		}
		if (!files) {
			if (filter) {
				$("<div class='ce_treenothing'><i class='icon-warning'></i>Not found: <span class='ce_treenothing_text'>" + htmlEncode(filter) + "<span></div>").appendTo($filelist);
			} else {
				$("<div class='ce_treeempty'><i class='icon-warning'></i>Folder empty</div>").appendTo($filelist);
			}
		}
	}

	// The conf file list
	function leftPaneConfList() {
		$filelist.empty();
		$filePath.removeClass('ce_rtl').empty();
		$(".ce_folder_up, .ce_refresh_tree, .ce_add_folder, .ce_add_file, .ce_filter, .ce_recent_files, .ce_app_run").addClass("ce_disabled");
		$("<span>Splunk conf files</span>").appendTo($filePath);
		for (var i = 0; i < confFilesSorted.length; i++) {
			$("<div class='ce_leftnav ce_conf'></div>").text(confFilesSorted[i]).attr("file", confFilesSorted[i]).prepend("<i class='icon-bulb'></i> ").appendTo($filelist);
		}
	}

	// Click handler for Recent Files button in top right
	function leftPaneRecentList() {
		$filelist.empty();
		$filePath.removeClass('ce_rtl').empty();
		$(".ce_folder_up, .ce_refresh_tree, .ce_add_folder, .ce_add_file, .ce_filter, .ce_show_confs, .ce_app_run").addClass("ce_disabled");
		$("<span>Recent files</span>").appendTo($filePath);
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
				$("<div class='ce_leftnav ce_leftnav_reopen'><i class='icon-" + icon + "'></i> " + htmlEncode(closed_tabs[i].label).replace(/^read:\s/,"") + "</div>").attr("file", closed_tabs[i].file).attr("title", closed_tabs[i].file).attr("type", closed_tabs[i].type).appendTo($filelist);
			}
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
			serverActionWithoutFlicker('read', path).then(function(contents){
				updateTabAsEditor(ecfg, contents);
				if (ecfg.hasOwnProperty('matchedConf')) {
					highlightBadConfig(ecfg);
					if (confFiles.hasOwnProperty(ecfg.matchedConf)) {
						serverAction('spec-hinting', ecfg.matchedConf).then(function(c){
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
							serverAction("new" + type, parentPath, fname).then(function(){
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
							serverAction("rename", parentPath, newname).then(function(){
								refreshFolder();
								showToast('Success');
								// if "path" is open in an editor, it needs to be closed without warning
								closeTabByName(parentPath);
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
						serverAction("delete", file).then(function(){
							refreshFolder();
							showToast('Success');
							// if "path" is open in an editor, it needs to be closed without warning
							closeTabByName(file);
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
		var table = $("<table></table>");
		serverActionWithoutFlicker("git-log").then(function(contents){
			// commit 1, datetime 2 user 3 change 4 files 5 additions 6 deletions 7
			var rex = /commit\s+(\S+)[\s\S]*?Date:\s+\S+\s+(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(\S+)(?: +(\S+))?\s+([\s\S]+?)\d+\s+files? changed,(?: (\d+) insertions?\(\+\))?(?: (\d+) deletions?\(\-\))?/g,
				res, 
				type,
				f,
				t,
				files,
				item,
				fileshtml,
				timediff,
				mapper = {},
				changes = [];
			while(res = rex.exec(contents)) {
				if (res.length === 8) {
					item = {
						sha: res[1],
						time: moment(new Date(res[2])),
						files: [],
						user: res[3],
						change: res[4],
						adds: Number(res[6] || 0),
						dels: Number(res[7] || 0),
						duration: 0,
						last_sha: "",
						count: 1
					};
					// etc/apps/config_explorer/README.md  | 484 ++++++++++++++++++++++++++++++++++++
					// etc/apps/config_explorer/README.md2 | 484 ------------------------------------
					if (item.change === "renamed") {
						var foundadd = res[5].match(/([^\/]+) +\| +\d+ \+/);
						var founddels = res[5].match(/\s*([^\n]+) +\| +\d+ -/);
						if (foundadd && founddels) {
							item.files.push(founddels[1] + " <i class='icon-arrow-right'></i> " + foundadd[1]);
						}
					} else {
						files = res[5].split(/ +\|.+\r?\n */);
						for (var k = 0; k < files.length; k++) {
							f = $.trim(files[k]);
							if (f) {
								item.files.push(f);
							}
						}
					}
					if (item.files.length === 1 && item.change === 'save') {
						if (mapper.hasOwnProperty(item.files[0]) && mapper[item.files[0]].user === item.user) {
							timediff = mapper[ item.files[0] ].time.diff(item.time, 'minutes');
							if (timediff < conf.git_group_time_mins) {
								changes[ mapper[ item.files[0] ].pointer ].count++;
								changes[ mapper[ item.files[0] ].pointer ].duration += timediff;
								changes[ mapper[ item.files[0] ].pointer ].last_sha = item.sha;
								changes[ mapper[ item.files[0] ].pointer ].adds += item.adds;
								changes[ mapper[ item.files[0] ].pointer ].dels += item.dels;
								mapper[ item.files[0] ].time = item.time;
								continue;
							}
						}
						mapper[ item.files[0] ] = {time: item.time, user: item.user, pointer: changes.length};
					}
					changes.push(item);
				}
			}			
			for (var i = 0; i < changes.length; i ++) {
				if (! changes[i].change) {
					type = "<td colspan='3'></td>";
				} else if (changes[i].change === "new") {
					type = "<td class='nobr ar' colspan='3'><i class='icon-report'></i> " + changes[i].change + "</td>";
				} else if (changes[i].change === "deleted") {
					type = "<td class='nobr ar' colspan='3'><i class='icon-trash'></i> " + changes[i].change + "</td>";
				} else if (changes[i].change === "renamed") {
					type = "<td class='nobr ar' colspan='3'><i class='icon-pencil'></i> " + changes[i].change + "</td>";
				} else {
					type = "<td class='nobr ar' title='File was saved " + changes[i].count + " times in " + changes[i].duration + " minutes'>" + (changes[i].count > 1 ? ("[" + (changes[i].count) + "]") : "") + "</td><td class='nobr ar'><i class='icon-plus-circle green'></i> " + changes[i].adds + '</td><td class="nobr ar"><i class="icon-minus-circle red"></i> ' + changes[i].dels + "</td>";
				}
				fileshtml = "";
				for (var j = 0; j < changes[i].files.length; j++) {
					t = "";
					if (! changes[i].change || changes[i].change === "save") {
						t = "<i title='Show changes in this commit' class='icon-speech-bubble ce_clickable_icon'></i> <i title='Compare this version to current' class='icon-number ce_clickable_icon'></i> ";
					}
					fileshtml += "<div><span class='ce_changelog_buttons'>" + t + "</span>" + changes[i].files[j] + "</div>";
				}
				table.append("<tr commitstart='" + changes[i].sha +"' commitend='" + changes[i].last_sha +"'><td class='nobr'>" + changes[i].time.format("YYYY-MM-DD  h:mma") + "</td><td class='nobr'>" + changes[i].time.fromNow() + "</td>" + type + "<td class='nobr'>" + changes[i].user + "</td><td class='ce_changelog_filescol'>" + fileshtml + "</td></tr>");
			}
		
			updateTabHTML(ecfg, $("<div class='ce_changelog'></div>").append(table));

			table.on("click", ".ce_clickable_icon", function(){
				var $elem = $(this),
					filestr = $.trim($elem.parent().parent().text());
					
				if ($elem.hasClass('icon-number')) {
					var filecommitstr = $elem.parents("tr").attr("commitstart") + ":./" + filestr;
					var ecfg = createTab('diff', filestr, "<span class='ce-dim'>diff:</span> " + dodgyBasename(filestr));
					Promise.all([serverAction("read", filestr), serverAction("git-show", filecommitstr)]).then(function(results) {						
						updateTabAsDiffer(ecfg, "# " + filecommitstr + "\n" + results[0], "# Current HEAD:./" + filestr + "\n" + results[1]);
					}).catch(function(){ 
						closeTabByCfg(ecfg);
					});
				} else if ($elem.hasClass('icon-speech-bubble')) {
					var filecommitstrstart = $elem.parents("tr").attr("commitstart");
					var filecommitstrend = $elem.parents("tr").attr("commitend");
					getFileHistory(filestr, filecommitstrstart, filecommitstrend);
				}
			});			
		}).catch(function(){ 
			closeTabByCfg(ecfg);
		});
	}
	
	// Git history of a specific file optionally between two commit tags
	function getFileHistory(file, commitstart, commitend){
		var ecfg = createTab('history', file, "<span class='ce-dim'>history:</span> " + dodgyBasename(file));
		serverActionWithoutFlicker("git-history", file).then(function(contents){
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
			var lines = htmlEncode(contents).split(/\r?\n/);
			var str = "";
			var firstThree;
			var time;
			var hash;
			var capturing = false;
			var stopOnNext = false;
			var closeBlock = false;
			if (! commitstart) {
				capturing = true;
			}
			for (var i = 0; i < lines.length; i++) {
				firstThree = lines[i].substr(0,3);
				if (firstThree === "com") {
					if (stopOnNext) {
						break;
					}
					hash = lines[i].substr(7);
					if (commitstart && hash === commitstart) {
						capturing = true;
					} else if (capturing && commitend && hash === commitend) {
						stopOnNext = true;
					}
				}
				//commit 2498c5b83158307ac7210dd1fd77abfda5fe21fb
				if (! capturing || firstThree === "Aut" || firstThree === "---" || firstThree === "+++"|| firstThree === "ind"|| firstThree === "dif") {
					continue;
				}
				if (lines[i].substr(0,4) === "Date") {
					if (closeBlock) {
						str += "</div>";
						closeBlock = false;
					}					
					time = moment(new Date(lines[i].substr(5)));
					str += "<p><h1>" + time.fromNow() + " <span>(" + time.format("YYYY-MM-DD  h:mma") + ") - " + lines[i+2] + "</span></h1></p>";
					i+=3;
				} else if (lines[i].substr(0,2) === "@@") {
					if (closeBlock) {
						str += "</div>";
					}					
					str += "<p>" + lines[i].replace(/^(.* @@)(.*)$/, "$1</p><div class='ce_diff_change'><p>$2</p>");
					closeBlock = true;
				} else if (lines[i].substr(0,1) === "+") {
					if (lines[i].length > 1) {
						str += "<p class='ce_diff_addition'>" + lines[i].substr(1) + "</p>";
					}
				} else if (lines[i].substr(0,1) === "-"){
					if (lines[i].length > 1) {
						str += "<p class='ce_diff_deletion'>" + lines[i].substr(1) + "</p>";
					}
				} else {
					str += "<p>" + lines[i]+ "</p>";
				}
			}
			updateTabHTML(ecfg, $("<div class='ce_file_history'></div>").html(str));
		}).catch(function(){ 
			closeTabByCfg(ecfg);
		});
	}

	function activateTab(idx){
		if (idx < -1 || idx > (editors.length - 1)) {
			return;
		}
		$container.children().addClass("ce_hidden");
		$ce_contents_home.addClass("ce_hidden");
		$tabs.children().removeClass("ce_active");
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
	
	function closeTabByName(file) {
		for (var i = 0; i < editors.length; i++) {
			if (editors[i].file === file) {
				closeTabNow(i);
				return;
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
		if (tabCfg[ecfg.type].can_reopen) {
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
		if ($tabs.children().length === 0) {
			activateTab(-1);
		// if there is already a tab selected
		} else if ($tabs.children(".ce_active").length === 0) {
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
		ecfg.container = $("<div></div>").appendTo($container);
		ecfg.container.append($spinner.clone());
		// Remove the "restore session" link
		$(".ce_restore_session").remove();
		ecfg.tab = $("<div class='ce_tab ce_active'>" + label + "</div>").attr("title", ecfg.label).data({"tab": ecfg}).appendTo($tabs);
		ecfg.hasChanges = false;
		ecfg.server_content = '';
		activateTab(editors.length-1);
		openTabsListChanged();
		return ecfg;
	}
	
	function addHookActionToEditor(hook, ecfg) {
		if (hook._match.test(ecfg.file)) {
			var lab = replaceTokens(hook.label, ecfg.file);
			if (isTrueValue(hook.showWithSave) && ecfg.canBeSaved) {
				ecfg.editor.addAction({
					id: "Save and " + lab,
					contextMenuOrder: 0.2,
					contextMenuGroupId: 'navigation',
					label: "Save and " + lab,
					run: function() {
						saveActiveTab(function(){
							runHookUnparsed(hook.action, ecfg.file);
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
					runHookUnparsed(hook.action, ecfg.file);
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
		ecfg.editor = monaco.editor.create(ecfg.container[0], {
			automaticLayout: true,
			model: ecfg.model,
			lineNumbersMinChars: 3,
			ariaLabel: ecfg.file,
			//readOnly: ! ecfg.canBeSaved,
			glyphMargin: true
		});
		ecfg.server_content = ecfg.editor.getValue();
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
		}
		for (var j = 0; j < hooksActive.length; j++) {
			var hook = hooksActive[j];
			addHookActionToEditor(hook, ecfg);
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
					hooksCfg[ecfg.type](ecfg.file);
				}
			});
		}		
		ecfg.editor.addAction({
			id: 'word-wrap-on',
			label: 'Word wrap on',
			run: function() {
				ecfg.editor.updateOptions({
					wordWrap: "on"
				});
			}
		});  
        ecfg.editor.addAction({
			id: 'word-wrap-off',
			label: 'Word wrap off',
			run: function() {
				ecfg.editor.updateOptions({
					wordWrap: "off"
				});
			}
		});
		ecfg.editor.addAction({
			id: 'render-whitespace-on',
			label: 'Render whitespace on',
			run: function() {
				ecfg.editor.updateOptions({
					renderWhitespace: "all"
				});
			}
		});
		ecfg.editor.addAction({
			id: 'render-whitespace-off',
			label: 'Render whitespace off',
			run: function() {
				ecfg.editor.updateOptions({
					renderWhitespace: "none"
				});
			}
		}); 		
		openTabsListChanged();
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
				serverAction('save', ecfg.file, saved_value).then(function(){
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
	
	function updateTabHTML(ecfg, contents) {
		ecfg.container.html(contents).css("overflow", "auto");
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
	}	
	
	// Make sure the server action that results in a tab open, takes a minimum amount of time so as not to flicker and look dumb
	function serverActionWithoutFlicker(type, path, param1) {
		var promise = serverAction(type, path, param1);
		var promiseTimeout = new Promise(function(resolve) {
			setTimeout(resolve, 800);
		});
		var promiseCombined = Promise.all([promise, promiseTimeout]);
		return promiseCombined.then(function(values) {
			return values[0];
		});			
	}
	
	// Make a rest call to our backend python script
	function serverAction(type, path, param1) {
		return new Promise(function(resolve, reject) {
			inFlightRequests++;
			$('.ce_saving_icon').removeClass('ce_hidden');
			service.post('/services/config_explorer', {action: type, path: path, param1: param1}, function(err, r) {
				inFlightRequests--;
				if (inFlightRequests === 0) {
					$('.ce_saving_icon').addClass('ce_hidden');
				}
				var errText = '';
				//console.log(type, err, r);
				if (err) {
					if (err.data.hasOwnProperty('messages')) {
						errText = "<pre>" + htmlEncode(err.data.messages["0"].text) + "</pre>";
					} else {
						errText = "<pre>" + htmlEncode(JSON.stringify(err)) + "</pre>";
					}
				} else {
					if (! r.data) {
						errText = "<pre>Error communicating with Splunk</pre>";
						
					} else if (! r.data.hasOwnProperty('status')) {
						errText = "<pre>" + htmlEncode(r.data) + "</pre>";
						
					} else if (r.data.status === "missing_perm_read") {
						errText = "<p>To use this application you must be have the capability \"<strong>admin_all_objects</strong>\" via a <a href='/manager/config_explorer/authorization/roles'>role</a>.</p>";

					} else if (r.data.status === "missing_perm_run") {
						errText = "<p>You must enable the <code>run_commands</code> setting</p>";
						
					} else if (r.data.status === "missing_perm_write") {
						errText = "<p>You must enable the <code>write_access</code> setting</p>";
						
					} else if (r.data.status === "config_locked") {
						errText = "<p>Unable to write to the settings file becuase it is locked and must be edited externally: <code>etc/apps/config_explorer/local/config_explorer.conf</code></p>";
						
					} else if (r.data.status === "error") {
						errText = "<pre>" + htmlEncode(r.data.result) + "</pre>";
					}
				}
				if (errText) {
					showModal({
						title: "Error",
						body: "<div class='alert alert-error'><i class='icon-alert'></i>An error occurred!<br><br>" + errText + "</pre></div>",
					});
					reject(Error("error"));
				} else {
					// if there was some unexpected git output, then open a window to display it
					if (r.data.git && r.data.git_status !== 0) {
						var git_output = "<h2>Warning: Unexpected return code when attempting to autocommit changes to version control. Output is below:</h2>";
						for (var j = 0; j < r.data.git.length; j++) {
							git_output += "<div class='ce_gitoutput-" + r.data.git[j].type + "'>" + htmlEncode($.trim(r.data.git[j].content)) + "</div>";
						}
						var ecfg = createTab('git', '', 'git output');
						updateTabHTML(ecfg, "<div class='ce_gitoutput'>" + git_output + "</div>");
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
	
	// Formats the output of "btool list" depending on what checkboxes are selected in the left pane
	function formatBtoolList(contents, ce_btool_default_values, ce_btool_path) {
		var indent = 80;
		return contents.replace(/\\/g,'/').replace(/^.+?splunk[\/]etc[\/](.*?\.conf)\s+(.+)(\r?\n)/img,function(all, g1, g2, g3){
			var path = '';
			// I am pretty sure that stanzas cant be set to default when containing a child that isnt
			if (! ce_btool_default_values && /[\/\\]default[\/\\]/.test(g1)) {
				return '';
			}
			if (ce_btool_path) {
				path = (" ".repeat(Math.max(1, (indent - g2.length)))) + "  " + g1;
			}
			return g2 + path + g3;
		});
	}
	
	function addGutter(newdecorations, i, className, message) {
		newdecorations.push({ range: new monaco.Range((1+i),1,(1+i),1), options: { isWholeLine: true, glyphMarginClassName: className, glyphMarginHoverMessage: [{value: message }]  }});
	}										

	// After loading a .conf file or after saving and before any changes are made, red or green colour will
	// be shown in the gutter about if the current line can be found in the output of btool list.
	function highlightBadConfig(ecfg){
		if (!confIsTrue('conf_validate_on_save', true)) {
			return;
		}
		if (ecfg.hasOwnProperty('matchedConf')) {
			serverAction('btool-list', ecfg.matchedConf).then(function(btoolcontents){
				if (! $.trim(btoolcontents)) {
					delete ecfg.matchedConf;
					return;
				}
				btoolcontents = btoolcontents.replace(/\\/g,'/');
				// Build lookup of btool output
				var lookup = buildBadCodeLookup(btoolcontents);
				if (debug_gutters) {
					console.log("Btool:", lookup);
					if (ecfg.hasOwnProperty('hinting')) {
						console.log("Spec:", ecfg.hinting);
					}
				}
				// try to figure out the SPLUNK_HOME value
				// Its common that in inputs.conf, some stanzas are defined with $SPLUNK_HOME which btool always expands
				var rexSplunkHome = /^(.+?)[\\\/]etc[\\\/]/;
				var foundSplunkHome = btoolcontents.match(rexSplunkHome);
				var splunk_home = "";
				if (foundSplunkHome && foundSplunkHome.length == 2) {
					splunk_home = foundSplunkHome[1];
				}
				var seenStanzas = {};
				var seenProps =  {};
				// Go through everyline of the editor
				var contents = ecfg.editor.getValue(),
					rows = contents.split(/\r?\n/),
					currentStanza = "",
					currentStanzaExpandedHome = "",
					currentStanzaTrimmed = "",
					// This regex is complex becuase sometimes properties have a unique string on the end of them 
					// e.g "EVAL-src = whatever"
					// found[1] will be "EVAL-src"
					// found[2] will be "EVAL"
					reProps = /^\s*((\w+)[^=\s]*)\s*=/,
					newdecorations = [],
					currentStanzaAsExpectedInBtool,
					tempStanza,
					foundSpec,
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
						// Stanzas that use relative paths, will be expanded by btool. (e.g. inputs.conf [script://./bin/go.sh] from current script location)
						currentStanzaAsExpectedInBtool = currentStanzaAsExpectedInBtool.replace(/\/\/\.\//, "//" + splunk_home + ecfg.file.substr(1).replace(/[^\/\\]*\/[^\/\\]*$/,''));
						
						if (seenStanzas.hasOwnProperty(currentStanza)) {
							newdecorations.push({ range: new monaco.Range((1+i),1,(1+i),1), options: { isWholeLine: true, glyphMarginClassName: 'ceOrangeLine', glyphMarginHoverMessage: [{value:"Duplicate Stanza in this file"}]  }});
						}
						seenStanzas[currentStanza] = 1;
						seenProps =  {};
					} else {
						var found = rows[i].match(reProps);
						if (found) {
							if (found[1].substr(0,1) !== "#") {
								// Check for duplicated key in stanza
								if (seenProps.hasOwnProperty(found[1])) {
									addGutter(newdecorations, i, 'ceOrangeLine', "Duplicate key in stanza");

								} else {
									seenProps[found[1]] = 1;
									// Look if stanza/property exists in btool
									if (! lookup.hasOwnProperty(currentStanzaAsExpectedInBtool)){
										addGutter(newdecorations, i, 'ceRedLine', "Not found in \"btool\" output (btool does not list the stanza \"" + currentStanzaAsExpectedInBtool +"\")");

									} else if (! lookup[currentStanzaAsExpectedInBtool].hasOwnProperty(found[1])){
										// [default] is a special case and is reflected through all other stanzas in the file
										if (currentStanzaAsExpectedInBtool !== "") {
											addGutter(newdecorations, i, 'ceRedLine', "Not found in \"btool\" output (btool with stanza [" + currentStanzaAsExpectedInBtool +"] does not have property \"" + found[1] + "\")");
										}
										
									} else if (lookup[currentStanzaAsExpectedInBtool][found[1]] !== ecfg.file) {
										addGutter(newdecorations, i, 'ceRedLine', "Not found in \"btool\" output (set in :" + lookup[currentStanzaAsExpectedInBtool][found[1]] + ")");

									} else {
										// If a spec file exists
										if (ecfg.hasOwnProperty('hinting') && found.length > 2) {
											foundSpec = false;
											// Look in the unstanzaed part of the spec
											if (ecfg.hinting[""].hasOwnProperty(found[2])) {
												addGutter(newdecorations, i, 'ceGreeenLine', "Found in \"btool\" output and spec file. (Stanza=\"\" Property=\"" + found[2] + "\")");
												
											// Look in the stanzaed part of the spec
											} else if (ecfg.hinting.hasOwnProperty(currentStanza) && ecfg.hinting[currentStanza].hasOwnProperty(found[2])) {
												addGutter(newdecorations, i, 'ceGreeenLine', "Found in \"btool\" output and spec file. (Stanza=\"" + currentStanza + "\" Property=\"" + found[2] + "\")");
											
											// Look for a trimmed version of the stanza in the spec. e.g. [endpoint:blah_rest] might be in the spec as [endpoint]
											} else if (ecfg.hinting.hasOwnProperty(currentStanzaTrimmed) && ecfg.hinting[currentStanzaTrimmed].hasOwnProperty(found[2])) {
												addGutter(newdecorations, i, 'ceGreeenLine', "Found in \"btool\" output and spec file. (Stanza=\"" + currentStanzaTrimmed + "\" Property=\"" + found[2] + "\")");

											// Now go through those same three checks, but look for the whole thing. For Example in web.conf found[2] is "tools" where as found[1] is "tools.sessions.timeout"
											} else if (ecfg.hinting[""].hasOwnProperty(found[1])) {
												addGutter(newdecorations, i, 'ceGreeenLine', "Found in \"btool\" output and spec file. (Stanza=\"\" Property=\"" + found[1] + "\")");
												
											// Look in the stanzaed part of the spec
											} else if (ecfg.hinting.hasOwnProperty(currentStanza) && ecfg.hinting[currentStanza].hasOwnProperty(found[1])) {
												addGutter(newdecorations, i, 'ceGreeenLine', "Found in \"btool\" output and spec file. (Stanza=\"" + currentStanza + "\" Property=\"" + found[1] + "\")");
											
											// Look for a trimmed version of the stanza in the spec. e.g. [endpoint:blah_rest] might be in the spec as [endpoint]
											} else if (ecfg.hinting.hasOwnProperty(currentStanzaTrimmed) && ecfg.hinting[currentStanzaTrimmed].hasOwnProperty(found[1])) {
												addGutter(newdecorations, i, 'ceGreeenLine', "Found in \"btool\" output and spec file. (Stanza=\"" + currentStanzaTrimmed + "\" Property=\"" + found[1] + "\")");
												
											} else {
												if (found[2] === found[1]) {
													extraProp = "Looked for property \"" + found[2] + "\" ";
												} else {
													extraProp = "Looked for property \"" + found[2] + "\" and \"" + found[1] + "\" ";
												}
												if (currentStanza === currentStanzaTrimmed) {
													extraStanz = "in stanza \"\", \"" + currentStanza + "\"";
												} else {
													extraStanz = "in stanzas \"\", \"" + currentStanza + "\" and \"" + currentStanzaTrimmed + "\"";
												}												
												addGutter(newdecorations, i, 'ceDimGreeenLine', "Found in \"btool\" output, but not found in spec file. "+ extraProp + extraStanz);

											}
										} else {
											// No spec file exists 
											addGutter(newdecorations, i, 'ceGreeenLine', "Found in \"btool\" output");
										}										
									}
								}
							}
						}
					}
				}
				ecfg.decorations = ecfg.editor.deltaDecorations(ecfg.decorations, newdecorations);
			});
		}		
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
		$dashboardBody.removeClass(function (index, className) {
			return (className.match (/(^|\s)ce_theme_\S+/g) || []).join(' ');
		});
		$dashboardBody.addClass("ce_theme_" + mode);
		// Set theme for editors
		monaco.editor.setTheme(mode);
		// save to local storage
		localStorage.setItem('ce_theme', mode);
	}
	
	// Build the list of config files, 
	// This function is also called after settings are changed.
	function loadPermissionsAndConfList(){
		return serverAction('init').then(function(data) {
			var rex = /^Checking: .*[\/\\]([^\/\\]+?).conf\s*$/gmi,
				res;
			conf = data.conf.global;
			$dashboardBody.addClass('ce_no_write_access ce_no_run_access ce_no_settings_access ce_no_git_access ');
			if(confIsTrue('write_access', false)) {
				$dashboardBody.removeClass('ce_no_write_access');
			}
			if(confIsTrue('run_commands', false)) {
				$dashboardBody.removeClass('ce_no_run_access');
			}
			if(! confIsTrue('hide_settings', false)) {
				$dashboardBody.removeClass('ce_no_settings_access');
			}
			if(confIsTrue('git_autocommit', false)) {
				$dashboardBody.removeClass('ce_no_git_access');
			}
			if (conf.hasOwnProperty('git_group_time_mins')) {
				conf.git_group_time_mins = parseFloat($.trim(conf.git_group_time_mins));
			}
			if (! conf.hasOwnProperty('git_group_time_mins') || ! Number.isInteger(conf.git_group_time_mins)) {
				conf.git_group_time_mins = 60;
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
		$spinner.detach();
		$dashboardBody.removeClass("ce_loading");
		
		setThemeMode(localStorage.getItem('ce_theme') || "vs-dark");

		// on page load, log that tabs that were open previously
		var ce_open_tabs = (JSON.parse(localStorage.getItem('ce_open_tabs')) || []);
		if (ce_open_tabs.length) {
			// move any previously open tabs into the close tabs list
			for (var i = 0; i < ce_open_tabs.length; i++){
				logClosedTab(ce_open_tabs[i]);
			}
			var $restore = $("<span class='ce_restore_session'><i class='icon-rotate'></i> <span>Restore " + (ce_open_tabs.length === 1 ? "1 tab" : ce_open_tabs.length + " tabs") + "</span></span>").appendTo($tabs);
			$restore.on("click", function(){
				for (var j = 0; j < ce_open_tabs.length; j++) {
					hooksCfg[ce_open_tabs[j].type](ce_open_tabs[j].file);
				}
			});
		}
		
		// Allow tabs to be rearranged
		Sortable.create($tabs[0], {
			draggable: ".ce_tab",
			animation: 150,
			onEnd: function () {
				// figure out how things moved and reorder list					
				openTabsListChanged();
				doPipeTabSeperators();		
			}
		});	

		// Add tooltips
		$('.ce_tree_icons i').tooltip({delay: 100, placement: 'bottom'});

		// Setup the splunk components properly
		$('header').remove();
		new LayoutView({ "hideAppBar": true, "hideChrome": false, "hideFooter": false, "hideSplunkBar": false, layout: "fixed" })
			.render()
			.getContainerElement()
			.appendChild($dashboardBody[0]);

		new Dashboard({
			id: 'dashboard',
			el: $dashboardBody,
			showTitle: true,
			editable: true
		}, { tokens: false }).render();

		DashboardController.ready();
		
		$("body").css("overflow","");

		readUrlHash();
		
		// Left pane styled scrollbar
		OverlayScrollbars($dirlist[0],{ className : "os-theme-light", overflowBehavior : { x: "hidden"} });
		
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
			serverAction('fs').then(function(contents){
				filecache = contents;
				readFolder(inFolder);
			});	
		} else {
			if (Number(conf.cache_file_depth) === -1) {
				filecache = null;
			}
			readFolder(inFolder);
		}
	});
});
