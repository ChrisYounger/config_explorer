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
    console.log(monaco);
    var editors = [];  
	var inFolder = ".";
    var $dirlist = $(".ce_file_list");
    var $container = $(".ce_contents");
    var $tabs = $(".ce_tabs");
    
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
			create($(this).parent().attr('f'), fname, "newfile");
		}
		
    }).on("click", ".ce_add_folder", function(e){
        e.stopPropagation();
		var fname = prompt("New folder name:", "");
		if (fname) {
			create($(this).parent().attr('f'), fname, "newfolder");
		}
		
    }).on("click", ".ce_rename_icon", function(e){
        e.stopPropagation();
		var newname = prompt("New name for [" + dodgy_basename($(this).parent().attr('f')) + "]:", "");
		if (newname) {
			create($(this).parent().attr('f'), newname, "rename");
		}
		
    }).on("click", ".ce_delete_icon", function(e){
        e.stopPropagation();
		var newname = prompt("Are you sure you want to delete [" + $(this).parent().attr('f') + "]? To confirm type 'yes':", "");
		if (newname === 'yes') {
			create($(this).parent().attr('f'), undefined, "delete");
		}
		
    }).on("click", ".ce_leftnav", function(){
        read($(this).attr('f'));
		
    }).on("mouseenter", ".ce_leftnav_editable", function(){
        $(this).append("<i title='Rename' class='ce_rename_icon icon-pencil ce_right_icon ce_right_two'></i><i title='Delete' class='ce_delete_icon icon-trash ce_right_icon'></i>");
        
    }).on("mouseleave", ".ce_leftnav_editable", function(){
        $(this).find('.ce_right_icon').remove();
    });

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
    
 	/*$(window).bind('keydown', function(event) {
        if (event.ctrlKey || event.metaKey) {
            switch (String.fromCharCode(event.which).toLowerCase()) {
            case 's':
                event.preventDefault();
                write("config-editor/web.conf", editor.getValue());
                break;
            }
        }
    });*/

    read();
    
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

	function create(path, filename, type) {
		service.get('/services/readfile', {path: path, newname: filename, action: type}, function(err, r) {
            if (err) {
                console.log('response: ', err);
                console.log(err.data.messages["0"].text);
            } else {
                console.log('response: ', r);
				read();
				if (r.data.info === "success") {
					alert("success");
				} else if (r.data.info === "error") {
					alert("ERROR: " + r.data.result)
				}
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
		});		
	}
	
    function read(f) {
		if (! f) {
			f = inFolder;
		}
        // check if file is already open
        for (var i = 0; i < editors.length; i++) {
            if (editors[i].file === f) {
                activateTab(i);
                return;
            }
        }
        service.get('/services/readfile', {path: f, action: 'read'}, function(err, r) {
            if (err) {
                console.log('response: ', err);
                console.log(err.data.messages["0"].text);
            } else {
                console.log('response: ', r);
                if (r.data.info === "error") {
					alert(r.data.result)
                } else if (r.data.info === "file") {					
                    var language = "ini"; // .conf, .meta
                    if (/.js$/.test(f)) {
                        language = "javascript";
                    } else if (/.xml$/.test(f)) {
                        language = "xml";
                    } else if (/.html$/.test(f)) {
                        language = "html";
                    } else if (/.css$/.test(f)) {
                        language = "css";
                    } else if (/.py$/.test(f)) {
                        language = "python";
                    } else if (/.md$/.test(f)) {
                        language = "markdown";
                    }
                    hideAllTabs();
                    var ecfg = {};
                    ecfg.container = $("<div></div>").appendTo($container);
                    ecfg.file = f;
                    ecfg.tab = $("<div class='ce_tab ce_active'>" + dodgy_basename(f) + "</div>").attr("title", f).appendTo($tabs);
                    ecfg.last_opened = Date.now();
					ecfg.hasChanges = false;
                    ecfg.editor = monaco.editor.create(ecfg.container[0], {
                        value: r.data.result,
                        language: language,
                        theme: "vs-dark",
                    });
					ecfg.server_content = ecfg.editor.getValue();
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
					ecfg.editor.addAction({
						id: 'splunk-save',
						label: 'Splunk Save',
						keybindings: [
							monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_S,
						],
						run: function(ed) {
							var saved_value = ecfg.editor.getValue();
							write(ecfg.file, saved_value, function(){
								ecfg.server_content = saved_value;
								ecfg.tab.find('.icon-alert-circle').remove()
								ecfg.hasChanges = false;															
							});
							return null;
						}
					});
                    editors.push(ecfg);
					
                } else if (r.data.info === "dir") {
					inFolder = f;
                    r.data.result.sort();
                    $dirlist.empty();
                    $("<li class='ce_leftnavfolder'></li>").text(dodgy_basename(f) + '/').attr("f", f).attr("title", f).prepend("<i class='icon-folder'></i> ").append("<i title='Create new folder' class='ce_add_folder ce_right_icon ce_right_two icon-folder'></i><i title='Create new file' class='ce_add_file ce_right_icon icon-report'></i>").appendTo($dirlist);
                    console.log("'" + f + "'");if (f !== ".") {
                        $("<li class='ce_leftnav'><i class='icon-folder'></i> ..</li>").attr("f", f.replace(/\/[^\/]+$/,'')).appendTo($dirlist)
                    }
                    for (var i = 0; i < r.data.result.length; i++) {
                        var icon = "folder";
                        if (r.data.result[i].substr(0,1) === "F") {
                            icon = "report";
                        }
                        $("<li class='ce_leftnav ce_leftnav_editable'></li>").text(r.data.result[i].substr(1)).attr("f", f + "/" + r.data.result[i].substr(1)).prepend("<i class='icon-" + icon + "'></i> ").appendTo($dirlist);
                    }
                }
            }
        });
    }
    // TODO replace this with something that comes from the os
	function dodgy_basename(f) {
		return f.replace(/.*\//,'')
	}
    function write(f, c, cb) {
        service.post('/services/writefile', {file: f, contents: c}, function(err, r) {
            if (err) {
                console.log('response: ', err);
                console.log(err.data.messages["0"].text);
            } else {
                console.log('response: ', r);
                alert("saved ok")
            }
        });        
    }
    
	// TODO : do we need the following bits?
	$('header').remove();
	new LayoutView({ "hideAppBar": false, "hideChrome": false, "hideFooter": false, "hideSplunkBar": false })
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
