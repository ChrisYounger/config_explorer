[global]
write_access = <bool>
* This enables saving, creating new files/folders, deleting and renaming. This
  is obviously very dangerous and just like having filesystem access through
  the operating system, will make it very easy to destroy your Splunk 
  environment if you dont know what you are doing. 
* Defaults to false

run_commands = <bool>
* Enables running commands in the shell, with the user that splunk runs as.
  Use with caution. 
* Defaults to false

hide_settings = <bool>
* Hide the "Settings" link from the top of the screen. Note that if write_access
  is true then settings can still be changed at 
  etc/apps/config_explorer/local/config_explorer.conf. When the Settings link
  is displayed, it can be changed even when write_access is off. To 
  prevent all editing, set "hide_settings = true" and "write_access = false".
* Defaults to false.

max_file_size = <non-negative integer>
* The maximum file size in megabytes that can be opened. 

############################################################################
#  Experimental features                                                   #
############################################################################

cache_file_depth = <integer>
* Cache the list of files and folders for the left pane to this many levels deep. 
  This makes navigation much faster (especially on windows) but uses more memory, 
  causes slightly slower startup, and will not follow symbolic links. Set to 0 to 
  disable cache but allow caching of visited directories. Set -1 to disable all caching.
* Defaults to 6

conf_validate_on_save = <bool>
* Show a green or red indicator in the code gutter of each line if it appears
  in the btool list output or not. As parsing .spec files is not particularly 
  reliable this can be wrong.
* Defaults to true

git_autocommit = <bool>
* Track all file saves by automatically committing them to git with a generic message.   
  Note you must first configure the git repo using "git init". Please see the documentation.
* Defaults to false 

git_autocommit_dir = <string>
* Force specific git repository location, relative to SPLUNK_HOME directory.
* Defaults to empty, meaning normal git rules will apply (search up from current directory)

git_autocommit_work_tree = <string>
* Force root location from where changes are tracked, relative to SPLUNK_HOME directory
  Set to "etc/" to track all changes beneath etc folder.
* Defaults to empty, meaning the normal git behavior will apply.

git_group_time_mins = <non-negative integer>
* In the "Change Log" view, changes to the same file by the same user within this
  time limit will be grouped together into one line entry for display purposes.


[hook]
* "[hook:<unique_name>]""
* The [hooks:...] stanza allows creation of custom right-click actions that can be quickly run from both 
  the editor and the file tree context menus.

match = <regular expression>
* A regular expression matching the files that this action should apply to. 
  e.g. /(?:local|default))/[^\/]*\.conf$

action = <string>
* The action name to run, full colon, then the argument (if required). Example: "run:ls -l ${FILENAME}"
* The following actions currently exist:
    run:(1) - Run a custom shell command. Requires that "run_commands=true".
    run-safe:(1) - Run a custom shell command but first shows the prompt so it can be edited. Requires that "run_commands=true".
    bump:(0) - Trigger the _bump endpoint to expire the cache..
    refresh:(1) - Trigger the specified debug/refresh endpoint. With no argument it will do all endpoints. 
    btool:(1) - Run btool on the specified conf file (--debug mode).
    btool-hidepaths:(1) - Run btool on the specified conf file and do not show paths (not --debug mode).
    btool-hidedefaults:(1) - Run btool on the specified conf file and hide any default setting.
    spec:(1) - Show the .spec file for the specified conf file.
    read:(1) - Open the specified file.
    live:(1) - Show the current running config for the specified conf file. Uses the "/services/configs/conf-*" endpoint.
    live-diff:(1) - Show the current running config as a diff comparison of what is reported by btool.
* The following variables can be used after the full colon:
    ${FILE} = Filename with path
    ${BASEFILE} = Filename without path
    ${DIRNAME} = Full path to the containing folder

label = <string>
* Display label for the action. Variables can be used: ${FILE}, ${BASEFILE} and ${DIRNAME}.

showWithSave = <bool>
* Show the action a second time in the editor context menu, prefixed with "Save and ...". Use this
  when creation a hook that is often used after saving the file.
* Default true

disabled = <bool>
* Enable or disable the hook.
* Defaults to false

order = <non-negative integer>
* Sort order. Lower numbers are sorted and displayed first.
* Defaults to 10
