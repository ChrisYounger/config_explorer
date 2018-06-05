// Copyright (C) 2018 Chris Younger

require.config({ paths: { 'vs': '../app/config_editor/node_modules/monaco-editor/min/vs' }});

require([
	"splunkjs/mvc",
	"jquery",
    "underscore",
	"moment",
	"splunkjs/mvc/simplexml",
	"splunkjs/mvc/layoutview",
	"splunkjs/mvc/simplexml/dashboardview",
    "splunkjs/mvc/searchmanager",
    "vs/editor/editor.main"
], function(
	mvc,
	$,
    _,
	moment,
	DashboardController,
	LayoutView,
	Dashboard,
    SearchManager,
    wat
) {
    var service = mvc.createService({ owner: "nobody" });
    var editors = [];  
	var inFolder = (localStorage.getItem('ce_current_path') || './etc/apps');
	var run_history = (JSON.parse(localStorage.getItem('ce_run_history')) || []);
	var $dashboardBody = $('.dashboard-body');
    var $dirlist = $(".ce_file_list");
    var $container = $(".ce_contents");
    var $tabs = $(".ce_tabs");
	var activeTab = null;
	var confFiles = {};
	var confFilesSorted = [];
	var action_mode = 'read';
    
    $(window).on("beforeunload", function() {
        for (var i = 0; i < editors.length; i++) {
			if (editors[i].hasChanges) {
				return "Unsaved changes will be lost.";
			}
		}
    });
		
    $dirlist.on("click", ".ce_add_file,.ce_add_folder", function(e){
        e.stopPropagation();
		var parentPath = $(this).parent().attr('file');
		var type = "file";
		if ($(this).hasClass("ce_add_folder")){
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
							serverAction("new" + type, parentPath, undefined, fname);
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

		
    }).on("click", ".ce_rename_icon", function(e){
        e.stopPropagation();
		var parentPath = $(this).parent().attr('file');
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
							serverAction("rename", parentPath, undefined, newname);
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
		
    }).on("click", ".ce_delete_icon", function(e){
        e.stopPropagation();
		var parentPath = $(this).parent().attr('file');
		showModal({
			title: "Delete",
			size: 550,
			body: "<div>Are you sure you want to delete: <code>" + $(this).parent().attr('file') + "</code><br><br>To confirm type 'yes':<br><br><input type='text' value='' class='ce_prompt_input input input-text' style='width: 60px; background-color: #3d424d; color: #cccccc;'/></div>",
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
						serverAction("delete", parentPath);
					}).modal('hide');
				},
				cssClass: 'btn-danger btn-disabled',
				label: "Delete"
			},{
				onClick: function(){ $(".modal").modal('hide'); },
				label: "Cancel"
			}]
		});	
		
    }).on("click", ".ce_leftnav", function(){
        serverAction(action_mode, $(this).attr('file'));
		
    }).on("mouseenter", ".ce_leftnav_editable", function(){
        $(this).append("<i title='Rename' class='ce_rename_icon icon-pencil ce_right_icon ce_right_two'></i><i title='Delete' class='ce_delete_icon icon-trash ce_right_icon'></i>");
        
    }).on("mouseleave", ".ce_leftnav_editable", function(){
        $(this).find('.ce_right_icon').remove();
    });


	
    $tabs.on("click", ".ce_close_tab", function(e){
        var idx = $(this).parent().index();
        e.stopPropagation();
		closeTab(idx);
        
    }).on("click", ".ce_tab", function(){
        activateTab($(this).index());
        
    }).on("mouseenter", ".ce_tab", function(){
        $(this).append("<i class='ce_close_tab icon-close  ce_right_icon'></i>");
        
    }).on("mouseleave", ".ce_tab", function(){
        $(this).find('.ce_close_tab').remove();
    });
    
    $('.ce_app_link a').on('click', function(e){
		e.preventDefault();
		var p = $(this).parent();
		if (p.hasClass('ce_active')) {
			return;
		}
		if (p.hasClass('ce_app_errors')) {
			serverAction('btool-check', undefined, function(contents){
				contents = contents.replace(/^(No spec file for|Checking):.*\r?\n/mg,'').replace(/^\t\t/mg,'').replace(/\n{2,}/g,'\n\n');
				if ($.trim(contents)) {
					openNewTab('btool-check', contents, false, 'none');
				} else {
					showModal({
						title: "Info",
						body: "<div class='alert alert-info'><i class='icon-alert'></i>No configuration errors found</div>",
						size: 300
					});	
				}				
			});
			return;
		} 
		if (p.hasClass('ce_app_run')) {
			var history_idx = run_history.length,
				in_progress_cmd = '',
				$input;
			showModal({
				title: "Run ",
				size: 600,
				body: "<div>Enter command to run on the server<br><br><input type='text' value='' class='ce_prompt_input input input-text' style='width: 100%; background-color: #3d424d; color: #cccccc;'/></div>",
				onShow: function(){ 
					$input = $('.ce_prompt_input');
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
									openNewTab('$ ' + command, contents, false, 'none');
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
			return;
		}
		if (p.hasClass('ce_app_changelog')) {
			showModal({
				title: "Info",
				body: "<div class='alert alert-info'><i class='icon-alert'></i>GIT Integration coming soon</div>",
				size: 300
			});		
			return;
		}
		if (p.hasClass('ce_app_refresh')) {
			showModal({
				title: "Info",
				body: "<div class='alert alert-info'><i class='icon-alert'></i>Debug/Refresh coming soon</div>",
				size: 300
			});	
			return;
		}
		$('.ce_app_link.ce_active').removeClass('ce_active');
		p.addClass('ce_active');
		if (p.hasClass('ce_app_filesystem')) {
			serverAction('read');
			action_mode = 'read';
			
		} else if (p.hasClass('ce_app_effective') || p.hasClass('ce_app_specs')) {
			if (p.hasClass('ce_app_effective')) {
				action_mode = 'btool-list';
			} else {
				action_mode = 'spec';
			}

			showConfList(action_mode);
		}
	});
	
    function activateTab(idx){
        console.log("activating tab ", editors[idx].file);
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
	
	function closeTab(idx){
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
		editors[idx].editor.dispose();
		editors[idx].tab.remove();
		editors[idx].container.remove();
		editors.splice(idx, 1);
		// if there are still tabs open, find the most recently used tab and activate that one
		if ($tabs.children().length === 0) {
			activeTab = null;
		
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
	

	function openNewTab(filename, contents, canBeSaved, language) {
		var ecfg = {};
		hideAllTabs();
		if (!language) {
			language = "ini"; // .conf, .meta
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
		ecfg.tab = $("<div class='ce_tab ce_active'>" + dodgyBasename(filename) + "</div>").attr("title", filename).appendTo($tabs);
		ecfg.last_opened = Date.now();
		ecfg.hasChanges = false;
		ecfg.editor = monaco.editor.create(ecfg.container[0], {
			automaticLayout: true,
			value: contents,
			language: language,
			theme: "vs-dark",
		});
		ecfg.server_content = ecfg.editor.getValue();
		if (canBeSaved) {
			ecfg.editor.onDidChangeModelContent(function (e) {
				// check against saved copy
				if (ecfg.editor.getValue() !== ecfg.server_content) {
					if (!ecfg.hasChanges) {
						ecfg.tab.append("<i class='ce_right_icon icon-alert-circle'></i>")
						ecfg.hasChanges = true;
					}
				} else {
					if (ecfg.hasChanges) {
						ecfg.tab.find('.icon-alert-circle').remove()
						ecfg.hasChanges = false;
					}							
				}
			});
		}
		ecfg.editor.addAction({
			id: 'save-file',
			label: 'Save file',
			keybindings: [
				monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_S,
			],
			run: function(ed) {
				if (canBeSaved) {
					var saved_value = ecfg.editor.getValue();
					serverAction('save', ecfg.file, function(){
						ecfg.server_content = saved_value;
						ecfg.tab.find('.icon-alert-circle').remove();
						ecfg.hasChanges = false;															
					}, saved_value);
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
		
		activeTab = editors.length;
		editors.push(ecfg);	
		return ecfg;		
	}	

	function showConfList(action_mode) {
		$dirlist.empty();
		if (action_mode === 'btool-list') {
			$("<li class='ce_leftnavfolder'><i class='icon-settings'></i> Show default values <input type='checkbox' checked='checked' class='ce_btool_default_values ce_right_icon ce_right_two'></li>" +
			  "<li class='ce_leftnavfolder'><i class='icon-settings'></i> Show originating path <input type='checkbox' checked='checked' class='ce_btool_path ce_right_icon ce_right_two'></li>").appendTo($dirlist);
			$dirlist.find('input').on('change', function(){
				for (var i = 0; i < editors.length; i++) {
					if (editors[i].hasOwnProperty('btoollist')) {
						editors[i].editor.setValue(formatBtoolList(editors[i].btoollist))
					}
				}
			});
		}
		for (var i = 0; i < confFilesSorted.length; i++) {
			$("<li class='ce_leftnav'></li>").text(confFilesSorted[i]).attr("file", confFilesSorted[i]).prepend("<i class='icon-report'></i> ").appendTo($dirlist);
		}
	}	
	
    // TODO replace this with something that comes from the os
	function dodgyBasename(f) {
		return f.replace(/.*\//,'')
	}
		
	function serverAction(type, path, callback, param1) {
		var tab_path;

		if (type == "read") {
			if (! path) {
				path = inFolder;
			}
			tab_path = path
		}
		if (type == "spec") {
			tab_path = 'spec: ' + path;
		}
		if (type == "btool-list") {
			tab_path = 'btool list: ' + path;
		}		
		if (tab_path) {
			// check if file is already open
			for (var i = 0; i < editors.length; i++) {
				if (editors[i].file === tab_path) {
					activateTab(i);
					return;
				}
			}
		}
		
		$('.ce_saving_icon').removeClass('ce_hidden');
		service.post('/services/ceditor', {action: type, path: path, param1: param1}, function(err, r) {
			$('.ce_saving_icon').addClass('ce_hidden');
			var errText = '';
			console.log(type, err, r);
			if (err) {
				if (err.data.hasOwnProperty('messages')) {
					errText = "<pre>" + htmlEncode(err.data.messages["0"].text) + "</pre>";
				} else {
					errText = "<pre>" + htmlEncode(JSON.stringify(err)) + "</pre>";
				}
			} else {
				if (! r.data.hasOwnProperty('status')) {
					errText = "<pre>" + htmlEncode(r.data) + "</pre>";
					
				} else if (r.data.status === "missing_perm_write") {
					errText = "<p>You are limited to read-only actions until, your account is granted the capability \"<strong>config_editor_ludicrous_mode</strong>\" via a <a href='/manager/config_editor/authorization/roles'>role</a>.</p>";
					
				} else if (r.data.status === "missing_perm_read") {
					errText = "<p>To use this application you must be have the capability \"<strong>admin_all_objects</strong>\" via a <a href='/manager/config_editor/authorization/roles'>role</a>.</p>";
					
				} else if (r.data.status === "error") {
					errText = "<pre>" + htmlEncode(r.data.result) + "</pre>";
				}
			}
			
			if (errText) {
				showModal({
					title: "Error",
					body: "<div class='alert alert-error'><i class='icon-alert'></i>An error occurred!<br><br>" + errText + "</pre></div>",
				});
				return;				
			}					
			if (type === "save") {
				showToast('Saved');
				
			} else if (type === "read") {
				if (r.data.status === "file") {					
					var ecfg = openNewTab(tab_path, r.data.result, true);
					
					var re = /([^\/]+).conf$/;
					var found = tab_path.match(re);
					if (found && confFiles.hasOwnProperty(found[1])) {
						var conf = found[1];
						serverAction('spec-hinting', conf, function(contents){
							ecfg.hinting = buildHintingLookup(conf, contents);
						});
					}
					
				} else if (r.data.status === "dir") {
					inFolder = path;
					localStorage.setItem('ce_current_path', inFolder);
					r.data.result.sort();
					$dirlist.empty();
					var dir = $("<li class='ce_leftnavfolder'><span></span><bdi></bdi><i title='Create new folder' class='ce_add_folder ce_right_icon ce_right_two icon-folder'></i><i title='Create new file' class='ce_add_file ce_right_icon icon-report'></i></li>").attr("file", path).attr("title", path).appendTo($dirlist);
					var span = dir.find("span").text(path + '/');
					dir.find("bdi").text(path + '/');
					if (span.width() > (dir.width() - 50)) {
						dir.addClass('ce_rtl');
					}
					if (path !== ".") {
						$("<li class='ce_leftnav'><i class='icon-arrow-left'></i> ..</li>").attr("file", path.replace(/\/[^\/]+$/,'')).appendTo($dirlist)
					}
					for (var i = 0; i < r.data.result.length; i++) {
						var icon = "folder";
						if (r.data.result[i].substr(0,1) === "F") {
							icon = "report";
						}
						$("<li class='ce_leftnav ce_leftnav_editable'></li>").text(r.data.result[i].substr(1)).attr("file", path + "/" + r.data.result[i].substr(1)).prepend("<i class='icon-" + icon + "'></i> ").appendTo($dirlist);
					}
				}
				
			} else if (type == "btool-check" || type == "btool-quick") {
				var rex = /^Checking: .*\/([^\/]+?).conf\s*$/gm,
					res;
				confFilesSorted = [];
				while((res = rex.exec(r.data.result)) !== null) {
					if (! confFiles.hasOwnProperty(res[1])) {
						confFiles[res[1]] = null;
						confFilesSorted.push(res[1]);
					}
				}
				confFilesSorted.sort();
			
				
			} else if (type == "btool-list") {
				var c = formatBtoolList(r.data.result);
				if ($.trim(c)) {
					ecfg = openNewTab(tab_path, c, false, 'ini');
					ecfg.btoollist = r.data.result;
				} else {
					showModal({
						title: "Warning",
						body: "<div class='alert alert-warning'><i class='icon-alert'></i>No contents</div>",
						size: 300
					});							
				}
				
			} else if (type == "spec-hinting") {
				// do nothing
				
			} else if (type == "spec") {
				var c = r.data.result
				if ($.trim(c)) {
					openNewTab(tab_path, c, false, 'ini');
				} else {
					showModal({
						title: "Error",
						body: "<div class='alert alert-error'><i class='icon-alert'></i>No spec file found!</div>",
						size: 300
					});							
				}	

			// delete, rename, new file, new folder
			} else {
				// refresh folder tree
				serverAction('read');

				showToast('Success');
				 
				if (type == "rename" || type == "delete") {
					// if "path" is open in an editor, it needs to be closed without warning
					for (var i = 0; i < editors.length; i++) {
						if (editors[i].file === path) {
							closeTabNow(i);
							break;
						}
					}
				} 
			}

			if (typeof callback === 'function') {
				callback(r.data.result);	
			}			
						
		});		
	}


	function formatBtoolList(contents) {
		var indent = 80;
		var ce_btool_default_values = $('.ce_btool_default_values:checked').length;
		var ce_btool_path = $('.ce_btool_path:checked').length;
		return contents.replace(/^.+?splunk\/etc\/(.*?\.conf)\s+(.+)(\r?\n)/mg,function(all, g1, g2, g3){
			var path = '';
			// TODO can stanzas be set to default when containing a child that isnt?
			if (! ce_btool_default_values && /\/default\//.test(g1)) {
				return '';
			}
			if (ce_btool_path) {
				path = (" ".repeat(Math.max(1, (indent - g2.length)))) + "  " + g1
			}
			return g2 + path + g3;
		});
	}
	
	function htmlEncode(value){
		//create a in-memory div, set it's inner text(which jQuery automatically encodes)
		//then grab the encoded contents back out.  The div never exists on the page.
		return $('<div/>').text(value).html();
	}
	
		
	monaco.languages.registerHoverProvider('ini', {
		provideHover: function(model, position, token) {
			return new Promise(function(resolve, reject) {
				// do somthing
				if (editors[activeTab].hasOwnProperty('hinting')) {
					// get all text up to hovered line becuase we need to find what stanza we are in
					var contents = model.getValueInRange(new monaco.Range(1, 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber)));
					var rex = /^(?:(\w+)|(\[\w+))?.*$/gm;
					var currentStanza = "";
					var currentField = "";
					while(res = rex.exec(contents)) {
						// need this because our rex can match a zero length string
						if (res.index == rex.lastIndex) {
							rex.lastIndex++;
						}
						if (res[1] || res[2]) {
							if (res[1]) {
								currentField = res[1];
							} else {
								currentStanza = res[2];
								currentField = "";
							}
						}
					}
					if (editors[activeTab].hinting.hasOwnProperty(currentStanza) && editors[activeTab].hinting[currentStanza].hasOwnProperty(currentField)) {
						resolve({
							// This is what will be highlighted
							range: new monaco.Range(position.lineNumber, 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber)),
							contents: [
								{ value: '**' + editors[activeTab].hinting[currentStanza][currentField].t + '**' },
								{ value: '\n' + editors[activeTab].hinting[currentStanza][currentField].c.replace(/^#/mg,'') + '\n' }
							]
						})						
					} else if (editors[activeTab].hinting[""].hasOwnProperty(currentField)) {
						resolve({
							// This is what will be highlighted
							range: new monaco.Range(position.lineNumber, 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber)),
							contents: [
								{ value: '**' + editors[activeTab].hinting[""][currentField].t + '**' },
								{ value: '\n' + editors[activeTab].hinting[""][currentField].c.replace(/^#/mg,'') + '\n' }
							]
						})						
					} else {
						console.log("cant find:", currentStanza,currentField, editors[activeTab].hinting );
						resolve()
					}
				} else {
					resolve();
				}
			});
		}
	});
	
	monaco.languages.registerCompletionItemProvider('ini', {
		provideCompletionItems: function(model, position) {
			if (editors[activeTab].hasOwnProperty('hinting')) {
				// get all text up to hovered line becuase we need to find what stanza we are in
				var contents = model.getValueInRange(new monaco.Range(1, 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber)));
// TODO This needs to be optimised becuase we only need to find what stanza we are in				
				var rex = /^(?:(\w+)|(\[\w+))?.*$/gm;
				var currentStanza = "";
				var currentField = "";
				while(res = rex.exec(contents)) {
					// need this because our rex can match a zero length string
					if (res.index == rex.lastIndex) {
						rex.lastIndex++;
					}
					if (res[1] || res[2]) {
						if (res[1]) {
							//currentField = res[1];
						} else {
							currentStanza = res[2];
							//currentField = "";
						}
					}
				}
				if (! editors[activeTab].hinting.hasOwnProperty(currentStanza)) {
					currentStanza = "";
				}
				
				var ret = [];
				for (key in editors[activeTab].hinting[currentStanza]) {
					if (editors[activeTab].hinting[currentStanza].hasOwnProperty(key) && key) {
						ret.push({
							 label: key,
							 kind: monaco.languages.CompletionItemKind.Property,
							 documentation: "" + editors[activeTab].hinting[currentStanza][key].t + "\n\n" + editors[activeTab].hinting[currentStanza][key].c + "\n",
						});
					}
				}
				console.log(ret);
				return ret;					

			} else {
				return [];
			}			
		}
	});	
	
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
					currentStanza = res[2];
					currentField = "";
					confFiles[conf][currentStanza] = {"":{t:"", c:""}}
				}
				confFiles[conf][currentStanza][currentField].t = res[0];
			} else {
				confFiles[conf][currentStanza][currentField].c += res[0] + "\n";
			}
		}	
		return confFiles[conf];
	}
	
	service.get('/services/authentication/current-context', null, function(err, r) {
		if(r.data.entry[0].content.capabilities.indexOf('config_editor_ludicrous_mode') > -1) {
			$dashboardBody.removeClass('ce_no_write_access');
		}
	});	
    serverAction('read');
	serverAction('btool-quick');

	function showToast(message) {
		var t = $('.ce_toaster');
		t.find('span').text(message);
		t.addClass('ce_show');
		setTimeout(function(){
			t.removeClass('ce_show');
		},3000)
	};
		
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
		var margin = options.size / 2;	
		if (self.$modal == undefined) {
			self.$modal = $('<div class="modal fade"><div class="modal-dialog"><div class="modal-content"></div></div></div>').appendTo('body');
			self.$modal.on('shown.bs.modal', function (e) {
				self.onShow.call(this, e);
			});
			self.$modal.on('hidden.bs.modal', function (e) {
				self.onHide.call(this, e);
			});
		}
		self.$modal.css({'width': options.size + "px", 'margin-left': -1 * (options.size / 2) + "px"})
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
    
	// TODO : do we need the following bits?
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
