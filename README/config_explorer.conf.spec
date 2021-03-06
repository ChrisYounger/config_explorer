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

btool_dirs = <string>
* A comma-seperated list of absolute paths to add as "--dirs=" that btool can check
* If this is a search head cluster deployer, "add /opt/splunk/etc/shcluster/apps" (sans-quotes)
* If this is a deployment server, you will need to do a few extra steps to make this work:
  1. mkdir /opt/splunk/etc/deployment-apps-for-btool/
  2. cd /opt/splunk/etc/deployment-apps-for-btool/
  3. ln -s /opt/splunk/etc/deployment-apps app
  4. Set the above parameter to: btools_dirs = /opt/splunk/etc/deployment-apps
* For more info see: https://answers.splunk.com/answers/731787
* There are additional hooks and actions in the example config that you will probably want to uncomment 
  for search head deployers or deployment servers.

detect_changed_files = <bool>
* Check if files that are open have changed on the filesystem and warn if so. 
* Defaults to true

############################################################################
#  Experimental features                                                   #
############################################################################

git_autocommit_show_output = <string>
* When autocommit is enabled, when should we show the commit log
   true = Always show git messages
   false = Never show git output
   auto = Only show git messages when there is a non-zero status code
* Defaults to auto

git_autocommit_dir = <string>
* Force specific git repository location, relative to SPLUNK_HOME directory.
* Defaults to empty, meaning normal git rules will apply (search up from current directory)

git_autocommit_work_tree = <string>
* Force root location from where changes are tracked, relative to SPLUNK_HOME directory
  Set to "etc/" to track all changes beneath etc folder.
* Defaults to empty, meaning the normal git behavior will apply.


[hook]
* "[hook:<unique_name>]"
* The [hooks:...] stanza allows creation of custom right-click actions that can be quickly run from both 
  the editor and the file tree context menus.

match = <regular expression>
* A regular expression matching the files that this action should apply to. 
  e.g. /(?:local|default))/[^\/]*\.conf$

matchtype = <string>
* The type of of tree element to match. Can be either "file", "folder", "conf" (the conf files screen).
* Default is "file"

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
    btool-hidesystemdefaults:(1) - Run btool on the specified conf file and hide system default settings.
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


[action]
* "[action:<unique_name>]"
* The [action:...] stanza allows creation of actions that can be run from the home tab 

action = <string>
* The action name to run, full colon, then the argument (if required). Example: "run:ls -l". 
* See hooks section above for complete list of options (except without variable substitutions).
* Commands always run from $SPLUNK_HOME

label = <string>
* Display label for the button.

description = <string>
* Text to show next to the button

disabled = <bool>
* Enable or disable the hook.
* Defaults to false

order = <non-negative integer>
* Sort order. Lower numbers are sorted and displayed first.
* Defaults to 10
