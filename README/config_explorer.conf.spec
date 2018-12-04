write_access = <bool>
* This enables saving, creating new files/folders, deleting and renaming. This
  is obviously very dangerous and just like having filesystem access through
  the operating system, will make it very easy to destroy your Splunk 
  environment if you dont know what you are doing. 
  Defaults to false

run_commands = <bool>
* Enables running commands in the shell, with the user that splunk runs as.
  Use with caution. 
  Defaults to false

hide_settings = <bool>
* Hide the "Settings" link from the top of the screen. Note that if write_access
  is true then settings can still be changed at 
  etc/apps/config_explorer/local/config_explorer.conf. When the Settings link
  is displayed, it can be changed even when write_access is off. To 
  prevent all editing, set hide_settings = true and write_access = false .
  Defaults to false.

max_file_size = <non-negative integer>
* The maximum file size in megabytes that can be opened. 

############################################################################
#  Experimental features                                                   #
############################################################################

conf_validate_on_save = <bool>
* Show a green or red indicator in the code gutter of each line if it appears
  in the btool list output or not. As parsing .spec files is not particularly 
  reliable this can be wrong.
  Defaults to true

git_autocommit = <bool>
* Track all file saves by automatically committing them to git with a generic message.   
  Note you must first configure the git repo using "git init". Please see the documentation.
  Defaults to false 

git_autocommit_dir = <string>
* Force specific git repository location, relative to SPLUNK_HOME directory.
  Defaults to empty, meaning normal git rules will apply (search up from current directory)

git_autocommit_work_tree = <string>
* Force root location from where changes are tracked, relative to SPLUNK_HOME directory
  Set to "etc/" to track all changes beneath etc folder.
  Defaults to empty, meaning the normal git behavior will apply.

git_group_time_mins = <non-negative integer>
* In the "Change Log" view, changes to the same file by the same user within this
  time limit will be grouped together into one line entry for display purposes.

