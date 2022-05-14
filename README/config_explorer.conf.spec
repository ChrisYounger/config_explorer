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
* The maximum file size in megabytes (MB) that can be opened. 
* Defaults to 10

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
* this is now deprecated. See 'btool_dir_for_deployment_apps', 'btool_dir_for_master_apps' and 'btool_dir_for_shcluster_apps' below
* This has no effect

btool_dir_for_deployment_apps = <string>
* If this server is a deployment server, then set this property to a sym-linked copy of the deployment-apps folder.
* this will enable the btool gutter-hinting in config files to work with config in the deployment-apps folder
* perform these steps to create the sym-linked deployment-apps folder. Note this only works on *nix-based platforms
* 1. mkdir /opt/splunk/etc/deployment-apps-for-btool/
* 2. cd /opt/splunk/etc/deployment-apps-for-btool/
* 3. ln -s /opt/splunk/etc/deployment-apps apps
* 4. Set this parameter to: btool_dir_for_deployment_apps = /opt/splunk/etc/deployment-apps-for-btool
* For more info on why the symlinking process is necissary, please see: https://answers.splunk.com/answers/731787

btool_dir_for_master_apps = <string>
* If this server is a cluster master server, then set this property to a sym-linked copy of the master-apps folder.
* this will enable the btool gutter-hinting in config files to work with config in the master-apps folder
* perform these steps to create the sym-linked master-apps folder. Note this only works on *nix-based platforms
* 1. mkdir /opt/splunk/etc/master-apps-for-btool/
* 2. cd /opt/splunk/etc/master-apps-for-btool/
* 3. ln -s /opt/splunk/etc/master-apps apps
* 4. Set this parameter to: btool_dir_for_master_apps = /opt/splunk/etc/master-apps-for-btool
* For more info on why the symlinking process is necissary, please see: https://answers.splunk.com/answers/731787

btool_dir_for_shcluster_apps = <string>
* This will enable the btool gutter-hinting in config files to work with config in the shcluster/apps folder
* Enable this if the current server is a search head deployer.
* There is no need to create a sym-link for this path, however an absolute path to shcluster must be set.
* e.g. /opt/splunk/etc/shcluster

master_apps_gutter_unnecissary_config_files = <string>
* When viewing a config file within a subfolder of the /master-apps/ folder, if it matches this pattern, then a grey indicator 
* will be shown in the gutter with a tooltip that shows: "In most environments, this property is not needed on indexers".
* In many environments the following configs are not desired on Indexers and can be appended: |restmap|web|inputs
* Set empty to disable the gray gutter warnings of unnecissary props/transforms config
* Default: alert_actions|addon_builder|checklist|collections|datamodels|deploymentclient|distsearch|eventgen|eventtypes|macros|savedsearches|tags|times|wmi|workflow_actions

master_apps_gutter_useful_props_and_transforms = <string>
* When viewing a props or transforms config file within a subfolder of the /master-apps/ folder, if the property does not match 
* this pattern, then a grey indicator will be shown in the gutter with a tooltip that shows:
* "In most environments, this property is not needed on indexers".
* Set empty to disable grey highlighting in props and transforms
* Default: priority|TRUNCATE|LINE_BREAKER|LINE_BREAKER_LOOKBEHIND|SHOULD_LINEMERGE|BREAK_ONLY_BEFORE_DATE|BREAK_ONLY_BEFORE|MUST_BREAK_AFTER|MUST_NOT_BREAK_AFTER|MUST_NOT_BREAK_BEFORE|DATETIME_CONFIG|TIME_PREFIX|MAX_TIMESTAMP_LOOKAHEAD|TIME_FORMAT|TZ|TZ_ALIAS|MAX_DAYS_AGO|MAX_DAYS_HENCE|MAX_DIFF_SECS_AGO|MAX_DIFF_SECS_HENCE|ADD_EXTRA_TIME_FIELDS|METRICS_PROTOCOL|STATSD-DIM-TRANSFORMS|master_apps_highlight_allowed_transforms|TRANSFORMS|CHECK_FOR_HEADER|SEDCMD|SEGMENTATION|ANNOTATE_PUNCT|description|category|REGEX|FORMAT|MATCH_LIMIT|DEPTH_LIMIT|CLONE_SOURCETYPE|LOOKAHEAD|WRITE_META|DEST_KEY|DEFAULT_VALUE|SOURCE_KEY|REPEAT_MATCH|INGEST_EVAL|REGEX|REMOVE_DIMS_FROM_METRIC_NAME|METRIC

master_apps_gutter_used_sourcetypes = <string>
* Have you ever wondered if you have parsing stanzas in master-apps/*/*/props.conf that are not being used in your environment? 
* Config Explorer can show an indicator in the gutter for stanzas that do not match the pattern defined here.
* This does not work on props stanzas like the following "[source::*", "[host::*", "[(*" 
* Use the below search as an administraot to create the pattern:
* | metadata type=sourcetypes index=* index=_* | fields sourcetype | format "" "" "" "" "" "" | rex mode=sed field=search "s/\"\s+sourcetype=\"/|/g" | rex mode=sed field=search "s/(\s*sourcetype=|\s*$)//g"
* Set empty to disable grey highlighting of stanzas that are not used
* Defaults to empty

master_apps_gutter_used_sourcetypes_date = <string>
* As the above master_apps_gutter_used_sourcetypes pattern is a one-off snapshot in time, this property allows you to know 
* "how out of date" the above pattern of known sourcetypes is. Must be in the format YYYY-MM-DD
* Set this to the current date when the above search is run.
* Defaults to empty

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
    cd:(1) - Change the current directory in config explorer to the path specified. Path should be relative to $SPLUNKHOME
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
