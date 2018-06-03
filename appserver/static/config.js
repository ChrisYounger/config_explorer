require.config({ paths: { 'vs': '../app/config-editor/node_modules/monaco-editor/min/vs' }});

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
    var $dirlist = $(".ce_file_list");
    var $container = $(".ce_contents");
    var $tabs = $(".ce_tabs");
	var confFiles = null;
	var action_mode = 'read';
    
    $(window)
    .on("beforeunload", function() {
        for (var i = 0; i < editors.length; i++) {
			if (editors[i].hasChanges) {
				return "Unsaved changes will be lost.";
			}
		}
    });
	
    $dirlist.on("click", ".ce_add_file", function(e){
        e.stopPropagation();
		var fname = prompt("New file name:", "");
		if (fname) {
			serverAction("newfile", $(this).parent().attr('file'), undefined, fname);
		}
		
    }).on("click", ".ce_add_folder", function(e){
        e.stopPropagation();
		var fname = prompt("New folder name:", "");
		if (fname) {
			serverAction("newfolder", $(this).parent().attr('file'), undefined, fname);
		}
		
    }).on("click", ".ce_rename_icon", function(e){
        e.stopPropagation();
		var bn = dodgyBasename($(this).parent().attr('file'));
		var newname = prompt("New name for [" + bn + "]:", bn);
		if (newname) {
			serverAction("rename", $(this).parent().attr('file'), undefined, newname);
		}
		
    }).on("click", ".ce_delete_icon", function(e){
        e.stopPropagation();
		var newname = prompt("Are you sure you want to delete [" + $(this).parent().attr('file') + "]? To confirm type 'yes':", "");
		if (newname === 'yes') {
			serverAction("delete", $(this).parent().attr('file'));
		}
		
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
		closetab(idx, true);
        
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
					alert("No configuration errors found!");
				}				
			});
			return;
		} 
		if (p.hasClass('ce_app_changelog')) {
			alert("GIT Integration is coming soon");
			return;
		}
		if (p.hasClass('ce_app_refresh')) {
			alert("Selective debug/refresh is coming soon");
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
			if (confFiles === null) {
				serverAction('btool-check', undefined, function(){
					showConfList(action_mode);
				});
			} else {
				showConfList(action_mode);
			}
		}
	});
	
    function activateTab(idx){
        console.log("activating tab ", editors[idx].file);
        hideAllTabs();
        $container.children().eq(idx).removeClass('ce_hidden');
        $tabs.children().eq(idx).addClass('ce_active');
        editors[idx].last_opened = Date.now();        
    }
	
    function hideAllTabs() {
        $container.children().addClass("ce_hidden");
        $tabs.children().removeClass("ce_active");
    }
	
	function closetab(idx, check){
		if (check && editors[idx].hasChanges) {
			var result = confirm("discard changes?");
			if (!result) {
				return;
			}
		}
        editors[idx].editor.dispose();
        editors[idx].tab.remove();
        editors[idx].container.remove();
        editors.splice(idx, 1);
		// if there are still tabs open, find the most recently used tab and activate that one
        if ($tabs.children().length > 0 && $tabs.children(".ce_active").length === 0) {
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
					save(ecfg.file, saved_value, function(){
						ecfg.server_content = saved_value;
						ecfg.tab.find('.icon-alert-circle').remove();
						ecfg.hasChanges = false;															
					});
					return null;
				} else {
					alert('ERROR: This file cannot be saved');
				}
			}
		});
		
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
		for (var i = 0; i < confFiles.length; i++) {
			$("<li class='ce_leftnav'></li>").text(confFiles[i]).attr("file", confFiles[i]).prepend("<i class='icon-report'></i> ").appendTo($dirlist);
		}
	}	
	
    // TODO replace this with something that comes from the os
	function dodgyBasename(f) {
		return f.replace(/.*\//,'')
	}

	
	function serverAction(type, path, callback, param1) {
		var tab_path;
		if (typeof callback !== 'function') {
			callback = function (){};
		}
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
		service.get('/services/ceditor', {action: type, path: path, param1: param1}, function(err, r) {
			$('.ce_saving_icon').addClass('ce_hidden');
            if (err) {
                console.log('response: ', err);
                console.log(err.data.messages["0"].text);
				alert("Fatal error:" + err)
            } else {
                console.log(type, 'response: ', r);

                if (r.data.info === "error") {
					alert("ERROR: " + r.data.result)
					return;
                }
				
				if (type == "read") {
					if (r.data.info === "file") {					
						openNewTab(tab_path, r.data.result, true)
						
					} else if (r.data.info === "dir") {
						inFolder = path;
						localStorage.setItem('ce_current_path', inFolder);
						r.data.result.sort();
						$dirlist.empty();
						$("<li class='ce_leftnavfolder'></li>").text(dodgyBasename(path) + '/').attr("file", path).attr("title", path).prepend("<i class='icon-folder'></i> ").append("<i title='Create new folder' class='ce_add_folder ce_right_icon ce_right_two icon-folder'></i><i title='Create new file' class='ce_add_file ce_right_icon icon-report'></i>").appendTo($dirlist);
						if (path !== ".") {
							$("<li class='ce_leftnav'><i class='icon-folder'></i> ..</li>").attr("file", path.replace(/\/[^\/]+$/,'')).appendTo($dirlist)
						}
						for (var i = 0; i < r.data.result.length; i++) {
							var icon = "folder";
							if (r.data.result[i].substr(0,1) === "F") {
								icon = "report";
							}
							$("<li class='ce_leftnav ce_leftnav_editable'></li>").text(r.data.result[i].substr(1)).attr("file", path + "/" + r.data.result[i].substr(1)).prepend("<i class='icon-" + icon + "'></i> ").appendTo($dirlist);
						}
					}
					
				} else if (type == "btool-check") {
					var rex = /^Checking: .*\/([^\/]+?).conf\s*$/gm,
						res,
						found = {};
					confFiles = [];
					while((res = rex.exec(r.data.result)) !== null) {
						if (! found.hasOwnProperty(res[1])) {
							found[res[1]] = 1;
							confFiles.push(res[1]);
						}
					}
					confFiles.sort();
				
					
				} else if (type == "btool-list") {
					var c = formatBtoolList(r.data.result);
					if ($.trim(c)) {
						ecfg = openNewTab(tab_path, c, false, 'ini');
						ecfg.btoollist = r.data.result;
					} else {
						alert("No contents!");
					}
					
				} else if (type == "spec") {
					var c = r.data.result
					if ($.trim(c)) {
						openNewTab(tab_path, c, false, 'ini');
					} else {
						alert("No spec file found!");
					}	

				// delete, rename, new file, new folder
				} else {
					// refresh folder tree
					serverAction('read');

					if (r.data.info === "success") {
						alert("success");
						 
						if (type == "rename" || type == "delete") {
							// if "path" is open in an editor, it needs to be closed without warning
							for (var i = 0; i < editors.length; i++) {
								if (editors[i].file === path) {
									closetab(i, false);
									break;
								}
							}
						} 
					}
				}
				(callback)(r.data.result);
			}				
		});		
	}

	
    function save(f, c, cb) {
		$('.ce_saving_icon').removeClass('ce_hidden');
        service.post('/services/ceditor', {file: f, contents: c}, function(err, r) {
			$('.ce_saving_icon').addClass('ce_hidden');
			if (!err && r.data.info === "success") {
				alert("saved ok");
				cb();
				return;
			}
		    console.log('save response: ', r, err);
			if (err) {
				alert("Error saving: " + err.data.messages["0"].text);
			} else {
				alert("Error saving: " + r.data);
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

    serverAction('read');
    
	// TODO : do we need the following bits?
	$('header').remove();
	new LayoutView({ "hideAppBar": true, "hideChrome": false, "hideFooter": false, "hideSplunkBar": false, layout: "fixed" })
		.render()
		.getContainerElement()
		.appendChild($('.dashboard-body')[0]);

	new Dashboard({
		id: 'dashboard',
		el: $('.dashboard-body'),
		showTitle: true,
		editable: true
	}, { tokens: true }).render();

	DashboardController.ready();
	
});
