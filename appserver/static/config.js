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
	}/app/config_explorer/config.js
};
*/



// The splunk webserver prepends all scripts with a call to i18n_register() for internationalisation. This fails for web-workers becuase they dont kknow about this function yet.
// The options are patch the function in on-the-fly like so, or to edit the file on the filesystem (which makes upgrading monaco harder)
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
				"console.log('shimming i18n_register for worker'); "+
				"function i18n_register(){console.log('i18n_register shimmed');} "+
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
	"app/config_explorer/jquery.transit.min",
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
	transit,
	Sortable,
	OverlayScrollbars
) {
	// globals
	var service = mvc.createService({ owner: "nobody" });
	var editors = [];  
	var inFolder = (localStorage.getItem('ce_current_path') || './etc/apps');
	var run_history = (JSON.parse(localStorage.getItem('ce_run_history')) || []);
	var closed_tabs = (JSON.parse(localStorage.getItem('ce_closed_tabs')) || []);
	var $dashboardBody = $('.dashboard-body');
    var $dirlist = $(".ce_file_list");
	var $filelist = $(".ce_file_wrap");
	var $filePath = $(".ce_file_path");
    var $container = $(".ce_contents");
	var $spinner = $(".ce_spinner");
    var $tabs = $(".ce_tabs");
	var activeTab = null;
	var conf = {};
	var confFiles = {};
	var confFilesSorted = [];
	var inFlightRequests = 0;
	var comparisonLeftFile = null;
	var tabid = 0;
	var scrollbar;
	var leftPaneFiles = true;
	var ignore_left_pane_click = false;

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

	// Event handlers for the top bar
	$('.ce_app_link a').on('click', function(e){
		e.preventDefault();
		var p = $(this).parent();
		
		if (p.hasClass('ce_active')) {
			// clicked tab that is already active. do nothing
			
		} else if (p.hasClass('ce_app_errors')) {
			runBToolCheck();

		} else if (p.hasClass('ce_app_run')) {
			runShellCommand();
			
		} else if (p.hasClass('ce_app_settings')) {			
			readFile("");

		} else if (p.hasClass('ce_app_changelog')) {
			showChangeLog();
			
		} else {
			// Clicked a tab that causes the left pane to change
			$('.ce_app_link.ce_active').removeClass('ce_active');
			p.addClass('ce_active');
			$filelist.empty().css({"transform":"", "opacity":""});
			// Clicking one of the top links
			if (p.hasClass('ce_app_filesystem')) {
				refreshCurrentPath();
				$filePath.css({"display":""});
				$dirlist.css({"top":""});
				leftPaneFiles = true;
				
			} else if (p.hasClass('ce_app_effective')) {
				$filePath.css({"display":"none"});
				$dirlist.css({"top":"0"});
				leftPaneFiles = false;
				leftPaneConfFilesList();
			}
		}
	});
	
	// Click handlers for New File/New Folder buttons
	$filePath.on("click", ".ce_add_file, .ce_add_folder", function(e){
		e.stopPropagation();
		var parentPath = $(this).attr('file');
		fileSystemCreateNew(parentPath, !$(this).hasClass("ce_add_folder"));
	});
	
	// Click handler for left pane items
	$dirlist.on("click", ".ce_leftnav", function(){
		var elem = $(this);
		// click on a conf file
		if (elem.hasClass("ce_conf")) {
			runBToolList($(this).attr('file'), 'btool');
		// click on file
		} else if (elem.hasClass("ce_is_report")) {
			readFile(elem.attr('file'));
		} else {
			// prevent double clicking causing strange behavior
			if (ignore_left_pane_click) {return;}
			ignore_left_pane_click = true;
			setTimeout(function(){ ignore_left_pane_click = false; }, 300);
			if (elem.hasClass("ce_is_folder")) {
				// click on folder
				$filelist.transition({ x: '-200px', opacity: 0 });
			} else {
				// click on back arrow
				$filelist.transition({ x: '200px', opacity: 0 });
			}
			readFolder(elem.attr('file'));
		}
		
	// Right click menu for left pane
	}).on("contextmenu", ".ce_leftnav", function (e) {
		var $t = $(this);
		var thisFile = $t.attr('file');
		var actions = [];
		if ($t.hasClass("ce_leftnav_editable")) {
			// can rename, can trash
			actions.push($("<div>Rename</div>").on("click", function(){ fileSystemRename(thisFile); }));
			actions.push($("<div>Delete</div>").on("click", function(){ filesystemDelete(thisFile); }));
			
		} else if ($t.hasClass("ce_conf")) {
			actions.push($("<div>Show btool (hide paths)</div>").on("click", function(){ runBToolList(thisFile, 'btool-hidepaths'); }));
			actions.push($("<div>Show btool (hide 'default' settings)</div>").on("click", function(){ runBToolList(thisFile, 'btool-hidedefaults'); }));
			actions.push($("<div>Show .spec file</div>").on("click", function(){ displaySpecFile(thisFile); }));
			actions.push($("<div>Show live (running) config</div>").on("click", function(){ runningVsLayered(thisFile, false); }));
			actions.push($("<div>Compare live config against btool output</div>").on("click", function(){ runningVsLayered(thisFile, true); }));
			//actions.push($("<div>Refresh endpoint</div>").on("click", function(){  }));
		}

		if ($t.hasClass("ce_is_report")) {
			if (confIsTrue('git_autocommit', false)) {
				// can show history
				actions.push($("<div>View file history</div>").on("click", function(){ getFileHistory(thisFile); }));
			}
			// can compare
			actions.push($("<div>Mark for comparison</div>").on("click", function(){ 
				comparisonLeftFile = thisFile; 
			}));
			
			if (comparisonLeftFile && comparisonLeftFile !== thisFile) {
				actions.push($("<div>Compare to " + htmlEncode(dodgyBasename(comparisonLeftFile)) + "</div>").on("click", function(){
					var ecfg = createTab('compare', thisFile + " " + comparisonLeftFile, "<span class='ce-dim'>compare:</span> " + thisFile + " " + comparisonLeftFile, false);
					// get both files 
					Promise.all([
						serverActionWithoutFlicker('read', comparisonLeftFile),
						serverActionWithoutFlicker('read', thisFile),
					]).then(function(contents){
						updateTabAsDiffer(ecfg, comparisonLeftFile + "\n" + contents[0], thisFile + "\n" + contents[1]);
					}).catch(function(){ 
						closeTabByCfg(ecfg);
					});
				}));
			}
		}
		if (! actions.length) {
			return;
		}
		var $menu = $(".ce_context_menu_wrap");
		$menu.empty().append(actions);		
		e.preventDefault(); // To prevent the default context menu.
		$t.css("background-color","rgba(0, 99, 153, 1)");
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
			$t.css("background-color","");
			$(document).off("click");           
		});
	});
	
	// Click handler for Recent Files button in top right
	$(".ce_recent_files").on("click", function(e){
		e.stopPropagation();
		var recent = $("<ul class='ce_recent_list'></ul>");
		var counter = 0;
		var openlabels = [];
		for (var j = 0; j < editors.length; j++) {
			openlabels.push(editors[j].label);
		}
		$("<li>Recently closed</li>").appendTo(recent);
		for (var i = closed_tabs.length - 1; i >= 0 ; i--) {
			if (counter > 15) {
				break;
			}
			// hide item if they are actually open at the moment
			if (openlabels.indexOf(closed_tabs[i].label) === -1) {
				counter++;
				$("<li class='ce_selectable'></li>").text(closed_tabs[i].label).data(closed_tabs[i]).appendTo(recent);
			}
		}
		//closed_tabs.push({label: file: type: read|btool|btool-hidepaths|btool-hidedefaults|spec|running});
		$(".ce_wrap").append(recent);

		recent.on("click auxclick", ".ce_selectable", function(e){
			if (e.which === 3) {
				return;
			}			
			var d = $(this).data();
			reopenTab(d.type, d.file);
		});
			
		$(document).one("click", function(){
			recent.remove();
		});
	});

	// Event handlers for the editor tabs
	$tabs.on("click", ".ce_close_tab", function(e){
		var idx = $(this).parent().index();
		e.stopPropagation();
		closeTabWithConfirmation(idx);
	
	// Middle click to close tab
	}).on("auxclick", ".ce_tab", function(e){
		if (e.which === 3) {
			return;
		}
		var idx = $(this).index();
		e.stopPropagation();
		closeTabWithConfirmation(idx);	
	
	// Clicking tab
	}).on("click", ".ce_tab", function(){
		activateTab($(this).index());
		
	// On hover show the cross
	}).on("mouseenter", ".ce_tab", function(){
		$(this).append("<i class='ce_close_tab icon-close ce_clickable_icon ce_right_icon'></i>");
	}).on("mouseleave", ".ce_tab", function(){
		$(this).find('.ce_close_tab').remove();
	});
	
	// Used by recent files functionality
	function reopenTab(type, file) {
		if (type === 'btool-hidepaths') {
			runBToolList(file, 'btool-hidepaths');
		} else if (type === 'btool-hidedefaults') {
			runBToolList(file, 'btool-hidedefaults');
		} else if (type === 'spec') {
			displaySpecFile(file);
		} else if (type === 'running') {
			runningVsLayered(file, false);
		} else if (type === 'btool') {
			runBToolList(file, 'btool');
		} else if (type === 'btool-check') {
			runBToolCheck();
		} else if (type === 'run') {
			runShellCommandNow(file);
		} else if (type === 'read') {
			readFile(file);
		}		
	}
	
	// Keep track of what tabs are open in local storage. 
	function openTabsListChanged(){
		var t = [];
		$tabs.children().each(function(i,elem){
			$(elem).data().tab.position = i;
		});
		
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
			if (editors[i].can_reopen) {
				t.push({label: editors[i].label, type: editors[i].type, file: editors[i].file});
			}
		}
		localStorage.setItem('ce_open_tabs', JSON.stringify(t));
	}

	// Run button
	function runShellCommand() {
		var history_idx = run_history.length,
			in_progress_cmd = '',
			$input;
		showModal({
			title: "Run ",
			size: 600,
			body: "<div>Enter command to run on the server<br><br><input type='text' value='' class='ce_prompt_input input input-text' style='width: 100%; background-color: #3d424d; color: #cccccc;'/></div>",
			onShow: function(){ 
				$input = $('.ce_prompt_input');
				// Provide a history of run commands
				$input.focus().on('keydown', function(e) {
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
					$('.modal').one('hidden.bs.modal', function() {
						var command = $input.val();
						if (command) {
							runShellCommandNow(command);
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
	
	function runShellCommandNow(command){
		// save to localstorage
		var ecfg = createTab('run', command, '<span class="ce-dim">$</span> ' + htmlEncode(command), false);
		serverActionWithoutFlicker("run", command, inFolder).then(function(contents){
			// trim length
			if (run_history.length > 50) {
				run_history.shift();
			}
			// only save if the command is different to what was last run
			if (command !== run_history[(run_history.length - 1)]) {
				run_history.push(command);
			}
			localStorage.setItem('ce_run_history', JSON.stringify(run_history));
			updateTabAsEditor(ecfg, contents, false, 'none');
		}).catch(function(){ 
			closeTabByCfg(ecfg);
		});		
	}
	
	// Check config
	function runBToolCheck() {
		var ecfg = createTab('btool-check', "", 'Check config', false);
		serverActionWithoutFlicker('btool-check').then(function(contents){
			contents = contents.replace(/^(No spec file for|Checking):.*\r?\n/mg,'').replace(/^\t\t/mg,'').replace(/\n{2,}/g,'\n\n');
			if ($.trim(contents)) {
				updateTabAsEditor(ecfg, contents, false, 'none');
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
		var type = 'live';
		var tab_path_fmt = '<span class="ce-dim">live:</span> ' + path;
		if (compare) {
			type = 'live-diff';
			tab_path_fmt = '<span class="ce-dim">live/fs:</span> ' + path;
		}
		if (! tabAlreadyOpen(type, path)) {
			var ecfg = createTab(type, path, tab_path_fmt, false);
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
							updateTabAsEditor(ecfg, contents_running, false, 'ini');
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
			var ecfg = createTab(type, path, tab_path_fmt, true);
			serverActionWithoutFlicker('btool-list', path).then(function(contents){
				var c = formatBtoolList(contents, ce_btool_default_values, ce_btool_path);
				if ($.trim(c)) {
					updateTabAsEditor(ecfg, c, false, 'ini');
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
				closeTabByCfg(ecfg);
			});
		}	
	}	
	
	function displaySpecFile(path) {
		var tab_path_fmt = '<span class="ce-dim">spec:</span> ' + path;
		if (! tabAlreadyOpen('spec', path)) {
			var ecfg = createTab('spec', path, tab_path_fmt, true);
			serverActionWithoutFlicker('spec', path).then(function(contents) {
				if ($.trim(contents)) {
					updateTabAsEditor(ecfg, contents, false, 'ini');
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
	function refreshCurrentPath() {
		return readFolder(inFolder);
	}

	// Run server action to load a folder
	function readFolder(path){
		return serverAction('read', path).then(function(contents){
			// If the user changed to the conf files tab, then dump out
			if (! leftPaneFiles) {
				return;
			}
			inFolder = path;
			localStorage.setItem('ce_current_path', inFolder);
			contents.sort(function (a, b) {
				return a.toLowerCase().localeCompare(b.toLowerCase());
			});
			$filelist.empty().css("transform","");
			$filePath.empty().attr("title", path);
			$("<span></span><bdi></bdi><i title='New folder' class='ce_add_folder ce_clickable_icon ce_right_icon ce_right_two icon-folder'></i>" +
						"<i title='New file' class='ce_add_file ce_clickable_icon ce_right_icon icon-report'></i>").attr("file", path).appendTo($filePath);
			var span = $filePath.find("span").text(path + '/');
			$filePath.find("bdi").text(path + '/');
			if (span.width() > $filePath.width()) {
				$filePath.addClass('ce_rtl');
			} else {
				$filePath.removeClass('ce_rtl');
			}
			if (path !== ".") {
				$("<div class='ce_leftnav'><i class='icon-arrow-left'></i> ..</div>").attr("file", path.replace(/[\/\\][^\/\\]+$/,'')).appendTo($filelist);
			}
			for (var i = 0; i < contents.length; i++) {
				var icon = "folder";
				if (contents[i].substr(0,1) === "F") {
					icon = "report";
				}
				$("<div class='ce_leftnav ce_leftnav_editable ce_is_" + icon + "'></div>").text(contents[i].substr(1)).attr("file", path + "/" + contents[i].substr(1)).prepend("<i class='icon-" + icon + "'></i> ").appendTo($filelist);
			}
			$filelist.transition({x: '0px', "opacity":1});
			leftPathChanged();
		});
	}
	
	// Handle clicking an file or folder in the left pane
	function readFile(path){
		if (! tabAlreadyOpen('read', path)) {
			var label = dodgyBasename(path);
			var can_reopen = true;
			if (path === "") {
				label = "Settings";
				can_reopen = false;
			}
			var ecfg = createTab('read', path, label, can_reopen);
			serverActionWithoutFlicker('read', path).then(function(contents){
				updateTabAsEditor(ecfg, contents, true);
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
					if (e.which == 13) {
						$('.modal').find('button:first-child').click();
					}
				}); 
			},
			actions: [{
				onClick: function(){
					$('.modal').one('hidden.bs.modal', function() {
						var fname = $('.ce_prompt_input').val();
						if (fname) {
							serverAction("new" + type, parentPath, fname).then(function(){
								refreshCurrentPath();
								showToast('Success');
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
					if (e.which == 13) {
						$('.modal').find('button:first-child').click();
					}
				}); 
			},
			actions: [{
				onClick: function(){
					$('.modal').one('hidden.bs.modal', function() {
						var newname = $('.ce_prompt_input').val();
						if (newname && newname !== bn) {
							serverAction("rename", parentPath, newname).then(function(){
								refreshCurrentPath();
								showToast('Success');
								// if "path" is open in an editor, it needs to be closed without warning
								closeTabByName(parentPath);
						
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
					if (e.which == 13) {
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
						serverAction("delete", file).then(function(){
							refreshCurrentPath();
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
		var ecfg = createTab('change-log', "", "Change log", false);
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
				table.append("<tr commitstart='" + changes[i].sha +"' commitend='" + changes[i].last_sha +"'><td class='nobr'>" + changes[i].time.format("YYYY-MM-DD  h:mma") + "</td><td class='nobr'>" + changes[i].time.fromNow() + "</td>" + type + "<td class='nobr'>" + changes[i].user + "</td><td class='ce_changelog_filescol'>" + fileshtml + "</td></tr>")
			}
		
			updateTabHTML(ecfg, $("<div class='ce_changelog'></div>").append(table));

			table.on("click", ".ce_clickable_icon", function(){
				var $elem = $(this),
					filestr = $.trim($elem.parent().parent().text());
					
				if ($elem.hasClass('icon-number')) {
					var filecommitstr = $elem.parents("tr").attr("commitstart") + ":./" + filestr;
					var ecfg = createTab('diff', filestr, "<span class='ce-dim'>diff:</span> " + dodgyBasename(filestr), false);
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
		var ecfg = createTab('history', file, "<span class='ce-dim'>history:</span> " + dodgyBasename(file), false);
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
	
	// The conf file list
	function leftPaneConfFilesList() {
		$filelist.empty();
		for (var i = 0; i < confFilesSorted.length; i++) {
			$("<div class='ce_leftnav ce_conf'></div>").text(confFilesSorted[i]).attr("file", confFilesSorted[i]).prepend("<i class='icon-gear'></i> ").appendTo($filelist);
		}
		$filelist.transition({"opacity":1});
		leftPathChanged();
	}
	
	function activateTab(idx){
		hideAllTabs();
		activeTab = idx;
		$tabs.children().eq(idx).addClass('ce_active');
		editors[idx].container.removeClass('ce_hidden');
		editors[idx].last_opened = Date.now();  
		doPipeTabSeperators();
	}
	
	function hideAllTabs() {
		$container.children().addClass("ce_hidden");
		$tabs.children().removeClass("ce_active");
	}
	
	// The pipe seperators are between active tabs but not on the currently active tab or the one to its left.
	function doPipeTabSeperators(){
		$(".ce_pipe").remove();
		$tabs.children().each(function(i){
			if ((activeTab - 1) !== i && activeTab !== i) {
				$(this).append('<span class="ce_pipe"></span>');
			}
		});		
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
		if (ecfg.can_reopen) {
			closed_tabs.push({label: ecfg.label, type: ecfg.type, file: ecfg.file});
		}
		// trim length
		if (closed_tabs.length > 30) {
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
		editors[idx].tab.remove();
		editors[idx].container.remove();
		editors.splice(idx, 1);
		openTabsListChanged();
		// if there are still tabs open, find the most recently used tab and activate that one
		if ($tabs.children().length === 0) {
			activeTab = null;
		
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

	function createLabel(type, file) {
		if (type === "read"){ 
			return file; 
		}
		return type + ": " + file;
	}
	
	function createTab(type, file, label, can_reopen, contents){
		var ecfg = {
			type: type, 
			file: file,
			label: createLabel(type, file),
			can_reopen: can_reopen,
			id: tabid++
		};
		editors.push(ecfg);	
		ecfg.container = $("<div></div>").appendTo($container);
		if (contents === undefined) {
			contents = $spinner.clone();
		}
		ecfg.container.append(contents);
		// Remove the "restore session" link
		$(".ce_restore_session").remove();
		ecfg.tab = $("<div class='ce_tab ce_active'>" + label + "<div class='ce_tab_shadow'></div></div>").attr("title", ecfg.label).data({"tab": ecfg}).appendTo($tabs);
		ecfg.hasChanges = false;
		ecfg.server_content = '';
		activateTab(editors.length-1);
		openTabsListChanged();
		return ecfg;
	}
	
	function updateTabAsEditor(ecfg, contents, canBeSaved, language) {
		// TODO instead use the built-in language detection
		if (!language) {
			language = "ini"; // .conf, .meta, spec
			if (/.js$/.test(ecfg.file)) {
				language = "javascript";
			} else if (/.xml$/.test(ecfg.file)) {
				language = "xml";
			} else if (/.html$/.test(ecfg.file)) {
				language = "html";
			} else if (/.css$/.test(ecfg.file)) {
				language = "css";
			} else if (/.py$/.test(ecfg.file)) {
				language = "python";
			} else if (/.md$/.test(ecfg.file)) {
				language = "markdown";
			}
		}
		var re = /([^\/\\]+).conf$/;
		var found = ecfg.file.match(re);
		if (found && ecfg.type === 'read' && found[1] !== 'app') {
			ecfg.matchedConf = found[1];
		}					
		ecfg.canBeSaved = canBeSaved;
		ecfg.saving = false;
		ecfg.decorations = [];
		ecfg.container.empty();
		ecfg.editor = monaco.editor.create(ecfg.container[0], {
			automaticLayout: true,
			lineNumbersMinChars: 3,
			value: contents,
			language: language,
			ariaLabel: ecfg.file,
			readOnly: ! ecfg.canBeSaved,
			theme: "vs-dark",
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
	
		ecfg.editor.addAction({
			id: 'save-file',
			contextMenuOrder: 1,
			contextMenuGroupId: ecfg.canBeSaved ? '1_modification' : null,
			label: 'Save file',
			run: function() {
				saveActiveTab();
			}
		});
		if (ecfg.hasOwnProperty('matchedConf')) {
			ecfg.editor.addAction({
				id: 'btool-file',
				contextMenuOrder: 1.1,
				contextMenuGroupId: '1_modification',
				label: 'Run btool on ' + ecfg.matchedConf + '.conf',
				run: function() {
					runBToolList(ecfg.matchedConf, "btool");
				}
			});	
			ecfg.editor.addAction({
				id: 'spec-file',
				contextMenuOrder: 1.12,
				contextMenuGroupId: '1_modification',
				label: 'Open ' + ecfg.matchedConf + '.conf.spec',
				run: function() {
					displaySpecFile(ecfg.matchedConf);
				}
			});
		}
		// add an ability to refresh for btools
		if (ecfg.type === 'btool' || ecfg.type === 'btool-hidedefaults' || ecfg.type === 'btool-hidepaths' || ecfg.type === 'btool-check' || ecfg.type === 'run') {
			ecfg.editor.addAction({
				id: 'reload',
				contextMenuOrder: 1.12,
				contextMenuGroupId: '1_modification',
				label: 'Reload',
				run: function() {
					var type = ecfg.type;
					var file = ecfg.file;
					closeTabByCfg(ecfg);
					reopenTab(type, file);
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
		openTabsListChanged();
	}
	
	function saveActiveTab(){
		if (activeTab === null) {
			return;
		}
		var ecfg = editors[activeTab];
		if (ecfg.canBeSaved) {
			if (! ecfg.saving) {
				var saved_value = ecfg.editor.getValue();
				ecfg.saving = true;
				serverAction('save', ecfg.file, saved_value).then(function(){
					ecfg.saving = false;
					showToast('Saved');
					ecfg.server_content = saved_value;
					ecfg.tab.find('.icon-alert-circle').remove();
					ecfg.hasChanges = false;	
					highlightBadConfig(ecfg);
					
					if (ecfg.file === "") {
						loadPermissionsAndConfList();
					}
				}, function(){
					ecfg.saving = false;
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
		ecfg.container.html(contents);
	}
	
	function updateTabAsDiffer(ecfg, left, right) {
		var originalModel = monaco.editor.createModel(left, "ini");
		var modifiedModel = monaco.editor.createModel(right, "ini");
		ecfg.container.empty();
		ecfg.editor = monaco.editor.createDiffEditor(ecfg.container[0],{
			automaticLayout: true,
			theme: "vs-dark",
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
						if (type === "read" && path === localStorage.getItem('ce_current_path')) {
							// Folder must have been deleted outside of this
							readFolder(".");
						}
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
							git_output += "<div class='ce_gitoutput-" + r.data.git[j].type + "'>" + htmlEncode($.trim(r.data.git[j].content)) + "</div>"
						}
						var ecfg = createTab('git', '', 'git output', false);
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
		return contents.replace(/^.+?splunk[\/\\]etc[\/\\](.*?\.conf)\s+(.+)(\r?\n)/img,function(all, g1, g2, g3){
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
				// Build lookup of btool output
				var lookup = buildBadCodeLookup(btoolcontents);
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
					reProps = /^\s*((\w+)[^=\s]*)\s*=/,
					newdecorations = [],
					extra;
				for (var i = 0; i < rows.length; i++) {
					if (rows[i].substr(0,1) === "[") {
						if (rows[i].substr(0,9) === "[default]") {
							currentStanza = "";
						} else {
							currentStanza = $.trim(rows[i]);
						}
						if (seenStanzas.hasOwnProperty(currentStanza)) {
							newdecorations.push({ range: new monaco.Range((1+i),1,(1+i),1), options: { isWholeLine: true, glyphMarginClassName: 'ceOrangeLine', glyphMarginHoverMessage: [{value:"Duplicate Stanza in this file"}]  }});
						}
						seenStanzas[currentStanza] = 1;
						seenProps =  {};
					} else {
						var found = rows[i].match(reProps);
						if (found) {
							if (found[1].substr(0,1) !== "#") {
								if (seenProps.hasOwnProperty(found[1])) {
									newdecorations.push({ range: new monaco.Range((1+i),1,(1+i),1), options: { isWholeLine: true, glyphMarginClassName: 'ceOrangeLine', glyphMarginHoverMessage: [{value:"Duplicate key in stanza"}]  }});
								} else {
									seenProps[found[1]] = 1;
									if (lookup.hasOwnProperty(currentStanza) && lookup[currentStanza].hasOwnProperty(found[1]) && lookup[currentStanza][found[1]] === ecfg.file) {
										if (ecfg.hasOwnProperty('hinting') && found.length > 2) {
											if (ecfg.hinting[""].hasOwnProperty(found[2]) || (ecfg.hinting.hasOwnProperty(currentStanza) && ecfg.hinting[currentStanza].hasOwnProperty(found[2]))) {
												newdecorations.push({ range: new monaco.Range((1+i),1,(1+i),1), options: { isWholeLine: true, glyphMarginClassName: 'ceGreeenLine', glyphMarginHoverMessage: [{value:"Found in \"btool\" output and spec file. Stanza=\"" + currentStanza + "\" or property \"" + found[2] + "\""}]  }});
											} else {
												newdecorations.push({ range: new monaco.Range((1+i),1,(1+i),1), options: { isWholeLine: true, glyphMarginClassName: 'ceDimGreeenLine', glyphMarginHoverMessage: [{value:"Found in \"btool\" output, but not found in spec file. Unexpected stanza \"" + currentStanza + "\" or property \"" + found[2] + "\"" }]  }});
											}
										}
									} else {
										// attempt to find the stanza by expanding $SPLUNK_HOME
										currentStanzaExpandedHome = currentStanza.replace(/\$SPLUNK_HOME/i, splunk_home);
										if (lookup.hasOwnProperty(currentStanzaExpandedHome) && lookup[currentStanzaExpandedHome].hasOwnProperty(found[1]) && lookup[currentStanzaExpandedHome][found[1]] === ecfg.file) {
											newdecorations.push({ range: new monaco.Range((1+i),1,(1+i),1), options: { isWholeLine: true, glyphMarginClassName: 'ceGreeenLine', glyphMarginHoverMessage: [{value:"Found in \"btool\" output"}]  }});
										} else {
											// TODO: attempt to expand stanza [script://./bin/go.sh] from current script location
											extra = "";
											if (!lookup.hasOwnProperty(currentStanza)){
												extra = "(btool does not have stanza \"" + currentStanza +"\")";
											} else if (! lookup[currentStanza].hasOwnProperty(found[1])){
												extra = "(btool with stanza [" + currentStanza +"] does not have property \"" + found[1] + "\")";
											} else {
												extra = "(set in :" + lookup[currentStanza][found[1]] + ")";
											}
											newdecorations.push({ range: new monaco.Range((1+i),1,(1+i),1), options: { isWholeLine: true, glyphMarginClassName: 'ceRedLine', glyphMarginHoverMessage: [{value:"Not found in \"btool\" output " + extra + ""}] }});
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
					confFiles[conf][currentStanza] = {"":{t:"", c:""}};
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
	
	//create a in-memory div, set it's inner text(which jQuery automatically encodes)
	//then grab the encoded contents back out.  The div never exists on the page.
	function htmlEncode(value){
		return $('<div/>').text(value).html();
	}

	function confIsTrue(param, defaultValue) {
		if (!conf.hasOwnProperty(param)) {
			return defaultValue;
		}
		return (["1", "true", "yes", "t", "y"].indexOf($.trim(conf[param].toLowerCase())) > -1);
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
		
	function leftPathChanged(){
		if (typeof scrollbar === "undefined") {
			scrollbar = OverlayScrollbars($dirlist[0],{ className : "os-theme-light", overflowBehavior : { x: "hidden"} });
		}		
	}
	
	// Build the list of config files, 
	function loadPermissionsAndConfList(){
		return serverAction('init').then(function(data) {
			var rex = /^Checking: .*[\/\\]([^\/\\]+?).conf\s*$/gmi,
				res;
			conf = data.conf;
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

		// on page load, log that tabs that were open previously
		var ce_open_tabs = (JSON.parse(localStorage.getItem('ce_open_tabs')) || []);
		if (ce_open_tabs.length) {
			for (var i = 0; i < ce_open_tabs.length; i++){
				logClosedTab(ce_open_tabs[i]);
			}
			var $restore = $("<span class='ce_restore_session'><i class='icon-rotate'></i> <span>Restore " + (ce_open_tabs.length === 1 ? "1 tab" : ce_open_tabs.length + " tabs") + "</span></span>").appendTo($tabs);
			$restore.on("click", function(){
				for (var j = 0; j < ce_open_tabs.length; j++) {
					reopenTab(ce_open_tabs[j].type, ce_open_tabs[j].file);
				}
			});
		}
		
		// Allow tabs to be rearranged
		Sortable.create($tabs[0], {
			draggable: ".ce_tab",
			animation: 150,
			onEnd: function () {
				// uptohere figure out how things moved and reorder list					
				openTabsListChanged();
				doPipeTabSeperators();		
			}
		});	

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
		
		// Build the directory
		refreshCurrentPath();		
	});
});
