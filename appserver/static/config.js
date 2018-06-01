require([
	"splunkjs/mvc",
	"jquery",
    "underscore",
	"moment",
	"splunkjs/mvc/simplexml",
	"splunkjs/mvc/layoutview",
	"splunkjs/mvc/simplexml/dashboardview",
    "splunkjs/mvc/searchmanager"
], function(
	mvc,
	$,
    _,
	moment,
	DashboardController,
	LayoutView,
	Dashboard,
    SearchManager
) {
    var service = mvc.createService({ owner: "nobody" });
    var editor = ace.edit($(".ce_contents")[0]);

	editor.$blockScrolling = Infinity;	
	editor.setTheme("ace/theme/chrome");
	editor.setHighlightActiveLine(false);
	editor.setShowPrintMargin(false);
	editor.getSession().setMode("ace/mode/ini");
	editor.setOptions({maxLines: 1000, minLines: 10});
    var $dirlist = $(".ce_file_list");
    $(".ce_file_list").on("click", "li", function(){
        console.log($(this).attr('f'));
        read($(this).attr('f'));
    });
    
 	$(window).bind('keydown', function(event) {
        if (event.ctrlKey || event.metaKey) {
            switch (String.fromCharCode(event.which).toLowerCase()) {
            case 's':
                event.preventDefault();
                write("config-editor/web.conf", editor.getValue());
                break;
            }
        }
    });

    read(".");
    
    function read(f) {
        service.get('/services/readfile', {file: f}, function(err, r) {
            if (err) {
                console.log('response: ', err);
                console.log(err.data.messages["0"].text);
            } else {
                console.log('response: ', r);
                if (typeof r.data.result === "string") {
                    editor.setValue(r.data.result, 1);
                } else {
                    r.data.result.sort();
                    $dirlist.empty();
                    $("<li><i class='icon-folder'></i> ..</li>").attr("f", f + "/..").appendTo($dirlist)
                    for (var i = 0; i < r.data.result.length; i++) {
                        var icon = "folder";
                        if (r.data.result[i].substr(0,1) === "F") {
                            icon = "report";
                        }
                        $("<li></li>").text(r.data.result[i].substr(1)).attr("f", f + "/" + r.data.result[i].substr(1)).prepend("<i class='icon-" + icon + "'></i> ").appendTo($dirlist);
                    }
                }
                
            }
        });
    }
    
    function write(f, c) {
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
