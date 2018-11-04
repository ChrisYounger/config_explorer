// Copyright (C) 2018 Chris Younger

require.config({ paths: { 'vs': '../app/config_explorer/node_modules/monaco-editor/min/vs' }});

require([
	"splunkjs/mvc",
	"jquery",
    "underscore",
	"moment",
	"splunkjs/mvc/simplexml",
	"splunkjs/mvc/layoutview",
	"splunkjs/mvc/simplexml/dashboardview",
    "splunkjs/mvc/searchmanager",
    "vs/editor/editor.main",
], function(
	mvc,
	$,
    _,
	moment,
	DashboardController,
	LayoutView,
	Dashboard,
    SearchManager,
    wat,
) {

	// Lovely globals
    var service = mvc.createService({ owner: "nobody" });
    var editors = [];  
	var inFolder = (localStorage.getItem('ce_current_path') || './etc/apps');
	var run_history = (JSON.parse(localStorage.getItem('ce_run_history')) || []);
	var $dashboardBody = $('.dashboard-body');
    var $dirlist = $(".ce_file_list");
    var $container = $(".ce_contents");
    var $tabs = $(".ce_tabs");
	var activeTab = null;
	var conf = {};
	var confFiles = {};
	var confFilesSorted = [];
	var action_mode = 'read';
	var inFlightRequests = 0;
	var comparisonLeftFile = null;
	var comparisonLeftMode = null;

	// Prevent people from navigating away when they have unsaved changes
    $(window).on("beforeunload", function() {
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
			readFileOrFolderAndUpdate("")

		} else if (p.hasClass('ce_app_changelog')) {
            var table = $("<table></table>");
            serverAction("git-log", undefined, function(contents){
                // commit 1, datetime 2 user 3 change 4 files 5 additions 6 deletions 7
                var rex = /commit\s+(\S+).*?Date:\s+\S+\s+(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(\S+)(?: +(\S+))?\s+(.+?)\d+\s+files? changed,(?: (\d+) insertions?\(\+\))?(?: (\d+) deletions?\(\-\))?/gs,
					time,
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
							for (var i = 0; i < files.length; i++) {
								f = $.trim(files[i]);
								if (f) {
									item.files.push(f);
								}
							}
						}
						if (item.files.length === 1 && item.change === 'save') {
							if (mapper.hasOwnProperty(item.files[0]) && mapper[item.files[0]].user === item.user) {
								timediff = mapper[ item.files[0] ].time.diff(item.time, 'minutes');
								if (timediff < 60) {
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
            });
			openHTMLTab("Change log", "Change log", $("<div class='ce_changelog'></div>").append(table));

			table.on("click", ".ce_clickable_icon", function(e){
				var $elem = $(this);
				if ($elem.hasClass('icon-number')) {
					var filestr = $.trim($elem.parent().parent().text());
					var filecommitstr = $elem.parents("tr").attr("commitstart") + ":./" + filestr;
					
					serverAction("git-show", filecommitstr, function(contents1){
						serverAction("read", filestr, function(contents2){
							openNewDiffTab("Diff: " + filestr, "Diff: " + dodgyBasename(filestr), "# " + filecommitstr + "\n" + contents1, "# Current HEAD:./" + filestr + "\n" + contents2);		
						});
					});				
				} else if ($elem.hasClass('icon-speech-bubble')) {
					var filestr = $.trim($elem.parent().parent().text());
					var filecommitstrstart = $elem.parents("tr").attr("commitstart");
					var filecommitstrend = $elem.parents("tr").attr("commitend");
					getFileHistory(filestr, filecommitstrstart, filecommitstrend);
				}
			});

		} else {
			// Clicked a tab that causes the left pane to change
			$('.ce_app_link.ce_active').removeClass('ce_active');
			p.addClass('ce_active');
			// Clicking one of the top links
			if (p.hasClass('ce_app_filesystem')) {
				refreshCurrentPath();
				action_mode = 'read';
				
			} else if (p.hasClass('ce_app_effective') || p.hasClass('ce_app_specs') || p.hasClass('ce_app_running')) {
				action_mode = 'btool-list';
				buildLeftPane();
			}
		}
	});
	
	// Click handlers for stuff in the left pane
    $dirlist.on("click", ".ce_add_file,.ce_add_folder", function(e){
        e.stopPropagation();
		var parentPath = $(this).parent().attr('file');
		fileSystemCreateNew(parentPath, !$(this).hasClass("ce_add_folder"));

	}).on("contextmenu", ".ce_leftnav", function (e) {
		var $t = $(this);
		thisFile = $t.attr('file');
		var actions = [];
		if ($t.hasClass("ce_leftnav_editable")) {
			// can rename, can trash
			actions.push($("<div>Rename</div>").on("click", function(){ fileSystemRename(thisFile); }));
			actions.push($("<div>Delete</div>").on("click", function(){ filesystemDelete(thisFile); }));
			
		} else if ($t.hasClass("ce_conf")) {
			
			actions.push($("<div>Show btool output with originating path</div>").on("click", function(){ runBToolList(thisFile, true, true); })); // runBToolList(path, ce_btool_default_values, ce_btool_path)
			actions.push($("<div>Show btool output hiding 'default' settings</div>").on("click", function(){ runBToolList(thisFile, false, true); }));
			actions.push($("<div>Show .spec file</div>").on("click", function(){ displaySpecFile(thisFile); }));
			actions.push($("<div>Show live config</div>").on("click", function(){ runningVsLayered(thisFile, false); }));
			actions.push($("<div>Compare live config against btool output</div>").on("click", function(){ runningVsLayered(thisFile, true); }));
			//actions.push($("<div>Refresh endpoint</div>").on("click", function(){  }));
			
		}
		// TODO this doesnt work with layered
		if ($t.hasClass("ce_is_report")) {
			if (confIsTrue('git')) {
				// can show history
				actions.push($("<div>View file history</div>").on("click", function(){ getFileHistory(thisFile); }));
			}
			// can compare
			actions.push($("<div>Mark for comparison</div>").on("click", function(){ comparisonLeftFile = thisFile; comparisonLeftMode = action_mode; }));
			if (comparisonLeftFile && !(comparisonLeftFile === thisFile && comparisonLeftMode === action_mode)) {
				actions.push($("<div>Compare to " + htmlEncode(dodgyBasename(comparisonLeftFile)) + "</div>").on("click", function(){
					// get both files 
					Promise.all([
						getContentsFromMode(comparisonLeftMode, comparisonLeftFile),
						getContentsFromMode(action_mode, thisFile),
					]).then(function(contents_left, contents_this){
						openNewDiffTab("Compare " + thisFile + " " + comparisonLeftFile, "Compare", comparisonLeftFile + "\n" + contents_left, thisFile + "\n" + contents_this);
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

    }).on("click", ".ce_leftnav", function(){	
		if (action_mode === 'btool-list') {
			runBToolList($(this).attr('file'), true, false);

		} else if (action_mode === 'read') {
			readFileOrFolderAndUpdate($(this).attr('file'));
		}
    });

	function getContentsFromMode(mode, path){
		if (mode === 'running') {
			return getRunningConfig(path);
		}
		return new Promise(function(resolve, reject){
			if (mode === 'btool-list') {
				serverAction('btool-list', path, function(contents){
					resolve($.trim(formatBtoolList(contents, true, false)));
				});
				
			} else if (mode === 'spec') {
				serverAction('spec', path, function(contents){			
					resolve($.trim(contents));
				});
								
			} else if (mode === 'read') {
				serverAction('read', path, function(contents){
					resolve($.trim(contents));
				});
			}			
		});
	}
		
	// Event handlers for the editor tabs
    $tabs.on("click", ".ce_close_tab", function(e){
        var idx = $(this).parent().index();
        e.stopPropagation();
		closeTabWithConfirmation(idx);
        
    }).on("click", ".ce_tab", function(){
        activateTab($(this).index());
        
    }).on("mouseenter", ".ce_tab", function(){
        $(this).append("<i class='ce_close_tab icon-close ce_clickable_icon ce_right_icon'></i>");
        
    }).on("mouseleave", ".ce_tab", function(){
        $(this).find('.ce_close_tab').remove();
    });
	
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
					$('.modal').one('hidden.bs.modal', function (e) {
						var command = $input.val();
						if (command) {
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
							serverAction("run", command, function(contents){
								openNewTab('$ ' + command, '<span class="ce-dim">$</span> ' + command, contents, false, 'none');
							}, command);
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
	
	function runBToolCheck() {
		serverAction('btool-check', undefined, function(contents){
			contents = contents.replace(/^(No spec file for|Checking):.*\r?\n/mg,'').replace(/^\t\t/mg,'').replace(/\n{2,}/g,'\n\n');
			if ($.trim(contents)) {
				openNewTab('Check config', 'Check config', contents, false, 'none');
			} else {
				showModal({
					title: "Info",
					body: "<div class='alert alert-info'><i class='icon-alert'></i>No configuration errors found</div>",
					size: 300
				});	
			}				
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
					resolve(str);
				} else {
					reject();
				}
			});							
		})	
	}
	
	function runningVsLayered(path, compare){
		//var ce_running_diff = $('.ce_running_diff:checked').length;
		var tab_path = 'running config: ' + path;
		var tab_path_fmt = '<span class="ce-dim">live:</span> ' + path;
		if (compare) {
			tab_path = 'running config vs filesystem: ' + path;
			tab_path_fmt = '<span class="ce-dim">live/fs:</span> ' + path;
		}
		if (! tabAlreadyOpen(tab_path)) {
			serverAction('btool-list', path, function(contents){
				var c = formatBtoolList(contents, true, false);
				if ($.trim(c)) {
					getRunningConfig(path).then(function(contents_running){
						if (compare) {
							openNewDiffTab(
								tab_path, 
								tab_path_fmt, 
								"# Filesystem (layered) config\n" + formatLikeRunningConfig(contents), //formatLikeRunningConfig(contents), 
								"# Running config\n" + contents_running
							);
						} else {
							openNewTab(tab_path, tab_path_fmt, contents_running); //formatLikeRunningConfig(contents));
						}						
					}).catch(function(){
						showModal({
							title: "Warning",
							body: "<div class='alert alert-warning'><i class='icon-alert'></i>Could not get retreieve running config for " + htmlEncode(path) + "</div>",
							size: 300
						});								
					});	
				} else {
					showModal({
						title: "Error",
						body: "<div class='alert alert-error'><i class='icon-alert'></i>Unable to get config for " + htmlEncode(path) + "</div>",
						size: 300
					});							
				}							
			});
		}	
	}
	
	function runBToolList(path, ce_btool_default_values, ce_btool_path){
		var tab_path = 'btool: ' + path;
		var tab_path_fmt = '<span class="ce-dim">btool:</span> ' + path;
		if (! ce_btool_default_values) { 
			tab_path += " (no defaults)"  
			tab_path_fmt += " <span class='ce-dim'>(no defaults)</span>"  
		} else if (ce_btool_path) { 
			tab_path += " --debug"  
			tab_path_fmt += " <span class='ce-dim'>--debug</span>"  
		}
		if (! tabAlreadyOpen(tab_path, true, false)) {
			serverAction('btool-list', path, function(contents){
				var c = formatBtoolList(contents, ce_btool_default_values, ce_btool_path);
				if ($.trim(c)) {
					var ecfg = openNewTab(tab_path, tab_path_fmt, c, false, 'ini');
					ecfg.btoollist = contents;
					serverAction('spec-hinting', path, function(c){
						ecfg.hinting = buildHintingLookup(path, c);
					});					
				} else {
					showModal({
						title: "Warning",
						body: "<div class='alert alert-warning'><i class='icon-alert'></i>No contents</div>",
						size: 300
					});							
				}							
			});
		}	
	}	
	
	
	function displaySpecFile(path) {
		var tab_path = 'spec: ' + path;
		var tab_path_fmt = '<span class="ce-dim">spec:</span> ' + path;
		if (! tabAlreadyOpen(tab_path)) {
			serverAction('spec', path, function(contents){			
				if ($.trim(contents)) {
					openNewTab(tab_path, tab_path_fmt, contents, false, 'ini');
				} else {
					showModal({
						title: "Error",
						body: "<div class='alert alert-error'><i class='icon-alert'></i>No spec file found!</div>",
						size: 300
					});							
				}
			});
		}			
	}

	// Update and display the left pane in filesystem mode
	function refreshCurrentPath() {
		readFileOrFolderAndUpdate(inFolder);
	}
	
	// Handle clicking an file or folder in the left pane
	function readFileOrFolderAndUpdate(path){
		if (! tabAlreadyOpen(path)) {
			serverAction('read', path, function(contents){
				if (typeof contents === "string") {					
					var ecfg = openNewTab(path, dodgyBasename(path), contents, true);
					
					var re = /([^\/\\]+).conf$/;
					var found = path.match(re);
					if (found) {
						if (confIsTrue('conf_validate_on_save')) {
							ecfg.attemptBtooling = found[1];
							highlightBadConfig(ecfg);
						}
						if (confFiles.hasOwnProperty(found[1])) {
							var conf = found[1];
							serverAction('spec-hinting', conf, function(c){
								ecfg.hinting = buildHintingLookup(conf, c);
							});
						}						
					} 
					
				} else {
					inFolder = path;
					localStorage.setItem('ce_current_path', inFolder);
					contents.sort(function (a, b) {
						return a.toLowerCase().localeCompare(b.toLowerCase());
					});
					$dirlist.empty();
					var dir = $("<li class='ce_leftnavfolder'><span></span><bdi></bdi><i title='New folder' class='ce_add_folder ce_clickable_icon ce_right_icon ce_right_two icon-folder'></i>" +
								"<i title='New file' class='ce_add_file ce_clickable_icon ce_right_icon icon-report'></i></li>").attr("file", path).attr("title", path).appendTo($dirlist);
					var span = dir.find("span").text(path + '/');
					dir.find("bdi").text(path + '/');
					if (span.width() > (dir.width() - 50)) {
						dir.addClass('ce_rtl');
					}
					if (path !== ".") {
						$("<li class='ce_leftnav'><i class='icon-arrow-left'></i> ..</li>").attr("file", path.replace(/[\/\\][^\/\\]+$/,'')).appendTo($dirlist);
					}
					for (var i = 0; i < contents.length; i++) {
						var icon = "folder";
						if (contents[i].substr(0,1) === "F") {
							icon = "report";
						}
						$("<li class='ce_leftnav ce_leftnav_editable ce_is_" + icon + "'></li>").text(contents[i].substr(1)).attr("file", path + "/" + contents[i].substr(1)).prepend("<i class='icon-" + icon + "'></i> ").appendTo($dirlist);
					}
				}
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
					$('.modal').one('hidden.bs.modal', function (e) {
						var fname = $('.ce_prompt_input').val();
						if (fname) {
							serverAction("new" + type, parentPath, function(){
								refreshCurrentPath();
								showToast('Success');
							}, fname);
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
		var bn = dodgyBasename(parentPath);
		showModal({
			title: "Rename",
			size: 400,
			body: "<div>Enter new name for <code>" + bn + "</code><br><br><input type='text' value='" + bn + "' class='ce_prompt_input input input-text' style='width: 100%; background-color: #3d424d; color: #cccccc;'/></div>",
			onShow: function(){ 
				$('.ce_prompt_input').focus().on('keydown', function(e) {
					if (e.which == 13) {
						$('.modal').find('button:first-child').click();
					}
				}); 
			},
			actions: [{
				onClick: function(){
					$('.modal').one('hidden.bs.modal', function (e) {
						var newname = $('.ce_prompt_input').val();
						if (newname) {
							serverAction("rename", parentPath, function(){
								refreshCurrentPath();
								showToast('Success');
								// if "path" is open in an editor, it needs to be closed without warning
								closeTabByName(parentPath);
						
							}, newname);
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
					$('.modal').one('hidden.bs.modal', function (e) {
						serverAction("delete", file, function(){
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
	
	function getFileHistory(file, commitstart, commitend){
		serverAction("git-history", file, function(contents){
			contents = $.trim(contents);
			if (! contents) {
				showModal({
					title: "Warning",
					body: "<div class='alert alert-warning'><i class='icon-alert'></i>No change history found for: <br><br><code>" + htmlEncode(file) + "</code></div>",
					size: 400
				});				
				return;
			}
			lines = htmlEncode(contents).split(/\r?\n/);
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
			
			openHTMLTab("History: " + file, "History: " + dodgyBasename(file), $("<div class='ce_file_history'></div>").html(str));		
		});
	}
	
	// Might be either the effective config or spec config screen
	function buildLeftPane() {
		$dirlist.empty();

		for (var i = 0; i < confFilesSorted.length; i++) {
			$("<li class='ce_leftnav ce_conf'></li>").text(confFilesSorted[i]).attr("file", confFilesSorted[i]).prepend("<i class='icon-report'></i> ").appendTo($dirlist);
		}
	}
	
    function activateTab(idx){
        hideAllTabs();
        $container.children().eq(idx).removeClass('ce_hidden');
        $tabs.children().eq(idx).addClass('ce_active');
        editors[idx].last_opened = Date.now();        
		activeTab = idx;
    }
	
    function hideAllTabs() {
        $container.children().addClass("ce_hidden");
        $tabs.children().removeClass("ce_active");
    }

	function closeTabByName(path) {
		for (var i = 0; i < editors.length; i++) {
			if (editors[i].file === path) {
				closeTabNow(i);
				return;
			}
		}
	}
	
	function tabAlreadyOpen(tab_path) {
		// check if file is already open
		for (var i = 0; i < editors.length; i++) {
			if (editors[i].file === tab_path) {
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
	
	function closeTabNow(idx) {
		if (editors[idx].hasOwnProperty("editor")) {
			editors[idx].editor.dispose();
		}
		editors[idx].tab.remove();
		editors[idx].container.remove();
		editors.splice(idx, 1);
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
	
	function openNewTab(filename, tab_title, contents, canBeSaved, language) {
		var ecfg = {};
		hideAllTabs();
		if (!language) {
			language = "ini"; // .conf, .meta, spec
			if (/.js$/.test(filename)) {
				language = "javascript";
			} else if (/.xml$/.test(filename)) {
				language = "xml";
			} else if (/.html$/.test(filename)) {
				language = "html";
			} else if (/.css$/.test(filename)) {
				language = "css";
			} else if (/.py$/.test(filename)) {
				language = "python";
			} else if (/.md$/.test(filename)) {
				language = "markdown";
			}
		}
		ecfg.container = $("<div></div>").appendTo($container);
		ecfg.file = filename;
		if (tab_title === "") {
			tab_title = "Settings"
		}
		ecfg.tab = $("<div class='ce_tab ce_active'>" + tab_title + "</div>").attr("title", filename).appendTo($tabs);
		ecfg.last_opened = Date.now();
		ecfg.hasChanges = false;
		ecfg.editor = monaco.editor.create(ecfg.container[0], {
			automaticLayout: true,
			value: contents,
			language: language,
			readOnly: ! canBeSaved,
			theme: "vs-dark",
			glyphMargin: true
			
		});
		ecfg.saving = false;
		ecfg.decorations = [];

		ecfg.server_content = ecfg.editor.getValue();
		if (canBeSaved) {
			ecfg.editor.onDidChangeModelContent(function (e) {
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
			contextMenuGroupId: canBeSaved ? '1_modification' : null,
			label: 'Save file',
			keybindings: [
				monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_S,
			],
			run: function(ed) {
				if (canBeSaved) {
					if (! ecfg.saving) {
						var saved_value = ecfg.editor.getValue();
						ecfg.saving = true;
						serverAction('save', ecfg.file, function(){
							ecfg.saving = false;
							showToast('Saved');
							ecfg.server_content = saved_value;
							ecfg.tab.find('.icon-alert-circle').remove();
							ecfg.hasChanges = false;	
							highlightBadConfig(ecfg);
							if (ecfg.file === "") {
								loadPermissionsAndConfList();
							}
						}, saved_value);
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
		});
        ecfg.editor.addAction({
			id: 'word-wrap-on',
			label: 'Word wrap on',
			run: function(ed) {
                ecfg.editor.updateOptions({
                    wordWrap: "on"
                });
			}
		});  
        ecfg.editor.addAction({
			id: 'word-wrap-off',
			label: 'Word wrap off',
			run: function(ed) {
                ecfg.editor.updateOptions({
                    wordWrap: "off"
                });
			}
		});  
 
		activeTab = editors.length;
		editors.push(ecfg);	
		return ecfg;		
	}
	
	function openHTMLTab(filename, tab_title, contents) {
		var ecfg = {};
		hideAllTabs();
		ecfg.container = $("<div></div>").appendTo($container);
		ecfg.container.append(contents);
		ecfg.file = filename;
		ecfg.tab = $("<div class='ce_tab ce_active'>" + tab_title + "</div>").attr("title", filename).appendTo($tabs);
		ecfg.last_opened = Date.now();
		ecfg.hasChanges = false;
		ecfg.server_content = '';
		activeTab = editors.length;
		editors.push(ecfg);	
		return ecfg;			
	}
	
	function openNewDiffTab(filename, tab_title, right, left) {
		var ecfg = {};
		hideAllTabs();
		ecfg.container = $("<div></div>").appendTo($container);
		ecfg.file = filename;
		ecfg.tab = $("<div class='ce_tab ce_active'>" + tab_title + "</div>").attr("title", filename).appendTo($tabs);
		ecfg.last_opened = Date.now();
		ecfg.hasChanges = false;

		var originalModel = monaco.editor.createModel(left, "ini");
		var modifiedModel = monaco.editor.createModel(right, "ini");

		ecfg.editor = monaco.editor.createDiffEditor(ecfg.container[0],{
			automaticLayout: true,
			theme: "vs-dark",
		});
		
		ecfg.editor.setModel({
			original: originalModel,
			modified: modifiedModel
		});	

		ecfg.server_content = '';
		activeTab = editors.length;
		editors.push(ecfg);	
		return ecfg;	
	}	
	
    // TODO replace this with something that comes from the os
	function dodgyBasename(f) {
		return f.replace(/.*[\/\\]/,'');
	}
	
	// Make a rest call to our backend python script
	function serverAction(type, path, callback, param1) {
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
					errText = "<p>You must enable the <code>run_commands</code> setting" + ((confIsTrue('lock_config')) ? " (and set <code>config_locked</code> to false in <code>etc/apps/config_explorer/local/config_explorer.conf</code>)" : "") + "</p>";
					
				} else if (r.data.status === "missing_perm_write") {
					errText = "<p>You must enable the <code>write_access</code> setting" + ((confIsTrue('lock_config')) ? " (and set <code>config_locked</code> to false in <code>etc/apps/config_explorer/local/config_explorer.conf</code>)" : "") + "</p>";
					
				} else if (r.data.status === "config_locked") {
					errText = "<p>Unable to write to the settings file becuase it is locked and must be edited externally: <code>etc/apps/config_explorer/local/config_explorer.conf</code></p>";
					
				} else if (r.data.status === "error") {
					errText = "<pre>" + htmlEncode(r.data.result) + "</pre>";
					if (type === "read" && path === localStorage.getItem('ce_current_path')) {
						// Folder must have been deleted outside of this
						readFileOrFolderAndUpdate(".")
					}
				}
			}
			if (errText) {
				showModal({
					title: "Error",
					body: "<div class='alert alert-error'><i class='icon-alert'></i>An error occurred!<br><br>" + errText + "</pre></div>",
				});
				return;				
			}
// temp debugging
			if (r.data.git) {
				openNewTab('git output', 'git output', r.data.git, false, 'none');
			}			

			if (typeof callback === 'function') {
				callback(r.data.result);	
			}	
		});		
	}

	// Try to build a conf file from calling the rest services. turns out this isn't great
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
	
	//create a in-memory div, set it's inner text(which jQuery automatically encodes)
	//then grab the encoded contents back out.  The div never exists on the page.
	function htmlEncode(value){
		return $('<div/>').text(value).html();
	}
	
	// After loading a .conf file or after saving and before any changes are made, red or green colour will
	// be shown in the gutter about if the current line can be found in the output of btool list.
	function highlightBadConfig(ecfg){	
		if (ecfg.hasOwnProperty('attemptBtooling')) {
			serverAction('btool-list', ecfg.attemptBtooling, function(btoolcontents){
				if (! $.trim(btoolcontents)) {
					delete ecfg.attemptBtooling;
					return;
				}
				// Build lookup of btool output
				var lookup = buildBadCodeLookup(btoolcontents);
                var seenStanzas = {};
                var seenProps =  {};
				// Go through everyline of the editor
				var contents = ecfg.editor.getValue(),
					rows = contents.split(/\r?\n/),
					currentStanza = "",
					reProps = /^\s*((\w+)[^=\s]*)\s*=/,
					newdecorations = [];
				for (var i = 0; i < rows.length; i++) {
					if (rows[i].substr(0,1) === "[") {
						if (rows[i].substr(0,9) === "[default]") {
							currentStanza = "";
						} else {
							currentStanza = rows[i];
						}
                        if (seenStanzas.hasOwnProperty(currentStanza)) {
                            newdecorations.push({ range: new monaco.Range((1+i),1,(1+i),1), options: { isWholeLine: true, glyphMarginClassName: 'ceOrangeLine', glyphMarginHoverMessage: [{value:"Stanza already seen in this file"}]  }});
                        }
                        seenStanzas[currentStanza] = 1;
                        seenProps =  {};
					} else {
						var found = rows[i].match(reProps);
						if (found) {
							if (found[1].substr(0,1) !== "#") {
                                if (seenProps.hasOwnProperty(found[1])) {
                                    newdecorations.push({ range: new monaco.Range((1+i),1,(1+i),1), options: { isWholeLine: true, glyphMarginClassName: 'ceOrangeLine', glyphMarginHoverMessage: [{value:"Duplicate key in stanza"}]  }});
                                }   
                                seenProps[found[1]] = 1;
								if (lookup.hasOwnProperty(currentStanza) && lookup[currentStanza].hasOwnProperty(found[1]) && lookup[currentStanza][found[1]] === ecfg.file) {
                                    if (ecfg.hasOwnProperty('hinting') && found.length > 2 && ! (ecfg.hinting[""].hasOwnProperty(found[2]) || (ecfg.hinting.hasOwnProperty(currentStanza) && ecfg.hinting[currentStanza].hasOwnProperty(found[2]) ) )) {
                                        //newdecorations.push({ range: new monaco.Range((1+i),1,(1+i),1), options: { isWholeLine: true, glyphMarginClassName: 'ceOrangeLine', glyphMarginHoverMessage: [{value:"Unexpected property"}]  }});
                                    } else {
                                        newdecorations.push({ range: new monaco.Range((1+i),1,(1+i),1), options: { isWholeLine: true, glyphMarginClassName: 'ceGreeenLine', glyphMarginHoverMessage: [{value:"Found in `btool` output"}]  }});
                                    }
								} else {
									newdecorations.push({ range: new monaco.Range((1+i),1,(1+i),1), options: { isWholeLine: true, glyphMarginClassName: 'ceRedLine', glyphMarginHoverMessage: [{value:"Not found in `btool` output (overridden somewhere else?)"}] }});
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
		var rex = /^.+?splunk([\/\\]etc[\/\\].*?\.conf)\s+(?:([^=\s]+)\s*=|(\[[^\]]+\]))/gim,
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
				ret[currentStanza] = {"":""} // dont care about stanzas and where they come from
			} else {
				console.log("unexpected row:", res[0]);
			}
		}	
		return ret;
	}
	
	// parse the spec file and build a lookup to use for code completion
	function buildHintingLookup(conf, contents){
		var rex = /^(?:(\w+).*=|(\[\w+))?.*$/gm,
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
						rex = /^(?:(\w+)|(\[\w+))?.*$/gm,
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
					rex = /.*\n\s*(\[\w+)/s,
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
							 kind: monaco.languages.CompletionItemKind.Property,
							 documentation: "" + editors[activeTab].hinting[currentStanza][key].t + "\n\n" + editors[activeTab].hinting[currentStanza][key].c + "\n",
						});
					}
				}
				return ret;
			}
			return [];
		}
	});	

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

	function confIsTrue(param) {
		return (["1", "true", "yes", "t", "y"].indexOf($.trim(conf[param].toLowerCase())) > -1);
	}
	
	function loadPermissionsAndConfList(){
		// Build the list of config files
		serverAction('init', undefined, function(data){
			var rex = /^Checking: .*[\/\\]([^\/\\]+?).conf\s*$/gmi,
				res;
			conf = data.conf;
			$dashboardBody.addClass('ce_no_write_access ce_no_run_access ce_no_settings_access ce_no_git_access ')
			if(confIsTrue('write_access')) {
				$dashboardBody.removeClass('ce_no_write_access');
			}
			if(confIsTrue('run_commands')) {
				$dashboardBody.removeClass('ce_no_run_access');
			}
			if(! confIsTrue('lock_config')) {
				$dashboardBody.removeClass('ce_no_settings_access');
			}
			if(confIsTrue('git')) {
				$dashboardBody.removeClass('ce_no_git_access');
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
	// Build the directory structure
    refreshCurrentPath();
	loadPermissionsAndConfList();
    
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
	}, { tokens: true }).render();

	DashboardController.ready();
});
